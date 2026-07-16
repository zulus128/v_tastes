import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  type Auth,
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

export const auth: Auth = getAuth(app);
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
