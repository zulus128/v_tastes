import { followUserInputSchema } from '@tastes/contracts';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireUserId } from '../../shared/auth';
import { db } from '../../shared/firebase';
import { enforceRateLimit } from '../../shared/mutations';
import { callableOptions } from '../../shared/options';
import { parseInput } from '../../shared/validation';

const MAX_FOLLOWING = 500;

export const followUser = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(followUserInputSchema, request.data);
  if (uid === input.targetUserId) {
    throw new HttpsError('failed-precondition', 'You cannot follow yourself.');
  }

  const userRef = db.collection('users').doc(uid);
  const targetRef = db.collection('users').doc(input.targetUserId);
  const followingRef = userRef.collection('following').doc(input.targetUserId);
  const followerRef = targetRef.collection('followers').doc(uid);

  return db.runTransaction(async (transaction) => {
    const [user, target, following] = await Promise.all([
      transaction.get(userRef),
      transaction.get(targetRef),
      transaction.get(followingRef),
    ]);
    if (!user.exists || user.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    if (!target.exists || target.get('status') !== 'active') {
      throw new HttpsError('not-found', 'The user was not found.');
    }
    if (following.exists) return { following: true };
    if (Number(user.get('followingCount') ?? 0) >= MAX_FOLLOWING) {
      throw new HttpsError('resource-exhausted', 'The following limit has been reached.');
    }

    await enforceRateLimit(transaction, uid, 'follow', 60, 60_000);
    const now = FieldValue.serverTimestamp();
    transaction.create(followingRef, { userId: input.targetUserId, createdAt: now });
    transaction.create(followerRef, { userId: uid, createdAt: now });
    transaction.update(userRef, { followingCount: FieldValue.increment(1), updatedAt: now });
    transaction.update(targetRef, { followerCount: FieldValue.increment(1), updatedAt: now });
    return { following: true };
  });
});

export const unfollowUser = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(followUserInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);
  const targetRef = db.collection('users').doc(input.targetUserId);
  const followingRef = userRef.collection('following').doc(input.targetUserId);
  const followerRef = targetRef.collection('followers').doc(uid);

  return db.runTransaction(async (transaction) => {
    const [user, target, following] = await Promise.all([
      transaction.get(userRef),
      transaction.get(targetRef),
      transaction.get(followingRef),
    ]);
    if (!following.exists) return { following: false };

    await enforceRateLimit(transaction, uid, 'follow', 60, 60_000);
    transaction.delete(followingRef);
    transaction.delete(followerRef);
    if (user.exists) {
      transaction.update(userRef, {
        followingCount: Math.max(0, Number(user.get('followingCount') ?? 0) - 1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (target.exists) {
      transaction.update(targetRef, {
        followerCount: Math.max(0, Number(target.get('followerCount') ?? 0) - 1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { following: false };
  });
});
