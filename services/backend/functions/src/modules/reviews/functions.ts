import {
  addCommentInputSchema,
  createReviewInputSchema,
  getCommentsInputSchema,
  getFeedInputSchema,
  reactToReviewInputSchema,
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
  const applyCursor = (query: Query): Query => cursor
    ? query.startAfter(Timestamp.fromDate(cursorDate(cursor.value)), cursor.id)
    : query;
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
    ).limit(input.limit + 1).get()));
    candidates = snapshots
      .flatMap((snapshot) => snapshot.docs)
      .sort((left, right) => {
        const timeDifference = (right.get('createdAt') as Timestamp).toMillis()
          - (left.get('createdAt') as Timestamp).toMillis();
        return timeDifference || compareDocumentIdsDesc(left.id, right.id);
      })
      .slice(0, input.limit + 1);
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
    candidates = (await applyCursor(feedQuery).limit(input.limit + 1).get()).docs;
  }

  const pageDocs = candidates.slice(0, input.limit);
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
      status: 'published',
      commentCount: 0,
      reactionCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    addXp(transaction, userRef, 50, {
      xp: Number(user.get('xp') ?? 0),
      monthlyXp: Number(user.get('monthlyXp') ?? 0),
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
