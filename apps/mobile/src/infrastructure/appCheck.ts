import { getApp as getWebApp } from 'firebase/app';
import {
  CustomProvider as WebCustomProvider,
  getToken as getWebAppCheckToken,
  initializeAppCheck as initializeWebAppCheck,
} from 'firebase/app-check';
import * as Application from 'expo-application';
import { usingFirebaseEmulators } from './firebase';
import { captureException } from './observability';
import { selectAppleAppCheckProvider } from './appCheckProvider';

let initialized = false;
let initializationPromise: Promise<void> | null = null;
let refreshToken: (() => Promise<void>) | null = null;

export function configureAppCheck(): Promise<void> {
  if (initialized || usingFirebaseEmulators) return Promise.resolve();
  if (initializationPromise) return initializationPromise;

  initializationPromise = Promise.all([
    import('@react-native-firebase/app'),
    import('@react-native-firebase/app-check'),
  ])
    .then(async ([firebaseApp, firebaseAppCheck]) => {
      const provider =
        new firebaseAppCheck.ReactNativeFirebaseAppCheckProvider();
      provider.configure({
        android: { provider: __DEV__ ? 'debug' : 'playIntegrity' },
        apple: {
          provider: selectAppleAppCheckProvider(
            __DEV__,
            Application.nativeBuildVersion,
          ),
          ...(process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN
            ? {
                debugToken:
                  process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN,
              }
            : {}),
        },
        isTokenAutoRefreshEnabled: true,
      });
      const nativeAppCheck = firebaseAppCheck.initializeAppCheck(
        firebaseApp.getApp(),
        {
          provider,
          isTokenAutoRefreshEnabled: true,
        },
      );

      // Fetch once before the callable client can make its first protected
      // request. In particular, this prevents the post-OTP session check from
      // racing the asynchronous native provider initialization.
      await firebaseAppCheck.getToken(nativeAppCheck, true);

      const webAppCheck = initializeWebAppCheck(getWebApp(), {
        provider: new WebCustomProvider({
          getToken: async () => {
            const result = await firebaseAppCheck.getToken(nativeAppCheck);
            return {
              token: result.token,
              expireTimeMillis: Date.now() + 50 * 60 * 1_000,
            };
          },
        }),
        isTokenAutoRefreshEnabled: true,
      });

      refreshToken = async () => {
        await firebaseAppCheck.getToken(nativeAppCheck, true);
        await getWebAppCheckToken(webAppCheck, true);
      };

      // Warm the web SDK's internal token provider too. Firebase Functions
      // reads this provider when it builds the X-Firebase-AppCheck header.
      await refreshToken();
      initialized = true;
    })
    .catch((error) => {
      initializationPromise = null;
      captureException(error, { operation: 'initialize-app-check' });
      throw error;
    });

  return initializationPromise;
}

export async function refreshAppCheckToken(): Promise<void> {
  await configureAppCheck();
  await refreshToken?.();
}
