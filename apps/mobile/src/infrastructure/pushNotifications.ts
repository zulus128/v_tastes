import type { TastesApi } from '@tastes/firebase-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const STORED_TOKEN_KEY = 'tastes:expo-push-token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function deepLinkFromResponse(response: Notifications.NotificationResponse | null): string | null {
  const data = response?.notification.request.content.data;
  if (data?.type !== 'message' || typeof data.conversationId !== 'string' || data.conversationId.length === 0) {
    return null;
  }
  return `tastes://conversations/${encodeURIComponent(data.conversationId)}`;
}

export function consumeInitialPushDeepLink(): string | null {
  const url = deepLinkFromResponse(Notifications.getLastNotificationResponse());
  if (url) Notifications.clearLastNotificationResponse();
  return url;
}

export function subscribeToPushDeepLinks(listener: (url: string) => void): () => void {
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
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
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
  await api.registerPushToken({ token, platform: Platform.OS });
  await AsyncStorage.setItem(STORED_TOKEN_KEY, token);

  if (previousToken && previousToken !== token) {
    await api.unregisterPushToken({ token: previousToken });
  }
  return token;
}

export async function unregisterPushNotifications(api: TastesApi): Promise<void> {
  await unregisterStoredToken(api);
}
