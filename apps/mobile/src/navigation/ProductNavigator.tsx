import {
  DarkTheme,
  NavigationContainer,
  type LinkingOptions,
  type Theme,
  useIsFocused,
} from '@react-navigation/native';
import {
  createBottomTabNavigator,
  type BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import type { User } from 'firebase/auth';
import { StatusBar } from 'expo-status-bar';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { DemoScreen } from '../features/demo/DemoScreen';
import { PaginatedCommentsScreen } from '../features/comments/CommentsScreen';
import { HomeFeedScreen } from '../features/home/HomeFeedScreen';
import { HomeFlow, type HomePreviewState } from '../features/home/HomeFlow';
import { PaginatedLeaderboardScreen } from '../features/leaderboard/PaginatedLeaderboardScreen';
import { LeaderboardScreen } from '../features/leaderboard/LeaderboardScreen';
import { MonthlyRecapFlow } from '../features/recap/MonthlyRecapFlow';
import { consumePendingDeepLink } from './pendingDeepLink';

export type RootStackParamList = {
  MainTabs: undefined;
  HomePreview: { state: HomePreviewState };
  Comments: { reviewId: string };
  CommentsPreview: { mode: 'empty' | 'menu' };
  Report: undefined;
  ReportSent: undefined;
  Recap: { mode: 'ready' | 'lowData' };
  Leaderboard: undefined;
  LeaderboardPreview: { mode: 'content' | 'empty' };
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

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#B82F29',
    background: '#161616',
    card: '#080808',
    border: '#080808',
  },
};

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
      Report: 'report',
    },
  },
};

const tabSymbols: Record<keyof MainTabParamList, string> = {
  Home: '▣',
  Discover: '⌾',
  Create: '+',
  Dialog: '◌',
  Profile: '♙',
};

function tabOptions({ route }: { route: { name: keyof MainTabParamList } }): BottomTabNavigationOptions {
  const create = route.name === 'Create';
  return {
    headerShown: false,
    tabBarActiveTintColor: '#FFFFFF',
    tabBarInactiveTintColor: 'rgba(255,255,255,0.58)',
    tabBarStyle: styles.tabBar,
    tabBarLabelStyle: styles.tabLabel,
    tabBarLabel: create ? () => null : undefined,
    tabBarItemStyle: create ? styles.createTabItem : undefined,
    tabBarIcon: ({ color }) => (
      <View style={create ? styles.createIcon : styles.tabIcon}>
        <Text style={[create ? styles.createIconText : styles.tabIconText, { color: create ? '#FFFFFF' : color }]}>
          {tabSymbols[route.name]}
        </Text>
      </View>
    ),
  };
}

function PlaceholderScreen({ title }: { title: string }) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderBody}>This section is ready for its product screen.</Text>
    </View>
  );
}

function ProfileTab({ user, rootNavigation }: { user: User; rootNavigation: RootNavigation }) {
  const focused = useIsFocused();
  return (
    <View style={styles.demoScreen}>
      {focused && <StatusBar style="dark" />}
      <DemoScreen
        user={user}
        onOpenRecap={(mode) => rootNavigation.navigate('Recap', { mode })}
        onOpenLeaderboard={(mode) => rootNavigation.navigate('LeaderboardPreview', { mode })}
        onOpenHome={(state) => rootNavigation.navigate('HomePreview', { state })}
      />
    </View>
  );
}

function MainTabs({ user, rootNavigation }: { user: User; rootNavigation: RootNavigation }) {
  return (
    <Tabs.Navigator
      initialRouteName="Home"
      screenOptions={tabOptions}
      backBehavior="history"
      safeAreaInsets={{ bottom: 0 }}
    >
      <Tabs.Screen name="Home">
        {() => (
          <HomeFeedScreen
            onOpenComments={(reviewId) => rootNavigation.navigate('Comments', { reviewId })}
            onOpenLeaderboard={() => rootNavigation.navigate('Leaderboard')}
          />
        )}
      </Tabs.Screen>
      <Tabs.Screen name="Discover">
        {() => <PlaceholderScreen title="Discover" />}
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
  return (
    <NavigationContainer linking={linking} theme={navigationTheme}>
      <RootStack.Navigator initialRouteName="MainTabs" screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="MainTabs">
          {({ navigation }) => <MainTabs user={user} rootNavigation={navigation} />}
        </RootStack.Screen>
        <RootStack.Screen name="HomePreview">
          {({ navigation, route }) => (
            <HomeFlow
              initialState={route.params.state}
              onBack={navigation.goBack}
              onOpenComments={(mode) => navigation.navigate('CommentsPreview', { mode })}
              onOpenReport={() => navigation.navigate('Report')}
              onReportSent={() => navigation.replace('ReportSent')}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Comments">
          {({ navigation, route }) => (
            <PaginatedCommentsScreen reviewId={route.params.reviewId} onBack={navigation.goBack} />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="CommentsPreview">
          {({ navigation, route }) => (
            <HomeFlow
              initialState={route.params.mode === 'empty' ? 'commentsEmpty' : 'commentMenu'}
              onBack={navigation.goBack}
              onOpenReport={() => navigation.navigate('Report')}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Report">
          {({ navigation }) => (
            <HomeFlow
              initialState="report"
              onBack={navigation.goBack}
              onReportSent={() => navigation.replace('ReportSent')}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="ReportSent">
          {({ navigation }) => (
            <HomeFlow initialState="reportSent" onBack={() => navigation.popTo('MainTabs')} />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Recap">
          {({ navigation, route }) => (
            <MonthlyRecapFlow mode={route.params.mode} onClose={navigation.goBack} />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Leaderboard">
          {({ navigation }) => <PaginatedLeaderboardScreen onBack={navigation.goBack} />}
        </RootStack.Screen>
        <RootStack.Screen name="LeaderboardPreview">
          {({ navigation, route }) => (
            <LeaderboardScreen initialState={route.params.mode} onBack={navigation.goBack} />
          )}
        </RootStack.Screen>
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  demoScreen: { flex: 1, paddingTop: 54, backgroundColor: '#F6F4EF' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 28, backgroundColor: '#161616' },
  placeholderTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '700' },
  placeholderBody: { color: 'rgba(255,255,255,0.55)', fontSize: 15, textAlign: 'center' },
  tabLabel: { fontSize: 12, marginTop: 1 },
  tabBar: { height: 70, paddingTop: 8, paddingBottom: 5, borderTopWidth: 0, backgroundColor: '#080808' },
  tabIcon: { width: 28, height: 25, alignItems: 'center', justifyContent: 'center' },
  tabIconText: { fontSize: 21 },
  createTabItem: { marginTop: -8 },
  createIcon: {
    width: 60,
    height: 60,
    marginTop: -17,
    borderWidth: 5,
    borderColor: '#080808',
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B82F29',
  },
  createIconText: { fontSize: 34, fontWeight: '300', marginTop: -3 },
});
