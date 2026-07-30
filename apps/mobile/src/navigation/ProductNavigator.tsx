import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type LinkingOptions,
  type Theme,
} from '@react-navigation/native';
import {
  createBottomTabNavigator,
  type BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import type { User } from 'firebase/auth';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { PaginatedCommentsScreen } from '../features/comments/CommentsScreen';
import { DiscoverScreen } from '../features/discover/DiscoverScreen';
import { HomeFeedScreen } from '../features/home/HomeFeedScreen';
import { PaginatedLeaderboardScreen } from '../features/leaderboard/PaginatedLeaderboardScreen';
import { MonthlyRecapFlow } from '../features/recap/MonthlyRecapFlow';
import { useSession } from '../session/SessionProvider';
import { CreateTabGlyph, TabBarGlyph } from '../ui/FigmaIcons';
import { type ThemeColors, useAppTheme } from '../ui/ThemeProvider';
import { consumePendingDeepLink } from './pendingDeepLink';

export type RootStackParamList = {
  MainTabs: undefined;
  Comments: { reviewId: string };
  Recap: { mode: 'ready' | 'lowData' };
  Leaderboard: undefined;
};

type MainTabParamList = {
  Home: undefined;
  Discover: undefined;
  Create: undefined;
  Dialog: undefined;
  Profile: undefined;
};

type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['tastes://', 'https://tastes.app'],
  async getInitialURL() {
    return consumePendingDeepLink() ?? await Linking.getInitialURL();
  },
  subscribe(listener) {
    const subscription = Linking.addEventListener('url', ({ url }) => listener(url));
    return () => subscription.remove();
  },
  config: {
    screens: {
      MainTabs: '',
      Comments: 'reviews/:reviewId/comments',
      Recap: 'recap/:mode',
      Leaderboard: 'leaderboard',
    },
  },
};

function tabOptions(
  colors: ThemeColors,
  { route }: { route: { name: keyof MainTabParamList } },
): BottomTabNavigationOptions {
  const create = route.name === 'Create';
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.text,
    tabBarInactiveTintColor: colors.textMuted,
    tabBarStyle: [styles.tabBar, { backgroundColor: colors.background }],
    tabBarLabelStyle: styles.tabLabel,
    tabBarLabel: create ? () => null : undefined,
    tabBarItemStyle: create ? styles.createTabItem : undefined,
    tabBarIcon: ({ focused }) => (
      create ? (
        <LinearGradient
          colors={['#080808', '#4C1816']}
          end={{ x: 0.5, y: 1 }}
          start={{ x: 0.5, y: 0 }}
          style={styles.createIconBorder}
        >
          <View style={styles.createIcon}>
          <CreateTabGlyph />
          </View>
        </LinearGradient>
      ) : (
        <View style={styles.tabIcon}>
          <TabBarGlyph
            active={focused}
            name={route.name as Exclude<keyof MainTabParamList, 'Create'>}
          />
        </View>
      )
    ),
  };
}

function PlaceholderScreen({ title }: { title: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.placeholder, { backgroundColor: colors.canvas }]}>
      <Text style={[styles.placeholderTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.placeholderBody, { color: colors.textMuted }]}>This section is ready for its product screen.</Text>
    </View>
  );
}

function ProfileTab({ user, rootNavigation }: { user: User; rootNavigation: RootNavigation }) {
  const { logout } = useSession();
  const { colors, preference, setPreference } = useAppTheme();
  return (
    <View style={[styles.profile, { backgroundColor: colors.canvas }]}>
      <View style={styles.profileAvatar}>
        <Text style={styles.profileInitial}>{(user.displayName ?? user.phoneNumber ?? 'T').slice(0, 1).toUpperCase()}</Text>
      </View>
      <Text style={[styles.profileName, { color: colors.text }]}>{user.displayName ?? 'Your profile'}</Text>
      <Text style={[styles.profileIdentity, { color: colors.textMuted }]}>{user.phoneNumber ?? user.email ?? user.uid}</Text>
      <View style={styles.profileActions}>
        <Text style={[styles.appearanceLabel, { color: colors.textMuted }]}>Appearance</Text>
        <View style={[styles.appearanceControl, { backgroundColor: colors.surfaceRaised }]}>
          {(['light', 'dark', 'system'] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityState={{ selected: preference === value }}
              onPress={() => void setPreference(value)}
              style={[
                styles.appearanceOption,
                preference === value && { backgroundColor: colors.surface },
              ]}
            >
              <Text style={{ color: preference === value ? colors.text : colors.textMuted, fontWeight: preference === value ? '700' : '400' }}>
                {value === 'system' ? 'Auto' : value[0].toUpperCase() + value.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => rootNavigation.navigate('Leaderboard')} style={[styles.profileAction, { backgroundColor: colors.surface }]}>
          <Text style={[styles.profileActionText, { color: colors.text }]}>Leaderboard</Text>
        </Pressable>
        <Pressable onPress={() => rootNavigation.navigate('Recap', { mode: 'ready' })} style={[styles.profileAction, { backgroundColor: colors.surface }]}>
          <Text style={[styles.profileActionText, { color: colors.text }]}>Monthly recap</Text>
        </Pressable>
        <Pressable onPress={() => void logout()} style={styles.signOutAction}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MainTabs({ user, rootNavigation }: { user: User; rootNavigation: RootNavigation }) {
  const { colors } = useAppTheme();
  return (
    <Tabs.Navigator
      initialRouteName="Home"
      screenOptions={(props) => tabOptions(colors, props)}
      backBehavior="history"
      safeAreaInsets={{ bottom: 0 }}
    >
      <Tabs.Screen name="Home">
        {({ navigation }) => (
          <HomeFeedScreen
            onExplore={() => navigation.navigate('Discover')}
            onOpenComments={(reviewId) => rootNavigation.navigate('Comments', { reviewId })}
            onOpenLeaderboard={() => rootNavigation.navigate('Leaderboard')}
          />
        )}
      </Tabs.Screen>
      <Tabs.Screen name="Discover">
        {() => <DiscoverScreen userId={user.uid} />}
      </Tabs.Screen>
      <Tabs.Screen name="Create">
        {() => <PlaceholderScreen title="Create a review" />}
      </Tabs.Screen>
      <Tabs.Screen name="Dialog">
        {() => <PlaceholderScreen title="Dialog" />}
      </Tabs.Screen>
      <Tabs.Screen name="Profile">
        {() => <ProfileTab user={user} rootNavigation={rootNavigation} />}
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}

export function ProductNavigator({ user }: { user: User }) {
  const { colors, isDark } = useAppTheme();
  const navigationTheme = useMemo<Theme>(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.canvas,
        card: colors.background,
        border: colors.border,
        text: colors.text,
      },
    };
  }, [colors, isDark]);
  return (
    <NavigationContainer linking={linking} theme={navigationTheme}>
      <RootStack.Navigator initialRouteName="MainTabs" screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="MainTabs">
          {({ navigation }) => <MainTabs user={user} rootNavigation={navigation} />}
        </RootStack.Screen>
        <RootStack.Screen name="Comments">
          {({ navigation, route }) => (
            <PaginatedCommentsScreen reviewId={route.params.reviewId} onBack={navigation.goBack} />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Recap">
          {({ navigation, route }) => (
            <MonthlyRecapFlow mode={route.params.mode} onClose={navigation.goBack} user={user} />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Leaderboard">
          {({ navigation }) => <PaginatedLeaderboardScreen onBack={navigation.goBack} />}
        </RootStack.Screen>
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  profile: { flex: 1, alignItems: 'center', paddingTop: 110, paddingHorizontal: 24 },
  profileAvatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#B82F29' },
  profileInitial: { color: '#fff', fontSize: 36, fontWeight: '700' },
  profileName: { marginTop: 18, fontSize: 24, fontWeight: '700' },
  profileIdentity: { marginTop: 6, fontSize: 13 },
  profileActions: { width: '100%', marginTop: 36, gap: 10 },
  appearanceLabel: { marginBottom: -2, fontSize: 13 },
  appearanceControl: { height: 44, padding: 3, borderRadius: 22, flexDirection: 'row' },
  appearanceOption: { flex: 1, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  profileAction: { minHeight: 52, paddingHorizontal: 18, borderRadius: 16, justifyContent: 'center' },
  profileActionText: { fontSize: 16, fontWeight: '600' },
  signOutAction: { minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  signOutText: { color: '#FF453A', fontSize: 16, fontWeight: '600' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 28 },
  placeholderTitle: { fontSize: 28, fontWeight: '700' },
  placeholderBody: { fontSize: 15, textAlign: 'center' },
  tabLabel: { fontSize: 12, marginTop: 1 },
  tabBar: { height: 70, paddingTop: 8, paddingBottom: 5, borderTopWidth: 0 },
  tabIcon: { width: 28, height: 25, alignItems: 'center', justifyContent: 'center' },
  createTabItem: { marginTop: -8 },
  createIconBorder: {
    width: 60,
    height: 60,
    marginTop: 3,
    borderRadius: 30,
    padding: 5,
  },
  createIcon: {
    flex: 1,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B82F29',
  },
});
