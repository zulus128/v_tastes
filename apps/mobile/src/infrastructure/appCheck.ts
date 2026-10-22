import { getApp as getWebApp } from 'firebase/app';
import {
  CustomProvider as WebCustomProvider,
  initializeAppCheck as initializeWebAppCheck,
} from 'firebase/app-check';
import { TurboModuleRegistry } from 'react-native';
import { captureException } from './observability';

let initialized = false;

export function configureAppCheck(): void {
  if (initialized || process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true')
    return;

  // OTA bundles must keep running on the previous native binary. App Check is
  // activated automatically after the next build includes its native module.
  if (!TurboModuleRegistry.get('NativeRNFBTurboAppCheck')) return;

  void Promise.all([
    import('@react-native-firebase/app'),
    import('@react-native-firebase/app-check'),
  ])
    .then(([firebaseApp, firebaseAppCheck]) => {
      const provider =
        new firebaseAppCheck.ReactNativeFirebaseAppCheckProvider();
      provider.configure({
        android: { provider: __DEV__ ? 'debug' : 'playIntegrity' },
        apple: {
          provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback',
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
      initializeWebAppCheck(getWebApp(), {
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
      initialized = true;
    })
    .catch((error) =>
      captureException(error, { operation: 'initialize-app-check' }),
    );
}
