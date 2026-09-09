import type { DocumentReference } from 'firebase-admin/firestore';
import { db } from './firebase';

export function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase('en-US');
}

export function usernameClaimId(username: string): string {
  return `handle:${normalizeUsername(username)}`;
}

export function usernameReference(username: string): DocumentReference {
  // A username itself must never become a Firestore document ID: `.` and `..`
  // are reserved path segments. The stable prefix also leaves room for future
  // claim metadata without changing the public handle format.
  return db.collection('_usernames').doc(usernameClaimId(username));
}

export function privateUserReference(uid: string): DocumentReference {
  return db.collection('_userPrivate').doc(uid);
}
