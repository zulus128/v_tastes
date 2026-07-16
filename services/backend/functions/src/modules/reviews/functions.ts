import {
  addCommentInputSchema,
  createReviewInputSchema,
  reactToReviewInputSchema,
} from '@tastes/contracts';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireUserId } from '../../shared/auth';
import { db } from '../../shared/firebase';
import { callableOptions } from '../../shared/options';
import { parseInput } from '../../shared/validation';

export const createReview = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(createReviewInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);
  const venueRef = db.collection('venues').doc(input.venueId);
  const reviewRef = db.collection('reviews').doc();

  await db.runTransaction(async (transaction) => {
    const [user, venue] = await Promise.all([
      transaction.get(userRef),
      transaction.get(venueRef),
    ]);

    if (!user.exists || user.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }

    if (!venue.exists || venue.get('status') !== 'active') {
      throw new HttpsError('not-found', 'The venue was not found.');
    }

    transaction.create(reviewRef, {
      authorId: uid,
      authorDisplayName: user.get('displayName'),
      venueId: venue.id,
      venueName: venue.get('name'),
      rating: input.rating,
      text: input.text,
      status: 'published',
      commentCount: 0,
      reactionCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { id: reviewRef.id };
});

export const addComment = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(addCommentInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);
  const reviewRef = db.collection('reviews').doc(input.reviewId);
  const commentRef = reviewRef.collection('comments').doc();

  await db.runTransaction(async (transaction) => {
    const [user, review] = await Promise.all([
      transaction.get(userRef),
      transaction.get(reviewRef),
    ]);

    if (!user.exists || user.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }

    if (!review.exists || review.get('status') !== 'published') {
      throw new HttpsError('not-found', 'The review was not found.');
    }

    transaction.create(commentRef, {
      authorId: uid,
      authorDisplayName: user.get('displayName'),
      text: input.text,
      status: 'published',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(reviewRef, {
      commentCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { id: commentRef.id };
});

export const reactToReview = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(reactToReviewInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);
  const reviewRef = db.collection('reviews').doc(input.reviewId);
  const reactionRef = reviewRef.collection('reactions').doc(uid);

  return db.runTransaction(async (transaction) => {
    const [user, review, reaction] = await Promise.all([
      transaction.get(userRef),
      transaction.get(reviewRef),
      transaction.get(reactionRef),
    ]);

    if (!user.exists || user.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }

    if (!review.exists || review.get('status') !== 'published') {
      throw new HttpsError('not-found', 'The review was not found.');
    }

    const currentCount = Number(review.get('reactionCount') ?? 0);

    if (reaction.exists) {
      transaction.delete(reactionRef);
      transaction.update(reviewRef, {
        reactionCount: Math.max(0, currentCount - 1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { active: false, reactionCount: Math.max(0, currentCount - 1) };
    }

    transaction.create(reactionRef, {
      userId: uid,
      reaction: input.reaction,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(reviewRef, {
      reactionCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { active: true, reactionCount: currentCount + 1 };
  });
});
