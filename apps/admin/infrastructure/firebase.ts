'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

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
  return getAuth(getFirebaseApp());
}

export async function callAdmin<Input, Output>(name: string, input: Input): Promise<Output> {
  const functions = getFunctions(getFirebaseApp(), 'europe-west1');
  const response = await httpsCallable<Input, Output>(functions, name)(input);
  return response.data;
}
