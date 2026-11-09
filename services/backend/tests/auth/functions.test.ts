import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TasteRecommendationsResult } from '@tastes/contracts';
import {
  rebuildTasteEvidence,
  maintainTasteEvidenceIfNeeded,
} from '../../functions/src/modules/taste-match/maintenance';
import { refreshTasteReviewProjection } from '../../functions/src/modules/taste-match/projection';

const PROJECT_ID = process.env.TEST_PROJECT_ID ?? 'demo-tastes';
const FUNCTIONS_HOST = process.env.TEST_FUNCTIONS_HOST ?? '127.0.0.1:5001';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8180';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const FUNCTIONS_URL = `http://${FUNCTIONS_HOST}/${PROJECT_ID}/europe-west1`;
const FIRESTORE_EMULATOR_URL = `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH_EMULATOR_URL = `http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`;

interface CallableFailure {
  details?: Record<string, unknown>;
  message: string;
  status?: string;
}

let phoneSequence = 0;

function uniquePhone(): string {
  phoneSequence += 1;
  return `+90555${String(Date.now() + phoneSequence).slice(-7)}`;
}

function rateLimitId(phoneNumber: string): string {
  return createHash('sha256').update(`phone:${phoneNumber}`).digest('hex');
}

function scopedRateLimitId(scope: string, value: string): string {
  return createHash('sha256').update(`${scope}:${value}`).digest('hex');
}

async function callFunction<T>(
  name: string,
  data: unknown,
  token?: string,
  options?: { profileDefaults?: boolean },
): Promise<T> {
  const requestData =
    name === 'createUserProfile' &&
    options?.profileDefaults !== false &&
    typeof data === 'object' &&
    data !== null
      ? { birthDate: '1990-01-01', ...data }
      : data;
  const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data: requestData }),
  });
  const payload = (await response.json()) as {
    result?: T;
    error?: CallableFailure;
  };

  if (!response.ok || payload.error) {
    throw (
      payload.error ??
      new Error(`Callable ${name} failed with HTTP ${response.status}`)
    );
  }
  return payload.result as T;
}

async function postTelemetry(
  payload: unknown,
  token?: string,
): Promise<Response> {
  return fetch(`${FUNCTIONS_URL}/ingestMobileTelemetry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
}

async function authenticatedUser() {
  const phoneNumber = uniquePhone();
  const challenge = await requestOtp(phoneNumber);
  const verified = await callFunction<{ customToken: string }>(
    'verifyPhoneOtp',
    {
      challengeId: challenge.challengeId,
      code: challenge.localCode,
    },
  );
  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: verified.customToken,
        returnSecureToken: true,
      }),
    },
  );
  const result = (await response.json()) as {
    idToken: string;
    localId: string;
  };
  return { token: result.idToken, uid: result.localId, phoneNumber };
}

async function expectReason(
  promise: Promise<unknown>,
  reason: string,
): Promise<CallableFailure> {
  try {
    await promise;
  } catch (error) {
    const failure = error as CallableFailure;
    expect(failure).toMatchObject({ details: { reason } });
    return failure;
  }
  throw new Error(`Expected callable to fail with reason ${reason}`);
}

async function requestOtp(phoneNumber: string) {
  return callFunction<{
    challengeId: string;
    expiresAt: string;
    localCode: string;
    resendAvailableAt: string;
  }>('requestPhoneOtp', { phoneNumber });
}

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
});

beforeEach(async () => {
  await Promise.all([
    fetch(FIRESTORE_EMULATOR_URL, { method: 'DELETE' }),
    fetch(AUTH_EMULATOR_URL, { method: 'DELETE' }),
  ]);
});

async function createSocialFixture() {
  const first = await authenticatedUser();
  const second = await authenticatedUser();
  const db = getFirestore();
  await callFunction(
    'createUserProfile',
    {
      displayName: 'Review Author',
      username: 'review.author',
      city: 'Istanbul',
    },
    first.token,
  );
  await callFunction(
    'createUserProfile',
    {
      displayName: 'Reader',
      username: 'review.reader',
      city: 'Istanbul',
    },
    second.token,
  );
  const author = (
    await db
      .collection('users')
      .where('username', '==', 'review.author')
      .limit(1)
      .get()
  ).docs[0];
  const reader = (
    await db
      .collection('users')
      .where('username', '==', 'review.reader')
      .limit(1)
      .get()
  ).docs[0];
  if (!author || !reader) throw new Error('Expected both profiles to exist.');

  return { first, second, db, author, reader };
}

async function createReviewFixture() {
  const fixture = await createSocialFixture();
  await fixture.db.collection('venues').doc('demo-cafe').set({
    name: 'Demo Cafe',
    city: 'Istanbul',
    status: 'active',
  });
  await callFunction(
    'followUser',
    { targetUserId: fixture.author.id },
    fixture.second.token,
  );
  const reviewCommand = {
    idempotencyKey: 'review-command-0001',
    venueId: 'demo-cafe',
    rating: 5,
    text: 'Exactly once',
    tags: ['casual', 'date-night'],
    dishReviews: [
      {
        id: 'dish-command-0001',
        title: 'Soup dumplings',
        rating: 4.5,
        photoPath: `review-images/${fixture.author.id}/review-command-0001/dish-command-0001`,
      },
    ],
  };
  const firstReview = await callFunction<{ id: string }>(
    'createReview',
    reviewCommand,
    fixture.first.token,
  );

  return { ...fixture, reviewCommand, firstReview };
}

describe('mobile observability endpoint', () => {
  it('requires Firebase authentication', async () => {
    const response = await postTelemetry({
      kind: 'event',
      event: 'app_opened',
    });
    expect(response.status).toBe(401);
  });

  it('accepts authenticated events and exceptions', async () => {
    const user = await authenticatedUser();
    const eventResponse = await postTelemetry(
      {
        kind: 'event',
        event: 'screen_opened',
        timestamp: new Date().toISOString(),
        context: { screen: 'discover', count: 3 },
      },
      user.token,
    );
    expect(eventResponse.status).toBe(202);
    await expect(eventResponse.json()).resolves.toEqual({ accepted: true });

    const errorResponse = await postTelemetry(
      {
        kind: 'exception',
        name: 'Error',
        message: 'Test exception',
        stack: 'Error: Test exception',
      },
      user.token,
    );
    expect(errorResponse.status).toBe(202);
  });

  it('rejects malformed telemetry', async () => {
    const user = await authenticatedUser();
    const response = await postTelemetry(
      { kind: 'event', event: '' },
      user.token,
    );
    expect(response.status).toBe(400);
  });
});

describe('phone OTP callables', () => {
  it('uses unpredictable, independent challenges and enforces resend cooldown', async () => {
    const phoneNumber = uniquePhone();
    const first = await requestOtp(phoneNumber);

    expect(first.challengeId).not.toBe(
      createHash('sha256').update(phoneNumber).digest('hex'),
    );
    await expectReason(requestOtp(phoneNumber), 'resend-too-soon');

    await getFirestore()
      .collection('_otpRateLimits')
      .doc(rateLimitId(phoneNumber))
      .update({
        nextAllowedAt: Timestamp.fromMillis(Date.now() - 1),
      });
    const second = await requestOtp(phoneNumber);
    expect(second.challengeId).not.toBe(first.challengeId);
  });

  it('rate-limits repeated sends to one phone number', async () => {
    const phoneNumber = uniquePhone();

    for (let request = 1; request <= 5; request += 1) {
      await requestOtp(phoneNumber);
      await getFirestore()
        .collection('_otpRateLimits')
        .doc(rateLimitId(phoneNumber))
        .update({
          nextAllowedAt: Timestamp.fromMillis(Date.now() - 1),
        });
    }

    await expectReason(requestOtp(phoneNumber), 'rate-limit-reached');
  });

  it('consumes a challenge after a successful verification and rejects replay', async () => {
    const challenge = await requestOtp(uniquePhone());
    expect(challenge.localCode).toBe('1332');
    const verified = await callFunction<{
      customToken: string;
      isNewUser: boolean;
    }>('verifyPhoneOtp', {
      challengeId: challenge.challengeId,
      code: challenge.localCode,
    });

    expect(verified.customToken).toBeTruthy();
    expect(verified.isNewUser).toBe(true);
    await expectReason(
      callFunction('verifyPhoneOtp', {
        challengeId: challenge.challengeId,
        code: '0000',
      }),
      'challenge-not-found',
    );
  });

  it('rejects expired challenges', async () => {
    const challenge = await requestOtp(uniquePhone());
    await getFirestore()
      .collection('_otpChallenges')
      .doc(challenge.challengeId)
      .update({
        expiresAt: Timestamp.fromMillis(Date.now() - 1),
      });

    await expectReason(
      callFunction('verifyPhoneOtp', {
        challengeId: challenge.challengeId,
        code: challenge.localCode,
      }),
      'code-expired',
    );
  });

  it('locks a challenge after five incorrect attempts', async () => {
    const challenge = await requestOtp(uniquePhone());

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const failure = await expectReason(
        callFunction('verifyPhoneOtp', {
          challengeId: challenge.challengeId,
          code: '0000',
        }),
        'incorrect-code',
      );
      expect(failure.details?.attemptsRemaining).toBe(5 - attempt);
    }

    await expectReason(
      callFunction('verifyPhoneOtp', {
        challengeId: challenge.challengeId,
        code: challenge.localCode,
      }),
      'max-attempts-reached',
    );
  });

  it('keeps four-digit codes but caps verification attempts per phone number', async () => {
    const phoneNumber = uniquePhone();
    const challenge = await requestOtp(phoneNumber);
    expect(challenge.localCode).toHaveLength(4);
    await getFirestore()
      .collection('_otpRateLimits')
      .doc(scopedRateLimitId('phone-verify', phoneNumber))
      .set({ count: 10, windowStartedAt: Timestamp.now() });
    await expectReason(
      callFunction('verifyPhoneOtp', {
        challengeId: challenge.challengeId,
        code: challenge.localCode,
      }),
      'rate-limit-reached',
    );
  });

  it('serializes concurrent checks so they cannot bypass the attempt counter', async () => {
    const challenge = await requestOtp(uniquePhone());
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        callFunction('verifyPhoneOtp', {
          challengeId: challenge.challengeId,
          code: '0000',
        }),
      ),
    );
    const reasons = results.map((result) =>
      result.status === 'rejected'
        ? (result.reason as CallableFailure).details?.reason
        : 'unexpected-success',
    );
    const snapshot = await getFirestore()
      .collection('_otpChallenges')
      .doc(challenge.challengeId)
      .get();
    const incorrectChecks = reasons.filter(
      (reason) => reason === 'incorrect-code',
    ).length;

    expect(reasons).toContain('incorrect-code');
    expect(
      reasons.every(
        (reason) =>
          reason === 'incorrect-code' || reason === 'verification-in-progress',
      ),
    ).toBe(true);
    expect(snapshot.get('failedAttempts')).toBe(incorrectChecks);
    expect(incorrectChecks).toBeLessThanOrEqual(5);
  }, 15_000);
});

describe('authenticated session and paginated reads', () => {
  it('requires a birth date when creating a profile for the first time', async () => {
    const { token } = await authenticatedUser();

    await expect(
      callFunction(
        'createUserProfile',
        {
          displayName: 'Demo User',
          username: 'demo.user',
          city: 'Istanbul',
        },
        token,
        { profileDefaults: false },
      ),
    ).rejects.toMatchObject({
      details: { reason: 'birth-date-required' },
    });
  }, 15_000);

  it('uses the server profile as the onboarding source of truth', async () => {
    const { token } = await authenticatedUser();

    expect(await callFunction('getSessionStatus', {}, token)).toEqual({
      profileExists: false,
      onboardingVersion: 0,
      onboardingComplete: false,
      minimumSupportedIosBuild: 49,
    });
    await callFunction(
      'createUserProfile',
      {
        displayName: 'Demo User',
        username: 'demo.user',
        city: 'Istanbul',
        countryCode: 'TR',
      },
      token,
    );
    await callFunction(
      'updateProfileSettings',
      { bio: 'Natural wine and handmade pasta.' },
      token,
    );
    expect(await callFunction('getSessionStatus', {}, token)).toMatchObject({
      profileExists: true,
      onboardingComplete: false,
    });
    await callFunction(
      'completeOnboarding',
      {
        version: 1,
        favoriteDish: 'Sushi',
        favoriteVenueId: 'morimoto',
        invitedContactCount: 3,
        appearance: 'dark',
      },
      token,
    );
    expect(await callFunction('getSessionStatus', {}, token)).toMatchObject({
      onboardingVersion: 1,
      onboardingComplete: true,
    });
    const profile = await getFirestore()
      .collection('users')
      .where('username', '==', 'demo.user')
      .limit(1)
      .get();
    expect(profile.docs[0]?.get('email')).toBeUndefined();
    expect(profile.docs[0]?.get('phoneNumber')).toBeUndefined();
    expect(profile.docs[0]?.get('signupNetworkHash')).toBeUndefined();
    const storedNetwork = (
      await getFirestore()
        .collection('_userPrivate')
        .doc(profile.docs[0]!.id)
        .get()
    ).get('signupNetworkHash');
    // The emulator may omit the source address; absence must remain unknown.
    expect(
      storedNetwork === null ||
        (typeof storedNetwork === 'string' &&
          /^[a-f0-9]{64}$/.test(storedNetwork)),
    ).toBe(true);
    const { networkFingerprint } =
      await import('../../functions/src/shared/network-fingerprint');
    const network = await networkFingerprint('198.51.100.4');
    expect(network).toMatch(/^[a-f0-9]{64}$/);
    expect(await networkFingerprint('198.51.100.4')).toBe(network);
    expect(await networkFingerprint('198.51.100.5')).not.toBe(network);
    expect(await networkFingerprint(undefined)).toBeNull();
    expect(profile.docs[0]?.get('countryCode')).toBe('TR');
    await callFunction('updateProfileSettings', { city: 'Paris' }, token);
    expect((await profile.docs[0]!.ref.get()).get('countryCode')).toBe('FR');
    await callFunction(
      'updateProfileSettings',
      { city: 'Unknown city' },
      token,
    );
    expect((await profile.docs[0]!.ref.get()).get('countryCode')).toBeNull();
    expect(profile.docs[0]?.get('bio')).toBe(
      'Natural wine and handmade pasta.',
    );
    expect(
      (
        await getFirestore()
          .collection('_userPrivate')
          .doc(profile.docs[0]!.id)
          .get()
      ).get('phoneNumber'),
    ).toBeTruthy();
    expect(profile.docs[0]?.get('tastePreferences')).toEqual({
      favoriteDish: 'Sushi',
      favoriteVenueId: 'morimoto',
    });
    expect(await callFunction('getMonthlyRecap', {}, token)).toMatchObject({
      ready: false,
      placesVisited: 0,
    });
  }, 15_000);

  it('keeps usernames unique and does not reactivate blocked profiles', async () => {
    const first = await authenticatedUser();
    const second = await authenticatedUser();
    const db = getFirestore();
    await callFunction(
      'createUserProfile',
      {
        displayName: 'First User',
        username: 'Unique.Name',
        city: 'Istanbul',
      },
      first.token,
    );
    await expect(
      callFunction(
        'createUserProfile',
        {
          displayName: 'Second User',
          username: 'unique.name',
          city: 'Istanbul',
        },
        second.token,
      ),
    ).rejects.toBeTruthy();
    const usernameClaim = await db
      .collection('_usernames')
      .doc('handle:unique.name')
      .get();
    const firstUid = String(usernameClaim.get('uid'));
    const firstRef = db.collection('users').doc(firstUid);
    await firstRef.update({ status: 'banned' });
    await expect(
      callFunction(
        'createUserProfile',
        {
          displayName: 'First User',
          username: 'another.name',
          city: 'Istanbul',
        },
        first.token,
      ),
    ).rejects.toBeTruthy();
    expect((await firstRef.get()).get('status')).toBe('banned');
    expect(usernameClaim.get('uid')).toBe(firstUid);
  }, 15_000);

  it('paginates favourites and notifications and clears every notification', async () => {
    const user = await authenticatedUser();
    const db = getFirestore();
    await callFunction(
      'createUserProfile',
      {
        displayName: 'Long List User',
        username: 'long.list.user',
        city: 'Istanbul',
      },
      user.token,
    );
    const userDocument = (
      await db
        .collection('users')
        .where('username', '==', 'long.list.user')
        .limit(1)
        .get()
    ).docs[0];
    if (!userDocument) throw new Error('Expected the long-list profile.');
    const userRef = userDocument.ref;
    const batch = db.batch();
    for (let index = 0; index < 3; index += 1) {
      const venueId = `paged-venue-${index}`;
      batch.set(db.collection('venues').doc(venueId), {
        name: `Paged venue ${index}`,
        city: 'Istanbul',
        status: 'active',
      });
      batch.set(userRef.collection('savedVenues').doc(venueId), {
        venueId,
        folderIds: [],
        createdAt: Timestamp.fromMillis(Date.now() - index * 1_000),
      });
    }
    for (let index = 0; index < 205; index += 1) {
      batch.set(
        userRef
          .collection('notifications')
          .doc(`notification-${String(index).padStart(3, '0')}`),
        {
          kind: 'system',
          title: `Notification ${index}`,
          body: 'Pagination fixture',
          unread: true,
          createdAt: Timestamp.fromMillis(Date.now() - index * 1_000),
        },
      );
    }
    await batch.commit();

    const favourites = await callFunction<{
      places: Array<{ venueId: string }>;
      nextCursor: string | null;
    }>('getFavourites', { limit: 2 }, user.token);
    expect(favourites.places).toHaveLength(2);
    expect(favourites.nextCursor).toBeTruthy();
    const nextFavourites = await callFunction<{
      places: Array<{ venueId: string }>;
      nextCursor: string | null;
    }>(
      'getFavourites',
      { limit: 2, cursor: favourites.nextCursor },
      user.token,
    );
    expect(nextFavourites.places).toHaveLength(1);

    const notifications = await callFunction<{
      items: Array<{ id: string }>;
      nextCursor: string | null;
    }>('listNotifications', { limit: 20 }, user.token);
    expect(notifications.items).toHaveLength(20);
    expect(notifications.nextCursor).toBeTruthy();
    const cleared = await callFunction<{ cleared: number }>(
      'clearNotifications',
      {},
      user.token,
    );
    expect(cleared.cleared).toBe(205);
    expect((await userRef.collection('notifications').get()).empty).toBe(true);
  }, 15_000);

  it('writes and removes mirrored social edges', async () => {
    const { first, second, author, reader, db } = await createSocialFixture();
    expect(
      await callFunction(
        'followUser',
        { targetUserId: author.id },
        second.token,
      ),
    ).toEqual({
      following: true,
    });
    expect(
      (await reader.ref.collection('following').doc(author.id).get()).exists,
    ).toBe(true);
    expect(
      (await author.ref.collection('followers').doc(reader.id).get()).exists,
    ).toBe(true);
    await callFunction('followUser', { targetUserId: author.id }, second.token);
    const follows = await db
      .collection('_activityEvents')
      .where('kind', '==', 'follow-created')
      .get();
    expect(
      follows.docs.filter(
        (event) =>
          event.get('actorId') === reader.id &&
          event.get('targetId') === author.id,
      ),
    ).toHaveLength(1);
    expect(
      await callFunction(
        'removeFollower',
        { followerUserId: reader.id },
        first.token,
      ),
    ).toEqual({
      following: false,
    });
    expect(
      (await reader.ref.collection('following').doc(author.id).get()).exists,
    ).toBe(false);
    expect(
      (await author.ref.collection('followers').doc(reader.id).get()).exists,
    ).toBe(false);
    await callFunction('followUser', { targetUserId: author.id }, second.token);
    expect(
      await callFunction(
        'unfollowUser',
        { targetUserId: author.id },
        second.token,
      ),
    ).toEqual({
      following: false,
    });
    expect(
      (await reader.ref.collection('following').doc(author.id).get()).exists,
    ).toBe(false);
  }, 15_000);

  it('creates reviews idempotently and exposes them in the friends feed', async () => {
    const { first, second, db, author, reviewCommand, firstReview } =
      await createReviewFixture();
    const replayedReview = await callFunction<{ id: string }>(
      'createReview',
      reviewCommand,
      first.token,
    );
    expect(replayedReview.id).toBe(firstReview.id);
    const createEvents = await db
      .collection('_activityEvents')
      .where('kind', '==', 'review-created')
      .get();
    expect(
      createEvents.docs.filter(
        (event) => event.get('targetId') === firstReview.id,
      ),
    ).toHaveLength(1);
    expect((await author.ref.get()).get('xp')).toBe(50);
    const reviewDocument = await db
      .collection('reviews')
      .doc(firstReview.id)
      .get();
    expect(reviewDocument.get('tags')).toEqual(['casual', 'date-night']);
    expect(reviewDocument.get('dishNames')).toEqual(['Soup dumplings']);
    expect(reviewDocument.get('dishReviews')).toMatchObject(
      reviewCommand.dishReviews,
    );
    expect(typeof reviewDocument.get('dishReviews')[0].ratedAt).toBe('string');
    expect(reviewDocument.get('xpBefore')).toBe(0);
    expect(reviewDocument.get('xpAfter')).toBe(50);
    expect(
      (await db.collection('venues').doc('demo-cafe').get()).get('reviewCount'),
    ).toBe(1);
    expect((await author.ref.get()).get('reviewCount')).toBe(1);
    const friendsFeed = await callFunction<{
      items: Array<{ id: string; tags: string[]; dishReviews: unknown[] }>;
    }>('getFeed', { scope: 'friends', limit: 20 }, second.token);
    expect(friendsFeed.items.map((item) => item.id)).toContain(firstReview.id);
    expect(
      friendsFeed.items.find((item) => item.id === firstReview.id),
    ).toMatchObject({
      tags: ['casual', 'date-night'],
      dishReviews: reviewCommand.dishReviews,
    });
  }, 15_000);

  it('handles comment threads, reports, reactions, and cascade deletion', async () => {
    const { first, second, db, author, reader, reviewCommand, firstReview } =
      await createReviewFixture();

    await expect(
      callFunction(
        'addComment',
        {
          idempotencyKey: 'comment-screened-001',
          reviewId: firstReview.id,
          text: 'FUCK!',
        },
        second.token,
      ),
    ).rejects.toMatchObject({
      status: 'INVALID_ARGUMENT',
      details: { reason: 'blocked-comment-term' },
    });
    expect(
      (
        await db
          .collection('reviews')
          .doc(firstReview.id)
          .collection('comments')
          .get()
      ).size,
    ).toBe(0);

    const commentCommand = {
      idempotencyKey: 'comment-command-001',
      reviewId: firstReview.id,
      text: 'Exactly once too',
    };
    const firstComment = await callFunction<{ id: string }>(
      'addComment',
      commentCommand,
      second.token,
    );
    await callFunction('addComment', commentCommand, second.token);
    const commentEvents = await db
      .collection('_activityEvents')
      .where('kind', '==', 'comment-added')
      .get();
    expect(
      commentEvents.docs.filter(
        (event) => event.get('commentId') === firstComment.id,
      ),
    ).toHaveLength(1);
    expect(
      (await db.collection('reviews').doc(firstReview.id).get()).get(
        'commentCount',
      ),
    ).toBe(1);

    const reply = await callFunction<{ id: string }>(
      'addComment',
      {
        idempotencyKey: 'comment-reply-command-001',
        reviewId: firstReview.id,
        parentCommentId: firstComment.id,
        text: 'A complete branch',
      },
      first.token,
    );
    const newerReplies: string[] = [];
    for (let index = 2; index <= 4; index += 1) {
      const newerReply = await callFunction<{ id: string }>(
        'addComment',
        {
          idempotencyKey: `comment-reply-command-00${index}`,
          reviewId: firstReview.id,
          parentCommentId: firstComment.id,
          text: `Bounded reply ${index}`,
        },
        first.token,
      );
      newerReplies.push(newerReply.id);
    }
    const commentReaction = {
      idempotencyKey: 'comment-reaction-command-001',
      reviewId: firstReview.id,
      commentId: firstComment.id,
      reaction: 'like',
    };
    expect(
      await callFunction('reactToComment', commentReaction, first.token),
    ).toEqual({
      active: true,
      reactionCount: 1,
    });
    await author.ref.update({ status: 'banned' });
    await expect(
      callFunction(
        'reactToComment',
        {
          ...commentReaction,
          idempotencyKey: 'comment-reaction-command-002',
        },
        first.token,
      ),
    ).rejects.toBeTruthy();
    await author.ref.update({ status: 'active' });
    expect(
      await callFunction('reactToComment', commentReaction, first.token),
    ).toEqual({
      active: true,
      reactionCount: 1,
    });
    const thread = await callFunction<{
      items: Array<{ id: string; parentCommentId: string | null }>;
      review: {
        id: string;
        authorUsername: string | null;
        dishReviews: unknown[];
      };
    }>('getComments', { reviewId: firstReview.id, limit: 1 }, second.token);
    expect(thread.review).toMatchObject({
      id: firstReview.id,
      authorUsername: 'review.author',
      dishReviews: reviewCommand.dishReviews,
    });
    expect(thread.items[0]?.id).toBe(firstComment.id);
    expect(thread.items).toHaveLength(4);
    expect(thread.items.map((comment) => comment.id)).not.toContain(reply.id);
    expect(new Set(thread.items.slice(1).map((comment) => comment.id))).toEqual(
      new Set(newerReplies),
    );
    const replyPage = await callFunction<{
      items: Array<{ id: string; parentCommentId: string | null }>;
      nextCursor: string | null;
    }>(
      'getCommentReplies',
      { reviewId: firstReview.id, parentCommentId: firstComment.id, limit: 2 },
      second.token,
    );
    expect(replyPage.items).toHaveLength(2);
    expect(
      replyPage.items.every(
        (comment) => comment.parentCommentId === firstComment.id,
      ),
    ).toBe(true);
    expect(replyPage.nextCursor).not.toBeNull();
    const olderReplyPage = await callFunction<{ items: Array<{ id: string }> }>(
      'getCommentReplies',
      {
        reviewId: firstReview.id,
        parentCommentId: firstComment.id,
        limit: 2,
        cursor: replyPage.nextCursor,
      },
      second.token,
    );
    expect(
      new Set(
        [...replyPage.items, ...olderReplyPage.items].map(
          (comment) => comment.id,
        ),
      ).size,
    ).toBe(4);

    const report = await callFunction<{ id: string }>(
      'reportComment',
      {
        idempotencyKey: 'comment-report-0001',
        reviewId: firstReview.id,
        commentId: firstComment.id,
        reason: 'Spam',
      },
      second.token,
    );
    const reportDocument = await db.collection('reports').doc(report.id).get();
    expect(reportDocument.exists).toBe(true);
    expect(reportDocument.data()).toMatchObject({
      reporterId: reader.id,
      reporterName: 'Reader',
      targetType: 'comment',
      targetId: firstComment.id,
      parentId: firstReview.id,
      contentPreview: 'Exactly once too',
      status: 'pending',
    });

    await callFunction(
      'deleteComment',
      {
        reviewId: firstReview.id,
        commentId: firstComment.id,
      },
      second.token,
    );
    expect(
      (await db.collection('reviews').doc(firstReview.id).get()).get(
        'commentCount',
      ),
    ).toBe(0);
    expect(
      (
        await db
          .collection('reviews')
          .doc(firstReview.id)
          .collection('comments')
          .doc(firstComment.id)
          .get()
      ).get('status'),
    ).toBe('deleted');
    expect(
      (
        await db
          .collection('reviews')
          .doc(firstReview.id)
          .collection('comments')
          .doc(reply.id)
          .get()
      ).get('status'),
    ).toBe('deleted');
    expect(
      (
        await db
          .collection('reviews')
          .doc(firstReview.id)
          .collection('comments')
          .doc(newerReplies[0])
          .get()
      ).get('status'),
    ).toBe('deleted');
  }, 15_000);

  it('applies review XP and reactions exactly once', async () => {
    const { first, second, author, firstReview, db } =
      await createReviewFixture();
    const profileExtras = await callFunction<{ xp: number }>(
      'getProfileExtras',
      {},
      first.token,
    );
    expect(profileExtras.xp).toBe(50);

    const reactionCommand = {
      idempotencyKey: 'reaction-command-01',
      reviewId: firstReview.id,
      reaction: 'like',
    };
    expect(
      await callFunction('reactToReview', reactionCommand, second.token),
    ).toMatchObject({
      active: true,
      reactionCount: 1,
    });
    expect(
      await callFunction('reactToReview', reactionCommand, second.token),
    ).toMatchObject({
      active: true,
      reactionCount: 1,
    });
    expect((await author.ref.get()).get('xp')).toBe(55);
    const likeEvents = await db
      .collection('_activityEvents')
      .where('kind', '==', 'reaction-added')
      .get();
    expect(
      likeEvents.docs.filter(
        (event) => event.get('targetId') === firstReview.id,
      ),
    ).toHaveLength(1);
    expect(
      await callFunction(
        'reactToContent',
        {
          idempotencyKey: 'reaction-command-02',
          targetType: 'review',
          reviewId: firstReview.id,
          reaction: 'like',
        },
        second.token,
      ),
    ).toMatchObject({ active: false, reactionCount: 0 });
    expect((await author.ref.get()).get('xp')).toBe(50);
    expect(
      await callFunction(
        'reactToReview',
        {
          ...reactionCommand,
          idempotencyKey: 'reaction-command-03',
        },
        second.token,
      ),
    ).toMatchObject({ active: true, reactionCount: 1 });
    expect((await author.ref.get()).get('xp')).toBe(55);
  }, 15_000);

  it('only labels a follow notification as follow-back for a consistent mutual relationship', async () => {
    const actor = await authenticatedUser();
    const target = await authenticatedUser();
    const db = getFirestore();
    await Promise.all([
      callFunction(
        'createUserProfile',
        {
          displayName: 'Actor',
          username: 'notification.actor',
          city: 'Istanbul',
        },
        actor.token,
      ),
      callFunction(
        'createUserProfile',
        {
          displayName: 'Target',
          username: 'notification.target',
          city: 'Istanbul',
        },
        target.token,
      ),
    ]);
    const actorRef = (
      await db
        .collection('users')
        .where('username', '==', 'notification.actor')
        .get()
    ).docs[0]?.ref;
    const targetRef = (
      await db
        .collection('users')
        .where('username', '==', 'notification.target')
        .get()
    ).docs[0]?.ref;
    if (!actorRef || !targetRef)
      throw new Error('Expected both follow-notification profiles to exist.');

    // A stale half of the mirrored relationship must not produce a factually
    // incorrect mutual-follow notification.
    await targetRef
      .collection('following')
      .doc(actorRef.id)
      .set({ userId: actorRef.id });
    await callFunction(
      'followUser',
      { targetUserId: targetRef.id },
      actor.token,
    );

    const oneWayNotification = (
      await targetRef.collection('notifications').get()
    ).docs[0];
    expect(oneWayNotification?.get('type')).toBe('follow-new');
    expect(oneWayNotification?.get('title')).toBe(
      'Actor started following you',
    );

    await callFunction(
      'unfollowUser',
      { targetUserId: targetRef.id },
      actor.token,
    );
    await targetRef
      .collection('notifications')
      .get()
      .then(async (snapshot) => {
        await Promise.all(
          snapshot.docs.map((notification) => notification.ref.delete()),
        );
      });
    await actorRef
      .collection('followers')
      .doc(targetRef.id)
      .set({ userId: targetRef.id });
    await callFunction(
      'followUser',
      { targetUserId: targetRef.id },
      actor.token,
    );

    const mutualNotification = (
      await targetRef.collection('notifications').get()
    ).docs[0];
    expect(mutualNotification?.get('type')).toBe('follow-back');
    expect(mutualNotification?.get('title')).toBe('Actor followed you back');
  }, 15_000);

  it('returns stable, non-overlapping cursors for feed, comments, and leaderboard', async () => {
    const { token } = await authenticatedUser();
    const db = getFirestore();
    await callFunction(
      'createUserProfile',
      {
        displayName: 'Demo User',
        username: 'demo.user',
        city: 'Istanbul',
      },
      token,
    );
    const currentUser = (
      await db
        .collection('users')
        .where('username', '==', 'demo.user')
        .limit(1)
        .get()
    ).docs[0];
    if (!currentUser)
      throw new Error('Expected the authenticated profile to exist.');

    const batch = db.batch();
    const base = Date.now();
    for (let index = 0; index < 45; index += 1) {
      const authorId = `author-${String(index).padStart(2, '0')}`;
      const review = db
        .collection('reviews')
        .doc(`review-${String(index).padStart(2, '0')}`);
      batch.set(review, {
        authorId,
        authorDisplayName: 'Demo User',
        venueId: 'demo-cafe',
        venueName: 'Demo Cafe',
        venueCity: 'Istanbul',
        rating: 5,
        text: `Review ${index}`,
        status: 'published',
        commentCount: 0,
        reactionCount: 0,
        createdAt: Timestamp.fromMillis(base - index),
      });
      batch.set(currentUser.ref.collection('following').doc(authorId), {
        followedAt: Timestamp.fromMillis(base - index),
      });
    }
    for (let index = 0; index < 35; index += 1) {
      batch.set(
        db
          .collection('reviews')
          .doc('review-00')
          .collection('comments')
          .doc(`comment-${index}`),
        {
          authorId: 'seed-author',
          authorDisplayName: 'Demo User',
          parentCommentId: null,
          reactionCount: 0,
          replyCount: 0,
          text: `Comment ${index}`,
          status: 'published',
          createdAt: Timestamp.fromMillis(base - index),
        },
      );
      batch.set(
        db.collection('users').doc(`ranked-${String(index).padStart(2, '0')}`),
        {
          displayName: `Ranked ${index}`,
          status: 'active',
          xp: 1_000 - index,
          monthlyXp: 500 - index,
        },
      );
    }
    await batch.commit();

    const feedFirst = await callFunction<{
      items: Array<{ id: string }>;
      nextCursor: string;
    }>('getFeed', { scope: 'local', limit: 20 }, token);
    const feedSecond = await callFunction<{
      items: Array<{ id: string }>;
      nextCursor: string | null;
    }>(
      'getFeed',
      { scope: 'local', limit: 20, cursor: feedFirst.nextCursor },
      token,
    );
    expect(feedFirst.items).toHaveLength(20);
    expect(feedSecond.items).toHaveLength(20);
    expect(
      new Set([...feedFirst.items, ...feedSecond.items].map((item) => item.id))
        .size,
    ).toBe(40);

    const friendsFirst = await callFunction<{
      items: Array<{ id: string }>;
      nextCursor: string;
    }>('getFeed', { scope: 'friends', limit: 20 }, token);
    const friendsSecond = await callFunction<{ items: Array<{ id: string }> }>(
      'getFeed',
      { scope: 'friends', limit: 20, cursor: friendsFirst.nextCursor },
      token,
    );
    expect(
      new Set(
        [...friendsFirst.items, ...friendsSecond.items].map((item) => item.id),
      ).size,
    ).toBe(40);

    const commentsFirst = await callFunction<{
      items: Array<{ id: string }>;
      nextCursor: string;
    }>('getComments', { reviewId: 'review-00', limit: 20 }, token);
    const commentsSecond = await callFunction<{ items: Array<{ id: string }> }>(
      'getComments',
      { reviewId: 'review-00', limit: 20, cursor: commentsFirst.nextCursor },
      token,
    );
    expect(commentsFirst.items).toHaveLength(20);
    expect(commentsSecond.items).toHaveLength(15);

    const leadersFirst = await callFunction<{
      items: Array<{ userId: string; rank: number }>;
      nextCursor: string;
    }>('getLeaderboard', { period: 'month', limit: 20 }, token);
    const leadersSecond = await callFunction<{
      items: Array<{ rank: number }>;
    }>(
      'getLeaderboard',
      { period: 'month', limit: 20, cursor: leadersFirst.nextCursor },
      token,
    );
    expect(leadersFirst.items[0]?.rank).toBe(1);
    expect(leadersSecond.items[0]?.rank).toBe(21);
  }, 15_000);

  it('serves Discover from Firestore with stable venue pages and real social state', async () => {
    const { token } = await authenticatedUser();
    const db = getFirestore();
    await callFunction(
      'createUserProfile',
      {
        displayName: 'Discover Reader',
        username: 'discover.reader',
        city: 'Istanbul',
      },
      token,
    );
    const currentUser = (
      await db
        .collection('users')
        .where('username', '==', 'discover.reader')
        .limit(1)
        .get()
    ).docs[0];
    if (!currentUser)
      throw new Error('Expected the authenticated Discover profile to exist.');

    const reviewer = db.collection('users').doc('discover-reviewer');
    const batch = db.batch();
    batch.update(currentUser.ref, {
      reviewCount: 999,
      createdAt: Timestamp.fromMillis(Date.now()),
    });
    batch.set(reviewer, {
      displayName: 'Discover Reviewer',
      username: 'discover.reviewer',
      photoUrl: 'https://example.com/discover-reviewer.jpg',
      city: 'Istanbul',
      status: 'active',
      reviewCount: 50,
      followerCount: 100,
      followingCount: 10,
      weeklyFollowerGrowth: 12,
      favoriteCuisines: ['Cafe'],
      createdAt: Timestamp.fromMillis(Date.now() - 1_000),
    });
    batch.set(currentUser.ref.collection('following').doc(reviewer.id), {
      userId: reviewer.id,
      createdAt: Timestamp.now(),
    });
    for (let index = 0; index < 5; index += 1) {
      const venue = db.collection('venues').doc(`discover-venue-${index}`);
      batch.set(venue, {
        name: `Discover venue ${index}`,
        city: 'Istanbul',
        status: 'active',
        category: index % 2 === 0 ? 'Cafe' : 'Italian',
        rating: index < 2 ? 4.8 : 4.5,
        reviewCount: 20 - index,
        discoverTags:
          index < 3 ? ['trending', 'most-reviewed'] : ['new', 'hidden-gem'],
      });
    }
    batch.set(db.collection('reviews').doc('discover-review'), {
      authorId: reviewer.id,
      authorDisplayName: 'Discover Reviewer',
      venueId: 'discover-venue-0',
      venueName: 'Discover venue 0',
      venueCity: 'Istanbul',
      rating: 5,
      text: 'Real Discover review',
      status: 'published',
      reactionCount: 37,
      commentCount: 4,
      createdAt: Timestamp.now(),
    });
    await batch.commit();

    const feed = await callFunction<{
      topReviewer: { userId: string; following: boolean } | null;
      popularReviews: Array<{
        reactionCount: number;
        commentCount: number;
        authorPhotoUrl: string | null;
      }>;
    }>('getDiscoverFeed', {}, token);
    expect(feed.topReviewer).toMatchObject({
      userId: reviewer.id,
      following: true,
    });
    expect(feed.popularReviews[0]).toMatchObject({
      reactionCount: 37,
      commentCount: 4,
      authorPhotoUrl: 'https://example.com/discover-reviewer.jpg',
    });

    const people = await callFunction<{
      trending: Array<{ userId: string; following: boolean }>;
    }>('getDiscoverPeople', {}, token);
    expect(people.trending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: reviewer.id, following: true }),
      ]),
    );

    const first = await callFunction<{
      items: Array<{ id: string }>;
      nextCursor: string | null;
    }>('getVenues', { limit: 2 }, token);
    const second = await callFunction<{ items: Array<{ id: string }> }>(
      'getVenues',
      { limit: 2, cursor: first.nextCursor },
      token,
    );
    expect(first.items).toHaveLength(2);
    expect(
      new Set([...first.items, ...second.items].map((venue) => venue.id)).size,
    ).toBe(4);

    const cafes = await callFunction<{ items: Array<{ id: string }> }>(
      'getVenues',
      { category: 'Cafe', limit: 20 },
      token,
    );
    expect(cafes.items).toHaveLength(3);

    const paginatedCafeIds: string[] = [];
    let cafeCursor: string | null = null;
    for (let page = 0; page < 3; page += 1) {
      const cafePage = await callFunction<{
        items: Array<{ id: string }>;
        nextCursor: string | null;
      }>(
        'getVenues',
        { category: 'Cafe', limit: 1, cursor: cafeCursor },
        token,
      );
      expect(cafePage.items).toHaveLength(1);
      paginatedCafeIds.push(cafePage.items[0]!.id);
      cafeCursor = cafePage.nextCursor;
    }
    expect(new Set(paginatedCafeIds).size).toBe(3);

    const trending = await callFunction<{ items: Array<{ id: string }> }>(
      'getVenues',
      { tag: 'trending', limit: 20 },
      token,
    );
    expect(trending.items).toHaveLength(3);
  });
});

describe('messaging callables', () => {
  it('requires mutual follows and applies message idempotency and unread state', async () => {
    const first = await authenticatedUser();
    const second = await authenticatedUser();
    const db = getFirestore();
    await callFunction(
      'createUserProfile',
      {
        displayName: 'First Messenger',
        username: 'first.messenger',
        city: 'Istanbul',
      },
      first.token,
    );
    await callFunction(
      'createUserProfile',
      {
        displayName: 'Second Messenger',
        username: 'second.messenger',
        city: 'Istanbul',
      },
      second.token,
    );
    const firstProfile = (
      await db
        .collection('users')
        .where('username', '==', 'first.messenger')
        .limit(1)
        .get()
    ).docs[0];
    const secondProfile = (
      await db
        .collection('users')
        .where('username', '==', 'second.messenger')
        .limit(1)
        .get()
    ).docs[0];
    if (!firstProfile || !secondProfile)
      throw new Error('Expected both messaging profiles to exist.');
    const firstUid = firstProfile.id;
    const secondUid = secondProfile.id;

    await callFunction('followUser', { targetUserId: secondUid }, first.token);
    await expectReason(
      callFunction(
        'createConversation',
        { targetUserId: secondUid },
        first.token,
      ),
      'mutual-follow-required',
    );
    await callFunction('followUser', { targetUserId: firstUid }, second.token);

    const conversation = await callFunction<{ id: string }>(
      'createConversation',
      { targetUserId: secondUid },
      first.token,
    );
    const replayedConversation = await callFunction<{ id: string }>(
      'createConversation',
      { targetUserId: firstUid },
      second.token,
    );
    expect(replayedConversation.id).toBe(conversation.id);

    const command = {
      conversationId: conversation.id,
      idempotencyKey: 'message-command-0001',
      text: 'Hello from the real backend',
    };
    await db.collection('conversations').doc(conversation.id).update({
      typing: FieldValue.delete(),
    });
    const firstMessage = await callFunction<{ id: string }>(
      'sendMessage',
      command,
      first.token,
    );
    const replayedMessage = await callFunction<{ id: string }>(
      'sendMessage',
      command,
      first.token,
    );
    expect(replayedMessage.id).toBe(firstMessage.id);

    const conversationDocument = await db
      .collection('conversations')
      .doc(conversation.id)
      .get();
    expect(conversationDocument.get('messageCount')).toBe(1);
    expect(conversationDocument.get(`unreadCounts.${secondUid}`)).toBe(1);
    const storedMessages = await conversationDocument.ref
      .collection('messages')
      .get();
    expect(storedMessages.size).toBe(1);
    expect(storedMessages.docs[0]?.data()).toMatchObject({
      senderDisplayName: 'First Messenger',
      senderPhotoUrl: null,
    });

    const inbox = await callFunction<{
      items: Array<{
        id: string;
        unreadCount: number;
        otherParticipant: { userId: string };
      }>;
    }>('listConversations', { limit: 20 }, second.token);
    expect(inbox.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: conversation.id,
          unreadCount: 1,
          otherParticipant: expect.objectContaining({ userId: firstUid }),
        }),
      ]),
    );

    const messages = await callFunction<{
      items: Array<{
        id: string;
        senderId: string;
        senderDisplayName: string | null;
        senderPhotoUrl: string | null;
        recipientId: string;
        text: string;
      }>;
    }>(
      'getMessages',
      { conversationId: conversation.id, limit: 20 },
      second.token,
    );
    expect(messages.items).toEqual([
      expect.objectContaining({
        id: firstMessage.id,
        senderId: firstUid,
        senderDisplayName: 'First Messenger',
        senderPhotoUrl: null,
        recipientId: secondUid,
        text: command.text,
      }),
    ]);

    await callFunction(
      'markConversationRead',
      {
        conversationId: conversation.id,
        throughMessageId: firstMessage.id,
      },
      second.token,
    );
    expect(
      (await conversationDocument.ref.get()).get(`unreadCounts.${secondUid}`),
    ).toBe(0);

    const notifications = await db
      .collection('notifications')
      .where('recipientId', '==', secondUid)
      .where('messageId', '==', firstMessage.id)
      .get();
    expect(notifications.size).toBe(1);

    const token = 'ExpoPushToken[abcdefghijklmnopqrstuv]';
    expect(
      await callFunction(
        'registerPushToken',
        { token, platform: 'android' },
        first.token,
      ),
    ).toEqual({
      registered: true,
    });
    expect(
      await callFunction(
        'registerPushToken',
        { token, platform: 'android' },
        second.token,
      ),
    ).toEqual({
      registered: true,
    });
    expect(
      (
        await db
          .collection('users')
          .doc(firstUid)
          .collection('pushTokens')
          .get()
      ).size,
    ).toBe(0);
    expect(
      (
        await db
          .collection('users')
          .doc(secondUid)
          .collection('pushTokens')
          .get()
      ).size,
    ).toBe(1);
    expect((await db.collection('_pushTokens').get()).docs[0]?.get('uid')).toBe(
      secondUid,
    );
    expect(
      await callFunction('unregisterPushToken', { token }, second.token),
    ).toEqual({
      registered: false,
    });
    expect(
      (
        await db
          .collection('users')
          .doc(secondUid)
          .collection('pushTokens')
          .get()
      ).size,
    ).toBe(0);
    expect((await db.collection('_pushTokens').get()).size).toBe(0);
  }, 15_000);

  it('enforces blocks for follows and direct messages and rejects external images', async () => {
    const first = await authenticatedUser();
    const second = await authenticatedUser();
    const db = getFirestore();
    await callFunction(
      'createUserProfile',
      {
        displayName: 'Blocking User',
        username: 'blocking.user',
        city: 'Istanbul',
      },
      first.token,
    );
    await callFunction(
      'createUserProfile',
      {
        displayName: 'Blocked User',
        username: 'blocked.user',
        city: 'Istanbul',
      },
      second.token,
    );
    const profiles = await db
      .collection('users')
      .where('username', 'in', ['blocking.user', 'blocked.user'])
      .get();
    const ids = new Map(
      profiles.docs.map((profile) => [profile.get('username'), profile.id]),
    );
    const firstUid = ids.get('blocking.user');
    const secondUid = ids.get('blocked.user');
    if (!firstUid || !secondUid) throw new Error('Expected blocking profiles.');

    await callFunction('followUser', { targetUserId: secondUid }, first.token);
    await callFunction('followUser', { targetUserId: firstUid }, second.token);
    const conversation = await callFunction<{ id: string }>(
      'createConversation',
      { targetUserId: secondUid },
      first.token,
    );

    await expectReason(
      callFunction(
        'sendMessage',
        {
          conversationId: conversation.id,
          idempotencyKey: 'external-image-message',
          imageUrl: 'https://tracker.example/pixel.jpg',
        },
        first.token,
      ),
      'invalid-chat-image',
    );

    await callFunction(
      'setUserBlocked',
      { targetUserId: secondUid, blocked: true },
      first.token,
    );
    await expectReason(
      callFunction('followUser', { targetUserId: firstUid }, second.token),
      'user-blocked',
    );
    await expectReason(
      callFunction(
        'createConversation',
        { targetUserId: firstUid },
        second.token,
      ),
      'user-blocked',
    );
    await expectReason(
      callFunction(
        'sendMessage',
        {
          conversationId: conversation.id,
          idempotencyKey: 'blocked-message-attempt',
          text: 'This must not be delivered.',
        },
        second.token,
      ),
      'user-blocked',
    );
  }, 15_000);

  it('returns sorted place reviews and geo-aware Tastes AI recommendations', async () => {
    const user = await authenticatedUser();
    const friend = await authenticatedUser();
    const db = getFirestore();
    await callFunction(
      'createUserProfile',
      {
        displayName: 'Recommendation User',
        username: 'recommendation.user',
        city: 'Istanbul',
      },
      user.token,
    );
    await callFunction(
      'createUserProfile',
      {
        displayName: 'Food Friend',
        username: 'food.friend',
        city: 'Istanbul',
      },
      friend.token,
    );
    const userDocument = (
      await db
        .collection('users')
        .where('username', '==', 'recommendation.user')
        .limit(1)
        .get()
    ).docs[0];
    const friendDocument = (
      await db
        .collection('users')
        .where('username', '==', 'food.friend')
        .limit(1)
        .get()
    ).docs[0];
    if (!userDocument || !friendDocument)
      throw new Error('Expected recommendation profiles.');
    await userDocument.ref.update({ favoriteCuisines: ['Japanese'] });
    await userDocument.ref
      .collection('following')
      .doc(friendDocument.id)
      .set({ followedAt: Timestamp.now() });
    await Promise.all([
      db
        .collection('venues')
        .doc('nearby-sushi')
        .set({
          name: 'Nearby Sushi',
          city: 'Istanbul',
          category: 'Japanese',
          status: 'active',
          latitude: 41.015,
          longitude: 28.98,
          rating: 4.8,
          reviewCount: 58,
          imageUrl: 'https://example.com/venue.jpg',
          priceLevel: 3,
          placeTags: ['romantic', 'date-night'],
        }),
      db
        .collection('venues')
        .doc('far-sushi')
        .set({
          name: 'Far Sushi',
          city: 'Ankara',
          category: 'Japanese',
          status: 'active',
          latitude: 39.9334,
          longitude: 32.8597,
          rating: 5,
          priceLevel: 4,
          placeTags: ['romantic'],
        }),
    ]);
    await Promise.all([
      db
        .collection('reviews')
        .doc('friend-place-review')
        .set({
          authorId: friendDocument.id,
          authorDisplayName: 'Food Friend',
          venueId: 'nearby-sushi',
          venueName: 'Nearby Sushi',
          rating: 5,
          text: 'Excellent omakase',
          status: 'published',
          reactionCount: 9,
          commentCount: 2,
          tags: ['date-night'],
          dishNames: ['Omakase'],
          dishReviews: [],
          createdAt: Timestamp.fromMillis(Date.now() - 1_000),
        }),
      db
        .collection('reviews')
        .doc('other-place-review')
        .set({
          authorId: 'another-user',
          authorDisplayName: 'Another User',
          venueId: 'nearby-sushi',
          venueName: 'Nearby Sushi',
          rating: 3,
          text: 'Solid lunch',
          status: 'published',
          reactionCount: 1,
          commentCount: 0,
          tags: ['casual'],
          dishNames: ['Ramen'],
          dishReviews: [],
          createdAt: Timestamp.fromMillis(Date.now() - 2_000),
        }),
    ]);

    const reviews = await callFunction<{
      items: Array<{ id: string; rating: number }>;
      nextCursor: string | null;
    }>(
      'getPlaceReviews',
      {
        venueId: 'nearby-sushi',
        sort: 'highest',
        scope: 'all',
        limit: 1,
      },
      user.token,
    );
    expect(reviews.items).toEqual([
      expect.objectContaining({ id: 'friend-place-review', rating: 5 }),
    ]);
    expect(reviews.nextCursor).toBeTruthy();
    const nextReviews = await callFunction<{
      items: Array<{ id: string; rating: number }>;
      nextCursor: string | null;
    }>(
      'getPlaceReviews',
      {
        venueId: 'nearby-sushi',
        sort: 'highest',
        scope: 'all',
        limit: 1,
        cursor: reviews.nextCursor,
      },
      user.token,
    );
    expect(nextReviews.items).toEqual([
      expect.objectContaining({ id: 'other-place-review', rating: 3 }),
    ]);
    const friendReviews = await callFunction<{
      items: Array<{ id: string }>;
      nextCursor: string | null;
    }>(
      'getPlaceReviews',
      {
        venueId: 'nearby-sushi',
        sort: 'recent',
        scope: 'friends',
        limit: 20,
      },
      user.token,
    );
    expect(friendReviews.items.map((review) => review.id)).toEqual([
      'friend-place-review',
    ]);

    // Local candidates must survive a larger, alphabetically earlier foreign catalog.
    const catalogBatch = db.batch();
    for (let index = 0; index < 51; index += 1) {
      catalogBatch.set(db.collection('venues').doc(`aaa-foreign-${index}`), {
        name: 'Foreign Sushi',
        city: 'Ankara',
        category: 'Japanese',
        status: 'active',
        latitude: 39.93,
        longitude: 32.86,
        rating: 5,
      });
    }
    catalogBatch.set(db.collection('venues').doc('unknown-coordinates'), {
      name: 'Nearby Romantic Japanese Sushi',
      city: 'Istanbul',
      category: 'Japanese',
      status: 'active',
      rating: 5,
      latitude: null,
      longitude: null,
    });
    await catalogBatch.commit();
    const answer = await callFunction<{
      places: Array<{
        id: string;
        distanceKm: number | null;
        reviewCount: number;
        imageUrl: string | null;
      }>;
    }>(
      'askTastesAi',
      {
        prompt: 'A romantic Japanese dinner nearby',
        location: 'Istanbul',
        latitude: 41.015,
        longitude: 28.979,
      },
      user.token,
    );
    expect(answer.places[0]).toMatchObject({
      id: 'nearby-sushi',
      reviewCount: 58,
      imageUrl: 'https://example.com/venue.jpg',
    });
    expect(answer.places.some((place) => place.id === 'far-sushi')).toBe(false);
    expect(
      answer.places.some((place) => place.id === 'unknown-coordinates'),
    ).toBe(false);
    expect(answer.places[0]?.distanceKm).toBeTypeOf('number');
    const profileCityAnswer = await callFunction<{
      places: Array<{ id: string }>;
    }>('askTastesAi', { prompt: 'Japanese dinner' }, user.token);
    expect(profileCityAnswer.places.length).toBeGreaterThan(0);
    expect(
      profileCityAnswer.places.every(
        (place) =>
          !place.id.startsWith('aaa-foreign-') && place.id !== 'far-sushi',
      ),
    ).toBe(true);
    const nullIsland = await callFunction<{ places: Array<{ id: string }> }>(
      'askTastesAi',
      { prompt: 'Japanese dinner', latitude: 0, longitude: 0 },
      user.token,
    );
    expect(nullIsland.places).toEqual([]);
  }, 15_000);
});

describe('Milestone 2 completion callables', () => {
  it('queues duplicate reviews for manual review and preserves staff dismissals', async () => {
    const { db, author, reader } = await createSocialFixture();
    const text =
      'The grilled fish was excellent with fresh herbs, tender vegetables, a rich sauce and warm bread. The service was attentive throughout our meal.';
    await Promise.all(
      [author, reader].map((user) =>
        db.collection('reviews').doc(`risk-${user.id}`).set({
          authorId: user.id,
          venueId: 'risk-venue',
          status: 'published',
          text,
          rating: 4,
          createdAt: Timestamp.now(),
        }),
      ),
    );
    const { queueReviewRisks } =
      await import('../../functions/src/modules/reviews/risk-monitor');
    expect(await queueReviewRisks()).toMatchObject({ queued: 2 });
    expect(await queueReviewRisks()).toMatchObject({ queued: 0 });
    const reports = await db
      .collection('reports')
      .where('source', '==', 'risk-monitor')
      .get();
    expect(reports.size).toBe(2);
    expect(reports.docs.every((report) => report.id.length <= 128)).toBe(true);
    await reports.docs[0]!.ref.update({ status: 'dismissed' });
    expect(await queueReviewRisks()).toMatchObject({ queued: 0 });
    expect((await reports.docs[0]!.ref.get()).get('status')).toBe('dismissed');
    expect(
      (await db.collection('reviews').where('status', '==', 'published').get())
        .size,
    ).toBe(2);
  }, 15_000);

  it('resolves system reports without a fake recipient and keeps moderated review totals correct', async () => {
    const { db, author, firstReview } = await createReviewFixture();
    const custom = await getAuth().createCustomToken(
      'qa-system-report-moderator',
      {
        role: 'moderator',
      },
    );
    const auth = (await fetch(
      `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: custom, returnSecureToken: true }),
      },
    ).then((response) => response.json())) as { idToken: string };
    const report = {
      source: 'risk-monitor',
      reporterId: '',
      reporterName: 'Spam risk check',
      targetType: 'review',
      targetId: firstReview.id,
      status: 'pending',
      createdAt: Timestamp.now(),
    };
    await db.collection('reports').doc('risk-dismiss').set(report);
    await callFunction(
      'dismissReport',
      { reportId: 'risk-dismiss' },
      auth.idToken,
    );
    expect(
      (await db.collection('reports').doc('risk-dismiss').get()).get('status'),
    ).toBe('dismissed');
    await db.collection('reports').doc('risk-delete').set(report);
    const action = {
      targetType: 'review',
      targetId: firstReview.id,
      reportId: 'risk-delete',
    };
    await callFunction('deleteContent', action, auth.idToken);
    await callFunction('deleteContent', action, auth.idToken);
    expect((await author.ref.get()).get('reviewCount')).toBe(0);
    expect((await author.ref.get()).get('xp')).toBe(0);
    expect(
      (await db.collection('venues').doc('demo-cafe').get()).data(),
    ).toMatchObject({ reviewCount: 0, rating: 0 });
    const deleted = await db
      .collection('_activityEvents')
      .where('kind', '==', 'review-deleted')
      .get();
    expect(
      deleted.docs.filter((event) => event.get('targetId') === firstReview.id),
    ).toHaveLength(1);
  }, 15_000);

  it('supports venue submission/search and review edit/delete/content actions', async () => {
    const author = await authenticatedUser();
    const reader = await authenticatedUser();
    const db = getFirestore();
    await callFunction(
      'createUserProfile',
      { displayName: 'M2 Author', username: 'm2.author', city: 'Istanbul' },
      author.token,
    );
    await callFunction(
      'createUserProfile',
      { displayName: 'M2 Reader', username: 'm2.reader', city: 'Istanbul' },
      reader.token,
    );
    const authorProfile = (
      await db
        .collection('users')
        .where('username', '==', 'm2.author')
        .limit(1)
        .get()
    ).docs[0];
    if (!authorProfile) throw new Error('Expected M2 author profile.');
    await db.collection('venues').doc('m2-venue').set({
      name: 'Milestone Bistro',
      city: 'Istanbul',
      address: 'M2 Street',
      category: 'Bistro',
      status: 'active',
      rating: 0,
      reviewCount: 0,
    });

    const search = await callFunction<{ items: Array<{ id: string }> }>(
      'searchVenues',
      { query: 'Milestone', limit: 10 },
      author.token,
    );
    expect(search.items.map((venue) => venue.id)).toContain('m2-venue');
    const submitted = await callFunction<{ id: string; status: string }>(
      'submitUserVenue',
      {
        name: 'Community Cafe',
        city: 'Istanbul',
        address: 'Community Street',
        category: 'Cafe',
      },
      author.token,
    );
    expect(submitted.status).toBe('pending');
    expect(
      (await db.collection('venues').doc(submitted.id).get()).data(),
    ).toMatchObject({
      source: 'user',
      submittedBy: authorProfile.id,
      status: 'pending',
    });

    const review = await callFunction<{ id: string }>(
      'createReview',
      {
        idempotencyKey: 'm2-review-create-0001',
        venueId: 'm2-venue',
        rating: 3,
        text: 'Initial review',
        tags: ['casual'],
        dishReviews: [],
      },
      author.token,
    );
    await callFunction(
      'editReview',
      {
        reviewId: review.id,
        rating: 4.5,
        text: 'Updated review',
        tags: ['date-night'],
        dishReviews: [],
      },
      author.token,
    );
    expect(
      (await db.collection('reviews').doc(review.id).get()).data(),
    ).toMatchObject({
      rating: 4.5,
      text: 'Updated review',
      tags: ['date-night'],
    });
    expect(
      (await db.collection('venues').doc('m2-venue').get()).get('rating'),
    ).toBe(4.5);

    expect(
      await callFunction(
        'reactToContent',
        {
          idempotencyKey: 'm2-content-react-001',
          targetType: 'review',
          reviewId: review.id,
          reaction: 'like',
        },
        reader.token,
      ),
    ).toEqual({ active: true, reactionCount: 1 });
    const report = await callFunction<{ id: string }>(
      'reportContent',
      {
        idempotencyKey: 'm2-content-report-001',
        targetType: 'review',
        reviewId: review.id,
        reason: 'Spam',
      },
      reader.token,
    );
    expect(
      (await db.collection('reports').doc(report.id).get()).data(),
    ).toMatchObject({
      targetType: 'review',
      targetId: review.id,
      contentPreview: 'Updated review',
      status: 'pending',
    });

    await callFunction('deleteReview', { reviewId: review.id }, author.token);
    expect(
      (await db.collection('reviews').doc(review.id).get()).get('status'),
    ).toBe('deleted');
    expect(
      (await db.collection('venues').doc('m2-venue').get()).data(),
    ).toMatchObject({ rating: 0, reviewCount: 0 });
  }, 15_000);

  it('creates invite-based group chat, tracks typing/read state, and matches contacts', async () => {
    const owner = await authenticatedUser();
    const firstFriend = await authenticatedUser();
    const secondFriend = await authenticatedUser();
    const db = getFirestore();
    await Promise.all([
      callFunction(
        'createUserProfile',
        {
          displayName: 'Group Owner',
          username: 'group.owner',
          city: 'Istanbul',
        },
        owner.token,
      ),
      callFunction(
        'createUserProfile',
        {
          displayName: 'First Friend',
          username: 'group.first',
          city: 'Istanbul',
        },
        firstFriend.token,
      ),
      callFunction(
        'createUserProfile',
        {
          displayName: 'Second Friend',
          username: 'group.second',
          city: 'Istanbul',
        },
        secondFriend.token,
      ),
    ]);
    const [ownerProfile, firstProfile, secondProfile] = await Promise.all([
      db
        .collection('users')
        .where('username', '==', 'group.owner')
        .limit(1)
        .get(),
      db
        .collection('users')
        .where('username', '==', 'group.first')
        .limit(1)
        .get(),
      db
        .collection('users')
        .where('username', '==', 'group.second')
        .limit(1)
        .get(),
    ]);
    const ownerUid = ownerProfile.docs[0]?.id;
    const firstUid = firstProfile.docs[0]?.id;
    const secondUid = secondProfile.docs[0]?.id;
    if (!ownerUid || !firstUid || !secondUid)
      throw new Error('Expected all group profiles.');

    const imported = await callFunction<{ matches: Array<{ userId: string }> }>(
      'importContacts',
      {
        phoneNumbers: [firstFriend.phoneNumber],
        emails: [],
      },
      owner.token,
    );
    expect(imported.matches.map((match) => match.userId)).toContain(firstUid);

    await expectReason(
      callFunction(
        'createGroup',
        {
          name: 'Blocked arbitrary group',
          memberIds: [firstUid],
        },
        owner.token,
      ),
      'mutual-follow-required',
    );

    await Promise.all([
      callFunction('followUser', { targetUserId: firstUid }, owner.token),
      callFunction('followUser', { targetUserId: ownerUid }, firstFriend.token),
      callFunction('followUser', { targetUserId: secondUid }, owner.token),
      callFunction(
        'followUser',
        { targetUserId: ownerUid },
        secondFriend.token,
      ),
    ]);

    const group = await callFunction<{ id: string }>(
      'createGroup',
      {
        name: 'M2 Food Friends',
        memberIds: [firstUid, secondUid],
      },
      owner.token,
    );
    expect(
      (
        await callFunction<{
          items: Array<{
            id: string;
            kind: string;
            lastMessage: { text: string } | null;
          }>;
        }>('listConversations', { limit: 20 }, owner.token)
      ).items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: group.id,
          kind: 'group',
          lastMessage: expect.objectContaining({ text: 'Group created' }),
        }),
      ]),
    );
    const requestId = `group-${group.id}`;
    expect(
      (
        await db
          .collection('users')
          .doc(firstUid)
          .collection('requests')
          .doc(requestId)
          .get()
      ).exists,
    ).toBe(true);
    const message = await callFunction<{ id: string }>(
      'sendMessage',
      {
        conversationId: group.id,
        idempotencyKey: 'm2-group-message-001',
        text: 'Welcome to the group',
      },
      owner.token,
    );
    expect(
      (
        await db
          .collection('conversations')
          .doc(group.id)
          .collection('messages')
          .doc(message.id)
          .get()
      ).exists,
    ).toBe(true);
    await callFunction(
      'respondToRequest',
      { requestId, response: 'accepted' },
      firstFriend.token,
    );
    await expectReason(
      callFunction(
        'respondToRequest',
        { requestId, response: 'accepted' },
        firstFriend.token,
      ),
      'request-already-answered',
    );

    await callFunction(
      'setTypingStatus',
      { conversationId: group.id, typing: true },
      firstFriend.token,
    );
    expect(
      (await db.collection('conversations').doc(group.id).get()).get(
        `typing.${firstUid}`,
      ),
    ).toBeTruthy();
    await callFunction(
      'setTypingStatus',
      { conversationId: group.id, typing: false },
      firstFriend.token,
    );
    expect(
      (await db.collection('conversations').doc(group.id).get()).get(
        `typing.${firstUid}`,
      ),
    ).toBeUndefined();

    await callFunction(
      'markConversationRead',
      { conversationId: group.id, throughMessageId: message.id },
      firstFriend.token,
    );
    const conversation = await db
      .collection('conversations')
      .doc(group.id)
      .get();
    expect(conversation.get('kind')).toBe('group');
    expect(conversation.get(`lastReadMessageIds.${firstUid}`)).toBe(message.id);
    expect(
      (
        await callFunction<{ items: Array<{ id: string; kind: string }> }>(
          'listConversations',
          { limit: 20 },
          owner.token,
        )
      ).items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: group.id, kind: 'group' }),
      ]),
    );
  }, 20_000);
});

describe('activity callables', () => {
  it('lists mutual followers and creates an idempotent activity', async () => {
    const organizer = await authenticatedUser();
    const friend = await authenticatedUser();
    const db = getFirestore();
    await callFunction(
      'createUserProfile',
      {
        displayName: 'Activity Organizer',
        username: 'activity.organizer',
        city: 'Istanbul',
      },
      organizer.token,
    );
    await callFunction(
      'createUserProfile',
      {
        displayName: 'Activity Friend',
        username: 'activity.friend',
        city: 'Istanbul',
      },
      friend.token,
    );
    const organizerProfile = (
      await db
        .collection('users')
        .where('username', '==', 'activity.organizer')
        .limit(1)
        .get()
    ).docs[0];
    const friendProfile = (
      await db
        .collection('users')
        .where('username', '==', 'activity.friend')
        .limit(1)
        .get()
    ).docs[0];
    if (!organizerProfile || !friendProfile)
      throw new Error('Expected both activity profiles to exist.');
    const organizerUid = organizerProfile.id;
    const friendUid = friendProfile.id;
    await db.collection('venues').doc('activity-venue').set({
      name: 'Activity Restaurant',
      city: 'Istanbul',
      status: 'active',
      rating: 4.7,
    });
    await callFunction(
      'followUser',
      { targetUserId: friendUid },
      organizer.token,
    );
    await callFunction(
      'followUser',
      { targetUserId: organizerUid },
      friend.token,
    );

    const candidates = await callFunction<
      Array<{ userId: string; username: string | null }>
    >('listActivityCandidates', {}, organizer.token);
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: friendUid,
          username: 'activity.friend',
        }),
      ]),
    );

    const command = {
      idempotencyKey: 'activity-command-0001',
      memberIds: [friendUid],
      startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      venueId: 'activity-venue',
    };
    const created = await callFunction<{ id: string }>(
      'createActivity',
      command,
      organizer.token,
    );
    const replayed = await callFunction<{ id: string }>(
      'createActivity',
      command,
      organizer.token,
    );
    expect(replayed.id).toBe(created.id);
    const activity = await db.collection('activities').doc(created.id).get();
    expect(activity.data()).toMatchObject({
      organizerId: organizerUid,
      participantIds: [organizerUid, friendUid],
      status: 'active',
      venueId: 'activity-venue',
      venueName: 'Activity Restaurant',
    });
    const activityConversation = await db
      .collection('conversations')
      .doc(created.id)
      .get();
    expect(activityConversation.data()).toMatchObject({
      kind: 'activity',
      activityId: created.id,
      organizerId: organizerUid,
      participantIds: [organizerUid, friendUid],
      title: 'Activity Restaurant',
      lastMessage: expect.objectContaining({ text: 'Activity created' }),
      status: 'active',
    });
    const friendInbox = await callFunction<{
      items: Array<{
        id: string;
        kind: string;
        title: string;
        activityId: string;
        lastMessage: { text: string } | null;
      }>;
    }>('listConversations', { limit: 20 }, friend.token);
    expect(friendInbox.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          kind: 'activity',
          activityId: created.id,
          title: 'Activity Restaurant',
          lastMessage: expect.objectContaining({ text: 'Activity created' }),
        }),
      ]),
    );
    const activityMessage = await callFunction<{ id: string }>(
      'sendMessage',
      {
        conversationId: created.id,
        idempotencyKey: 'activity-message-0001',
        text: 'See you there!',
      },
      organizer.token,
    );
    expect(activityMessage.id).toBeTruthy();
    expect(
      (await activityConversation.ref.get()).get(`unreadCounts.${friendUid}`),
    ).toBe(1);
    expect((await db.collection('activities').get()).size).toBe(1);
  }, 30_000);

  it('requires invite acceptance before messaging and removes declined invitees', async () => {
    const organizer = await authenticatedUser();
    const acceptingFriend = await authenticatedUser();
    const decliningFriend = await authenticatedUser();
    const db = getFirestore();
    await callFunction(
      'createUserProfile',
      {
        displayName: 'Invitation Organizer',
        username: 'invitation.organizer',
        city: 'Istanbul',
      },
      organizer.token,
    );
    await callFunction(
      'createUserProfile',
      {
        displayName: 'Accepting Friend',
        username: 'invitation.accepting',
        city: 'Istanbul',
      },
      acceptingFriend.token,
    );
    await callFunction(
      'createUserProfile',
      {
        displayName: 'Declining Friend',
        username: 'invitation.declining',
        city: 'Istanbul',
      },
      decliningFriend.token,
    );

    const profiles = await db
      .collection('users')
      .where('username', '>=', 'invitation.')
      .where('username', '<=', 'invitation.\uf8ff')
      .get();
    const userIds = new Map(
      profiles.docs.map((profile) => [profile.get('username'), profile.id]),
    );
    const organizerUid = userIds.get('invitation.organizer');
    const acceptingUid = userIds.get('invitation.accepting');
    const decliningUid = userIds.get('invitation.declining');
    if (!organizerUid || !acceptingUid || !decliningUid) {
      throw new Error('Expected all invitation profiles to exist.');
    }

    await db.collection('venues').doc('invitation-venue').set({
      name: 'Invitation Restaurant',
      city: 'Istanbul',
      status: 'active',
      rating: 4.8,
    });
    await Promise.all([
      callFunction(
        'followUser',
        { targetUserId: acceptingUid },
        organizer.token,
      ),
      callFunction(
        'followUser',
        { targetUserId: decliningUid },
        organizer.token,
      ),
      callFunction(
        'followUser',
        { targetUserId: organizerUid },
        acceptingFriend.token,
      ),
      callFunction(
        'followUser',
        { targetUserId: organizerUid },
        decliningFriend.token,
      ),
    ]);

    const created = await callFunction<{ id: string }>(
      'createActivity',
      {
        idempotencyKey: 'activity-invitations-0001',
        memberIds: [acceptingUid, decliningUid],
        startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        venueId: 'invitation-venue',
      },
      organizer.token,
    );

    await expect(
      callFunction(
        'sendMessage',
        {
          conversationId: created.id,
          idempotencyKey: 'pending-message-0001',
          text: 'Can I send before accepting?',
        },
        acceptingFriend.token,
      ),
    ).rejects.toMatchObject({ status: 'FAILED_PRECONDITION' });

    expect(
      await callFunction(
        'respondToActivityInvitation',
        {
          activityId: created.id,
          response: 'accepted',
        },
        acceptingFriend.token,
      ),
    ).toEqual({ id: created.id });
    expect(
      await callFunction(
        'respondToActivityInvitation',
        {
          activityId: created.id,
          response: 'accepted',
        },
        acceptingFriend.token,
      ),
    ).toEqual({ id: created.id });

    const acceptedMessage = await callFunction<{ id: string }>(
      'sendMessage',
      {
        conversationId: created.id,
        idempotencyKey: 'accepted-message-0001',
        text: 'I am joining!',
      },
      acceptingFriend.token,
    );
    expect(acceptedMessage.id).toBeTruthy();

    expect(
      await callFunction(
        'respondToActivityInvitation',
        {
          activityId: created.id,
          response: 'declined',
        },
        decliningFriend.token,
      ),
    ).toEqual({ id: created.id });
    expect(
      await callFunction(
        'respondToActivityInvitation',
        {
          activityId: created.id,
          response: 'declined',
        },
        decliningFriend.token,
      ),
    ).toEqual({ id: created.id });

    const [activity, conversation] = await Promise.all([
      db.collection('activities').doc(created.id).get(),
      db.collection('conversations').doc(created.id).get(),
    ]);
    expect(activity.get(`invitationStatuses.${acceptingUid}`)).toBe('accepted');
    expect(conversation.get(`invitationStatuses.${acceptingUid}`)).toBe(
      'accepted',
    );
    expect(activity.get(`invitationStatuses.${decliningUid}`)).toBe('declined');
    expect(conversation.get(`invitationStatuses.${decliningUid}`)).toBe(
      'declined',
    );
    expect(activity.get('participantIds')).toEqual(
      expect.arrayContaining([organizerUid, acceptingUid]),
    );
    expect(activity.get('participantIds')).not.toContain(decliningUid);
    expect(conversation.get('participantIds')).not.toContain(decliningUid);
    expect(conversation.get(`unreadCounts.${decliningUid}`)).toBeUndefined();

    const declinedInbox = await callFunction<{ items: Array<{ id: string }> }>(
      'listConversations',
      { limit: 20 },
      decliningFriend.token,
    );
    expect(declinedInbox.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );
    await expect(
      callFunction(
        'getMessages',
        {
          conversationId: created.id,
          limit: 20,
        },
        decliningFriend.token,
      ),
    ).rejects.toMatchObject({ status: 'NOT_FOUND' });
  }, 30_000);
});

describe('client feedback regressions', () => {
  it('serializes concurrent reviews and appends retry-safe visits without extra XP', async () => {
    const { first, second, db, author, firstReview, reviewCommand } =
      await createReviewFixture();
    const duplicate = await expectReason(
      callFunction(
        'createReview',
        {
          ...reviewCommand,
          dishReviews: [],
          idempotencyKey: 'different-review-key-0001',
        },
        first.token,
      ),
      'ALREADY_REVIEWED',
    );
    expect(duplicate.details?.existingReviewId).toBe(firstReview.id);
    const found = await callFunction<{ review: { id: string } }>(
      'getOwnVenueReview',
      { venueId: 'demo-cafe' },
      first.token,
    );
    expect(found.review.id).toBe(firstReview.id);
    const before = await db.collection('users').doc(author.id).get();
    const reviewRef = db.collection('reviews').doc(firstReview.id);
    await reviewRef.update({ reactionCount: 8, commentCount: 3 });
    const visit = {
      reviewId: firstReview.id,
      idempotencyKey: 'return-visit-command-0001',
      rating: 4,
      text: 'Returned for another visit',
      tags: ['casual'],
      dishReviews: [
        { id: 'another-draft-id', title: 'Soup dumplings', rating: 4 },
        { id: 'new-dessert', title: 'Dessert', rating: 5 },
      ],
    };
    await expect(
      callFunction('addReviewVisit', visit, second.token),
    ).rejects.toMatchObject({ status: 'PERMISSION_DENIED' });
    await Promise.all([
      callFunction('addReviewVisit', visit, first.token),
      callFunction('addReviewVisit', visit, first.token),
    ]);
    const review = await reviewRef.get();
    const after = await db.collection('users').doc(author.id).get();
    expect(review.get('visitCount')).toBe(2);
    expect(review.get('previousRating')).toBe(5);
    expect(review.get('reactionCount')).toBe(8);
    expect(review.get('commentCount')).toBe(3);
    expect(review.get('dishReviews')).toHaveLength(2);
    expect(
      review
        .get('dishReviews')[1]
        .history.map((entry: { rating: number }) => entry.rating),
    ).toEqual([4.5, 4]);
    expect(after.get('xp')).toBe(before.get('xp'));
    expect(after.get('reviewCount')).toBe(before.get('reviewCount'));
    expect(
      (await db.collection('venues').doc('demo-cafe').get()).get('reviewCount'),
    ).toBe(1);
    await callFunction(
      'deleteReview',
      { reviewId: firstReview.id },
      first.token,
    );
    const fresh = await Promise.allSettled([
      callFunction<{ id: string }>(
        'createReview',
        { ...reviewCommand, idempotencyKey: 'new-after-delete-0001' },
        first.token,
      ),
      callFunction<{ id: string }>(
        'createReview',
        { ...reviewCommand, idempotencyKey: 'new-after-delete-0002' },
        first.token,
      ),
    ]);
    // Photo paths must match each new draft key.
    expect(fresh.every((item) => item.status === 'rejected')).toBe(true);
    const concurrent = await Promise.allSettled([
      callFunction<{ id: string }>(
        'createReview',
        {
          ...reviewCommand,
          dishReviews: [],
          idempotencyKey: 'new-after-delete-0003',
        },
        first.token,
      ),
      callFunction<{ id: string }>(
        'createReview',
        {
          ...reviewCommand,
          dishReviews: [],
          idempotencyKey: 'new-after-delete-0004',
        },
        first.token,
      ),
    ]);
    expect(
      concurrent.filter((item) => item.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      (await db.collection('venues').doc('demo-cafe').get()).get('reviewCount'),
    ).toBe(1);
  }, 30_000);

  it('includes friends and local users below the global top 250', async () => {
    const { first, second, db, author, reader } = await createSocialFixture();
    const batch = db.batch();
    for (let index = 0; index < 260; index += 1)
      batch.set(db.collection('users').doc(`global-${index}`), {
        status: 'active',
        displayName: `Global ${index}`,
        city: 'Paris',
        xp: 100_000 + index,
        monthlyXp: 100_000 + index,
      });
    batch.update(author.ref, { xp: 10, monthlyXp: 10 });
    batch.update(reader.ref, { xp: 20, monthlyXp: 20 });
    await batch.commit();
    await callFunction('followUser', { targetUserId: reader.id }, first.token);
    const friends = await callFunction<{ items: { userId: string }[] }>(
      'getLeaderboard',
      { audience: 'friends', period: 'month' },
      first.token,
    );
    const local = await callFunction<{ items: { userId: string }[] }>(
      'getLeaderboard',
      { audience: 'local', period: 'month' },
      first.token,
    );
    expect(friends.items.map((item) => item.userId)).toEqual([
      reader.id,
      author.id,
    ]);
    expect(local.items.map((item) => item.userId)).toEqual([
      reader.id,
      author.id,
    ]);
    const otherFriends = await callFunction<{ items: { userId: string }[] }>(
      'getLeaderboard',
      { audience: 'friends', period: 'month' },
      second.token,
    );
    expect(otherFriends.items.map((item) => item.userId)).toEqual([reader.id]);
  }, 30_000);

  it('uploads chat photos only for active accepted participants and reuses retries', async () => {
    const { first, second, db, author } = await createSocialFixture();
    await db
      .collection('conversations')
      .doc('photo-regression')
      .set({
        kind: 'group',
        status: 'active',
        participantIds: [author.id],
        invitationStatuses: { [author.id]: 'accepted' },
      });
    const command = {
      conversationId: 'photo-regression',
      idempotencyKey: 'chat-photo-regression-0001',
      photoBase64:
        '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwB1FFFd55Z//9k=',
    };
    await expect(
      callFunction('uploadChatPhoto', command, second.token),
    ).rejects.toMatchObject({ status: 'NOT_FOUND' });
    const image = await callFunction<{ imageUrl: string }>(
      'uploadChatPhoto',
      command,
      first.token,
    );
    const retry = await callFunction<{ imageUrl: string }>(
      'uploadChatPhoto',
      command,
      first.token,
    );
    expect(retry.imageUrl).toBe(image.imageUrl);
    const media = await fetch(image.imageUrl);
    expect(media.ok).toBe(true);
    expect(media.headers.get('content-type')).toBe('image/jpeg');
    await callFunction(
      'sendMessage',
      {
        conversationId: command.conversationId,
        idempotencyKey: 'chat-image-message-0001',
        imageUrl: image.imageUrl,
      },
      first.token,
    );
    await db
      .collection('conversations')
      .doc('photo-regression')
      .update({ [`invitationStatuses.${author.id}`]: 'pending' });
    await expect(
      callFunction(
        'uploadChatPhoto',
        { ...command, idempotencyKey: 'chat-photo-regression-0002' },
        first.token,
      ),
    ).rejects.toMatchObject({ status: 'PERMISSION_DENIED' });
  }, 30_000);
});

it(
  'opens historical review links and preserves engagement after consolidation',
  { timeout: 30_000 },
  async () => {
    const fixture = await createReviewFixture();
    const canonicalId = fixture.firstReview.id;
    const aliasId = 'historical-review-before-consolidation';
    await fixture.db.collection('reviews').doc(aliasId).set({
      authorId: fixture.author.id,
      venueId: 'demo-cafe',
      status: 'deleted',
      mergedIntoReviewId: canonicalId,
    });
    await fixture.db
      .collection('reviews')
      .doc(canonicalId)
      .collection('comments')
      .doc('historical-comment')
      .set({
        authorId: fixture.reader.id,
        authorDisplayName: 'Reader',
        text: 'Preserved comment',
        parentCommentId: null,
        status: 'published',
        reactionCount: 0,
        replyCount: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    await fixture.db
      .collection('reviews')
      .doc(canonicalId)
      .update({ commentCount: 1 });
    const result = await callFunction<{
      review: { id: string };
      items: Array<{ id: string; text: string }>;
    }>('getComments', { reviewId: aliasId, limit: 20 }, fixture.second.token);
    expect(result.review.id).toBe(canonicalId);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'historical-comment',
          text: 'Preserved comment',
        }),
      ]),
    );
    await callFunction(
      'reactToComment',
      {
        reviewId: aliasId,
        commentId: 'historical-comment',
        idempotencyKey: 'historical-comment-like',
        reaction: 'like',
      },
      fixture.first.token,
    );
    expect(
      (
        await fixture.db
          .collection('reviews')
          .doc(canonicalId)
          .collection('comments')
          .doc('historical-comment')
          .get()
      ).get('reactionCount'),
    ).toBe(1);
    const reaction = await callFunction<{ active: boolean }>(
      'reactToReview',
      {
        reviewId: aliasId,
        idempotencyKey: 'historical-review-like',
        reaction: 'like',
      },
      fixture.second.token,
    );
    expect(reaction.active).toBe(true);
    expect(
      (
        await fixture.db
          .collection('reviews')
          .doc(canonicalId)
          .collection('reactions')
          .doc(fixture.reader.id)
          .get()
      ).exists,
    ).toBe(true);
    expect(
      (await fixture.db.collection('reviews').doc(aliasId).get()).get('status'),
    ).toBe('deleted');
  },
);

it(
  'consolidates legacy reviews transactionally without losing comments, photos or likes',
  { timeout: 30_000 },
  async () => {
    const fixture = await createReviewFixture();
    const canonical = fixture.db
      .collection('reviews')
      .doc(fixture.firstReview.id);
    const original = (await canonical.get()).data()!;
    const duplicate = fixture.db
      .collection('reviews')
      .doc('legacy-return-visit');
    // Create an archived record first so the publication side-effect trigger does
    // not award XP for migration fixtures, then expose the legacy published state.
    await duplicate.set({
      ...original,
      status: 'deleted',
      text: 'Returned later',
      createdAt: Timestamp.fromMillis(Date.now() + 1000),
      rating: 4,
      dishReviews: [{ id: 'new-id', title: 'Soup dumplings', rating: 4 }],
    });
    await duplicate.update({ status: 'published' });
    await canonical.update({ reactionCount: 1 });
    await canonical
      .collection('reactions')
      .doc(fixture.reader.id)
      .set({ userId: fixture.reader.id, createdAt: Timestamp.now() });
    await duplicate
      .collection('reactions')
      .doc(fixture.reader.id)
      .set({ userId: fixture.reader.id, createdAt: Timestamp.now() });
    await duplicate
      .collection('reactions')
      .doc('another-reader')
      .set({ userId: 'another-reader', createdAt: Timestamp.now() });
    await duplicate.update({ reactionCount: 2, commentCount: 2 });
    const comment = duplicate.collection('comments').doc('preserved-root');
    await comment.set({
      authorId: fixture.reader.id,
      text: 'Original discussion',
      status: 'published',
      parentCommentId: null,
      reactionCount: 1,
      replyCount: 1,
      createdAt: Timestamp.now(),
    });
    await comment
      .collection('reactions')
      .doc(fixture.author.id)
      .set({ userId: fixture.author.id });
    await duplicate.collection('comments').doc('preserved-reply').set({
      authorId: fixture.author.id,
      text: 'Reply',
      status: 'published',
      parentCommentId: comment.id,
      createdAt: Timestamp.now(),
    });
    await fixture.author.ref.update({ reviewCount: 2 });
    await fixture.db
      .collection('venues')
      .doc('demo-cafe')
      .update({ reviewCount: 2, rating: 4.5 });
    const beforeXp = (await fixture.author.ref.get()).get('xp');
    const { mkdtemp, readFile, readdir, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const backupDirectory = await mkdtemp(
      join(tmpdir(), 'tastes-migration-test-'),
    );
    process.env.GCLOUD_PROJECT = PROJECT_ID;
    const { mergeHistoricalReviewVisits } =
      await import('../../functions/src/scripts/merge-historical-review-visits');
    try {
      await mergeHistoricalReviewVisits({
        apply: true,
        backupDirectory,
        allowTestEmulator: true,
      });
      const merged = await canonical.get();
      expect(merged.get('visitCount')).toBe(2);
      expect(merged.get('rating')).toBe(4);
      expect(
        merged.get('visits').map((visit: { text: string }) => visit.text),
      ).toEqual(['Exactly once', 'Returned later']);
      expect(merged.get('dishReviews')[0].photoPath).toBe(
        fixture.reviewCommand.dishReviews[0]!.photoPath,
      );
      expect(merged.get('reactionCount')).toBe(2);
      expect(merged.get('commentCount')).toBe(2);
      expect(
        (
          await canonical
            .collection('comments')
            .doc('preserved-root')
            .collection('reactions')
            .doc(fixture.author.id)
            .get()
        ).exists,
      ).toBe(true);
      expect(
        (
          await canonical.collection('comments').doc('preserved-reply').get()
        ).get('parentCommentId'),
      ).toBe('preserved-root');
      expect((await duplicate.get()).get('mergedIntoReviewId')).toBe(
        canonical.id,
      );
      expect((await duplicate.collection('comments').get()).size).toBe(2);
      const author = await fixture.author.ref.get();
      expect(author.get('reviewCount')).toBe(1);
      expect(author.get('xp')).toBe(beforeXp);
      expect(
        (await fixture.db.collection('venues').doc('demo-cafe').get()).get(
          'rating',
        ),
      ).toBe(4);
      const backup = JSON.parse(
        await readFile(
          `${backupDirectory}/${(await readdir(backupDirectory))[0]}`,
          'utf8',
        ),
      );
      expect(
        backup.documents.some(
          (doc: { path: string }) =>
            doc.path ===
            `${duplicate.path}/comments/preserved-root/reactions/${fixture.author.id}`,
        ),
      ).toBe(true);
      await mergeHistoricalReviewVisits({
        apply: true,
        backupDirectory,
        allowTestEmulator: true,
      });
      expect((await canonical.get()).get('visitCount')).toBe(2);
    } finally {
      await rm(backupDirectory, { recursive: true, force: true });
    }
  },
);

it(
  'scopes curated discovery before ranking and distinguishes verified new spots',
  { timeout: 30_000 },
  async () => {
    const fixture = await createSocialFixture();
    const base = {
      city: 'Istanbul',
      name: 'Local cafe',
      status: 'active',
      address: 'Local street 1',
      category: 'Cafe',
      rating: 4,
      reviewCount: 3,
      discoverTags: ['trending', 'new'],
      createdAt: Timestamp.now(),
    };
    for (let i = 0; i < 4; i += 1)
      await fixture.db
        .collection('venues')
        .doc(`foreign-${i}`)
        .set({ ...base, city: 'London', rating: 5 });
    await fixture.db.collection('venues').doc('local-curated').set(base);
    await fixture.db
      .collection('venues')
      .doc('just-opened')
      .set({
        ...base,
        verifiedOpeningDate: new Date(
          Date.now() - 10 * 86_400_000,
        ).toISOString(),
        rating: 3,
      });
    await fixture.db
      .collection('venues')
      .doc('new-on-tastes')
      .set({
        ...base,
        firstPublishedAt: Timestamp.fromMillis(Date.now() - 2 * 86_400_000),
        rating: 2,
      });
    await fixture.db
      .collection('venues')
      .doc('expired-new')
      .set({
        ...base,
        firstPublishedAt: Timestamp.fromMillis(Date.now() - 60 * 86_400_000),
      });
    const feed = await callFunction<{
      hero: { id: string; city: string };
      heroIsHot: boolean;
      trending: Array<{ city: string }>;
      newSpots: Array<{ id: string }>;
      newSpotLabels: Record<string, string>;
    }>('getDiscoverFeed', {}, fixture.first.token);
    expect(feed.hero.city).toBe('Istanbul');
    expect(feed.heroIsHot).toBe(false);
    expect(feed.trending.every((venue) => venue.city === 'Istanbul')).toBe(
      true,
    );
    expect(feed.newSpots.map((venue) => venue.id)).toEqual([
      'new-on-tastes',
      'just-opened',
      'local-curated',
    ]);
    expect(feed.newSpotLabels).toMatchObject({
      'just-opened': 'Just opened',
      'new-on-tastes': 'New on Tastes',
      'local-curated': 'Editor’s pick',
    });
    expect(feed.newSpotLabels['expired-new']).toBeUndefined();
    await expect(
      callFunction(
        'getDiscoverFeed',
        { latitude: 91, longitude: 0 },
        fixture.first.token,
      ),
    ).rejects.toMatchObject({ status: 'INVALID_ARGUMENT' });
    await fixture.db
      .collection('users')
      .doc(fixture.author.id)
      .update({ city: 'Monaco' });
    expect(
      (
        await callFunction<{ hero: null }>(
          'getDiscoverFeed',
          {},
          fixture.first.token,
        )
      ).hero,
    ).toBeNull();
  },
);

it(
  'persists half-star minimum scores and normalizes older client decimals',
  { timeout: 30_000 },
  async () => {
    const fixture = await createSocialFixture();
    await fixture.db.collection('venues').doc('half-star-venue').set({
      name: 'Half-star venue',
      city: 'Istanbul',
      status: 'active',
      rating: 0,
      reviewCount: 0,
    });
    const created = await callFunction<{ id: string }>(
      'createReview',
      {
        idempotencyKey: 'half-star-create-0001',
        venueId: 'half-star-venue',
        rating: 0.5,
        text: 'A half-star review',
        dishReviews: [{ id: 'soup', title: 'Soup', rating: 4.3 }],
      },
      fixture.first.token,
    );
    const reference = fixture.db.collection('reviews').doc(created.id);
    expect((await reference.get()).get('rating')).toBe(0.5);
    expect((await reference.get()).get('dishReviews')[0].rating).toBe(4.5);
    await callFunction(
      'editReview',
      {
        reviewId: created.id,
        rating: 4.7,
        text: 'Updated from an older client',
        dishReviews: [{ id: 'soup', title: 'Soup', rating: 0.5 }],
      },
      fixture.first.token,
    );
    expect((await reference.get()).get('rating')).toBe(4.5);
    expect((await reference.get()).get('dishReviews')[0].rating).toBe(0.5);
    await callFunction(
      'addReviewVisit',
      {
        reviewId: created.id,
        idempotencyKey: 'half-star-visit-0001',
        rating: 0.5,
        text: 'Another visit',
        dishReviews: [{ id: 'soup', title: 'Soup', rating: 0.5 }],
      },
      fixture.first.token,
    );
    const result = await reference.get();
    expect(result.get('rating')).toBe(0.5);
    expect(result.get('previousRating')).toBe(4.5);
    expect(
      result.get('visits').map((visit: { rating: number }) => visit.rating),
    ).toEqual([4.5, 0.5]);
  },
);

describe('atomic venue merges and aggregate reconciliation', () => {
  it('combines visits and engagement, counts only published reviews and safely retries', async () => {
    const db = getFirestore();
    const { mergeVenueRecords } =
      await import('../../functions/src/modules/admin/merge-venues');
    const { idempotentDocumentId } =
      await import('../../functions/src/shared/mutations');
    await Promise.all([
      db.doc('venues/merge-source').set({
        name: 'Duplicate',
        city: 'London',
        status: 'active',
        reviewCount: 91,
        rating: 1,
      }),
      db.doc('venues/merge-target').set({
        name: 'Correct place',
        city: 'Monaco',
        status: 'active',
        reviewCount: 92,
        rating: 1,
      }),
      db
        .doc('users/merge-author')
        .set({ status: 'active', reviewCount: 2, xp: 900, monthlyXp: 100 }),
    ]);
    const review = (
      authorId: string,
      venueId: string,
      rating: number,
      days: number,
      status = 'published',
    ) => ({
      authorId,
      venueId,
      rating,
      text: 'Visit details',
      dishReviews: [{ id: 'soup', title: 'Soup', rating }],
      status,
      createdAt: Timestamp.fromMillis(Date.now() - days * 86_400_000),
      reactionCount: 0,
      commentCount: 0,
    });
    await Promise.all([
      db.doc('reviews/merge-old').set({
        ...review('merge-author', 'merge-source', 2, 3),
        reactionCount: 1,
      }),
      db.doc('reviews/merge-new').set({
        ...review('merge-author', 'merge-target', 4.5, 1),
        reactionCount: 2,
      }),
      db.doc('reviews/merge-other').set(review('other', 'merge-source', 5, 2)),
      db
        .doc('reviews/merge-deleted')
        .set(review('removed', 'merge-source', 1, 1, 'deleted')),
      db
        .doc('reviews/merge-hidden')
        .set(review('moderated', 'merge-source', 1.5, 1, 'hidden')),
      db
        .doc('reviews/merge-old/reactions/liker')
        .set({ userId: 'liker', createdAt: Timestamp.fromMillis(10) }),
      db
        .doc('reviews/merge-new/reactions/liker')
        .set({ userId: 'liker', createdAt: Timestamp.fromMillis(20) }),
      db
        .doc('reviews/merge-new/reactions/second')
        .set({ userId: 'second', createdAt: Timestamp.now() }),
      db.doc('reviews/merge-old/comments/first').set({
        status: 'published',
        text: 'First comment',
        createdAt: Timestamp.now(),
      }),
      db.doc('reviews/merge-new/comments/reply').set({
        status: 'published',
        text: 'Reply',
        reviewId: 'merge-new',
        createdAt: Timestamp.now(),
      }),
      db
        .doc('reviews/merge-new/comments/reply/reactions/liker')
        .set({ userId: 'liker', createdAt: Timestamp.now() }),
    ]);
    await db
      .doc('users/merge-author')
      .update({ 'tastePreferences.favoriteVenueId': 'merge-source' });
    await db.doc('users/merge-author/savedVenues/merge-source').set({
      venueId: 'merge-source',
      folderIds: ['first-folder'],
      createdAt: Timestamp.now(),
    });
    await db.doc('users/merge-author/savedVenues/merge-target').set({
      venueId: 'merge-target',
      folderIds: ['second-folder'],
      createdAt: Timestamp.now(),
    });
    const concurrent = await Promise.all([
      mergeVenueRecords(db, 'merge-source', 'merge-target', 'admin'),
      mergeVenueRecords(db, 'merge-source', 'merge-target', 'admin'),
    ]);
    expect(concurrent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          movedReviews: 4,
          mergedReviews: 1,
          alreadyMerged: false,
        }),
        expect.objectContaining({ movedReviews: 0, alreadyMerged: true }),
      ]),
    );
    expect((await db.doc('venues/merge-target').get()).data()).toMatchObject({
      reviewCount: 2,
      rating: 4.75,
    });
    expect((await db.doc('venues/merge-source').get()).data()).toMatchObject({
      status: 'merged',
      reviewCount: 0,
      rating: 0,
    });
    const canonical = await db.doc('reviews/merge-old').get();
    expect(canonical.data()).toMatchObject({
      venueCity: 'Monaco',
      venueName: 'Correct place',
      venueId: 'merge-target',
      rating: 4.5,
      visitCount: 2,
      reactionCount: 2,
      commentCount: 2,
    });
    expect(
      (await db.doc('reviews/merge-new').get()).get('mergedIntoReviewId'),
    ).toBe('merge-old');
    expect(
      (await db.doc('reviews/merge-old/comments/reply/reactions/liker').get())
        .exists,
    ).toBe(true);
    expect(
      (await db.doc('reviews/merge-old/comments/reply').get()).get('reviewId'),
    ).toBe('merge-old');
    expect(
      (await db.doc('reviews/merge-old/reactions/liker').get())
        .get('createdAt')
        .toMillis(),
    ).toBe(10);
    expect((await db.doc('users/merge-author').get()).data()).toMatchObject({
      reviewCount: 1,
      xp: 900,
    });
    expect(
      (
        await db
          .collection('reviewOwnership')
          .doc(
            idempotentDocumentId(
              'merge-author',
              'review-owner',
              'merge-target',
            ),
          )
          .get()
      ).get('reviewId'),
    ).toBe('merge-old');
    expect(
      await mergeVenueRecords(db, 'merge-source', 'merge-target', 'admin'),
    ).toMatchObject({ alreadyMerged: true, movedReviews: 0 });
    expect(
      (await db.doc('users/merge-author/savedVenues/merge-target').get()).get(
        'folderIds',
      ),
    ).toEqual(expect.arrayContaining(['first-folder', 'second-folder']));
    expect(
      (await db.doc('users/merge-author/savedVenues/merge-source').get())
        .exists,
    ).toBe(false);
    expect(
      (await db.doc('users/merge-author').get()).get(
        'tastePreferences.favoriteVenueId',
      ),
    ).toBe('merge-target');
    expect(
      (
        await db
          .doc(
            '_venueMergeArchives/merge-source:merge-target/savedVenues/merge-author',
          )
          .get()
      ).exists,
    ).toBe(true);
    const { resolveVenue } =
      await import('../../functions/src/shared/venue-alias');
    expect((await resolveVenue('merge-source')).id).toBe('merge-target');
  }, 20_000);

  it('fails before any writes for self-merges and conflicts involving hidden reviews', async () => {
    const db = getFirestore();
    const { mergeVenueRecords } =
      await import('../../functions/src/modules/admin/merge-venues');
    await db
      .doc('venues/safe-source')
      .set({ name: 'Source', status: 'active' });
    await db
      .doc('venues/safe-target')
      .set({ name: 'Target', status: 'active' });
    for (const [id, venueId, status] of [
      ['first', 'safe-source', 'published'],
      ['second', 'safe-target', 'hidden'],
    ])
      await db
        .doc(`reviews/${id}`)
        .set({ authorId: 'same', venueId, status, rating: 4 });
    await expect(
      mergeVenueRecords(db, 'safe-source', 'safe-source', 'admin'),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      mergeVenueRecords(db, 'safe-source', 'safe-target', 'admin'),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect((await db.doc('venues/safe-source').get()).get('status')).toBe(
      'active',
    );
    expect((await db.doc('reviews/first').get()).get('venueId')).toBe(
      'safe-source',
    );
    await db.doc('reviews/second').update({ status: 'published' });
    await db
      .doc('reports/merge-pending')
      .set({ targetType: 'review', targetId: 'first', status: 'pending' });
    await expect(
      mergeVenueRecords(db, 'safe-source', 'safe-target', 'admin'),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect((await db.doc('reviews/first').get()).get('venueId')).toBe(
      'safe-source',
    );
  });

  it('repairs venue averages and user counts once, excludes hidden/deleted reviews and keeps an audit', async () => {
    const db = getFirestore();
    const { reconcileReviewAggregates } =
      await import('../../functions/src/shared/review-aggregates');
    await db.doc('venues/count-place').set({ reviewCount: 88, rating: 1 });
    await db.doc('users/count-author').set({ reviewCount: 99, xp: 123 });
    for (const [id, rating, status] of [
      ['a', 4, 'published'],
      ['b', 5, 'published'],
      ['c', 1, 'deleted'],
      ['d', 1, 'hidden'],
    ] as const)
      await db.doc(`reviews/${id}`).set({
        authorId: 'count-author',
        venueId: 'count-place',
        status,
        rating,
      });
    expect((await reconcileReviewAggregates(db)).repairs).toHaveLength(2);
    expect((await db.doc('users/count-author').get()).get('reviewCount')).toBe(
      99,
    );
    expect((await reconcileReviewAggregates(db, true)).repairs).toHaveLength(2);
    expect((await db.doc('venues/count-place').get()).data()).toMatchObject({
      reviewCount: 2,
      rating: 4.5,
    });
    expect((await db.doc('users/count-author').get()).data()).toMatchObject({
      reviewCount: 2,
      xp: 123,
    });
    expect((await reconcileReviewAggregates(db, true)).repairs).toHaveLength(0);
    expect((await db.collection('_reviewAggregateRepairs').get()).size).toBe(2);
  });
});

it('gates weekly ranking activation by admin role/history, applies exclusions and uses validated scores', async () => {
  const { db, first, author } = await createSocialFixture();
  const custom = await getAuth().createCustomToken('qa-community-admin', {
    role: 'admin',
  });
  const auth = (await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    },
  ).then((response) => response.json())) as { idToken: string };
  await expect(
    callFunction(
      'setCommunityDiscoveryMode',
      { mode: 'enabled', reason: 'QA approval' },
      first.token,
    ),
  ).rejects.toMatchObject({ status: 'PERMISSION_DENIED' });
  await expect(
    callFunction(
      'setCommunityDiscoveryMode',
      { mode: 'enabled', reason: 'QA approval' },
      auth.idToken,
    ),
  ).rejects.toMatchObject({ status: 'FAILED_PRECONDITION' });
  const now = Date.now();
  const fresh = {
    algorithmVersion: 1,
    calculatedAt: Timestamp.fromMillis(now),
  };
  await db
    .collection('_communitySignalRuns')
    .doc('qa-valid-observation')
    .set({
      ...fresh,
      eventCount: 12,
      firstObservedEventAt: Timestamp.fromMillis(now - 8 * 86_400_000),
    });
  for (const [id, followers, weekly] of [
    ['weekly-winner', 2, 5],
    ['lifetime-winner', 900, 1],
  ] as const) {
    await db.doc(`users/${id}`).set({
      status: 'active',
      displayName: id,
      username: id,
      city: 'Istanbul',
      createdAt: Timestamp.fromMillis(now - 40 * 86_400_000),
      reviewCount: 1,
      followerCount: followers,
    });
    await db.doc(`_communityPeopleSignals/${id}`).set({
      ...fresh,
      userId: id,
      uniqueFollowers7d: weekly,
      reviewEngagement: 1,
    });
    await db.doc(`reviews/review-${id}`).set({
      status: 'published',
      authorId: id,
      authorDisplayName: id,
      venueId: 'weekly-place',
      venueName: 'Place',
      venueCity: 'Istanbul',
      rating: 4.5,
      text: 'Enough detailed food review text to qualify for the recent ranking.',
      createdAt: Timestamp.fromMillis(now - 86_400_000),
      reactionCount: followers,
    });
    await db.doc(`_communityReviewSignals/review-${id}`).set({
      ...fresh,
      score: weekly,
      recentEngagement: weekly,
      publishedAt: now - 86_400_000,
    });
  }
  await db.doc('venues/weekly-place').set({
    status: 'active',
    name: 'Place',
    city: 'Istanbul',
    reviewCount: 2,
    rating: 4.5,
  });
  await callFunction(
    'setCommunityDiscoveryMode',
    { mode: 'enabled', reason: 'QA validated synthetic history' },
    auth.idToken,
  );
  const people = await callFunction<{
    trendingIsAutomatic: boolean;
    trending: { userId: string }[];
  }>('getDiscoverPeople', {}, first.token);
  expect(people.trendingIsAutomatic).toBe(true);
  expect(people.trending[0]?.userId).toBe('weekly-winner');
  const newlyJoined = await callFunction<{ new: { userId: string }[] }>(
    'getDiscoverPeople',
    {},
    first.token,
  );
  expect(
    newlyJoined.new.some((person) =>
      ['weekly-winner', 'lifetime-winner'].includes(person.userId),
    ),
  ).toBe(false);

  const feed = await callFunction<{
    popularReviewsAreAutomatic: boolean;
    popularReviews: { id: string }[];
  }>('getDiscoverFeed', {}, first.token);
  expect(feed.popularReviewsAreAutomatic).toBe(true);
  expect(feed.popularReviews[0]?.id).toBe('review-weekly-winner');
  await callFunction(
    'setCommunityDiscoveryOverride',
    {
      targetType: 'user',
      targetId: 'weekly-winner',
      excluded: true,
      reason: 'QA editorial exclusion',
    },
    auth.idToken,
  );
  const excluded = await callFunction<{ trending: { userId: string }[] }>(
    'getDiscoverPeople',
    {},
    first.token,
  );
  expect(
    excluded.trending.some((person) => person.userId === 'weekly-winner'),
  ).toBe(false);
  const excludedReviews = await callFunction<{
    popularReviews: { id: string }[];
  }>('getDiscoverFeed', {}, first.token);
  expect(
    excludedReviews.popularReviews.some(
      (review) => review.id === 'review-weekly-winner',
    ),
  ).toBe(false);
  expect((await db.doc('users/weekly-winner').get()).get('status')).toBe(
    'active',
  );
  expect(
    (await db.doc('reviews/review-weekly-winner').get()).get('status'),
  ).toBe('published');
  await db
    .doc('_communitySignalRuns/qa-valid-observation')
    .update({ calculatedAt: Timestamp.fromMillis(now - 3 * 60 * 60_000) });
  const fallback = await callFunction<{
    trendingIsAutomatic: boolean;
    trending: { userId: string }[];
  }>('getDiscoverPeople', {}, first.token);
  expect(fallback.trendingIsAutomatic).toBe(false);
  expect(
    fallback.trending.some((person) => person.userId === 'weekly-winner'),
  ).toBe(false);
  expect((await db.doc(`users/${author.id}`).get()).get('status')).toBe(
    'active',
  );
}, 25_000);

it('serves real cross-venue taste matches, rechecks hidden/deleted evidence and excludes reverse blocks', async () => {
  const { db, first, author } = await createSocialFixture();
  const now = Date.now(),
    anchors = [
      'cacio-e-pepe',
      'margherita-pizza',
      'patatas-bravas',
      'mushroom-risotto',
      'tiramisu',
    ];
  const names = [
    'Cacio e pepe',
    'Margherita pizza',
    'Patatas bravas',
    'Mushroom risotto',
    'Tiramisu',
  ];
  await Promise.all(
    ['own-taste-place', 'peer-anchor-place', 'recommend-place'].map((id) =>
      db.doc(`venues/${id}`).set({
        status: 'active',
        name: id,
        city: 'Istanbul',
        latitude: 41,
        longitude: 29,
      }),
    ),
  );
  await db
    .doc('users/taste-peer')
    .set({ status: 'active', displayName: 'Taste peer' });
  const review = (
    uid: string,
    venueId: string,
    dishes: { id: string; title: string; rating: number }[],
  ) => ({
    authorId: uid,
    authorDisplayName: uid,
    venueId,
    venueCity: 'Istanbul',
    status: 'published',
    rating: 4.5,
    text: 'Real source review',
    createdAt: Timestamp.fromMillis(now - 1000),
    dishReviews: dishes,
  });
  const anchorDishes = anchors.map((id, i) => ({
    id,
    title: names[i]!,
    rating: i === 3 ? 2 : 4.5,
  }));
  await db
    .doc('reviews/taste-own')
    .set(review(author.id, 'own-taste-place', anchorDishes));
  await db
    .doc('reviews/taste-peer-anchor')
    .set(review('taste-peer', 'peer-anchor-place', anchorDishes));
  await db
    .doc('reviews/taste-offering')
    .set(
      review('taste-peer', 'recommend-place', [
        { id: 'pesto', title: 'Pasta al pesto', rating: 5 },
      ]),
    );
  for (const id of ['taste-own', 'taste-peer-anchor', 'taste-offering'])
    await refreshTasteReviewProjection(db, id);
  const result = await callFunction<TasteRecommendationsResult>(
    'getTasteRecommendations',
    {},
    first.token,
  );
  expect(result.state).toBe('personalized');
  expect(result.distinctRatedDishes).toBe(5);
  expect(result.recommendations[0]).toMatchObject({
    canonicalDishId: 'pesto-pasta',
    venue: { id: 'recommend-place' },
    tier: 'taste_match',
    reviewId: 'taste-offering',
  });
  const json = JSON.stringify(result);
  expect(json).not.toMatch(
    /internalState|rankScore|ingredients|traitPreferences/,
  );
  await db
    .doc('_communityOverrides/review:taste-offering')
    .set({ targetType: 'review', targetId: 'taste-offering', excluded: true });
  expect(
    (
      await callFunction<TasteRecommendationsResult>(
        'getTasteRecommendations',
        {},
        first.token,
      )
    ).recommendations,
  ).toEqual([]);
  await db.doc('_communityOverrides/review:taste-offering').delete();
  await db.doc('users/taste-peer').update({ source: 'seed' });
  expect(
    (
      await callFunction<TasteRecommendationsResult>(
        'getTasteRecommendations',
        {},
        first.token,
      )
    ).recommendations,
  ).toEqual([]);
  await db.doc('users/taste-peer').update({ source: FieldValue.delete() });
  // Leave the retrieval index stale deliberately: source revalidation is the privacy boundary.
  await db.doc('reviews/taste-offering').update({ status: 'hidden' });
  expect(
    (
      await callFunction<TasteRecommendationsResult>(
        'getTasteRecommendations',
        {},
        first.token,
      )
    ).recommendations,
  ).toEqual([]);
  await db.doc('reviews/taste-offering').update({
    status: 'published',
    dishReviews: [{ id: 'pesto', title: 'Pasta al pesto', rating: 0.5 }],
  });
  expect(
    (
      await callFunction<TasteRecommendationsResult>(
        'getTasteRecommendations',
        {},
        first.token,
      )
    ).recommendations,
  ).toEqual([]);
  await db.doc('reviews/taste-offering').update({
    dishReviews: [{ id: 'pesto', title: 'Pasta al pesto', rating: 5 }],
  });
  await db
    .doc(`users/taste-peer/blocked/${author.id}`)
    .set({ userId: author.id });
  const blocked = await callFunction<TasteRecommendationsResult>(
    'getTasteRecommendations',
    {},
    first.token,
  );
  expect(blocked.matchedUserCount).toBe(0);
  expect(blocked.recommendations).toEqual([]);
  await db.doc(`users/taste-peer/blocked/${author.id}`).delete();
  await db.doc('venues/recommend-place').update({ status: 'hidden' });
  expect(
    (
      await callFunction<TasteRecommendationsResult>(
        'getTasteRecommendations',
        {},
        first.token,
      )
    ).recommendations,
  ).toEqual([]);
  await expect(
    callFunction('getTasteRecommendations', {}),
  ).rejects.toMatchObject({ status: 'UNAUTHENTICATED' });
}, 30_000);

it('validates canonical selection at the real review write boundary without altering old-client writes', async () => {
  const { db, first } = await createSocialFixture();
  await db.doc('venues/canonical-place').set({
    status: 'active',
    name: 'Canonical Place',
    city: 'Istanbul',
    rating: 0,
    reviewCount: 0,
  });
  const base = {
    venueId: 'canonical-place',
    rating: 4.5,
    text: 'A proper dish review',
    dishReviews: [
      {
        id: 'fish',
        title: 'fish with lemon',
        rating: 0.5,
        canonicalDishId: 'lemon-sea-bass',
      },
    ],
  };
  await expect(
    callFunction(
      'createReview',
      { ...base, idempotencyKey: 'unconfirmed-canonical-0001' },
      first.token,
    ),
  ).rejects.toMatchObject({ status: 'INVALID_ARGUMENT' });
  const created = await callFunction<{ id: string }>(
    'createReview',
    {
      ...base,
      idempotencyKey: 'confirmed-canonical-00001',
      dishReviews: [{ ...base.dishReviews[0], canonicalDishConfirmed: true }],
    },
    first.token,
  );
  expect(
    (await db.doc(`reviews/${created.id}`).get()).get('dishReviews')[0],
  ).toMatchObject({
    title: 'fish with lemon',
    canonicalDishId: 'lemon-sea-bass',
    rating: 0.5,
  });
  await callFunction(
    'editReview',
    {
      reviewId: created.id,
      rating: 4.5,
      text: 'Updated text only',
      dishReviews: [{ id: 'fish', title: 'fish with lemon', rating: 0.5 }],
    },
    first.token,
  );
  expect(
    (await db.doc(`reviews/${created.id}`).get()).get('dishReviews')[0]
      .canonicalDishId,
  ).toBe('lemon-sea-bass');
  await callFunction(
    'addReviewVisit',
    {
      reviewId: created.id,
      idempotencyKey: 'canonical-revisit-000001',
      rating: 4.5,
      text: 'Returned for the same dish',
      dishReviews: [
        { id: 'different-local-id', title: 'Sea bass with lemon', rating: 4.5 },
      ],
    },
    first.token,
  );
  const current = await db.doc(`reviews/${created.id}`).get();
  expect(current.get('dishReviews')).toHaveLength(1);
  expect(current.get('dishReviews')[0].history).toHaveLength(2);
  expect(
    (await db.doc('venues/canonical-place').get()).get('reviewCount'),
  ).toBe(1);
}, 25_000);

it('restricts canonical approvals to admins, rejects alias conflicts and makes approved names usable', async () => {
  const { db, first } = await createSocialFixture();
  const input = {
    id: 'test-dish',
    name: 'Test dish',
    aliases: ['exact test alias'],
    status: 'active',
    reason: 'Verified exact recipe identity',
  };
  await expect(
    callFunction('upsertCanonicalDish', input, first.token),
  ).rejects.toMatchObject({ status: 'PERMISSION_DENIED' });
  await expect(
    callFunction('getAdminDishCatalog', {}, first.token),
  ).rejects.toMatchObject({ status: 'PERMISSION_DENIED' });
  const custom = await getAuth().createCustomToken('dish-admin', {
    role: 'admin',
  });
  const signed = (await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    },
  ).then((r) => r.json())) as { idToken: string };
  await callFunction('upsertCanonicalDish', input, signed.idToken);
  expect(
    await callFunction(
      'getCanonicalDishes',
      { query: 'exact test alias' },
      first.token,
    ),
  ).toMatchObject({ exactId: 'test-dish' });
  await expect(
    callFunction(
      'upsertCanonicalDish',
      { ...input, id: 'other-test-dish', name: 'Different dish' },
      signed.idToken,
    ),
  ).rejects.toMatchObject({ status: 'INVALID_ARGUMENT' });
  expect((await db.collection('_tasteCatalogAudit').get()).size).toBe(1);
}, 25_000);

describe('taste catalogue index maintenance', () => {
  it('reindexes existing names after approval, skips redundant scans and preserves source reviews', async () => {
    const db = getFirestore();
    const source = db.doc('reviews/catalogue-repair');
    const payload = {
      authorId: 'catalogue-user',
      venueId: 'catalogue-place',
      venueCity: 'Rome',
      status: 'published',
      createdAt: Timestamp.fromMillis(Date.now() - 60_000),
      dishReviews: [{ id: 'dish', title: 'Exact new dish', rating: 4.5 }],
    };
    await source.set(payload);
    await maintainTasteEvidenceIfNeeded(db);
    const evidence = db.doc('_tasteReviewEvidence/catalogue-repair');
    expect((await evidence.get()).exists).toBe(false);
    await db
      .doc('_canonicalDishes/exact-new-dish')
      .set({ name: 'Exact new dish', aliases: [], status: 'active' });
    await db.doc('_tasteMaintenance/catalog').set({ revision: 1 });
    await maintainTasteEvidenceIfNeeded(db);
    expect((await evidence.get()).get('canonicalDishIds')).toEqual([
      'exact-new-dish',
    ]);
    const completed = (await db.doc('_tasteMaintenance/backfill').get()).get(
      'lastCompleteAt',
    );
    expect(await maintainTasteEvidenceIfNeeded(db)).toEqual({
      processed: 0,
      complete: true,
    });
    expect(
      (await db.doc('_tasteMaintenance/backfill').get()).get('lastCompleteAt'),
    ).toEqual(completed);
    expect((await source.get()).data()).toEqual(payload);
    await db.doc('_tasteMaintenance/backfill').set(
      {
        lastCompleteAt: Timestamp.fromMillis(Date.now() - 25 * 60 * 60 * 1000),
      },
      { merge: true },
    );
    expect((await maintainTasteEvidenceIfNeeded(db)).processed).toBeGreaterThan(
      0,
    );
  });
  it('revisits earlier pages when a dish is approved during a paginated rebuild', async () => {
    const db = getFirestore();
    const payload = {
      authorId: 'catalogue-user',
      venueId: 'catalogue-place',
      venueCity: 'Rome',
      status: 'published',
      createdAt: Timestamp.fromMillis(Date.now() - 60_000),
      dishReviews: [{ id: 'dish', title: 'Later approved dish', rating: 4.5 }],
    };
    await db.doc('reviews/a-before-approval').set(payload);
    await db.doc('reviews/z-after-approval').set(payload);
    expect((await rebuildTasteEvidence(db, 1)).complete).toBe(false);
    await db
      .doc('_canonicalDishes/later-approved-dish')
      .set({ name: 'Later approved dish', aliases: [], status: 'active' });
    await db.doc('_tasteMaintenance/catalog').set({ revision: 1 });
    await rebuildTasteEvidence(db, 1);
    await rebuildTasteEvidence(db, 1);
    const earlier = db.doc('_tasteReviewEvidence/a-before-approval');
    // A delayed review trigger may already have refreshed this row. Remove the
    // derived index only; catalogue revision must still force a complete pass.
    await earlier.delete();
    expect(
      (await db.doc('_tasteMaintenance/backfill').get()).get(
        'completedCatalogRevision',
      ),
    ).toBe(0);
    expect((await maintainTasteEvidenceIfNeeded(db)).processed).toBe(2);
    expect((await earlier.get()).get('canonicalDishIds')).toEqual([
      'later-approved-dish',
    ]);
  });
});
