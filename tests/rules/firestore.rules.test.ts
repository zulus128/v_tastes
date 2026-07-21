import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let testEnvironment: RulesTestEnvironment;
const projectId = process.env.TEST_PROJECT_ID ?? 'demo-tastes';

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync('firebase/firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'venues', 'active'), { name: 'Active', city: 'Istanbul', status: 'active' });
    await setDoc(doc(db, 'venues', 'hidden'), { name: 'Hidden', city: 'Istanbul', status: 'hidden' });
    await setDoc(doc(db, 'reviews', 'published'), {
      authorId: 'user-a',
      status: 'published',
      createdAt: new Date(),
    });
    await setDoc(doc(db, 'reviews', 'hidden'), {
      authorId: 'user-b',
      status: 'hidden',
      createdAt: new Date(),
    });
    await setDoc(doc(db, 'reviews', 'published', 'comments', 'published'), { status: 'published' });
    await setDoc(doc(db, 'reviews', 'published', 'comments', 'hidden'), { status: 'hidden' });
    await setDoc(doc(db, 'reviews', 'published', 'reactions', 'user-a'), { reaction: 'like' });
    await setDoc(doc(db, 'users', 'user-a'), { displayName: 'User A' });
    await setDoc(doc(db, '_otpChallenges', 'secret'), { phoneNumber: '+905551234567' });
    await setDoc(doc(db, '_otpRateLimits', 'secret'), { count: 1 });
  });
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe('Firestore security rules', () => {
  it('denies anonymous venue reads', async () => {
    const db = testEnvironment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'venues', 'active')));
  });

  it('allows authenticated users to read active venues', async () => {
    const db = testEnvironment.authenticatedContext('user-a').firestore();
    await assertSucceeds(getDoc(doc(db, 'venues', 'active')));
  });

  it('denies hidden venues to ordinary users', async () => {
    const db = testEnvironment.authenticatedContext('user-a').firestore();
    await assertFails(getDoc(doc(db, 'venues', 'hidden')));
  });

  it('allows published review reads but denies direct writes', async () => {
    const db = testEnvironment.authenticatedContext('user-a').firestore();
    await assertSucceeds(getDoc(doc(db, 'reviews', 'published')));
    await assertFails(setDoc(doc(db, 'reviews', 'new'), { authorId: 'user-a', status: 'published' }));
  });

  it('allows moderators and admins to read hidden venues and reviews', async () => {
    for (const role of ['moderator', 'admin']) {
      const db = testEnvironment.authenticatedContext(`staff-${role}`, { role }).firestore();
      await assertSucceeds(getDoc(doc(db, 'venues', 'hidden')));
      await assertSucceeds(getDoc(doc(db, 'reviews', 'hidden')));
    }
  });

  it('allows an author to read their hidden review but not another user review', async () => {
    const authorDb = testEnvironment.authenticatedContext('user-b').firestore();
    const otherDb = testEnvironment.authenticatedContext('user-a').firestore();
    await assertSucceeds(getDoc(doc(authorDb, 'reviews', 'hidden')));
    await assertFails(getDoc(doc(otherDb, 'reviews', 'hidden')));
  });

  it('protects comments while allowing staff moderation access', async () => {
    const userDb = testEnvironment.authenticatedContext('user-a').firestore();
    const staffDb = testEnvironment.authenticatedContext('staff', { role: 'moderator' }).firestore();
    await assertSucceeds(getDoc(doc(userDb, 'reviews', 'published', 'comments', 'published')));
    await assertFails(getDoc(doc(userDb, 'reviews', 'published', 'comments', 'hidden')));
    await assertSucceeds(getDoc(doc(staffDb, 'reviews', 'published', 'comments', 'hidden')));
    await assertFails(setDoc(doc(userDb, 'reviews', 'published', 'comments', 'new'), { status: 'published' }));
  });

  it('allows reaction reads but denies direct reaction writes', async () => {
    const db = testEnvironment.authenticatedContext('user-a').firestore();
    await assertSucceeds(getDoc(doc(db, 'reviews', 'published', 'reactions', 'user-a')));
    await assertFails(setDoc(doc(db, 'reviews', 'published', 'reactions', 'user-b'), { reaction: 'like' }));
  });

  it('denies direct user writes, including writes to the caller own profile', async () => {
    const db = testEnvironment.authenticatedContext('user-a').firestore();
    await assertSucceeds(getDoc(doc(db, 'users', 'user-a')));
    await assertFails(setDoc(doc(db, 'users', 'user-a'), { displayName: 'Changed' }));
  });

  it('never exposes OTP challenges, even to staff', async () => {
    const userDb = testEnvironment.authenticatedContext('user-a').firestore();
    const staffDb = testEnvironment.authenticatedContext('staff', { role: 'admin' }).firestore();
    await assertFails(getDoc(doc(userDb, '_otpChallenges', 'secret')));
    await assertFails(getDoc(doc(staffDb, '_otpChallenges', 'secret')));
    await assertFails(setDoc(doc(userDb, '_otpChallenges', 'new'), { status: 'pending' }));
    await assertFails(getDoc(doc(staffDb, '_otpRateLimits', 'secret')));
  });
});
