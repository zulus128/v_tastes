import {
  addCommentInputSchema,
  createReviewInputSchema,
  getCommentsInputSchema,
  getFeedInputSchema,
  hideReviewInputSchema,
  reactToReviewInputSchema,
  reportReviewInputSchema,
} from '@tastes/contracts';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireUserId } from '../../shared/auth';
import { db } from '../../shared/firebase';
import {
  addXp,
  enforceRateLimit,
  idempotentDocumentId,
} from '../../shared/mutations';
import { callableOptions } from '../../shared/options';
import {
  compareDocumentIdsDesc,
  cursorDate,
  decodeCursor,
  encodeCursor,
} from '../../shared/pagination';
import { timestampToIso } from '../../shared/serialization';
import { parseInput } from '../../shared/validation';

export const getFeed = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(getFeedInputSchema, request.data);
  const cursor = decodeCursor(input.cursor);
  const hiddenReviews = await db.collection('users').doc(uid).collection('hiddenReviews').get();
  const hiddenReviewIds = new Set(hiddenReviews.docs.map((document) => document.id));
  const applyCursor = (query: Query): Query => cursor
    ? query.startAfter(Timestamp.fromDate(cursorDate(cursor.value)), cursor.id)
    : query;
  const fetchLimit = Math.min(100, input.limit * 2);
  let candidates: QueryDocumentSnapshot[];

  if (input.scope === 'friends') {
    const following = await db.collection('users').doc(uid).collection('following').get();
    const authorIds = following.docs.map((document) => document.id);
    if (authorIds.length === 0) return { items: [], nextCursor: null };
    const chunks = Array.from(
      { length: Math.ceil(authorIds.length / 30) },
      (_, index) => authorIds.slice(index * 30, index * 30 + 30),
    );
      const snapshots = await Promise.all(chunks.map((chunk) => applyCursor(
      db.collection('reviews')
        .where('status', '==', 'published')
        .where('authorId', 'in', chunk)
        .orderBy('createdAt', 'desc')
        .orderBy(FieldPath.documentId(), 'desc'),
    ).limit(fetchLimit + 1).get()));
    candidates = snapshots
      .flatMap((snapshot) => snapshot.docs)
      .sort((left, right) => {
        const timeDifference = (right.get('createdAt') as Timestamp).toMillis()
          - (left.get('createdAt') as Timestamp).toMillis();
        return timeDifference || compareDocumentIdsDesc(left.id, right.id);
      });
  } else {
    const profile = await db.collection('users').doc(uid).get();
    const city = profile.get('city');
    if (!profile.exists || typeof city !== 'string' || city.length === 0) {
      return { items: [], nextCursor: null };
    }
    const feedQuery = db
      .collection('reviews')
      .where('status', '==', 'published')
      .where('venueCity', '==', city)
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc');
    candidates = (await applyCursor(feedQuery).limit(fetchLimit + 1).get()).docs;
  }

  const visibleCandidates = candidates.filter((document) => !hiddenReviewIds.has(document.id));
  const pageDocs = visibleCandidates.slice(0, input.limit);
  const last = pageDocs.at(-1);

  return {
    items: pageDocs.map((document) => ({
      id: document.id,
      authorId: String(document.get('authorId')),
      authorDisplayName: String(document.get('authorDisplayName')),
      venueId: String(document.get('venueId')),
      venueName: String(document.get('venueName')),
      rating: Number(document.get('rating')),
      text: String(document.get('text')),
      tags: Array.isArray(document.get('tags')) ? document.get('tags') : [],
      dishReviews: Array.isArray(document.get('dishReviews')) ? document.get('dishReviews') : [],
      status: 'published' as const,
      commentCount: Number(document.get('commentCount') ?? 0),
      reactionCount: Number(document.get('reactionCount') ?? 0),
      createdAt: timestampToIso(document.get('createdAt')),
    })),
    nextCursor: candidates.length > input.limit && last
      ? encodeCursor({ id: last.id, value: timestampToIso(last.get('createdAt')) })
      : null,
  };
});

export const getComments = onCall(callableOptions, async (request) => {
  requireUserId(request);
  const input = parseInput(getCommentsInputSchema, request.data);
  const cursor = decodeCursor(input.cursor);
  const review = await db.collection('reviews').doc(input.reviewId).get();
  if (!review.exists || review.get('status') !== 'published') {
    throw new HttpsError('not-found', 'The review was not found.');
  }

  let commentsQuery = review.ref
    .collection('comments')
    .where('status', '==', 'published')
    .orderBy('createdAt', 'desc')
    .orderBy(FieldPath.documentId(), 'desc');

  if (cursor) {
    commentsQuery = commentsQuery.startAfter(Timestamp.fromDate(cursorDate(cursor.value)), cursor.id);
  }

  const snapshot = await commentsQuery.limit(input.limit + 1).get();
  const pageDocs = snapshot.docs.slice(0, input.limit);
  const last = pageDocs.at(-1);

  return {
    items: pageDocs.map((document) => ({
      id: document.id,
      reviewId: input.reviewId,
      authorId: String(document.get('authorId')),
      authorDisplayName: String(document.get('authorDisplayName')),
      text: String(document.get('text')),
      createdAt: timestampToIso(document.get('createdAt')),
    })),
    nextCursor: snapshot.size > input.limit && last
      ? encodeCursor({ id: last.id, value: timestampToIso(last.get('createdAt')) })
      : null,
  };
});

export const createReview = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(createReviewInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);
  const venueRef = db.collection('venues').doc(input.venueId);
  const reviewRef = db.collection('reviews').doc(
    idempotentDocumentId(uid, 'create-review', input.idempotencyKey),
  );
  const expectedPhotoPrefix = `review-images/${uid}/${input.idempotencyKey}/`;
  if (input.dishReviews.some((dish) => !dish.photoPath.startsWith(expectedPhotoPrefix))) {
    throw new HttpsError('permission-denied', 'Review photos must belong to the authenticated user and draft.');
  }

  await db.runTransaction(async (transaction) => {
    const [user, venue, existingReview] = await Promise.all([
      transaction.get(userRef),
      transaction.get(venueRef),
      transaction.get(reviewRef),
    ]);

    if (!user.exists || user.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    if (existingReview.exists) return;

    if (!venue.exists || venue.get('status') !== 'active') {
      throw new HttpsError('not-found', 'The venue was not found.');
    }

    await enforceRateLimit(transaction, uid, 'create-review', 10, 60 * 60_000);
    transaction.create(reviewRef, {
      authorId: uid,
      authorDisplayName: user.get('displayName'),
      venueId: venue.id,
      venueName: venue.get('name'),
      venueCity: venue.get('city'),
      rating: input.rating,
      text: input.text,
      tags: input.tags,
      tag: input.tags[0] ?? null,
      dishReviews: input.dishReviews,
      dishNames: input.dishReviews.map((dish) => dish.title),
      status: 'published',
      commentCount: 0,
      reactionCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const reviewCount = Math.max(0, Number(venue.get('reviewCount') ?? 0));
    const averageRating = Math.max(0, Number(venue.get('rating') ?? 0));
    transaction.update(venueRef, {
      rating: ((averageRating * reviewCount) + input.rating) / (reviewCount + 1),
      reviewCount: reviewCount + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    addXp(transaction, userRef, 50, {
      xp: Number(user.get('xp') ?? 0),
      monthlyXp: Number(user.get('monthlyXp') ?? 0),
    });
    transaction.update(userRef, {
      reviewCount: FieldValue.increment(1),
    });
  });

  return { id: reviewRef.id };
});

export const addComment = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(addCommentInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);
  const reviewRef = db.collection('reviews').doc(input.reviewId);
  const commentRef = reviewRef.collection('comments').doc(
    idempotentDocumentId(uid, `comment:${input.reviewId}`, input.idempotencyKey),
  );

  await db.runTransaction(async (transaction) => {
    const [user, review, existingComment] = await Promise.all([
      transaction.get(userRef),
      transaction.get(reviewRef),
      transaction.get(commentRef),
    ]);

    if (!user.exists || user.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    if (existingComment.exists) return;

    if (!review.exists || review.get('status') !== 'published') {
      throw new HttpsError('not-found', 'The review was not found.');
    }

    await enforceRateLimit(transaction, uid, 'add-comment', 30, 60_000);
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
  const idempotencyRef = db.collection('_idempotency').doc(
    idempotentDocumentId(uid, `reaction:${input.reviewId}`, input.idempotencyKey),
  );

  return db.runTransaction(async (transaction) => {
    const [user, review, reaction, idempotency] = await Promise.all([
      transaction.get(userRef),
      transaction.get(reviewRef),
      transaction.get(reactionRef),
      transaction.get(idempotencyRef),
    ]);

    if (!user.exists || user.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    if (idempotency.exists) {
      return {
        active: Boolean(idempotency.get('active')),
        reactionCount: Number(idempotency.get('reactionCount')),
      };
    }
    if (!review.exists || review.get('status') !== 'published') {
      throw new HttpsError('not-found', 'The review was not found.');
    }
    const authorId = String(review.get('authorId'));
    if (authorId === uid) {
      throw new HttpsError('failed-precondition', 'You cannot react to your own review.');
    }
    const authorRef = db.collection('users').doc(authorId);
    const author = await transaction.get(authorRef);

    await enforceRateLimit(transaction, uid, 'react-review', 120, 60_000);
    const currentCount = Number(review.get('reactionCount') ?? 0);
    const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60_000);

    if (reaction.exists) {
      const reactionCount = Math.max(0, currentCount - 1);
      transaction.delete(reactionRef);
      transaction.update(reviewRef, {
        reactionCount,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (author.exists) addXp(transaction, authorRef, -5, {
        xp: Number(author.get('xp') ?? 0),
        monthlyXp: Number(author.get('monthlyXp') ?? 0),
      });
      transaction.create(idempotencyRef, {
        active: false,
        reactionCount,
        expiresAt,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { active: false, reactionCount };
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
    if (author.exists) addXp(transaction, authorRef, 5, {
      xp: Number(author.get('xp') ?? 0),
      monthlyXp: Number(author.get('monthlyXp') ?? 0),
    });
    const reactionCount = currentCount + 1;
    transaction.create(idempotencyRef, {
      active: true,
      reactionCount,
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { active: true, reactionCount };
  });
});

export const hideReview = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(hideReviewInputSchema, request.data);
  const reviewRef = db.collection('reviews').doc(input.reviewId);
  const hiddenReviewRef = db.collection('users').doc(uid).collection('hiddenReviews').doc(input.reviewId);

  await db.runTransaction(async (transaction) => {
    const [user, review] = await Promise.all([
      transaction.get(db.collection('users').doc(uid)),
      transaction.get(reviewRef),
    ]);

    if (!user.exists || user.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    if (!review.exists || review.get('status') !== 'published') {
      throw new HttpsError('not-found', 'The review was not found.');
    }

    transaction.set(hiddenReviewRef, {
      reviewId: input.reviewId,
      hiddenAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { id: input.reviewId };
});

export const reportReview = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(reportReviewInputSchema, request.data);
  const idempotencyRef = db.collection('_idempotency').doc(
    idempotentDocumentId(uid, `report-review:${input.reviewId}`, input.idempotencyKey),
  );
  const reviewRef = db.collection('reviews').doc(input.reviewId);
  const userRef = db.collection('users').doc(uid);

  return db.runTransaction(async (transaction) => {
    const [idempotency, review, user] = await Promise.all([
      transaction.get(idempotencyRef),
      transaction.get(reviewRef),
      transaction.get(userRef),
    ]);

    if (!user.exists || user.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    if (idempotency.exists) {
      return { id: String(idempotency.get('reportId') ?? '') };
    }
    if (!review.exists || review.get('status') !== 'published') {
      throw new HttpsError('not-found', 'The review was not found.');
    }

    const reportRef = db.collection('reports').doc();
    transaction.set(reportRef, {
      reporterId: uid,
      reporterName: String(user.get('displayName') ?? 'Tastes user'),
      targetType: 'review',
      targetId: input.reviewId,
      reason: input.reason,
      details: input.details ?? '',
      contentPreview: String(review.get('text') ?? '').slice(0, 180),
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    });

    const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60_000);
    transaction.create(idempotencyRef, {
      reportId: reportRef.id,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
    });

    return { id: reportRef.id };
  });
});
