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
import { apiErrorMessage, createTastesApi } from '@tastes/firebase-client';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import type { User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { deleteObject, ref as storageRef, uploadBytes } from 'firebase/storage';
import { ActivityIndicator, Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { PaginatedCommentsScreen } from '../features/comments/CommentsScreen';
import { NewActivityScreen } from '../features/activities/NewActivityScreen';
import { CreateReviewScreen } from '../features/create-review/CreateReviewScreen';
import { DiscoverScreen } from '../features/discover/DiscoverScreen';
import { PlaceScreen } from '../features/place/PlaceScreen';
import { HomeFeedScreen } from '../features/home/HomeFeedScreen';
import { PaginatedLeaderboardScreen } from '../features/leaderboard/PaginatedLeaderboardScreen';
import { ChatScreen } from '../features/messaging/ChatScreen';
import { ConversationsScreen } from '../features/messaging/ConversationsScreen';
import { useUnreadConversationCount } from '../features/messaging/realtime';
import { MonthlyRecapFlow } from '../features/recap/MonthlyRecapFlow';
import { firestore, functions, storage } from '../infrastructure/firebase';
import { consumeInitialPushDeepLink, subscribeToPushDeepLinks } from '../infrastructure/pushNotifications';
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
};

type MainTabParamList = {
  Home: undefined;
  Discover: undefined;
  Create: { venueId?: string } | undefined;
  Dialog: undefined;
  Profile: undefined;
};

type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['tastes://', 'https://tastes.app'],
  async getInitialURL() {
    return consumePendingDeepLink() ?? await Linking.getInitialURL() ?? consumeInitialPushDeepLink();
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
    tabBarStyle: [styles.tabBar, { backgroundColor: colors.background }],
    tabBarLabelStyle: styles.tabLabel,
    tabBarLabel: create ? () => null : undefined,
    tabBarItemStyle: create ? styles.createTabItem : undefined,
    tabBarIcon: ({ focused }) => (
      create ? (
        <LinearGradient
          colors={isDark ? ['#080808', colors.primaryBorder] : ['#FFFFFF', '#FED1D0']}
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

function ProfileTab({ user, rootNavigation }: { user: User; rootNavigation: RootNavigation }) {
  const { logout } = useSession();
  const { colors, preference, setPreference } = useAppTheme();
  const api = useMemo(() => createTastesApi(functions), []);
  const [profile, setProfile] = useState<{
    displayName: string | null;
    photoPath: string | null;
    photoUrl: string | null;
  }>({ displayName: user.displayName, photoPath: null, photoUrl: user.photoURL });
  const [avatarUri, setAvatarUri] = useState<string | null>(user.photoURL);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => onSnapshot(doc(firestore, 'users', user.uid), (snapshot) => {
    const data = snapshot.data();
    const next = {
      displayName: typeof data?.displayName === 'string' ? data.displayName : user.displayName,
      photoPath: typeof data?.photoPath === 'string' ? data.photoPath : null,
      photoUrl: typeof data?.photoUrl === 'string' ? data.photoUrl : null,
    };
    setProfile(next);
    if (next.photoUrl) setAvatarUri(next.photoUrl);
  }), [user.displayName, user.uid]);

  async function chooseProfilePhoto() {
    if (uploadingPhoto) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to add a profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const previousPath = profile.photoPath;
    const photoPath = `profile-images/${user.uid}/avatar-${Date.now()}.jpg`;
    setUploadingPhoto(true);
    try {
      const cropSize = Math.min(asset.width, asset.height);
      const optimized = await manipulateAsync(
        asset.uri,
        [
          {
            crop: {
              originX: Math.max(0, (asset.width - cropSize) / 2),
              originY: Math.max(0, (asset.height - cropSize) / 2),
              width: cropSize,
              height: cropSize,
            },
          },
          { resize: { width: 512, height: 512 } },
        ],
        { compress: 0.78, format: SaveFormat.JPEG },
      );
      setAvatarUri(optimized.uri);
      const response = await fetch(optimized.uri);
      const blob = await response.blob();
      await uploadBytes(storageRef(storage, photoPath), blob, {
        contentType: 'image/jpeg',
      });
      const updated = await api.updateProfilePhoto({ photoPath });
      setAvatarUri(updated.data.photoUrl);
      if (previousPath && previousPath !== photoPath) {
        void deleteObject(storageRef(storage, previousPath)).catch(() => undefined);
      }
    } catch (error) {
      setAvatarUri(profile.photoUrl);
      Alert.alert('Could not update photo', apiErrorMessage(error));
    } finally {
      setUploadingPhoto(false);
    }
  }

  const displayName = profile.displayName ?? user.displayName ?? 'Your profile';
  return (
    <View style={[styles.profile, { backgroundColor: colors.canvas }]}>
      <Pressable
        accessibilityLabel="Add profile photo"
        accessibilityRole="button"
        disabled={uploadingPhoto}
        onPress={() => void chooseProfilePhoto()}
        style={({ pressed }) => [styles.profileAvatar, pressed && styles.profileAvatarPressed]}
      >
        {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.profileAvatarImage} /> : (
          <Text style={styles.profileInitial}>{displayName === 'Your profile' ? '+' : displayName.slice(0, 1).toUpperCase()}</Text>
        )}
        {uploadingPhoto ? <View style={styles.profileAvatarBusy}><ActivityIndicator color="#fff" /></View> : null}
      </Pressable>
      <Text style={[styles.profileName, { color: colors.text }]}>{displayName}</Text>
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
  const { colors, isDark } = useAppTheme();
  const unreadMessages = useUnreadConversationCount(user.uid);
  return (
    <Tabs.Navigator
      initialRouteName="Home"
      screenOptions={(props) => tabOptions(colors, isDark, props)}
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
        {() => <DiscoverScreen onOpenPlace={(venueId) => rootNavigation.navigate('Place', { venueId })} userId={user.uid} />}
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
          tabBarBadgeStyle: { backgroundColor: colors.primary, color: colors.onPrimary, fontSize: 10 },
        }}
      >
        {() => (
          <ConversationsScreen
            onNewActivity={() => rootNavigation.navigate('NewActivity')}
            onOpenConversation={(conversationId) => rootNavigation.navigate('Conversation', { conversationId })}
            userId={user.uid}
          />
        )}
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
        <RootStack.Screen name="Place">
          {({ navigation, route }) => (
            <PlaceScreen
              onBack={() => {
                if (navigation.canGoBack()) navigation.goBack();
                else navigation.navigate('MainTabs', { screen: 'Discover' });
              }}
              onWriteReview={() => navigation.navigate('MainTabs', { screen: 'Create', params: { venueId: route.params.venueId } })}
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
              onCreated={() => navigation.navigate('MainTabs', { screen: 'Dialog' })}
              userId={user.uid}
            />
          )}
        </RootStack.Screen>
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  profile: { flex: 1, alignItems: 'center', paddingTop: 110, paddingHorizontal: 24 },
  profileAvatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#B82F29' },
  profileAvatarPressed: { opacity: 0.8 },
  profileAvatarImage: { width: 88, height: 88, borderRadius: 44 },
  profileAvatarBusy: { position: 'absolute', inset: 0, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
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
