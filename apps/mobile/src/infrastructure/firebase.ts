import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import {
  getAuth,
  initializeAuth,
  type Auth,
  type Persistence,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'tastes-934e6';
const firestoreDatabaseId =
  process.env.EXPO_PUBLIC_FIRESTORE_DATABASE_ID ?? 'tastes-eu';
const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'demo-api-key';
const authDomain =
  process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ??
  `${projectId}.firebaseapp.com`;
const storageBucket =
  process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`;
const appId =
  process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '1:1234567890:web:demo-tastes';
const messagingSenderId = process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;

const app =
  getApps().length > 0
    ? getApp()
    : initializeApp({
        apiKey,
        authDomain,
        projectId,
        storageBucket,
        appId,
        ...(messagingSenderId ? { messagingSenderId } : {}),
      });

function initializePersistentAuth(): Auth {
  // The React Native export is selected by Metro at runtime, while Firebase's
  // top-level TypeScript declaration currently exposes only its web surface.
  const getReactNativePersistence = (
    FirebaseAuth as typeof FirebaseAuth & {
      getReactNativePersistence: (
        storage: typeof ReactNativeAsyncStorage,
      ) => Persistence;
    }
  ).getReactNativePersistence;

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
export const firestore: Firestore = getFirestore(app, firestoreDatabaseId);
export const functions: Functions = getFunctions(app, 'europe-west1');
export const storage: FirebaseStorage = getStorage(app);
