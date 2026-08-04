import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  initializeApp();
}

export const firestoreDatabaseId =
  process.env.FIRESTORE_DATABASE_ID ??
  (process.env.FIRESTORE_EMULATOR_HOST ? '(default)' : 'tastes-eu');

export const db =
  firestoreDatabaseId === '(default)'
    ? getFirestore()
    : getFirestore(firestoreDatabaseId);
