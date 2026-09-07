import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Application from 'expo-application';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { type PropsWithChildren, useCallback, useEffect, useRef } from 'react';
import { useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { useVisualAuditCase, VisualAuditScreen } from './src/dev/VisualAuditScreen';
import { OnboardingFlow } from './src/features/onboarding/OnboardingFlow';
import { PostSignupOnboardingFlow } from './src/features/onboarding/PostSignupOnboardingFlow';
import { queryClient, queryPersister } from './src/infrastructure/query';
import { configureObservability } from './src/infrastructure/observability';
import { ProductNavigator } from './src/navigation/ProductNavigator';
import { rememberPendingDeepLink } from './src/navigation/pendingDeepLink';
import { SessionProvider, useSession } from './src/session/SessionProvider';
import { ThemeProvider, useAppTheme } from './src/ui/ThemeProvider';
import { ResponsiveModal as Modal } from './src/ui/ResponsiveModal';
import { responsiveStyleSheet, useResponsiveViewport } from './src/ui/responsive';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 500, fade: true });
configureObservability();

function ResponsiveAppFrame({ children }: PropsWithChildren) {
  const { colors } = useAppTheme();
  const { height, width } = useResponsiveViewport();
  const viewportKey = `${Math.round(width)}:${Math.round(height)}`;

  return (
    <View style={[styles.viewport, { backgroundColor: colors.background }]}>
      <View key={viewportKey} style={[styles.appFrame, { height, width }]}>{children}</View>
    </View>
  );
}

function AppGate() {
  const { state, completeOnboarding, logout, minimumSupportedIosBuild, refresh } = useSession();
  const { colors, isDark } = useAppTheme();
  const visualAuditCase = useVisualAuditCase();
  const splashHidden = useRef(false);
  const [updatePromptVisible, setUpdatePromptVisible] = useState(false);

  const onRootLayout = useCallback(() => {
    if ((!visualAuditCase && state.status === 'booting') || splashHidden.current) return;
    splashHidden.current = true;
    void SplashScreen.hideAsync();
  }, [state.status, visualAuditCase]);

  useEffect(() => {
    if (state.status === 'authenticated') return undefined;
    const subscription = Linking.addEventListener('url', ({ url }) => rememberPendingDeepLink(url));
    return () => subscription.remove();
  }, [state.status]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || state.status === 'booting' || minimumSupportedIosBuild <= 0) return;
    const installedBuild = Number(Application.nativeBuildVersion ?? 0);
    if (!Number.isFinite(installedBuild) || installedBuild >= minimumSupportedIosBuild) return;

    setUpdatePromptVisible(true);
  }, [minimumSupportedIosBuild, state.status]);

  if (visualAuditCase) {
    return (
      <View onLayout={onRootLayout} style={[styles.root, { backgroundColor: colors.background }]}>
        <VisualAuditScreen auditCase={visualAuditCase} />
        {process.env.EXPO_PUBLIC_VISUAL_AUDIT_AUTOCYCLE === 'true' ? (
          <View pointerEvents="none" style={styles.auditLabel}>
            <Text style={styles.auditLabelText}>{visualAuditCase}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (state.status === 'booting') return null;

  if (state.status === 'anonymous') {
    return <View onLayout={onRootLayout} style={[styles.root, { backgroundColor: colors.background }]}><StatusBar style={isDark ? 'light' : 'dark'} /><OnboardingFlow /></View>;
  }

  if (state.status === 'error') {
    return (
      <View onLayout={onRootLayout} style={[styles.error, { backgroundColor: colors.canvas }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Could not load your account</Text>
        <Text style={[styles.errorBody, { color: colors.textMuted }]}>{state.error.message}</Text>
        <Pressable onPress={() => void refresh()} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
        <Pressable onPress={() => void logout()}>
          <Text style={[styles.signOut, { color: colors.textMuted }]}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  if (state.status === 'onboarding') {
    return (
      <View onLayout={onRootLayout} style={[styles.root, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <PostSignupOnboardingFlow
          onAuthenticationRequired={logout}
          onComplete={completeOnboarding}
        />
        <UpdatePrompt
          onClose={() => setUpdatePromptVisible(false)}
          onUpdate={() => {
            setUpdatePromptVisible(false);
            void Linking.openURL('https://apps.apple.com/app/id6796403021');
          }}
          visible={updatePromptVisible}
        />
      </View>
    );
  }

  return (
    <View onLayout={onRootLayout} style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ProductNavigator user={state.user} />
      <UpdatePrompt
        onClose={() => setUpdatePromptVisible(false)}
        onUpdate={() => {
          setUpdatePromptVisible(false);
          void Linking.openURL('https://apps.apple.com/app/id6796403021');
        }}
        visible={updatePromptVisible}
      />
    </View>
  );
}

function UpdatePrompt({ onClose, onUpdate, visible }: { onClose: () => void; onUpdate: () => void; visible: boolean }) {
  const { colors } = useAppTheme();

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.updateScrim}>
        <View style={[styles.updateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.updateIcon, { backgroundColor: colors.primaryBorder }]}>
            <Text style={styles.updateIconText}>↻</Text>
          </View>
          <Text style={[styles.updateTitle, { color: colors.text }]}>Update available</Text>
          <Text style={[styles.updateBody, { color: colors.textSecondary }]}>A newer version of Tastes is available. Update for the latest fixes and improvements.</Text>
          <View style={styles.updateActions}>
            <Pressable onPress={onClose} style={[styles.updateSecondaryButton, { backgroundColor: colors.surfaceRaised }]}>
              <Text style={[styles.updateSecondaryText, { color: colors.text }]}>Later</Text>
            </Pressable>
            <Pressable onPress={onUpdate} style={[styles.updatePrimaryButton, { backgroundColor: colors.primary }]}>
              <Text style={[styles.updatePrimaryText, { color: colors.onPrimary }]}>Update</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ResponsiveAppFrame>
        <AppErrorBoundary>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ maxAge: 24 * 60 * 60_000, persister: queryPersister }}
          >
            <SessionProvider>
              <AppGate />
            </SessionProvider>
          </PersistQueryClientProvider>
        </AppErrorBoundary>
      </ResponsiveAppFrame>
    </ThemeProvider>
  );
}

const styles = responsiveStyleSheet({
  viewport: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  appFrame: { overflow: 'hidden' },
  root: { flex: 1 },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: '#161616' },
  errorTitle: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  errorBody: { color: 'rgba(255,255,255,0.58)', textAlign: 'center' },
  button: { marginTop: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24, backgroundColor: '#B82F29' },
  buttonText: { color: '#fff', fontWeight: '600' },
  signOut: { color: 'rgba(255,255,255,0.65)', padding: 10 },
  updateScrim: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: 'rgba(0,0,0,0.52)' },
  updateCard: { width: '100%', maxWidth: 380, alignItems: 'center', borderWidth: 1, borderRadius: 24, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 8 },
  updateIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, marginBottom: 14 },
  updateIconText: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' },
  updateTitle: { fontSize: 21, fontWeight: '700', lineHeight: 26, textAlign: 'center' },
  updateBody: { marginTop: 10, maxWidth: 300, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  updateActions: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 22 },
  updateSecondaryButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  updateSecondaryText: { fontSize: 16, fontWeight: '600' },
  updatePrimaryButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  updatePrimaryText: { fontSize: 16, fontWeight: '700' },
  auditLabel: { position: 'absolute', top: 3, right: 3, zIndex: 1000, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 5, paddingVertical: 2 },
  auditLabelText: { color: '#FFFFFF', fontSize: 8 },
});
