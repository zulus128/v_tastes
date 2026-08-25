import { renderNotificationCopy } from '@tastes/contracts';
import type { TastesApi } from '@tastes/firebase-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import type { NotificationResponse } from 'expo-notifications';
import { Platform } from 'react-native';

const STORED_TOKEN_KEY = 'tastes:expo-push-token';

function supportsRemotePushNotifications(): boolean {
  return Platform.OS === 'android' || (Platform.OS === 'ios' && Constants.isDevice);
}

type ExpoNotifications = typeof import('expo-notifications');

let notificationsModule: ExpoNotifications | null = null;

function getNotifications(): ExpoNotifications | null {
  if (!supportsRemotePushNotifications()) return null;
  if (notificationsModule) return notificationsModule;

  const loadedModule = require('expo-notifications') as ExpoNotifications;
  loadedModule.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  notificationsModule = loadedModule;
  return loadedModule;
}

/** Turns the catalog target of a push payload into an in-app route. */
export function deepLinkForTarget(targetType: string, targetId: string): string {
  const id = encodeURIComponent(targetId);
  switch (targetType) {
    case 'comments':
    case 'review':
      return targetId ? `tastes://reviews/${id}/comments` : 'tastes://notifications';
    case 'place':
      return targetId ? `tastes://places/${id}` : 'tastes://notifications';
    case 'chat':
      return targetId ? `tastes://conversations/${id}` : 'tastes://notifications';
    case 'activity':
      return targetId ? `tastes://activities/${id}` : 'tastes://notifications';
    case 'profile':
      return targetId ? `tastes://users/${id}` : 'tastes://notifications';
    case 'recap':
      return 'tastes://recap/ready';
    case 'leaderboard':
      return 'tastes://leaderboard';
    case 'requests':
    case 'messageRequests':
      return 'tastes://requests';
    default:
      return 'tastes://notifications';
  }
}

function deepLinkFromResponse(response: NotificationResponse | null): string | null {
  const data = response?.notification.request.content.data;
  if (!data) return null;
  if (data.type === 'message' && typeof data.conversationId === 'string' && data.conversationId.length > 0) {
    return `tastes://conversations/${encodeURIComponent(data.conversationId)}`;
  }
  if (typeof data.targetType !== 'string' || data.targetType.length === 0) return null;
  return deepLinkForTarget(data.targetType, typeof data.targetId === 'string' ? data.targetId : '');
}

export function consumeInitialPushDeepLink(): string | null {
  const Notifications = getNotifications();
  if (!Notifications) return null;
  const url = deepLinkFromResponse(Notifications.getLastNotificationResponse());
  if (url) Notifications.clearLastNotificationResponse();
  return url;
}

export function subscribeToPushDeepLinks(listener: (url: string) => void): () => void {
  const Notifications = getNotifications();
  if (!Notifications) return () => undefined;
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = deepLinkFromResponse(response);
    if (url) listener(url);
  });
  return () => subscription.remove();
}

function easProjectId(): string {
  const projectId = Constants.easConfig?.projectId
    ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== 'string' || projectId.length === 0) {
    throw new Error('The EAS project ID is missing from the Expo configuration.');
  }
  return projectId;
}

async function configureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const Notifications = getNotifications();
  if (!Notifications) return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });
}

async function unregisterStoredToken(api: TastesApi): Promise<void> {
  const storedToken = await AsyncStorage.getItem(STORED_TOKEN_KEY);
  if (!storedToken) return;
  await api.unregisterPushToken({ token: storedToken });
  await AsyncStorage.removeItem(STORED_TOKEN_KEY);
}

export async function syncPushNotifications(
  api: TastesApi,
  options: { requestPermission?: boolean } = {},
): Promise<string | null> {
  const Notifications = getNotifications();
  if (!Notifications) return null;
  const platform = Platform.OS;
  if (platform !== 'android' && platform !== 'ios') return null;
  await configureAndroidChannel();

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && options.requestPermission) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) {
    await unregisterStoredToken(api);
    return null;
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId: easProjectId() })).data;
  const previousToken = await AsyncStorage.getItem(STORED_TOKEN_KEY);
  await api.registerPushToken({ token, platform });
  await AsyncStorage.setItem(STORED_TOKEN_KEY, token);

  if (previousToken && previousToken !== token) {
    await api.unregisterPushToken({ token: previousToken });
  }
  return token;
}

export async function unregisterPushNotifications(api: TastesApi): Promise<void> {
  await unregisterStoredToken(api);
}

const DRAFT_REMINDER_KEY = 'tastes:draft-reminder-id';
const DRAFT_REMINDER_DELAY_SECONDS = 24 * 60 * 60;

/**
 * Review drafts never leave the device, so the "unfinished review" reminder is scheduled locally
 * for 24 hours after the draft was last touched.
 */
export async function scheduleDraftReminder(placeName: string): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  await cancelDraftReminder();
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  const copy = renderNotificationCopy('draft-reminder', { place: placeName || 'a place' });
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: copy.title,
      body: copy.body,
      data: { type: 'draft-reminder', targetType: 'draft', targetId: '' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: DRAFT_REMINDER_DELAY_SECONDS,
      repeats: false,
    },
  });
  await AsyncStorage.setItem(DRAFT_REMINDER_KEY, identifier);
}

export async function cancelDraftReminder(): Promise<void> {
  const identifier = await AsyncStorage.getItem(DRAFT_REMINDER_KEY);
  if (!identifier) return;
  const Notifications = getNotifications();
  await Notifications?.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
  await AsyncStorage.removeItem(DRAFT_REMINDER_KEY);
}
