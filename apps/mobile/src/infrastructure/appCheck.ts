import { NativeModules } from 'react-native';
import { captureException } from './observability';

let initialized = false;

export function configureAppCheck(): void {
  if (initialized || process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true')
    return;

  // OTA bundles must keep running on the previous native binary. App Check is
  // activated automatically after the next build includes its native module.
  if (!NativeModules.RNFBAppCheckModule) return;

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
        },
        isTokenAutoRefreshEnabled: true,
      });
      firebaseAppCheck.initializeAppCheck(firebaseApp.getApp(), {
        provider,
        isTokenAutoRefreshEnabled: true,
      });
      initialized = true;
    })
    .catch((error) =>
      captureException(error, { operation: 'initialize-app-check' }),
    );
}
