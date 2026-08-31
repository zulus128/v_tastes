'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

let authEmulatorConnected = false;
let functionsEmulatorConnected = false;

function usesFirebaseEmulators() {
  return process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true';
}

function getFirebaseApp() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'tastes-934e6';
  return getApps().length > 0 ? getApp() : initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyC486z8f5sqDm-ipAwFPaadVmddbX9_mqY',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'tastes-934e6.firebasestorage.app',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '254210443804',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '1:254210443804:web:1e73db67903018421f2dd9',
  });
}

export function getFirebaseAuth() {
  const auth = getAuth(getFirebaseApp());
  if (usesFirebaseEmulators() && !authEmulatorConnected) {
    const host = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9101';
    connectAuthEmulator(auth, `http://${host}`, { disableWarnings: true });
    authEmulatorConnected = true;
  }
  return auth;
}

export function getFirebaseStorage() {
  return getStorage(getFirebaseApp());
}

export async function callAdmin<Input, Output>(name: string, input: Input): Promise<Output> {
  const functions = getFunctions(getFirebaseApp(), 'europe-west1');
  if (usesFirebaseEmulators() && !functionsEmulatorConnected) {
    const [host, port = '5002'] = (
      process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5002'
    ).split(':');
    connectFunctionsEmulator(functions, host || '127.0.0.1', Number(port));
    functionsEmulatorConnected = true;
  }
  const response = await httpsCallable<Input, Output>(functions, name)(input);
  return response.data;
}
