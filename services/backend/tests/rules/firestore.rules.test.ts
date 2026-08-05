import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore';

let testEnvironment: RulesTestEnvironment;
const projectId = process.env.TEST_PROJECT_ID ?? 'demo-tastes';

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync('services/backend/firebase/firestore.rules', 'utf8'),
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
    await setDoc(doc(db, 'users', 'user-a', 'following', 'user-b'), { userId: 'user-b' });
    await setDoc(doc(db, 'users', 'user-a', 'folders', 'date-spots'), { name: 'Date spots' });
    await setDoc(doc(db, 'users', 'user-a', 'savedVenues', 'active'), { venueId: 'active' });
    await setDoc(doc(db, 'conversations', 'conversation-ab'), {
      participantIds: ['user-a', 'user-b'],
      status: 'active',
      updatedAt: new Date(),
    });
    await setDoc(doc(db, 'conversations', 'conversation-ab', 'messages', 'message-1'), {
      senderId: 'user-a',
      recipientId: 'user-b',
      text: 'Hello',
      createdAt: new Date(),
    });
    await setDoc(doc(db, 'activities', 'activity-ab'), {
      organizerId: 'user-a',
      participantIds: ['user-a', 'user-b'],
      status: 'active',
    });
    await setDoc(doc(db, 'notifications', 'notification-b'), {
      recipientId: 'user-b',
      type: 'message',
    });
    await setDoc(doc(db, 'users', 'user-a', 'pushTokens', 'secret-token'), {
      token: 'ExpoPushToken[secret]',
      active: true,
    });
    await setDoc(doc(db, '_otpChallenges', 'secret'), { phoneNumber: '+905551234567' });
    await setDoc(doc(db, '_otpRateLimits', 'secret'), { count: 1 });
    await setDoc(doc(db, '_contentRateLimits', 'secret'), { count: 1 });
    await setDoc(doc(db, '_idempotency', 'secret'), { active: true });
    await setDoc(doc(db, '_pushTokens', 'secret'), { uid: 'user-a' });
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

  it('allows the profile screen to read a user and query their published reviews', async () => {
    const db = testEnvironment.authenticatedContext('user-b').firestore();
    await assertSucceeds(getDoc(doc(db, 'users', 'user-a')));

    const reviews = await assertSucceeds(getDocs(query(
      collection(db, 'reviews'),
      where('status', '==', 'published'),
      where('authorId', '==', 'user-a'),
      orderBy('createdAt', 'desc'),
      limit(20),
    )));

    expect(reviews.docs.map((review) => review.id)).toEqual(['published']);
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

  it('allows owners to read favourites but keeps them backend-owned and private', async () => {
    const ownerDb = testEnvironment.authenticatedContext('user-a').firestore();
    const otherDb = testEnvironment.authenticatedContext('user-b').firestore();
    await assertSucceeds(getDoc(doc(ownerDb, 'users', 'user-a', 'folders', 'date-spots')));
    await assertSucceeds(getDoc(doc(ownerDb, 'users', 'user-a', 'savedVenues', 'active')));
    await assertFails(getDoc(doc(otherDb, 'users', 'user-a', 'folders', 'date-spots')));
    await assertFails(getDoc(doc(otherDb, 'users', 'user-a', 'savedVenues', 'active')));
    await assertFails(setDoc(doc(ownerDb, 'users', 'user-a', 'folders', 'bars'), { name: 'Bars' }));
    await assertFails(setDoc(doc(ownerDb, 'users', 'user-a', 'savedVenues', 'hidden'), { venueId: 'hidden' }));
  });

  it('never exposes OTP challenges, even to staff', async () => {
    const userDb = testEnvironment.authenticatedContext('user-a').firestore();
    const staffDb = testEnvironment.authenticatedContext('staff', { role: 'admin' }).firestore();
    await assertFails(getDoc(doc(userDb, '_otpChallenges', 'secret')));
    await assertFails(getDoc(doc(staffDb, '_otpChallenges', 'secret')));
    await assertFails(setDoc(doc(userDb, '_otpChallenges', 'new'), { status: 'pending' }));
    await assertFails(getDoc(doc(staffDb, '_otpRateLimits', 'secret')));
  });

  it('keeps social edges and mutation-control documents backend-owned', async () => {
    const userDb = testEnvironment.authenticatedContext('user-a').firestore();
    const staffDb = testEnvironment.authenticatedContext('staff', { role: 'admin' }).firestore();
    await assertFails(getDoc(doc(userDb, 'users', 'user-a', 'following', 'user-b')));
    await assertFails(setDoc(doc(userDb, 'users', 'user-a', 'following', 'user-c'), { userId: 'user-c' }));
    await assertFails(getDoc(doc(staffDb, '_contentRateLimits', 'secret')));
    await assertFails(getDoc(doc(staffDb, '_idempotency', 'secret')));
    await assertFails(getDoc(doc(staffDb, '_pushTokens', 'secret')));
  });

  it('allows only participants to read conversations and messages', async () => {
    const participantDb = testEnvironment.authenticatedContext('user-a').firestore();
    const otherDb = testEnvironment.authenticatedContext('user-c').firestore();
    await assertSucceeds(getDoc(doc(participantDb, 'conversations', 'conversation-ab')));
    await assertSucceeds(getDoc(doc(participantDb, 'conversations', 'conversation-ab', 'messages', 'message-1')));
    await assertFails(getDoc(doc(otherDb, 'conversations', 'conversation-ab')));
    await assertFails(getDoc(doc(otherDb, 'conversations', 'conversation-ab', 'messages', 'message-1')));
    await assertFails(setDoc(doc(participantDb, 'conversations', 'conversation-ab', 'messages', 'message-2'), {
      senderId: 'user-a',
      text: 'Direct writes stay forbidden',
    }));
  });

  it('permits participant-scoped conversation queries but rejects broad inbox reads', async () => {
    const db = testEnvironment.authenticatedContext('user-a').firestore();
    await assertSucceeds(getDocs(query(
      collection(db, 'conversations'),
      where('participantIds', 'array-contains', 'user-a'),
    )));
    await assertFails(getDocs(collection(db, 'conversations')));
  });

  it('allows only participants to read activity details and denies direct writes', async () => {
    const participantDb = testEnvironment.authenticatedContext('user-b').firestore();
    const otherDb = testEnvironment.authenticatedContext('user-c').firestore();
    await assertSucceeds(getDoc(doc(participantDb, 'activities', 'activity-ab')));
    await assertFails(getDoc(doc(otherDb, 'activities', 'activity-ab')));
    await assertFails(setDoc(doc(participantDb, 'activities', 'activity-ab'), { status: 'cancelled' }));
  });

  it('keeps notifications private and push tokens backend-only', async () => {
    const recipientDb = testEnvironment.authenticatedContext('user-b').firestore();
    const otherDb = testEnvironment.authenticatedContext('user-a').firestore();
    await assertSucceeds(getDoc(doc(recipientDb, 'notifications', 'notification-b')));
    await assertFails(getDoc(doc(otherDb, 'notifications', 'notification-b')));
    await assertFails(setDoc(doc(recipientDb, 'notifications', 'notification-new'), { recipientId: 'user-b' }));
    await assertFails(getDoc(doc(otherDb, 'users', 'user-a', 'pushTokens', 'secret-token')));
  });
});
