import {
  addCommentInputSchema,
  createReviewInputSchema,
  deleteReviewInputSchema,
  deleteCommentInputSchema,
  editReviewInputSchema,
  setReviewPinnedInputSchema,
  getCommentsInputSchema,
  getFeedInputSchema,
  hideReviewInputSchema,
  reactToReviewInputSchema,
  reactToCommentInputSchema,
  reactToContentInputSchema,
  reportContentInputSchema,
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
import {
  queueNotification,
  sendNotification,
  sendNotifications,
  type NotificationRequest,
} from '../../shared/notifications';
import { callableOptions } from '../../shared/options';
import { levelForXp, notifyLevelChange, syncRewardNotifications } from '../../shared/rewards';
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
  const authorIds = [...new Set(pageDocs.map((document) => String(document.get('authorId'))))];
  const [authorDocuments, reactionDocuments] = await Promise.all([
    authorIds.length > 0
      ? db.getAll(...authorIds.map((authorId) => db.collection('users').doc(authorId)))
      : Promise.resolve([]),
    pageDocs.length > 0
      ? db.getAll(...pageDocs.map((document) => document.ref.collection('reactions').doc(uid)))
      : Promise.resolve([]),
  ]);
  const reactedIds = new Set(reactionDocuments.filter((document) => document.exists).map((document) => document.ref.parent.parent?.id));
  const authorsById = new Map(authorDocuments.map((document) => [document.id, document]));

  return {
    items: pageDocs.map((document) => {
      const author = authorsById.get(String(document.get('authorId')));
      return {
        id: document.id,
        authorId: String(document.get('authorId')),
        authorDisplayName: author?.exists && author.get('displayName')
          ? String(author.get('displayName'))
          : String(document.get('authorDisplayName')),
        authorUsername: author?.exists && author.get('username') ? String(author.get('username')) : null,
        authorPhotoUrl: author?.exists && author.get('photoUrl') ? String(author.get('photoUrl')) : null,
        venueId: String(document.get('venueId')),
        venueName: String(document.get('venueName')),
        rating: Number(document.get('rating')),
        text: String(document.get('text')),
        tags: Array.isArray(document.get('tags')) ? document.get('tags') : [],
        dishReviews: Array.isArray(document.get('dishReviews')) ? document.get('dishReviews') : [],
        status: 'published' as const,
        commentCount: Number(document.get('commentCount') ?? 0),
        reactionCount: Number(document.get('reactionCount') ?? 0),
        reacted: reactedIds.has(document.id),
        createdAt: timestampToIso(document.get('createdAt')),
      };
    }),
    nextCursor: candidates.length > input.limit && last
      ? encodeCursor({ id: last.id, value: timestampToIso(last.get('createdAt')) })
      : null,
  };
});

export const getComments = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(getCommentsInputSchema, request.data);
  const cursor = decodeCursor(input.cursor);
  const review = await db.collection('reviews').doc(input.reviewId).get();
  if (!review.exists || review.get('status') !== 'published') {
    throw new HttpsError('not-found', 'The review was not found.');
  }

  let commentsQuery = review.ref
    .collection('comments')
    .where('status', '==', 'published')
    .where('parentCommentId', '==', null)
    .orderBy('createdAt', 'desc')
    .orderBy(FieldPath.documentId(), 'desc');

  if (cursor) {
    commentsQuery = commentsQuery.startAfter(Timestamp.fromDate(cursorDate(cursor.value)), cursor.id);
  }

  const snapshot = await commentsQuery.limit(input.limit + 1).get();
  const rootDocuments = snapshot.docs.slice(0, input.limit);
  const last = rootDocuments.at(-1);
  const rootIdChunks = Array.from(
    { length: Math.ceil(rootDocuments.length / 30) },
    (_, index) => rootDocuments.slice(index * 30, index * 30 + 30).map((document) => document.id),
  );
  const replySnapshots = await Promise.all(rootIdChunks.map((rootIds) => review.ref
    .collection('comments')
    .where('status', '==', 'published')
    .where('parentCommentId', 'in', rootIds)
    .get()));
  const replyDocuments = replySnapshots.flatMap((replySnapshot) => replySnapshot.docs);
  const pageDocuments = [...rootDocuments, ...replyDocuments];
  const commentAuthorIds = [...new Set(pageDocuments.map((document) => String(document.get('authorId'))))];
  const [reactionDocuments, author, reviewReaction, commentAuthorDocs] = await Promise.all([
    pageDocuments.length > 0
      ? db.getAll(...pageDocuments.map((document) => document.ref.collection('reactions').doc(uid)))
      : Promise.resolve([]),
    db.collection('users').doc(String(review.get('authorId'))).get(),
    review.ref.collection('reactions').doc(uid).get(),
    commentAuthorIds.length > 0
      ? db.getAll(...commentAuthorIds.map((id) => db.collection('users').doc(id)))
      : Promise.resolve([]),
  ]);
  const reactedIds = new Set(reactionDocuments.filter((document) => document.exists).map((document) => document.ref.parent.parent?.id));
  const commentAuthorPhotoById = new Map(
    commentAuthorDocs.map((document) => [document.id, document.exists && document.get('photoUrl') ? String(document.get('photoUrl')) : null]),
  );
  const toComment = (document: QueryDocumentSnapshot) => ({
    id: document.id,
    reviewId: input.reviewId,
    authorId: String(document.get('authorId')),
    authorDisplayName: String(document.get('authorDisplayName')),
    authorPhotoUrl: commentAuthorPhotoById.get(String(document.get('authorId'))) ?? null,
    parentCommentId: document.get('parentCommentId') ? String(document.get('parentCommentId')) : null,
    reactionCount: Number(document.get('reactionCount') ?? 0),
    replyCount: Number(document.get('replyCount') ?? 0),
    reacted: reactedIds.has(document.id),
    text: String(document.get('text')),
    createdAt: timestampToIso(document.get('createdAt')),
  });

  return {
    review: {
      id: review.id,
      authorId: String(review.get('authorId')),
      authorDisplayName: String(review.get('authorDisplayName')),
      authorUsername: author.exists && author.get('username') ? String(author.get('username')) : null,
      authorPhotoUrl: author.exists && author.get('photoUrl') ? String(author.get('photoUrl')) : null,
      venueId: String(review.get('venueId')),
      venueName: String(review.get('venueName')),
      rating: Number(review.get('rating')),
      text: String(review.get('text')),
      tags: Array.isArray(review.get('tags')) ? review.get('tags') : [],
      dishReviews: Array.isArray(review.get('dishReviews')) ? review.get('dishReviews') : [],
      status: 'published' as const,
      commentCount: Number(review.get('commentCount') ?? 0),
      reactionCount: Number(review.get('reactionCount') ?? 0),
      reacted: reviewReaction.exists,
      createdAt: timestampToIso(review.get('createdAt')),
    },
    items: [
      ...rootDocuments.map(toComment),
      ...replyDocuments.map(toComment).sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    ],
    nextCursor: snapshot.size > input.limit && last
      ? encodeCursor({ id: last.id, value: timestampToIso(last.get('createdAt')) })
      : null,
  };
});

/** Like counts that are worth telling the author about. */
const REVIEW_LIKE_MILESTONES = [10, 50, 100];
const MENTION_PATTERN = /@([a-zA-Z0-9._]{2,40})/g;
const COMMENT_PREVIEW_LENGTH = 120;

function commentPreview(text: string): string {
  return text.length > COMMENT_PREVIEW_LENGTH ? `${text.slice(0, COMMENT_PREVIEW_LENGTH - 1)}…` : text;
}

/** Resolves the `@username` handles inside a comment to the accounts they belong to. */
async function mentionedUserIds(text: string): Promise<string[]> {
  const usernames = [...new Set([...text.matchAll(MENTION_PATTERN)].map((match) => match[1]))].slice(0, 10);
  if (usernames.length === 0) return [];
  const profiles = await Promise.all(usernames.map((username) => db
    .collection('users')
    .where('username', '==', username)
    .limit(1)
    .get()));
  return [...new Set(profiles.flatMap((profile) => profile.docs.map((document) => document.id)))];
}

/** Everyone who should hear about a freshly published review. */
async function announceReview(
  reviewId: string,
  authorId: string,
  authorName: string,
  venue: { id: string; name: string; city: string; reviewCount: number },
): Promise<void> {
  const [followers, savers] = await Promise.all([
    db.collection('users').doc(authorId).collection('followers').limit(400).get(),
    db.collectionGroup('savedVenues').where('venueId', '==', venue.id).limit(400).get(),
  ]);
  const saverIds = new Set(savers.docs
    .map((saved) => saved.ref.parent.parent?.id)
    .filter((id): id is string => Boolean(id) && id !== authorId));
  const requests: NotificationRequest[] = [];
  for (const follower of followers.docs) {
    requests.push({
      recipientId: follower.id,
      type: saverIds.has(follower.id) ? 'saved-place-review' : 'friend-review',
      eventKey: reviewId,
      actorId: authorId,
      actorName: authorName,
      params: { place: venue.name },
      targetId: reviewId,
    });
  }
  const followerIds = new Set(followers.docs.map((follower) => follower.id));
  for (const saverId of saverIds) {
    if (followerIds.has(saverId)) continue;
    requests.push({
      recipientId: saverId,
      type: 'saved-place-review',
      eventKey: reviewId,
      actorId: authorId,
      actorName: authorName,
      params: { place: venue.name },
      targetId: reviewId,
    });
  }
  await sendNotifications(requests);

  // The very first review of a venue is news for everyone living in that city.
  if (venue.reviewCount > 0 || !venue.city) return;
  const neighbours = await db.collection('users')
    .where('status', '==', 'active')
    .where('city', '==', venue.city)
    .limit(400)
    .get();
  await sendNotifications(neighbours.docs
    .filter((neighbour) => neighbour.id !== authorId)
    .map((neighbour) => ({
      recipientId: neighbour.id,
      type: 'city-first-review' as const,
      eventKey: venue.id,
      actorId: authorId,
      params: { place: venue.name, city: venue.city },
      targetId: venue.id,
    })));
}

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

  type ReviewAnnouncement = {
    authorName: string;
    venue: { id: string; name: string; city: string; reviewCount: number };
    previousXp: number;
  };
  let announcement: ReviewAnnouncement | null = null;

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
    announcement = {
      authorName: String(user.get('displayName') ?? 'Someone'),
      venue: {
        id: venue.id,
        name: String(venue.get('name') ?? 'a place'),
        city: String(venue.get('city') ?? ''),
        reviewCount,
      },
      previousXp: Number(user.get('xp') ?? 0),
    };
  });

  const published = announcement as ReviewAnnouncement | null;
  if (published) {
    const { authorName, venue, previousXp } = published;
    const effects = await Promise.allSettled([
      announceReview(reviewRef.id, uid, authorName, venue),
      notifyLevelChange(uid, previousXp, previousXp + 50),
      syncRewardNotifications(uid),
    ]);
    const effectNames = ['review announcement', 'level notification', 'reward notification'] as const;
    effects.forEach((effect, index) => {
      if (effect.status === 'rejected') {
        console.warn(`Unable to complete the post-create ${effectNames[index]}.`, effect.reason);
      }
    });
  }

  return { id: reviewRef.id };
});

export const editReview = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(editReviewInputSchema, request.data);
  const reviewRef = db.collection('reviews').doc(input.reviewId);
  if (input.dishReviews.some((dish) => !dish.photoPath.startsWith(`review-images/${uid}/`))) {
    throw new HttpsError('permission-denied', 'Review photos must belong to the authenticated user.');
  }

  await db.runTransaction(async (transaction) => {
    const review = await transaction.get(reviewRef);
    if (!review.exists || review.get('status') !== 'published') {
      throw new HttpsError('not-found', 'The review was not found.');
    }
    if (review.get('authorId') !== uid) {
      throw new HttpsError('permission-denied', 'Only the review author can edit this review.');
    }
    const venueRef = db.collection('venues').doc(String(review.get('venueId')));
    const venue = await transaction.get(venueRef);
    if (!venue.exists) throw new HttpsError('not-found', 'The venue was not found.');

    const count = Math.max(1, Number(venue.get('reviewCount') ?? 1));
    const average = Math.max(0, Number(venue.get('rating') ?? 0));
    const oldRating = Number(review.get('rating') ?? 0);
    const now = FieldValue.serverTimestamp();
    transaction.update(reviewRef, {
      rating: input.rating,
      text: input.text,
      tags: input.tags,
      tag: input.tags[0] ?? null,
      dishReviews: input.dishReviews,
      dishNames: input.dishReviews.map((dish) => dish.title),
      updatedAt: now,
    });
    transaction.update(venueRef, {
      rating: Math.max(0, Math.min(5, ((average * count) - oldRating + input.rating) / count)),
      updatedAt: now,
    });
  });
  return { id: input.reviewId };
});

export const deleteReview = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(deleteReviewInputSchema, request.data);
  const reviewRef = db.collection('reviews').doc(input.reviewId);
  const userRef = db.collection('users').doc(uid);

  await db.runTransaction(async (transaction) => {
    const [review, user] = await Promise.all([
      transaction.get(reviewRef),
      transaction.get(userRef),
    ]);
    if (!review.exists || review.get('status') === 'deleted') return;
    if (review.get('authorId') !== uid) {
      throw new HttpsError('permission-denied', 'Only the review author can delete this review.');
    }
    const venueRef = db.collection('venues').doc(String(review.get('venueId')));
    const venue = await transaction.get(venueRef);
    const now = FieldValue.serverTimestamp();
    transaction.update(reviewRef, { status: 'deleted', deletedAt: now, updatedAt: now });
    if (venue.exists) {
      const count = Math.max(0, Number(venue.get('reviewCount') ?? 0));
      const nextCount = Math.max(0, count - 1);
      const average = Math.max(0, Number(venue.get('rating') ?? 0));
      const rating = Number(review.get('rating') ?? 0);
      transaction.update(venueRef, {
        reviewCount: nextCount,
        rating: nextCount === 0 ? 0 : Math.max(0, Math.min(5, ((average * count) - rating) / nextCount)),
        updatedAt: now,
      });
    }
    if (user.exists) {
      addXp(transaction, userRef, -50, {
        xp: Number(user.get('xp') ?? 0),
        monthlyXp: Number(user.get('monthlyXp') ?? 0),
      });
      transaction.update(userRef, {
        reviewCount: Math.max(0, Number(user.get('reviewCount') ?? 0) - 1),
        updatedAt: now,
      });
    }
  });
  return { id: input.reviewId };
});

export const setReviewPinned = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(setReviewPinnedInputSchema, request.data);
  const reviewRef = db.collection('reviews').doc(input.reviewId);
  const review = await reviewRef.get();
  if (!review.exists || review.get('status') !== 'published') {
    throw new HttpsError('not-found', 'The review was not found.');
  }
  if (review.get('authorId') !== uid) {
    throw new HttpsError('permission-denied', 'Only the review author can change its pinned state.');
  }
  await reviewRef.update({
    pinned: input.pinned,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { id: input.reviewId };
});

export const reactToContent = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(reactToContentInputSchema, request.data);
  const reviewRef = db.collection('reviews').doc(input.reviewId);
  const contentRef = input.targetType === 'review'
    ? reviewRef
    : reviewRef.collection('comments').doc(input.commentId!);
  const reactionRef = contentRef.collection('reactions').doc(uid);
  const idempotencyRef = db.collection('_idempotency').doc(
    idempotentDocumentId(uid, `${input.targetType}-reaction:${contentRef.id}`, input.idempotencyKey),
  );
  return db.runTransaction(async (transaction) => {
    const [profile, review, content, reaction, idempotency] = await Promise.all([
      transaction.get(db.collection('users').doc(uid)),
      transaction.get(reviewRef),
      input.targetType === 'review' ? transaction.get(reviewRef) : transaction.get(contentRef),
      transaction.get(reactionRef),
      transaction.get(idempotencyRef),
    ]);
    if (!profile.exists || profile.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    if (idempotency.exists) {
      return { active: Boolean(idempotency.get('active')), reactionCount: Number(idempotency.get('reactionCount') ?? 0) };
    }
    if (!review.exists || review.get('status') !== 'published' || !content.exists || content.get('status') !== 'published') {
      throw new HttpsError('not-found', 'The content was not found.');
    }
    if (content.get('authorId') === uid) {
      throw new HttpsError('failed-precondition', 'You cannot react to your own content.');
    }
    await enforceRateLimit(transaction, uid, 'react-content', 120, 60_000);
    const currentCount = Math.max(0, Number(content.get('reactionCount') ?? 0));
    const active = !reaction.exists;
    const reactionCount = Math.max(0, currentCount + (active ? 1 : -1));
    if (active) transaction.create(reactionRef, { userId: uid, reaction: input.reaction, createdAt: FieldValue.serverTimestamp() });
    else transaction.delete(reactionRef);
    transaction.update(contentRef, { reactionCount, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(idempotencyRef, {
      active,
      reactionCount,
      expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60_000),
    });
    if (active && input.targetType === 'review') {
      const venueName = String(review.get('venueName') ?? 'a place');
      queueNotification(transaction, {
        recipientId: String(content.get('authorId') ?? ''),
        type: 'review-like',
        eventKey: `${input.reviewId}:${uid}`,
        actorId: uid,
        actorName: String(profile.get('displayName') ?? 'Someone'),
        params: { place: venueName },
        targetId: input.reviewId,
      });
      if (REVIEW_LIKE_MILESTONES.includes(reactionCount)) {
        queueNotification(transaction, {
          recipientId: String(content.get('authorId') ?? ''),
          type: 'review-milestone',
          eventKey: `${input.reviewId}:${reactionCount}`,
          params: { place: venueName, count: reactionCount },
          targetId: input.reviewId,
        });
      }
    }
    return { active, reactionCount };
  });
});

export const reportContent = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(reportContentInputSchema, request.data);
  const profileRef = db.collection('users').doc(uid);
  const reviewRef = db.collection('reviews').doc(input.reviewId);
  const contentRef = input.targetType === 'review'
    ? reviewRef
    : reviewRef.collection('comments').doc(input.commentId!);
  const [profile, review, content] = await Promise.all([profileRef.get(), reviewRef.get(), contentRef.get()]);
  if (!profile.exists || profile.get('status') !== 'active') {
    throw new HttpsError('failed-precondition', 'An active user profile is required.');
  }
  if (!review.exists || review.get('status') !== 'published' || !content.exists || content.get('status') !== 'published') {
    throw new HttpsError('not-found', 'The content was not found.');
  }
  const reportRef = db.collection('reports').doc(
    idempotentDocumentId(uid, `report-${input.targetType}:${contentRef.id}`, input.idempotencyKey),
  );
  await reportRef.set({
    reporterId: uid,
    reporterName: String(profile.get('displayName') ?? 'Tastes user'),
    targetType: input.targetType,
    targetId: contentRef.id,
    ...(input.targetType === 'comment' ? { parentId: input.reviewId } : {}),
    reason: input.reason,
    details: input.details ?? null,
    contentPreview: String(content.get('text') ?? '').slice(0, 280),
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: false });
  await sendNotification({
    recipientId: uid,
    type: 'report-received',
    eventKey: reportRef.id,
    targetId: reportRef.id,
  });
  return { id: reportRef.id };
});

export const addComment = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(addCommentInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);
  const reviewRef = db.collection('reviews').doc(input.reviewId);
  const commentRef = reviewRef.collection('comments').doc(
    idempotentDocumentId(uid, `comment:${input.reviewId}`, input.idempotencyKey),
  );
  const parentRef = input.parentCommentId
    ? reviewRef.collection('comments').doc(input.parentCommentId)
    : null;
  type CommentNotice = { actorName: string; preview: string; excludedIds: string[] };
  let notified: CommentNotice | null = null;

  await db.runTransaction(async (transaction) => {
    const [user, review, existingComment, parentComment] = await Promise.all([
      transaction.get(userRef),
      transaction.get(reviewRef),
      transaction.get(commentRef),
      parentRef ? transaction.get(parentRef) : Promise.resolve(null),
    ]);

    if (!user.exists || user.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    if (existingComment.exists) return;

    if (!review.exists || review.get('status') !== 'published') {
      throw new HttpsError('not-found', 'The review was not found.');
    }
    if (parentRef && (!parentComment?.exists || parentComment.get('status') !== 'published')) {
      throw new HttpsError('not-found', 'The parent comment was not found.');
    }
    if (parentComment?.get('parentCommentId')) {
      throw new HttpsError('failed-precondition', 'Replies can only be added to top-level comments.');
    }

    await enforceRateLimit(transaction, uid, 'add-comment', 30, 60_000);
    transaction.create(commentRef, {
      authorId: uid,
      authorDisplayName: user.get('displayName'),
      parentCommentId: input.parentCommentId ?? null,
      reactionCount: 0,
      replyCount: 0,
      text: input.text,
      status: 'published',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(reviewRef, {
      commentCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (parentRef) transaction.update(parentRef, { replyCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });

    const actorName = String(user.get('displayName') ?? 'Someone');
    const preview = commentPreview(input.text);
    const parentAuthorId = parentComment ? String(parentComment.get('authorId') ?? '') : '';
    queueNotification(transaction, {
      recipientId: parentRef ? parentAuthorId : String(review.get('authorId') ?? ''),
      type: parentRef ? 'comment-reply' : 'review-comment',
      eventKey: commentRef.id,
      actorId: uid,
      actorName,
      params: { text: preview, place: String(review.get('venueName') ?? '') },
      targetId: input.reviewId,
      data: { commentId: commentRef.id },
    });
    // A reply still deserves to reach the review author when they are not the one being replied to.
    if (parentRef && String(review.get('authorId') ?? '') !== parentAuthorId) {
      queueNotification(transaction, {
        recipientId: String(review.get('authorId') ?? ''),
        type: 'review-comment',
        eventKey: commentRef.id,
        actorId: uid,
        actorName,
        params: { text: preview, place: String(review.get('venueName') ?? '') },
        targetId: input.reviewId,
        data: { commentId: commentRef.id },
      });
    }
    notified = {
      actorName,
      preview,
      excludedIds: [uid, parentAuthorId, String(review.get('authorId') ?? '')].filter(Boolean),
    };
  });

  const notice = notified as CommentNotice | null;
  if (notice) {
    const { actorName, preview, excludedIds } = notice;
    const mentioned = (await mentionedUserIds(input.text)).filter((id) => !excludedIds.includes(id));
    await sendNotifications(mentioned.map((recipientId) => ({
      recipientId,
      type: 'mention' as const,
      eventKey: commentRef.id,
      actorId: uid,
      actorName,
      params: { text: preview },
      targetId: input.reviewId,
      data: { commentId: commentRef.id },
    })));
  }

  return { id: commentRef.id };
});

export const reactToComment = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(reactToCommentInputSchema, request.data);
  const commentRef = db.collection('reviews').doc(input.reviewId).collection('comments').doc(input.commentId);
  const reactionRef = commentRef.collection('reactions').doc(uid);
  const idempotencyRef = db.collection('_idempotency').doc(idempotentDocumentId(uid, `comment-reaction:${input.commentId}`, input.idempotencyKey));
  return db.runTransaction(async (transaction) => {
    const [comment, reaction, idempotency] = await Promise.all([
      transaction.get(commentRef), transaction.get(reactionRef), transaction.get(idempotencyRef),
    ]);
    if (idempotency.exists) return { active: Boolean(idempotency.get('active')), reactionCount: Number(idempotency.get('reactionCount')) };
    if (!comment.exists || comment.get('status') !== 'published') throw new HttpsError('not-found', 'The comment was not found.');
    const currentCount = Number(comment.get('reactionCount') ?? 0);
    const active = !reaction.exists;
    const reactionCount = Math.max(0, currentCount + (active ? 1 : -1));
    if (active) transaction.create(reactionRef, { userId: uid, reaction: input.reaction, createdAt: FieldValue.serverTimestamp() });
    else transaction.delete(reactionRef);
    transaction.update(commentRef, { reactionCount, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(idempotencyRef, { active, reactionCount, createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60_000) });
    return { active, reactionCount };
  });
});

export const deleteComment = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(deleteCommentInputSchema, request.data);
  const reviewRef = db.collection('reviews').doc(input.reviewId);
  const commentRef = reviewRef.collection('comments').doc(input.commentId);
  await db.runTransaction(async (transaction) => {
    const [review, comment] = await Promise.all([
      transaction.get(reviewRef),
      transaction.get(commentRef),
    ]);
    if (!review.exists || review.get('status') !== 'published') throw new HttpsError('not-found', 'The review was not found.');
    if (!comment.exists || comment.get('status') !== 'published') throw new HttpsError('not-found', 'The comment was not found.');
    if (comment.get('authorId') !== uid) throw new HttpsError('permission-denied', 'You can only delete your own comments.');
    const replies = comment.get('parentCommentId')
      ? null
      : await transaction.get(reviewRef.collection('comments')
        .where('status', '==', 'published')
        .where('parentCommentId', '==', input.commentId));
    if (replies && replies.size > 450) {
      throw new HttpsError('resource-exhausted', 'This comment thread is too large to delete at once.');
    }
    const parentId = comment.get('parentCommentId');
    const parentRef = parentId ? reviewRef.collection('comments').doc(String(parentId)) : null;
    const parent = parentRef ? await transaction.get(parentRef) : null;
    const deletedCount = 1 + (replies?.size ?? 0);
    transaction.update(commentRef, { status: 'deleted', updatedAt: FieldValue.serverTimestamp() });
    replies?.docs.forEach((reply) => transaction.update(reply.ref, {
      status: 'deleted',
      updatedAt: FieldValue.serverTimestamp(),
    }));
    transaction.update(reviewRef, {
      commentCount: Math.max(0, Number(review.get('commentCount') ?? 0) - deletedCount),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (parentRef && parent?.exists && parent.get('status') === 'published') {
      transaction.update(parentRef, {
        replyCount: Math.max(0, Number(parent.get('replyCount') ?? 0) - 1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
  return { id: input.commentId };
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
    const venueName = String(review.get('venueName') ?? 'a place');
    queueNotification(transaction, {
      recipientId: authorId,
      type: 'review-like',
      eventKey: `${input.reviewId}:${uid}`,
      actorId: uid,
      actorName: String(user.get('displayName') ?? 'Someone'),
      params: { place: venueName },
      targetId: input.reviewId,
    });
    if (REVIEW_LIKE_MILESTONES.includes(reactionCount)) {
      queueNotification(transaction, {
        recipientId: authorId,
        type: 'review-milestone',
        eventKey: `${input.reviewId}:${reactionCount}`,
        params: { place: venueName, count: reactionCount },
        targetId: input.reviewId,
      });
    }
    const authorXp = Number(author.get('xp') ?? 0);
    if (author.exists && levelForXp(authorXp + 5) > levelForXp(authorXp)) {
      queueNotification(transaction, {
        recipientId: authorId,
        type: 'level-up',
        eventKey: `level-${levelForXp(authorXp + 5)}`,
        params: { level: levelForXp(authorXp + 5) },
        targetId: String(levelForXp(authorXp + 5)),
      });
    }
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

    queueNotification(transaction, {
      recipientId: uid,
      type: 'report-received',
      eventKey: reportRef.id,
      targetId: reportRef.id,
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
