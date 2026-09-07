import type { DocumentReference } from 'firebase-admin/firestore';
import { db } from './firebase';

export function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase('en-US');
}

export function usernameReference(username: string): DocumentReference {
  return db.collection('_usernames').doc(normalizeUsername(username));
}

export function privateUserReference(uid: string): DocumentReference {
  return db.collection('_userPrivate').doc(uid);
}
