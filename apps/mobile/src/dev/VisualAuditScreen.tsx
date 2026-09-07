import type { User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { OnboardingFlow, type OnboardingScreen } from '../features/onboarding/OnboardingFlow';
import {
  PostSignupOnboardingFlow,
  type PostSignupScreen,
} from '../features/onboarding/PostSignupOnboardingFlow';
import { MonthlyRecapFlow, type RecapStep } from '../features/recap/MonthlyRecapFlow';
import {
  ProductNavigator,
  type MainTabParamList,
  type ProductVisualAuditRoute,
  type RootStackParamList,
} from '../navigation/ProductNavigator';
import { SessionStateOverrideProvider } from '../session/SessionProvider';
import { useAppTheme } from '../ui/ThemeProvider';
import { responsiveStyleSheet } from '../ui/responsive';

const visualAuditUser = {
  uid: 'visual-audit-user',
  displayName: 'Alex Morgan',
  email: 'alex@example.com',
  photoURL: null,
} as unknown as User;

const onboardingScreens: OnboardingScreen[] = ['entry', 'consent', 'phone', 'country', 'otp'];
const postSignupScreens: PostSignupScreen[] = [
  'profile',
  'city',
  'dish',
  'location',
  'locationDenied',
  'place',
  'style',
  'contactsPermission',
  'invite',
  'contacts',
  'notifications',
  'ready',
];
const recapSteps: RecapStep[] = [
  'loading',
  'lowData',
  'intro',
  'placeGuess',
  'placeResult',
  'areaGuess',
  'areaResult',
  'ratingGuess',
  'ratingFeedback',
  'ranking',
  'favorites',
  'followers',
  'comparison',
  'share',
];

const productTabs: Record<string, keyof MainTabParamList> = {
  home: 'Home',
  discover: 'Discover',
  create: 'Create',
  conversations: 'Dialog',
  profile: 'Profile',
};

const productRoots: Record<string, keyof RootStackParamList> = {
  comments: 'Comments',
  leaderboard: 'Leaderboard',
  place: 'Place',
  conversation: 'Conversation',
  'new-activity': 'NewActivity',
  'activity-details': 'ActivityDetails',
  notifications: 'Notifications',
  ai: 'TastesAI',
  requests: 'Requests',
  'new-group': 'NewGroup',
  'group-details': 'GroupDetails',
  'discover-filters': 'DiscoverFilters',
};

export const visualAuditCases = [
  ...onboardingScreens.map((screen) => `onboarding/${screen}`),
  ...postSignupScreens.map((screen) => `post-signup/${screen}`),
  ...recapSteps.map((screen) => `recap/${screen}`),
  'recap/close',
  ...Object.keys(productTabs).map((screen) => `product/${screen}`),
  ...Object.keys(productRoots).map((screen) => `product/${screen}`),
];

// The recurring device pass intentionally stays focused on the screens that drive
// the client's visual review. Every case remains deep-linkable above, while the
// automatic pass avoids spending most of its time on secondary empty/error states.
export const primaryVisualAuditCases = [
  'onboarding/entry',
  'onboarding/phone',
  'onboarding/otp',
  'post-signup/profile',
  'post-signup/invite',
  'post-signup/ready',
  'recap/intro',
  'product/home',
  'product/discover',
  'product/create',
  'product/conversations',
  'product/profile',
  'product/place',
  'product/conversation',
  'product/new-activity',
  'product/activity-details',
  'product/discover-filters',
] as const;

function visualAuditCaseFromUrl(url: string | null): string | null {
  if (!url) return null;
  const queryMatch = url.match(/[?&]visualAudit=([^&]+)/);
  if (queryMatch?.[1]) return decodeURIComponent(queryMatch[1]);
  const marker = 'visual-audit/';
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return null;
  const encodedCase = url.slice(markerIndex + marker.length).split(/[?#]/, 1)[0];
  return encodedCase ? decodeURIComponent(encodedCase) : null;
}

export function useVisualAuditCase() {
  const automaticallyCycle = process.env.EXPO_PUBLIC_VISUAL_AUDIT_AUTOCYCLE === 'true';
  const [auditCase, setAuditCase] = useState<string | null>(automaticallyCycle ? primaryVisualAuditCases[0]! : null);

  useEffect(() => {
    if (!__DEV__) return undefined;
    let active = true;
    void Linking.getInitialURL().then((url) => {
      const nextCase = visualAuditCaseFromUrl(url);
      if (active && nextCase) setAuditCase(nextCase);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const nextCase = visualAuditCaseFromUrl(url);
      if (nextCase) setAuditCase(nextCase);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!__DEV__ || !automaticallyCycle) return undefined;
    const alert = Alert.alert;
    Alert.alert = () => undefined;
    let index = 0;
    const timer = setInterval(() => {
      index = (index + 1) % primaryVisualAuditCases.length;
      setAuditCase(primaryVisualAuditCases[index]!);
    }, 3_000);
    return () => {
      clearInterval(timer);
      Alert.alert = alert;
    };
  }, [automaticallyCycle]);

  return __DEV__ ? auditCase : null;
}

export function VisualAuditScreen({ auditCase }: { auditCase: string }) {
  const { colors } = useAppTheme();
  const [group, name] = auditCase.split('/');

  if (group === 'onboarding' && onboardingScreens.includes(name as OnboardingScreen)) {
    return <OnboardingFlow key={auditCase} initialScreen={name as OnboardingScreen} />;
  }

  if (group === 'post-signup' && postSignupScreens.includes(name as PostSignupScreen)) {
    return (
      <PostSignupOnboardingFlow
        key={auditCase}
        initialScreen={name as PostSignupScreen}
        onAuthenticationRequired={async () => undefined}
        onComplete={async () => undefined}
        visualAudit
      />
    );
  }

  if (group === 'recap' && (recapSteps.includes(name as RecapStep) || name === 'close')) {
    return (
      <SessionStateOverrideProvider user={visualAuditUser} visualAudit>
        <MonthlyRecapFlow
          key={auditCase}
          initialConfirmingClose={name === 'close'}
          initialStep={name === 'close' ? 'intro' : name as RecapStep}
          onClose={() => undefined}
          user={visualAuditUser}
        />
      </SessionStateOverrideProvider>
    );
  }

  if (group === 'product') {
    const tab = productTabs[name];
    const root = productRoots[name];
    const visualAuditRoute: ProductVisualAuditRoute | undefined = tab
      ? { root: 'MainTabs', tab }
      : root ? { root } : undefined;
    if (visualAuditRoute) {
      return (
        <SessionStateOverrideProvider user={visualAuditUser} visualAudit>
          <ProductNavigator user={visualAuditUser} visualAuditRoute={visualAuditRoute} />
        </SessionStateOverrideProvider>
      );
    }
  }

  return (
    <View style={[styles.missing, { backgroundColor: colors.canvas }]}>
      <Text style={[styles.missingTitle, { color: colors.text }]}>Unknown visual audit case</Text>
      <Text style={[styles.missingCase, { color: colors.textMuted }]}>{auditCase}</Text>
    </View>
  );
}

const styles = responsiveStyleSheet({
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  missingTitle: { fontSize: 20, fontWeight: '700' },
  missingCase: { fontSize: 14, marginTop: 8 },
});
