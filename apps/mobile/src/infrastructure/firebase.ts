import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import {
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  type Auth,
  type Persistence,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  type Functions,
} from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';
import { Platform } from 'react-native';

const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-tastes';
const useEmulators = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS !== 'false';

const app =
  getApps().length > 0
    ? getApp()
    : initializeApp({
        apiKey: 'demo-api-key',
        authDomain: `${projectId}.firebaseapp.com`,
        projectId,
        storageBucket: `${projectId}.appspot.com`,
        appId: '1:1234567890:web:demo-tastes',
      });

function initializePersistentAuth(): Auth {
  // The React Native export is selected by Metro at runtime, while Firebase's
  // top-level TypeScript declaration currently exposes only its web surface.
  const getReactNativePersistence = (FirebaseAuth as typeof FirebaseAuth & {
    getReactNativePersistence: (storage: typeof ReactNativeAsyncStorage) => Persistence;
  }).getReactNativePersistence;

  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/already-initialized') {
      return getAuth(app);
    }
    throw error;
  }
}

export const auth: Auth = initializePersistentAuth();
export const firestore: Firestore = getFirestore(app);
export const functions: Functions = getFunctions(app, 'europe-west1');
export const storage: FirebaseStorage = getStorage(app);

const globalState = globalThis as typeof globalThis & { __tastesEmulatorsConnected?: boolean };

if (useEmulators && !globalState.__tastesEmulatorsConnected) {
  const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';

  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(firestore, host, 8180);
  connectFunctionsEmulator(functions, host, 5001);
  connectStorageEmulator(storage, host, 9199);
  globalState.__tastesEmulatorsConnected = true;
}
