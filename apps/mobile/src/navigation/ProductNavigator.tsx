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
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import type { User } from 'firebase/auth';
import {
  Alert,
  InteractionManager,
  Keyboard,
  Linking,
  TextInput,
  View,
} from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PaginatedCommentsScreen } from '../features/comments/CommentsScreen';
import { NewActivityScreen } from '../features/activities/NewActivityScreen';
import { ActivityDetailsScreen } from '../features/activities/ActivityDetailsScreen';
import {
  CreateReviewScreen,
  PlaceSelector,
} from '../features/create-review/CreateReviewScreen';
import { DiscoverScreen } from '../features/discover/DiscoverScreen';
import {
  DiscoverFiltersScreen,
  type PlaceFilterScope,
} from '../features/discover/DiscoverFiltersScreen';
import { SavedPlacesFiltersScreen } from '../features/favourites/SavedPlacesFiltersScreen';
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
import { responsiveStyleSheet } from '../ui/responsive';
import { consumePendingDeepLink } from './pendingDeepLink';
import {
  prefetchComments,
  prefetchCommentsForReviews,
  prefetchConversationMessages,
  prefetchPlace,
  prefetchPlaces,
} from './prefetchNextLists';
import { prefetchPrimaryLists } from './prefetchPrimaryLists';

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Comments: { reviewId: string; commentId?: string };
  Recap: { mode: 'ready' | 'lowData' };
  Leaderboard: undefined;
  Place: { venueId: string };
  Conversation: { conversationId: string };
  NewActivity: { activityId?: string } | undefined;
  ActivityDetails: { activityId: string };
  Notifications: undefined;
  TastesAI: undefined;
  Requests: undefined;
  NewGroup: undefined;
  GroupDetails: { groupId: string; admin?: boolean };
  DiscoverFilters: { scope?: PlaceFilterScope } | undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Discover: undefined;
  Create: { venueId?: string } | undefined;
  Dialog: undefined;
  Profile:
    | {
        initialFollowing?: boolean;
        returnToVenueId?: string;
        returnToComments?: { reviewId: string; commentId?: string };
        returnToNotifications?: boolean;
        userId?: string;
      }
    | undefined;
};

export type ProductVisualAuditRoute = {
  filters?: string[];
  root: keyof RootStackParamList;
  tab?: keyof MainTabParamList;
};

type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['tastes://', 'https://tastesapp.com'],
  async getInitialURL() {
    return (
      consumePendingDeepLink() ??
      (await Linking.getInitialURL()) ??
      consumeInitialPushDeepLink()
    );
  },
  subscribe(listener) {
    const linkingSubscription = Linking.addEventListener('url', ({ url }) =>
      listener(url),
    );
    const unsubscribePush = subscribeToPushDeepLinks(listener);
    return () => {
      linkingSubscription.remove();
      unsubscribePush();
    };
  },
  config: {
    screens: {
      MainTabs: {
        path: '',
        screens: {
          Profile: 'users/:userId',
        },
      },
      Notifications: 'notifications',
      Requests: 'requests',
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
  isDark: boolean,
  { route }: { route: { name: keyof MainTabParamList } },
): BottomTabNavigationOptions {
  const create = route.name === 'Create';
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.text,
    tabBarInactiveTintColor: colors.textMuted,
    tabBarHideOnKeyboard: true,
    tabBarStyle: [styles.tabBar, { backgroundColor: colors.background }],
    tabBarLabelStyle: styles.tabLabel,
    tabBarLabel: create ? () => null : undefined,
    tabBarItemStyle: create ? styles.createTabItem : undefined,
    tabBarIcon: ({ focused }) =>
      create ? (
        <LinearGradient
          colors={isDark ? ['#080808', '#4B1816'] : ['#FFFFFF', '#FFD1D0']}
          end={{ x: 0.5, y: 1 }}
          start={{ x: 0.5, y: 0 }}
          style={styles.createIconBorder}
        >
          <View
            style={[styles.createIcon, { backgroundColor: colors.primary }]}
          >
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
  initialTab,
  onClearReviewFilters,
  onClearSavedFilters,
  reviewFilters,
  savedFilters,
  user,
  rootNavigation,
}: {
  discoverFilters: string[];
  initialTab?: keyof MainTabParamList;
  onClearReviewFilters: () => void;
  onClearSavedFilters: () => void;
  reviewFilters: string[];
  savedFilters: string[];
  user: User;
  rootNavigation: RootNavigation;
}) {
  const { colors, isDark } = useAppTheme();
  const queryClient = useQueryClient();
  const unreadMessages = useUnreadConversationCount(user.uid);
  const { api, logout, deleteAccount } = useSession();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [discoverEntrySignal, setDiscoverEntrySignal] = useState(0);
  const [placeSelectorVisible, setPlaceSelectorVisible] = useState(false);
  const [openingConversationFor, setOpeningConversationFor] = useState<
    string | null
  >(null);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void prefetchPrimaryLists(queryClient, api, user.uid);
    });
    return () => task.cancel();
  }, [api, queryClient, user.uid]);

  function openComments(reviewId: string) {
    void prefetchComments(queryClient, api, user.uid, reviewId);
    rootNavigation.navigate('Comments', { reviewId });
  }

  const prefetchVisibleComments = useCallback(
    (reviewIds: string[]) => {
      InteractionManager.runAfterInteractions(() => {
        void prefetchCommentsForReviews(queryClient, api, user.uid, reviewIds);
      });
    },
    [api, queryClient, user.uid],
  );

  const prefetchVisiblePlaces = useCallback(
    (venueIds: string[]) => {
      InteractionManager.runAfterInteractions(() => {
        void prefetchPlaces(queryClient, api, venueIds);
      });
    },
    [api, queryClient],
  );

  function openPlace(venueId: string) {
    void prefetchPlace(queryClient, api, venueId);
    rootNavigation.navigate('Place', { venueId });
  }

  function openExistingConversation(conversationId: string) {
    void prefetchConversationMessages(queryClient, api, conversationId);
    rootNavigation.navigate('Conversation', { conversationId });
  }

  async function openConversation(targetUserId: string) {
    if (openingConversationFor) return;
    setOpeningConversationFor(targetUserId);
    try {
      const result = await api.createConversation({ targetUserId });
      openExistingConversation(result.data.id);
    } catch (error) {
      const message = apiErrorMessage(error);
      Alert.alert(
        /mutual|follow each other/i.test(message)
          ? 'Message unavailable'
          : 'Could not start conversation',
        /mutual|follow each other/i.test(message)
          ? 'You can message each other after you both follow one another.'
          : message,
      );
    } finally {
      setOpeningConversationFor(null);
    }
  }
  return (
    <>
      <Tabs.Navigator
        initialRouteName={initialTab ?? 'Home'}
        screenOptions={(props) => tabOptions(colors, isDark, props)}
        backBehavior="history"
        safeAreaInsets={{ bottom: 0 }}
      >
        <Tabs.Screen name="Home">
          {({ navigation }) => (
            <HomeFeedScreen
              onExplore={() => navigation.navigate('Discover')}
              onOpenComments={openComments}
              onOpenLeaderboard={() => rootNavigation.navigate('Leaderboard')}
              onOpenNotifications={() =>
                rootNavigation.navigate('Notifications')
              }
              onOpenPlace={openPlace}
              onOpenProfile={(userId) =>
                navigation.navigate('Profile', { userId })
              }
              onPrefetchComments={prefetchVisibleComments}
              onPrefetchPlaces={prefetchVisiblePlaces}
            />
          )}
        </Tabs.Screen>
        <Tabs.Screen
          listeners={{
            tabPress: () => setDiscoverEntrySignal((value) => value + 1),
          }}
          name="Discover"
          options={{ tabBarHideOnKeyboard: false }}
        >
          {({ navigation }) => (
            <DiscoverScreen
              appliedFilters={discoverFilters}
              entrySignal={discoverEntrySignal}
              onClearSavedFilters={onClearSavedFilters}
              onOpenAI={() => rootNavigation.navigate('TastesAI')}
              onOpenFilters={() =>
                rootNavigation.navigate('DiscoverFilters', {
                  scope: 'discover',
                })
              }
              onOpenSavedFilters={() =>
                rootNavigation.navigate('DiscoverFilters', { scope: 'saved' })
              }
              savedFilters={savedFilters}
              onOpenComments={openComments}
              onOpenPlace={openPlace}
              onOpenProfile={(person: DiscoverPerson) =>
                navigation.navigate('Profile', {
                  initialFollowing: person.following,
                  userId: person.userId,
                })
              }
              onPrefetchComments={prefetchVisibleComments}
              onPrefetchPlaces={prefetchVisiblePlaces}
              userId={user.uid}
            />
          )}
        </Tabs.Screen>
        <Tabs.Screen
          listeners={{
            tabPress: (event) => {
              event.preventDefault();
              setPlaceSelectorVisible(true);
            },
          }}
          name="Create"
        >
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
            tabBarLabel: 'Chats',
            title: 'Chats',
            tabBarBadge:
              unreadMessages > 0 ? Math.min(unreadMessages, 99) : undefined,
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
              onOpenConversation={openExistingConversation}
              onOpenRequests={() => rootNavigation.navigate('Requests')}
              userId={user.uid}
            />
          )}
        </Tabs.Screen>
        <Tabs.Screen
          listeners={({ navigation }) => ({
            tabPress: () =>
              navigation.setParams({
                initialFollowing: undefined,
                userId: undefined,
              }),
          })}
          name="Profile"
          options={{ tabBarHideOnKeyboard: false }}
        >
          {({ navigation, route }) => {
            const targetUserId = route.params?.userId ?? user.uid;
            return (
              <ProfileScreen
                appliedFilters={reviewFilters}
                savedFilters={savedFilters}
                currentUserId={user.uid}
                fallbackName={user.displayName ?? 'Your profile'}
                initialFollowing={route.params?.initialFollowing}
                onBack={() => {
                  const returnToVenueId = route.params?.returnToVenueId;
                  const returnToComments = route.params?.returnToComments;
                  const returnToNotifications =
                    route.params?.returnToNotifications;
                  navigation.setParams({
                    initialFollowing: undefined,
                    returnToVenueId: undefined,
                    returnToComments: undefined,
                    returnToNotifications: undefined,
                    userId: undefined,
                  });
                  // A profile opened from a venue review returns to that venue.
                  if (returnToComments)
                    rootNavigation.navigate('Comments', returnToComments);
                  else if (returnToNotifications)
                    rootNavigation.navigate('Notifications');
                  else if (returnToVenueId) openPlace(returnToVenueId);
                  else navigation.navigate('Discover');
                }}
                onMessage={(targetId) => void openConversation(targetId)}
                onClearFilters={onClearReviewFilters}
                onClearSavedFilters={onClearSavedFilters}
                onOpenComments={openComments}
                onOpenFilters={() =>
                  rootNavigation.navigate('DiscoverFilters', {
                    scope: 'reviews',
                  })
                }
                onOpenSavedFilters={() =>
                  rootNavigation.navigate('DiscoverFilters', { scope: 'saved' })
                }
                onOpenPlace={openPlace}
                onOpenProfile={(profileUserId, profileFollowing) =>
                  navigation.navigate('Profile', {
                    initialFollowing: profileFollowing,
                    userId: profileUserId,
                  })
                }
                onPrefetchComments={prefetchVisibleComments}
                onPrefetchPlaces={prefetchVisiblePlaces}
                onContinueDraft={() => navigation.navigate('Create')}
                onSettings={() => {
                  const focusedInput = TextInput.State.currentlyFocusedInput();
                  TextInput.State.blurTextInput(focusedInput);
                  focusedInput?.blur();
                  Keyboard.dismiss();
                  setSettingsVisible(true);
                }}
                targetUserId={targetUserId}
              />
            );
          }}
        </Tabs.Screen>
      </Tabs.Navigator>
      {placeSelectorVisible ? (
        <PlaceSelector
          onClose={() => setPlaceSelectorVisible(false)}
          onSelect={(venue) => {
            setPlaceSelectorVisible(false);
            rootNavigation.navigate('MainTabs', {
              params: { venueId: venue.id },
              screen: 'Create',
            });
          }}
          userId={user.uid}
          visible={placeSelectorVisible}
        />
      ) : null}
      {settingsVisible ? (
        <ProfileSettingsSheet
          fallbackName={user.displayName ?? 'Your profile'}
          onClose={() => setSettingsVisible(false)}
          onDeleteAccount={deleteAccount}
          onLogout={logout}
          userId={user.uid}
          visible
        />
      ) : null}
    </>
  );
}

export function ProductNavigator({
  user,
  visualAuditRoute,
}: {
  user: User;
  visualAuditRoute?: ProductVisualAuditRoute;
}) {
  const { colors, isDark } = useAppTheme();
  const queryClient = useQueryClient();
  const { api } = useSession();
  // Each surface keeps its own filters: narrowing saved places or a profile's
  // reviews must not change what Discover shows.
  const [discoverFilters, setDiscoverFilters] = useState<string[]>(
    visualAuditRoute?.filters ?? [],
  );
  const [savedFilters, setSavedFilters] = useState<string[]>(
    visualAuditRoute?.filters ?? [],
  );
  const [reviewFilters, setReviewFilters] = useState<string[]>(
    visualAuditRoute?.filters ?? [],
  );
  const warmComments = (reviewId: string) =>
    void prefetchComments(queryClient, api, user.uid, reviewId);
  const prefetchVisibleComments = useCallback(
    (reviewIds: string[]) => {
      InteractionManager.runAfterInteractions(() => {
        void prefetchCommentsForReviews(queryClient, api, user.uid, reviewIds);
      });
    },
    [api, queryClient, user.uid],
  );
  const warmConversation = (conversationId: string) =>
    void prefetchConversationMessages(queryClient, api, conversationId);
  const warmPlace = (venueId: string) =>
    void prefetchPlace(queryClient, api, venueId);
  const prefetchVisiblePlaces = useCallback(
    (venueIds: string[]) => {
      InteractionManager.runAfterInteractions(() => {
        void prefetchPlaces(queryClient, api, venueIds);
      });
    },
    [api, queryClient],
  );
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
    <NavigationContainer
      key={`${visualAuditRoute?.root ?? 'MainTabs'}:${visualAuditRoute?.tab ?? ''}:${visualAuditRoute?.filters?.join(',') ?? ''}`}
      linking={linking}
      theme={navigationTheme}
    >
      <RootStack.Navigator
        initialRouteName={visualAuditRoute?.root ?? 'MainTabs'}
        screenOptions={{ headerShown: false }}
      >
        <RootStack.Screen name="MainTabs">
          {({ navigation }) => (
            <MainTabs
              discoverFilters={discoverFilters}
              initialTab={visualAuditRoute?.tab}
              onClearReviewFilters={() => setReviewFilters([])}
              onClearSavedFilters={() => setSavedFilters([])}
              reviewFilters={reviewFilters}
              savedFilters={savedFilters}
              user={user}
              rootNavigation={navigation}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen
          name="Comments"
          initialParams={
            visualAuditRoute?.root === 'Comments'
              ? { reviewId: 'visual-audit-review' }
              : undefined
          }
        >
          {({ navigation, route }) => (
            <PaginatedCommentsScreen
              onOpenProfile={(userId) =>
                navigation.navigate('MainTabs', {
                  screen: 'Profile',
                  params: { userId, returnToComments: route.params },
                })
              }
              commentId={route.params.commentId}
              onBack={() => {
                if (navigation.canGoBack()) navigation.goBack();
                else navigation.navigate('MainTabs', { screen: 'Home' });
              }}
              onOpenPlace={(venueId) => {
                warmPlace(venueId);
                navigation.navigate('Place', { venueId });
              }}
              reviewId={route.params.reviewId}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen
          name="Recap"
          initialParams={
            visualAuditRoute?.root === 'Recap' ? { mode: 'ready' } : undefined
          }
        >
          {({ navigation, route }) => (
            <MonthlyRecapFlow
              mode={route.params.mode}
              onClose={navigation.goBack}
              user={user}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Leaderboard">
          {({ navigation }) => (
            <PaginatedLeaderboardScreen
              onAddFriends={() =>
                navigation.navigate('MainTabs', { screen: 'Discover' })
              }
              onBack={navigation.goBack}
              onEditProfile={() =>
                navigation.navigate('MainTabs', { screen: 'Profile' })
              }
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen
          name="Place"
          initialParams={
            visualAuditRoute?.root === 'Place'
              ? { venueId: 'visual-audit-venue' }
              : undefined
          }
        >
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
              onOpenComments={(reviewId) => {
                warmComments(reviewId);
                navigation.navigate('Comments', { reviewId });
              }}
              onOpenProfile={(profileUserId) =>
                navigation.navigate('MainTabs', {
                  screen: 'Profile',
                  params: {
                    returnToVenueId: route.params.venueId,
                    userId: profileUserId,
                  },
                })
              }
              onPrefetchComments={prefetchVisibleComments}
              userId={user.uid}
              venueId={route.params.venueId}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen
          name="Conversation"
          initialParams={
            visualAuditRoute?.root === 'Conversation'
              ? { conversationId: 'visual-audit-conversation' }
              : undefined
          }
        >
          {({ navigation, route }) => (
            <ChatScreen
              conversationId={route.params.conversationId}
              onBack={() => {
                if (navigation.canGoBack()) navigation.goBack();
                else navigation.navigate('MainTabs', { screen: 'Dialog' });
              }}
              onOpenActivityDetails={(activityId) =>
                navigation.navigate('ActivityDetails', { activityId })
              }
              onOpenGroupDetails={(groupId) =>
                navigation.navigate('GroupDetails', { groupId })
              }
              userId={user.uid}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="NewActivity">
          {({ navigation, route }) => (
            <NewActivityScreen
              activityId={route.params?.activityId}
              onBack={navigation.goBack}
              onCreated={(activityId) =>
                route.params?.activityId
                  ? navigation.goBack()
                  : navigation.replace('Conversation', {
                      conversationId: activityId,
                    })
              }
              userId={user.uid}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen
          name="ActivityDetails"
          initialParams={
            visualAuditRoute?.root === 'ActivityDetails'
              ? { activityId: 'visual-audit-activity' }
              : undefined
          }
        >
          {({ navigation, route }) => (
            <ActivityDetailsScreen
              activityId={route.params.activityId}
              onBack={navigation.goBack}
              onEdit={(activityId) =>
                navigation.navigate('NewActivity', { activityId })
              }
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Notifications">
          {({ navigation }) => (
            <NotificationsScreen
              onOpenProfile={(userId) =>
                navigation.navigate('MainTabs', {
                  screen: 'Profile',
                  params: { userId, returnToNotifications: true },
                })
              }
              onBack={navigation.goBack}
              onOpenTarget={(item) => {
                const targetId = item.targetId ?? '';
                switch (item.targetType) {
                  case 'comments':
                  case 'review':
                    if (targetId) {
                      warmComments(targetId);
                      navigation.navigate('Comments', { reviewId: targetId });
                    }
                    break;
                  case 'profile':
                    if (targetId)
                      navigation.navigate('MainTabs', {
                        screen: 'Profile',
                        params: {
                          userId: targetId,
                          returnToNotifications: true,
                        },
                      });
                    break;
                  case 'activity':
                    if (targetId)
                      navigation.navigate('ActivityDetails', {
                        activityId: targetId,
                      });
                    break;
                  case 'place':
                    if (targetId) {
                      warmPlace(targetId);
                      navigation.navigate('Place', { venueId: targetId });
                    }
                    break;
                  case 'chat':
                    if (targetId) {
                      warmConversation(targetId);
                      navigation.navigate('Conversation', {
                        conversationId: targetId,
                      });
                    }
                    break;
                  case 'recap':
                    navigation.navigate('Recap', { mode: 'ready' });
                    break;
                  case 'leaderboard':
                    navigation.navigate('Leaderboard');
                    break;
                  case 'requests':
                  case 'messageRequests':
                    navigation.navigate('Requests');
                    break;
                  case 'discover':
                    navigation.navigate('MainTabs', { screen: 'Discover' });
                    break;
                  case 'compose':
                  case 'draft':
                    navigation.navigate('MainTabs', {
                      screen: 'Create',
                      params: targetId ? { venueId: targetId } : undefined,
                    });
                    break;
                  case 'settings':
                  case 'account':
                  case 'moderation':
                    navigation.navigate('MainTabs', { screen: 'Profile' });
                    break;
                  default:
                    break;
                }
              }}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="TastesAI">
          {({ navigation }) => (
            <TastesAIScreen
              onBack={navigation.goBack}
              onOpenPlace={(venueId) => {
                warmPlace(venueId);
                navigation.navigate('Place', { venueId });
              }}
              onPrefetchPlaces={prefetchVisiblePlaces}
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
              onCreated={(groupId) =>
                navigation.replace('GroupDetails', { groupId, admin: true })
              }
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen
          name="GroupDetails"
          initialParams={
            visualAuditRoute?.root === 'GroupDetails'
              ? { groupId: 'visual-audit-group', admin: true }
              : undefined
          }
        >
          {({ navigation, route }) => (
            <GroupDetailsScreen
              groupId={route.params.groupId}
              onBack={navigation.goBack}
              onOpenConversation={(conversationId) => {
                warmConversation(conversationId);
                navigation.navigate('Conversation', { conversationId });
              }}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen
          name="DiscoverFilters"
          options={{ gestureEnabled: false }}
        >
          {({ navigation, route }) => {
            const scope = route.params?.scope ?? 'discover';
            const filters = {
              discover: discoverFilters,
              reviews: reviewFilters,
              saved: savedFilters,
            };
            const setFilters = {
              discover: setDiscoverFilters,
              reviews: setReviewFilters,
              saved: setSavedFilters,
            };
            const onApply = (values: string[]) => {
              setFilters[scope](values);
              navigation.goBack();
            };
            return scope === 'saved' ? (
              <SavedPlacesFiltersScreen
                initialValues={filters.saved}
                onApply={onApply}
                onBack={navigation.goBack}
                userId={user.uid}
              />
            ) : (
              <DiscoverFiltersScreen
                initialValues={filters[scope]}
                onApply={onApply}
                onBack={navigation.goBack}
                scope={scope}
              />
            );
          }}
        </RootStack.Screen>
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = responsiveStyleSheet({
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
