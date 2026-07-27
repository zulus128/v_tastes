import {
  completeOnboardingInputSchema,
  createUserProfileInputSchema,
  getLeaderboardInputSchema,
} from '@tastes/contracts';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireUserId } from '../../shared/auth';
import { db } from '../../shared/firebase';
import { callableOptions } from '../../shared/options';
import { decodeCursor, encodeCursor } from '../../shared/pagination';
import { parseInput } from '../../shared/validation';

const CURRENT_ONBOARDING_VERSION = 1;

export const getSessionStatus = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const profile = await db.collection('users').doc(uid).get();
  const onboardingVersion = profile.exists ? Number(profile.get('onboardingVersion') ?? 0) : 0;

  return {
    profileExists: profile.exists,
    onboardingVersion,
    onboardingComplete: profile.exists && onboardingVersion >= CURRENT_ONBOARDING_VERSION,
  };
});

export const completeOnboarding = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(completeOnboardingInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);
  const user = await userRef.get();
  if (!user.exists) {
    throw new HttpsError('failed-precondition', 'Create a user profile before completing onboarding.');
  }

  await userRef.set({
    onboardingVersion: input.version,
    onboardingCompletedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { onboardingVersion: input.version };
});

export const getLeaderboard = onCall(callableOptions, async (request) => {
  requireUserId(request);
  const input = parseInput(getLeaderboardInputSchema, request.data);
  const cursor = decodeCursor(input.cursor);

  let leaderboardQuery = db
    .collection('users')
    .where('status', '==', 'active')
    .orderBy(input.period === 'month' ? 'monthlyXp' : 'xp', 'desc')
    .orderBy(FieldPath.documentId(), 'asc');

  if (cursor) {
    if (typeof cursor.value !== 'number') {
      throw new HttpsError('invalid-argument', 'The leaderboard cursor is invalid.');
    }
    leaderboardQuery = leaderboardQuery.startAfter(cursor.value, cursor.id);
  }

  const snapshot = await leaderboardQuery.limit(input.limit + 1).get();
  const pageDocs = snapshot.docs.slice(0, input.limit);
  const startPosition = cursor?.position ?? 0;
  const xpField = input.period === 'month' ? 'monthlyXp' : 'xp';
  const last = pageDocs.at(-1);

  return {
    items: pageDocs.map((document, index) => ({
      userId: document.id,
      displayName: String(document.get('displayName')),
      photoUrl: document.get('photoUrl') ? String(document.get('photoUrl')) : null,
      xp: Number(document.get(xpField) ?? 0),
      rank: startPosition + index + 1,
    })),
    nextCursor: snapshot.size > input.limit && last
      ? encodeCursor({
          id: last.id,
          value: Number(last.get(xpField) ?? 0),
          position: startPosition + pageDocs.length,
        })
      : null,
  };
});

export const createUserProfile = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(createUserProfileInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(userRef);
    const now = FieldValue.serverTimestamp();

    transaction.set(
      userRef,
      {
        uid,
        displayName: input.displayName,
        username: input.username ?? existing.get('username') ?? null,
        city: input.city ?? existing.get('city') ?? null,
        bio: input.bio ?? '',
        photoUrl: existing.exists ? existing.get('photoUrl') ?? null : null,
        status: 'active',
        xp: existing.exists ? Number(existing.get('xp') ?? 0) : 0,
        monthlyXp: existing.exists ? Number(existing.get('monthlyXp') ?? 0) : 0,
        createdAt: existing.exists ? existing.get('createdAt') : now,
        updatedAt: now,
      },
      { merge: true },
    );
  });

  return { id: uid };
});
