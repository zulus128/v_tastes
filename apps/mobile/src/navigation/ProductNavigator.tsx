import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type LinkingOptions,
  type NavigatorScreenParams,
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
import { apiErrorMessage } from '@tastes/firebase-client';
import type { DiscoverPerson } from '@tastes/contracts';
import { LinearGradient } from 'expo-linear-gradient';
import type { User } from 'firebase/auth';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { useMemo, useState } from 'react';
import { PaginatedCommentsScreen } from '../features/comments/CommentsScreen';
import { NewActivityScreen } from '../features/activities/NewActivityScreen';
import { ActivityDetailsScreen } from '../features/activities/ActivityDetailsScreen';
import { CreateReviewScreen } from '../features/create-review/CreateReviewScreen';
import { DiscoverScreen } from '../features/discover/DiscoverScreen';
import { DiscoverFiltersScreen } from '../features/discover/DiscoverFiltersScreen';
import { PlaceScreen } from '../features/place/PlaceScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { ProfileSettingsSheet } from '../features/profile/ProfileSettingsSheet';
import { HomeFeedScreen } from '../features/home/HomeFeedScreen';
import { PaginatedLeaderboardScreen } from '../features/leaderboard/PaginatedLeaderboardScreen';
import { ChatScreen } from '../features/messaging/ChatScreen';
import { ConversationsScreen } from '../features/messaging/ConversationsScreen';
import {
  GroupDetailsScreen,
  NewGroupScreen,
  RequestsScreen,
} from '../features/messaging/MessagingExtras';
import { useUnreadConversationCount } from '../features/messaging/realtime';
import { MonthlyRecapFlow } from '../features/recap/MonthlyRecapFlow';
import { NotificationsScreen } from '../features/notifications/NotificationsScreen';
import { TastesAIScreen } from '../features/ai/TastesAIScreen';
import {
  consumeInitialPushDeepLink,
  subscribeToPushDeepLinks,
} from '../infrastructure/pushNotifications';
import { useSession } from '../session/SessionProvider';
import { CreateTabGlyph, TabBarGlyph } from '../ui/FigmaIcons';
import { type ThemeColors, useAppTheme } from '../ui/ThemeProvider';
import { consumePendingDeepLink } from './pendingDeepLink';

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Comments: { reviewId: string };
  Recap: { mode: 'ready' | 'lowData' };
  Leaderboard: undefined;
  Place: { venueId: string };
  Conversation: { conversationId: string };
  NewActivity: undefined;
  ActivityDetails: { activityId: string };
  Notifications: undefined;
  TastesAI: undefined;
  Requests: undefined;
  NewGroup: undefined;
  GroupDetails: { groupId: string; admin?: boolean };
  DiscoverFilters: undefined;
};

type MainTabParamList = {
  Home: undefined;
  Discover: undefined;
  Create: { venueId?: string } | undefined;
  Dialog: undefined;
  Profile: { initialFollowing?: boolean; userId?: string } | undefined;
};

type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['tastes://', 'https://tastes.app'],
  async getInitialURL() {
    return (
      consumePendingDeepLink() ?? (await Linking.getInitialURL()) ?? consumeInitialPushDeepLink()
    );
  },
  subscribe(listener) {
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => listener(url));
    const unsubscribePush = subscribeToPushDeepLinks(listener);
    return () => {
      linkingSubscription.remove();
      unsubscribePush();
    };
  },
  config: {
    screens: {
      MainTabs: '',
      Comments: 'reviews/:reviewId/comments',
      Recap: 'recap/:mode',
      Leaderboard: 'leaderboard',
      Place: 'places/:venueId',
      Conversation: 'conversations/:conversationId',
      NewActivity: 'activities/new',
      ActivityDetails: 'activities/:activityId',
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
    tabBarIcon: ({ focused }) =>
      create ? (
        <LinearGradient
          colors={[colors.background, colors.brandGradientEnd]}
          end={{ x: 0.5, y: 1 }}
          start={{ x: 0.5, y: 0 }}
          style={styles.createIconBorder}
        >
          <View style={[styles.createIcon, { backgroundColor: colors.primary }]}>
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
      ),
  };
}

function MainTabs({
  discoverFilters,
  user,
  rootNavigation,
}: {
  discoverFilters: string[];
  user: User;
  rootNavigation: RootNavigation;
}) {
  const { colors } = useAppTheme();
  const unreadMessages = useUnreadConversationCount(user.uid);
  const { api, logout } = useSession();
  const [settingsVisible, setSettingsVisible] = useState(false);

  async function openConversation(targetUserId: string) {
    try {
      const result = await api.createConversation({ targetUserId });
      rootNavigation.navigate('Conversation', {
        conversationId: result.data.id,
      });
    } catch (error) {
      Alert.alert('Could not start conversation', apiErrorMessage(error));
    }
  }
  return (
    <>
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
              onOpenNotifications={() => rootNavigation.navigate('Notifications')}
              onOpenPlace={(venueId) => rootNavigation.navigate('Place', { venueId })}
            />
          )}
        </Tabs.Screen>
        <Tabs.Screen name="Discover">
          {({ navigation }) => (
            <DiscoverScreen
              appliedFilters={discoverFilters}
              onOpenAI={() => rootNavigation.navigate('TastesAI')}
              onOpenFilters={() => rootNavigation.navigate('DiscoverFilters')}
              onOpenComments={(reviewId) => rootNavigation.navigate('Comments', { reviewId })}
              onOpenPlace={(venueId) => rootNavigation.navigate('Place', { venueId })}
              onOpenProfile={(person: DiscoverPerson) =>
                navigation.navigate('Profile', {
                  initialFollowing: person.following,
                  userId: person.userId,
                })
              }
              userId={user.uid}
            />
          )}
        </Tabs.Screen>
        <Tabs.Screen name="Create">
          {({ navigation, route }) => (
            <CreateReviewScreen
              initialVenueId={route.params?.venueId}
              onClose={() => {
                navigation.setParams({ venueId: undefined });
                navigation.navigate('Home');
              }}
              onPublished={() => {
                navigation.setParams({ venueId: undefined });
                navigation.navigate('Home');
              }}
              userId={user.uid}
            />
          )}
        </Tabs.Screen>
        <Tabs.Screen
          name="Dialog"
          options={{
            tabBarBadge: unreadMessages > 0 ? Math.min(unreadMessages, 99) : undefined,
            tabBarBadgeStyle: {
              backgroundColor: colors.primary,
              color: colors.onPrimary,
              fontSize: 10,
            },
          }}
        >
          {() => (
            <ConversationsScreen
              onNewActivity={() => rootNavigation.navigate('NewActivity')}
              onNewGroup={() => rootNavigation.navigate('NewGroup')}
              onOpenConversation={(conversationId) =>
                rootNavigation.navigate('Conversation', { conversationId })
              }
              onOpenRequests={() => rootNavigation.navigate('Requests')}
              userId={user.uid}
            />
          )}
        </Tabs.Screen>
        <Tabs.Screen name="Profile">
          {({ navigation, route }) => {
            const targetUserId = route.params?.userId ?? user.uid;
            return (
              <ProfileScreen
                currentUserId={user.uid}
                fallbackName={user.displayName ?? 'Your profile'}
                initialFollowing={route.params?.initialFollowing}
                onBack={() => {
                  navigation.setParams({
                    initialFollowing: undefined,
                    userId: undefined,
                  });
                  navigation.navigate('Discover');
                }}
                onMessage={(targetId) => void openConversation(targetId)}
                onOpenComments={(reviewId) => rootNavigation.navigate('Comments', { reviewId })}
                onOpenPlace={(venueId) => rootNavigation.navigate('Place', { venueId })}
                onSettings={() => setSettingsVisible(true)}
                targetUserId={targetUserId}
              />
            );
          }}
        </Tabs.Screen>
      </Tabs.Navigator>
      <ProfileSettingsSheet
        fallbackName={user.displayName ?? 'Your profile'}
        onClose={() => setSettingsVisible(false)}
        onLogout={logout}
        userId={user.uid}
        visible={settingsVisible}
      />
    </>
  );
}

export function ProductNavigator({ user }: { user: User }) {
  const { colors, isDark } = useAppTheme();
  const [discoverFilters, setDiscoverFilters] = useState<string[]>([]);
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
          {({ navigation }) => (
            <MainTabs discoverFilters={discoverFilters} user={user} rootNavigation={navigation} />
          )}
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
          {({ navigation }) => (
            <PaginatedLeaderboardScreen
              onAddFriends={() => navigation.navigate('MainTabs', { screen: 'Discover' })}
              onBack={navigation.goBack}
              onEditProfile={() => navigation.navigate('MainTabs', { screen: 'Profile' })}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Place">
          {({ navigation, route }) => (
            <PlaceScreen
              onBack={() => {
                if (navigation.canGoBack()) navigation.goBack();
                else navigation.navigate('MainTabs', { screen: 'Discover' });
              }}
              onWriteReview={() =>
                navigation.navigate('MainTabs', {
                  screen: 'Create',
                  params: { venueId: route.params.venueId },
                })
              }
              onOpenComments={(reviewId) => navigation.navigate('Comments', { reviewId })}
              userId={user.uid}
              venueId={route.params.venueId}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Conversation">
          {({ navigation, route }) => (
            <ChatScreen
              conversationId={route.params.conversationId}
              onBack={() => {
                if (navigation.canGoBack()) navigation.goBack();
                else navigation.navigate('MainTabs', { screen: 'Dialog' });
              }}
              userId={user.uid}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="NewActivity">
          {({ navigation }) => (
            <NewActivityScreen
              onBack={navigation.goBack}
              onCreated={(activityId) =>
                navigation.replace('Conversation', {
                  conversationId: activityId,
                })
              }
              userId={user.uid}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="ActivityDetails">
          {({ navigation, route }) => (
            <ActivityDetailsScreen
              activityId={route.params.activityId}
              onBack={navigation.goBack}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Notifications">
          {({ navigation }) => (
            <NotificationsScreen
              onBack={navigation.goBack}
              onOpenTarget={(item) => {
                if (item.targetType === 'comments' && item.targetId)
                  navigation.navigate('Comments', { reviewId: item.targetId });
                else if (item.targetType === 'profile' && item.targetId)
                  navigation.navigate('MainTabs', {
                    screen: 'Profile',
                    params: { userId: item.targetId },
                  });
                else if (item.targetType === 'activity' && item.targetId)
                  navigation.navigate('ActivityDetails', {
                    activityId: item.targetId,
                  });
                else if (item.targetType === 'recap')
                  navigation.navigate('Recap', { mode: 'ready' });
              }}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="TastesAI">
          {({ navigation }) => (
            <TastesAIScreen
              onBack={navigation.goBack}
              onOpenPlace={(venueId) => navigation.navigate('Place', { venueId })}
              userId={user.uid}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Requests">
          {({ navigation }) => <RequestsScreen onBack={navigation.goBack} />}
        </RootStack.Screen>
        <RootStack.Screen name="NewGroup">
          {({ navigation }) => (
            <NewGroupScreen
              onBack={navigation.goBack}
              onCreated={(groupId) => navigation.replace('GroupDetails', { groupId, admin: true })}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="GroupDetails">
          {({ navigation, route }) => (
            <GroupDetailsScreen
              groupId={route.params.groupId}
              onBack={navigation.goBack}
              onOpenConversation={(conversationId) => navigation.navigate('Conversation', { conversationId })}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="DiscoverFilters">
          {({ navigation }) => (
            <DiscoverFiltersScreen
              initialValues={discoverFilters}
              onApply={(values) => {
                setDiscoverFilters(values);
                navigation.goBack();
              }}
              onBack={navigation.goBack}
            />
          )}
        </RootStack.Screen>
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabLabel: { fontSize: 12, marginTop: 1 },
  tabBar: { height: 70, paddingTop: 8, paddingBottom: 5, borderTopWidth: 0 },
  tabIcon: {
    width: 28,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  },
});
