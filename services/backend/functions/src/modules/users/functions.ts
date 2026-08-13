import {
  completeOnboardingInputSchema,
  createUserProfileInputSchema,
  getLeaderboardInputSchema,
  updateProfilePhotoInputSchema,
  type MonthlyRecapResult,
} from '@tastes/contracts';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDownloadURL, getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireUserId } from '../../shared/auth';
import { db } from '../../shared/firebase';
import { callableOptions } from '../../shared/options';
import { decodeCursor, encodeCursor } from '../../shared/pagination';
import { parseInput } from '../../shared/validation';

const CURRENT_ONBOARDING_VERSION = 1;
const MAX_PROFILE_PHOTO_BYTES = 750 * 1024;

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
    tastePreferences: {
      favoriteDish: input.favoriteDish ?? null,
      favoriteVenueId: input.favoriteVenueId ?? null,
    },
    onboardingInvitedContactCount: input.invitedContactCount,
    appearance: input.appearance,
    onboardingCompletedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { onboardingVersion: input.version };
});

export const getMonthlyRecap = onCall(callableOptions, async (request): Promise<MonthlyRecapResult> => {
  const uid = requireUserId(request);
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = now.toLocaleDateString('en-US', { month: 'long' });
  const previousMonth = previous.toLocaleDateString('en-US', { month: 'long' });
  const recap = await db.collection('users').doc(uid).collection('monthlyRecaps').doc('current').get();

  if (!recap.exists) {
    return {
      month,
      previousMonth,
      ready: false,
      placesVisited: 0,
      previousPlacesVisited: 0,
      areasExplored: 0,
      previousAreasExplored: 0,
      reviewsWritten: 0,
      previousReviewsWritten: 0,
      followersGained: 0,
      favoriteArea: '',
      topPlaces: [],
      topDishes: [],
    };
  }

  const number = (field: string) => Math.max(0, Number(recap.get(field) ?? 0));
  return {
    month: String(recap.get('month') ?? month),
    previousMonth: String(recap.get('previousMonth') ?? previousMonth),
    ready: recap.get('ready') === true,
    placesVisited: number('placesVisited'),
    previousPlacesVisited: number('previousPlacesVisited'),
    areasExplored: number('areasExplored'),
    previousAreasExplored: number('previousAreasExplored'),
    reviewsWritten: number('reviewsWritten'),
    previousReviewsWritten: number('previousReviewsWritten'),
    followersGained: number('followersGained'),
    favoriteArea: String(recap.get('favoriteArea') ?? ''),
    topPlaces: Array.isArray(recap.get('topPlaces')) ? recap.get('topPlaces') : [],
    topDishes: Array.isArray(recap.get('topDishes')) ? recap.get('topDishes') : [],
  };
});

export const getLeaderboard = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(getLeaderboardInputSchema, request.data);
  const cursor = decodeCursor(input.cursor);
  const currentProfile = await db.collection('users').doc(uid).get();
  const following = input.audience === 'friends'
    ? await db.collection('users').doc(uid).collection('following').get()
    : null;
  const visibleIds = new Set([uid, ...(following?.docs.map((document) => document.id) ?? [])]);
  const city = String(currentProfile.get('city') ?? '').trim().toLocaleLowerCase();

  const leaderboardQuery = db
    .collection('users')
    .where('status', '==', 'active')
    .orderBy(input.period === 'month' ? 'monthlyXp' : 'xp', 'desc')
    .orderBy(FieldPath.documentId(), 'asc');

  const snapshot = await leaderboardQuery.limit(250).get();
  const eligibleDocs = snapshot.docs.filter((document) => input.audience === 'all'
    || (input.audience === 'friends'
      ? visibleIds.has(document.id)
      : Boolean(city) && String(document.get('city') ?? '').trim().toLocaleLowerCase() === city));
  const startIndex = cursor ? eligibleDocs.findIndex((document) => document.id === cursor.id) + 1 : 0;
  if (cursor && startIndex === 0) throw new HttpsError('invalid-argument', 'The leaderboard cursor is invalid.');
  const pageDocs = eligibleDocs.slice(startIndex, startIndex + input.limit);
  const startPosition = startIndex;
  const xpField = input.period === 'month' ? 'monthlyXp' : 'xp';
  const last = pageDocs.at(-1);

  return {
    items: pageDocs.map((document, index) => ({
      userId: document.id,
      displayName: String(document.get('displayName')),
      username: document.get('username') ? String(document.get('username')) : null,
      photoUrl: document.get('photoUrl') ? String(document.get('photoUrl')) : null,
      xp: Number(document.get(xpField) ?? 0),
      rank: startPosition + index + 1,
    })),
    nextCursor: eligibleDocs.length > startIndex + input.limit && last
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
  const authUser = await getAuth().getUser(uid);
  if (input.photoPath && !input.photoPath.startsWith(`profile-images/${uid}/`)) {
    throw new HttpsError('permission-denied', 'The profile image path is not owned by this user.');
  }

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(userRef);
    const now = FieldValue.serverTimestamp();

    transaction.set(
      userRef,
      {
        uid,
        email: authUser.email?.toLocaleLowerCase() ?? null,
        phoneNumber: authUser.phoneNumber ?? null,
        displayName: input.displayName,
        username: input.username ?? existing.get('username') ?? null,
        city: input.city ?? existing.get('city') ?? null,
        bio: input.bio ?? '',
        photoPath: input.photoPath ?? existing.get('photoPath') ?? null,
        photoUrl: existing.exists ? existing.get('photoUrl') ?? null : null,
        status: 'active',
        xp: existing.exists ? Number(existing.get('xp') ?? 0) : 0,
        monthlyXp: existing.exists ? Number(existing.get('monthlyXp') ?? 0) : 0,
        followerCount: existing.exists ? Number(existing.get('followerCount') ?? 0) : 0,
        followingCount: existing.exists ? Number(existing.get('followingCount') ?? 0) : 0,
        createdAt: existing.exists ? existing.get('createdAt') : now,
        updatedAt: now,
      },
      { merge: true },
    );
  });

  return { id: uid };
});

export const updateProfilePhoto = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(updateProfilePhotoInputSchema, request.data);
  if (!input.photoPath.startsWith(`profile-images/${uid}/`)) {
    throw new HttpsError('permission-denied', 'The profile image path is not owned by this user.');
  }

  const userRef = db.collection('users').doc(uid);
  const user = await userRef.get();
  if (!user.exists || user.get('status') !== 'active') {
    throw new HttpsError('failed-precondition', 'An active user profile is required.');
  }

  const file = getStorage().bucket().file(input.photoPath);
  let metadata;
  try {
    [metadata] = await file.getMetadata();
  } catch (error) {
    if ((error as { code?: number }).code === 404) {
      throw new HttpsError('not-found', 'The uploaded profile photo was not found.');
    }
    throw error;
  }
  const size = Number(metadata.size ?? 0);
  if (!metadata.contentType?.startsWith('image/') || !Number.isFinite(size) || size <= 0 || size >= MAX_PROFILE_PHOTO_BYTES) {
    throw new HttpsError('failed-precondition', 'The uploaded profile photo must be an image smaller than 750 KB.');
  }

  const photoUrl = await getDownloadURL(file);
  await userRef.update({
    photoPath: input.photoPath,
    photoUrl,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { photoPath: input.photoPath, photoUrl };
});
