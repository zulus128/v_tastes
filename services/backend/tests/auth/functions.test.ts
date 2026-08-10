import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

async function callFunction<T>(name: string, data: unknown, token?: string): Promise<T> {
  const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const payload = (await response.json()) as { result?: T; error?: CallableFailure };

  if (!response.ok || payload.error) {
    throw payload.error ?? new Error(`Callable ${name} failed with HTTP ${response.status}`);
  }
  return payload.result as T;
}

async function authenticatedUser() {
  const challenge = await requestOtp(uniquePhone());
  const verified = await callFunction<{ customToken: string }>('verifyPhoneOtp', {
    challengeId: challenge.challengeId,
    code: challenge.localCode,
  });
  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: verified.customToken, returnSecureToken: true }),
    },
  );
  const result = (await response.json()) as { idToken: string; localId: string };
  return { token: result.idToken, uid: result.localId };
}

async function expectReason(promise: Promise<unknown>, reason: string): Promise<CallableFailure> {
  try {
    await promise;
  } catch (error) {
    const failure = error as CallableFailure;
    expect(failure.details?.reason).toBe(reason);
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

describe('phone OTP callables', () => {
  it('uses unpredictable, independent challenges and enforces resend cooldown', async () => {
    const phoneNumber = uniquePhone();
    const first = await requestOtp(phoneNumber);

    expect(first.challengeId).not.toBe(createHash('sha256').update(phoneNumber).digest('hex'));
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
    const verified = await callFunction<{ customToken: string; isNewUser: boolean }>(
      'verifyPhoneOtp',
      {
        challengeId: challenge.challengeId,
        code: challenge.localCode,
      },
    );

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
    const incorrectChecks = reasons.filter((reason) => reason === 'incorrect-code').length;

    expect(reasons).toContain('incorrect-code');
    expect(
      reasons.every(
        (reason) => reason === 'incorrect-code' || reason === 'verification-in-progress',
      ),
    ).toBe(true);
    expect(snapshot.get('failedAttempts')).toBe(incorrectChecks);
    expect(incorrectChecks).toBeLessThanOrEqual(5);
  }, 15_000);
});

describe('authenticated session and paginated reads', () => {
  it('uses the server profile as the onboarding source of truth', async () => {
    const { token } = await authenticatedUser();

    expect(await callFunction('getSessionStatus', {}, token)).toEqual({
      profileExists: false,
      onboardingVersion: 0,
      onboardingComplete: false,
    });
    await callFunction(
      'createUserProfile',
      {
        displayName: 'Demo User',
        username: 'demo.user',
        city: 'Istanbul',
      },
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
    expect(profile.docs[0]?.get('tastePreferences')).toEqual({
      favoriteDish: 'Sushi',
      favoriteVenueId: 'morimoto',
    });
    expect(await callFunction('getMonthlyRecap', {}, token)).toMatchObject({
      ready: false,
      placesVisited: 0,
    });
  });

  it('writes social edges and applies XP and idempotency exactly once', async () => {
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
      await db.collection('users').where('username', '==', 'review.author').limit(1).get()
    ).docs[0];
    const reader = (
      await db.collection('users').where('username', '==', 'review.reader').limit(1).get()
    ).docs[0];
    if (!author || !reader) throw new Error('Expected both profiles to exist.');
    await db.collection('venues').doc('demo-cafe').set({
      name: 'Demo Cafe',
      city: 'Istanbul',
      status: 'active',
    });

    expect(await callFunction('followUser', { targetUserId: author.id }, second.token)).toEqual({
      following: true,
    });
    expect((await reader.ref.collection('following').doc(author.id).get()).exists).toBe(true);
    expect((await author.ref.collection('followers').doc(reader.id).get()).exists).toBe(true);

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
          photoPath: `review-images/${author.id}/review-command-0001/dish-command-0001`,
        },
      ],
    };
    const firstReview = await callFunction<{ id: string }>(
      'createReview',
      reviewCommand,
      first.token,
    );
    const replayedReview = await callFunction<{ id: string }>(
      'createReview',
      reviewCommand,
      first.token,
    );
    expect(replayedReview.id).toBe(firstReview.id);
    expect((await author.ref.get()).get('xp')).toBe(50);
    const reviewDocument = await db.collection('reviews').doc(firstReview.id).get();
    expect(reviewDocument.get('tags')).toEqual(['casual', 'date-night']);
    expect(reviewDocument.get('dishNames')).toEqual(['Soup dumplings']);
    expect(reviewDocument.get('dishReviews')).toEqual(reviewCommand.dishReviews);
    expect((await db.collection('venues').doc('demo-cafe').get()).get('reviewCount')).toBe(1);
    expect((await author.ref.get()).get('reviewCount')).toBe(1);
    const friendsFeed = await callFunction<{
      items: Array<{ id: string; tags: string[]; dishReviews: unknown[] }>;
    }>('getFeed', { scope: 'friends', limit: 20 }, second.token);
    expect(friendsFeed.items.map((item) => item.id)).toContain(firstReview.id);
    expect(friendsFeed.items.find((item) => item.id === firstReview.id)).toMatchObject({
      tags: ['casual', 'date-night'],
      dishReviews: reviewCommand.dishReviews,
    });

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
    expect((await db.collection('reviews').doc(firstReview.id).get()).get('commentCount')).toBe(1);

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
      contentType: 'comment',
      contentId: firstComment.id,
      status: 'pending',
    });

    await db
      .collection('reviews')
      .doc(firstReview.id)
      .update({ dishNames: ['Tiramisu'] });
    const profileExtras = await callFunction<{
      xp: number;
      rewards: Array<{ id: string; completed: boolean; progress: number }>;
    }>('getProfileExtras', {}, first.token);
    expect(profileExtras.xp).toBe(50);
    expect(profileExtras.rewards.find((reward) => reward.id === 'tiramisu')).toMatchObject({
      completed: true,
      progress: 1,
    });
    expect(profileExtras.rewards.find((reward) => reward.id === 'matcha')).toMatchObject({
      completed: false,
      progress: 0,
    });

    const reactionCommand = {
      idempotencyKey: 'reaction-command-01',
      reviewId: firstReview.id,
      reaction: 'like',
    };
    expect(await callFunction('reactToReview', reactionCommand, second.token)).toMatchObject({
      active: true,
      reactionCount: 1,
    });
    expect(await callFunction('reactToReview', reactionCommand, second.token)).toMatchObject({
      active: true,
      reactionCount: 1,
    });
    expect((await author.ref.get()).get('xp')).toBe(55);

    expect(await callFunction('unfollowUser', { targetUserId: author.id }, second.token)).toEqual({
      following: false,
    });
    expect((await reader.ref.collection('following').doc(author.id).get()).exists).toBe(false);
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
      await db.collection('users').where('username', '==', 'demo.user').limit(1).get()
    ).docs[0];
    if (!currentUser) throw new Error('Expected the authenticated profile to exist.');

    const batch = db.batch();
    const base = Date.now();
    for (let index = 0; index < 45; index += 1) {
      const authorId = `author-${String(index).padStart(2, '0')}`;
      const review = db.collection('reviews').doc(`review-${String(index).padStart(2, '0')}`);
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
        db.collection('reviews').doc('review-00').collection('comments').doc(`comment-${index}`),
        {
          authorId: 'seed-author',
          authorDisplayName: 'Demo User',
          text: `Comment ${index}`,
          status: 'published',
          createdAt: Timestamp.fromMillis(base - index),
        },
      );
      batch.set(db.collection('users').doc(`ranked-${String(index).padStart(2, '0')}`), {
        displayName: `Ranked ${index}`,
        status: 'active',
        xp: 1_000 - index,
        monthlyXp: 500 - index,
      });
    }
    await batch.commit();

    const feedFirst = await callFunction<{ items: Array<{ id: string }>; nextCursor: string }>(
      'getFeed',
      { scope: 'local', limit: 20 },
      token,
    );
    const feedSecond = await callFunction<{
      items: Array<{ id: string }>;
      nextCursor: string | null;
    }>('getFeed', { scope: 'local', limit: 20, cursor: feedFirst.nextCursor }, token);
    expect(feedFirst.items).toHaveLength(20);
    expect(feedSecond.items).toHaveLength(20);
    expect(new Set([...feedFirst.items, ...feedSecond.items].map((item) => item.id)).size).toBe(40);

    const friendsFirst = await callFunction<{ items: Array<{ id: string }>; nextCursor: string }>(
      'getFeed',
      { scope: 'friends', limit: 20 },
      token,
    );
    const friendsSecond = await callFunction<{ items: Array<{ id: string }> }>(
      'getFeed',
      { scope: 'friends', limit: 20, cursor: friendsFirst.nextCursor },
      token,
    );
    expect(
      new Set([...friendsFirst.items, ...friendsSecond.items].map((item) => item.id)).size,
    ).toBe(40);

    const commentsFirst = await callFunction<{ items: Array<{ id: string }>; nextCursor: string }>(
      'getComments',
      { reviewId: 'review-00', limit: 20 },
      token,
    );
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
    const leadersSecond = await callFunction<{ items: Array<{ rank: number }> }>(
      'getLeaderboard',
      { period: 'month', limit: 20, cursor: leadersFirst.nextCursor },
      token,
    );
    expect(leadersFirst.items[0]?.rank).toBe(1);
    expect(leadersSecond.items[0]?.rank).toBe(21);
  });

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
      await db.collection('users').where('username', '==', 'discover.reader').limit(1).get()
    ).docs[0];
    if (!currentUser) throw new Error('Expected the authenticated Discover profile to exist.');

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
        discoverTags: index < 3 ? ['trending', 'most-reviewed'] : ['new', 'hidden-gem'],
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
    expect(feed.topReviewer).toMatchObject({ userId: reviewer.id, following: true });
    expect(feed.popularReviews[0]).toMatchObject({
      reactionCount: 37,
      commentCount: 4,
      authorPhotoUrl: 'https://example.com/discover-reviewer.jpg',
    });

    const people = await callFunction<{
      trending: Array<{ userId: string; following: boolean }>;
    }>('getDiscoverPeople', {}, token);
    expect(people.trending).toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: reviewer.id, following: true })]),
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
    expect(new Set([...first.items, ...second.items].map((venue) => venue.id)).size).toBe(4);

    const cafes = await callFunction<{ items: Array<{ id: string }> }>(
      'getVenues',
      { category: 'Cafe', limit: 20 },
      token,
    );
    expect(cafes.items).toHaveLength(3);
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
      await db.collection('users').where('username', '==', 'first.messenger').limit(1).get()
    ).docs[0];
    const secondProfile = (
      await db.collection('users').where('username', '==', 'second.messenger').limit(1).get()
    ).docs[0];
    if (!firstProfile || !secondProfile)
      throw new Error('Expected both messaging profiles to exist.');
    const firstUid = firstProfile.id;
    const secondUid = secondProfile.id;

    await callFunction('followUser', { targetUserId: secondUid }, first.token);
    await expectReason(
      callFunction('createConversation', { targetUserId: secondUid }, first.token),
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
    const firstMessage = await callFunction<{ id: string }>('sendMessage', command, first.token);
    const replayedMessage = await callFunction<{ id: string }>('sendMessage', command, first.token);
    expect(replayedMessage.id).toBe(firstMessage.id);

    const conversationDocument = await db.collection('conversations').doc(conversation.id).get();
    expect(conversationDocument.get('messageCount')).toBe(1);
    expect(conversationDocument.get(`unreadCounts.${secondUid}`)).toBe(1);
    expect((await conversationDocument.ref.collection('messages').get()).size).toBe(1);

    const inbox = await callFunction<{
      items: Array<{ id: string; unreadCount: number; otherParticipant: { userId: string } }>;
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
      items: Array<{ id: string; senderId: string; recipientId: string; text: string }>;
    }>('getMessages', { conversationId: conversation.id, limit: 20 }, second.token);
    expect(messages.items).toEqual([
      expect.objectContaining({
        id: firstMessage.id,
        senderId: firstUid,
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
    expect((await conversationDocument.ref.get()).get(`unreadCounts.${secondUid}`)).toBe(0);

    const notifications = await db
      .collection('notifications')
      .where('recipientId', '==', secondUid)
      .where('messageId', '==', firstMessage.id)
      .get();
    expect(notifications.size).toBe(1);

    const token = 'ExpoPushToken[abcdefghijklmnopqrstuv]';
    expect(
      await callFunction('registerPushToken', { token, platform: 'android' }, first.token),
    ).toEqual({
      registered: true,
    });
    expect(
      await callFunction('registerPushToken', { token, platform: 'android' }, second.token),
    ).toEqual({
      registered: true,
    });
    expect((await db.collection('users').doc(firstUid).collection('pushTokens').get()).size).toBe(
      0,
    );
    expect((await db.collection('users').doc(secondUid).collection('pushTokens').get()).size).toBe(
      1,
    );
    expect((await db.collection('_pushTokens').get()).docs[0]?.get('uid')).toBe(secondUid);
    expect(await callFunction('unregisterPushToken', { token }, second.token)).toEqual({
      registered: false,
    });
    expect((await db.collection('users').doc(secondUid).collection('pushTokens').get()).size).toBe(
      0,
    );
    expect((await db.collection('_pushTokens').get()).size).toBe(0);
  }, 15_000);
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
      await db.collection('users').where('username', '==', 'activity.organizer').limit(1).get()
    ).docs[0];
    const friendProfile = (
      await db.collection('users').where('username', '==', 'activity.friend').limit(1).get()
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
    await callFunction('followUser', { targetUserId: friendUid }, organizer.token);
    await callFunction('followUser', { targetUserId: organizerUid }, friend.token);

    const candidates = await callFunction<Array<{ userId: string; username: string | null }>>(
      'listActivityCandidates',
      {},
      organizer.token,
    );
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: friendUid, username: 'activity.friend' }),
      ]),
    );

    const command = {
      idempotencyKey: 'activity-command-0001',
      memberIds: [friendUid],
      startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      venueId: 'activity-venue',
    };
    const created = await callFunction<{ id: string }>('createActivity', command, organizer.token);
    const replayed = await callFunction<{ id: string }>('createActivity', command, organizer.token);
    expect(replayed.id).toBe(created.id);
    const activity = await db.collection('activities').doc(created.id).get();
    expect(activity.data()).toMatchObject({
      organizerId: organizerUid,
      participantIds: [organizerUid, friendUid],
      status: 'active',
      venueId: 'activity-venue',
      venueName: 'Activity Restaurant',
    });
    const activityConversation = await db.collection('conversations').doc(created.id).get();
    expect(activityConversation.data()).toMatchObject({
      kind: 'activity',
      activityId: created.id,
      organizerId: organizerUid,
      participantIds: [organizerUid, friendUid],
      title: 'Activity Restaurant',
      status: 'active',
    });
    const friendInbox = await callFunction<{
      items: Array<{ id: string; kind: string; title: string; activityId: string }>;
    }>('listConversations', { limit: 20 }, friend.token);
    expect(friendInbox.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          kind: 'activity',
          activityId: created.id,
          title: 'Activity Restaurant',
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
    expect((await activityConversation.ref.get()).get(`unreadCounts.${friendUid}`)).toBe(1);
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
    const userIds = new Map(profiles.docs.map((profile) => [profile.get('username'), profile.id]));
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
      callFunction('followUser', { targetUserId: acceptingUid }, organizer.token),
      callFunction('followUser', { targetUserId: decliningUid }, organizer.token),
      callFunction('followUser', { targetUserId: organizerUid }, acceptingFriend.token),
      callFunction('followUser', { targetUserId: organizerUid }, decliningFriend.token),
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
    expect(conversation.get(`invitationStatuses.${acceptingUid}`)).toBe('accepted');
    expect(activity.get(`invitationStatuses.${decliningUid}`)).toBe('declined');
    expect(conversation.get(`invitationStatuses.${decliningUid}`)).toBe('declined');
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
