import {
  addCommentInputSchema,
  createReviewInputSchema,
  deleteReviewInputSchema,
  deleteCommentInputSchema,
  editReviewInputSchema,
  setReviewPinnedInputSchema,
  getCommentsInputSchema,
  getCommentRepliesInputSchema,
  getCommentContextInputSchema,
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
import { getDownloadURL, getStorage } from 'firebase-admin/storage';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { requireUserId } from '../../shared/auth';
import { db, firestoreDatabaseId } from '../../shared/firebase';
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
import { isFirebaseEmulator } from '../../shared/runtime-environment';
import {
  compareDocumentIdsDesc,
  cursorDate,
  decodeCursor,
  encodeCursor,
} from '../../shared/pagination';
import { timestampToIso } from '../../shared/serialization';
import { parseInput } from '../../shared/validation';
import { normalizeUsername, usernameReference } from '../../shared/user-data';

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
  // The UI previews only the latest replies for each root. Fetching every reply made this
  // callable unbounded (20 roots could previously return thousands of documents).
  const replySnapshots = await Promise.all(rootDocuments.map((rootDocument) => review.ref
    .collection('comments')
    .where('status', '==', 'published')
    .where('parentCommentId', '==', rootDocument.id)
    .orderBy('createdAt', 'desc')
    .limit(3)
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

/** Fetches a bounded, independently paginated reply thread. */
export const getCommentReplies = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(getCommentRepliesInputSchema, request.data);
  const cursor = decodeCursor(input.cursor);
  const reviewRef = db.collection('reviews').doc(input.reviewId);
  const [review, parent] = await Promise.all([
    reviewRef.get(),
    reviewRef.collection('comments').doc(input.parentCommentId).get(),
  ]);
  if (!review.exists || review.get('status') !== 'published') {
    throw new HttpsError('not-found', 'The review was not found.');
  }
  if (!parent.exists || parent.get('status') !== 'published' || parent.get('parentCommentId') !== null) {
    throw new HttpsError('not-found', 'The parent comment was not found.');
  }

  let repliesQuery = reviewRef.collection('comments')
    .where('status', '==', 'published')
    .where('parentCommentId', '==', input.parentCommentId)
    .orderBy('createdAt', 'desc')
    .orderBy(FieldPath.documentId(), 'desc');
  if (cursor) repliesQuery = repliesQuery.startAfter(Timestamp.fromDate(cursorDate(cursor.value)), cursor.id);
  const snapshot = await repliesQuery.limit(input.limit + 1).get();
  const documents = snapshot.docs.slice(0, input.limit);
  const last = documents.at(-1);
  const authorIds = [...new Set(documents.map((document) => String(document.get('authorId'))))];
  const [reactionDocuments, authorDocuments] = await Promise.all([
    documents.length > 0
      ? db.getAll(...documents.map((document) => document.ref.collection('reactions').doc(uid)))
      : Promise.resolve([]),
    authorIds.length > 0
      ? db.getAll(...authorIds.map((id) => db.collection('users').doc(id)))
      : Promise.resolve([]),
  ]);
  const reactedIds = new Set(reactionDocuments.filter((document) => document.exists).map((document) => document.ref.parent.parent?.id));
  const authorPhotoById = new Map(authorDocuments.map((document) => [
    document.id,
    document.exists && document.get('photoUrl') ? String(document.get('photoUrl')) : null,
  ]));
  return {
    items: documents.map((document) => ({
      id: document.id,
      reviewId: input.reviewId,
      authorId: String(document.get('authorId')),
      authorDisplayName: String(document.get('authorDisplayName')),
      authorPhotoUrl: authorPhotoById.get(String(document.get('authorId'))) ?? null,
      parentCommentId: input.parentCommentId,
      reactionCount: Number(document.get('reactionCount') ?? 0),
      replyCount: Number(document.get('replyCount') ?? 0),
      reacted: reactedIds.has(document.id),
      text: String(document.get('text')),
      createdAt: timestampToIso(document.get('createdAt')),
    })),
    nextCursor: snapshot.size > input.limit && last
      ? encodeCursor({ id: last.id, value: timestampToIso(last.get('createdAt')) })
      : null,
  };
});

/** Resolves the root and target comment behind an unchanged deep-link URL. */
export const getCommentContext = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(getCommentContextInputSchema, request.data);
  const reviewRef = db.collection('reviews').doc(input.reviewId);
  const targetRef = reviewRef.collection('comments').doc(input.commentId);
  const [review, target] = await Promise.all([reviewRef.get(), targetRef.get()]);
  if (!review.exists || review.get('status') !== 'published' || !target.exists || target.get('status') !== 'published') {
    throw new HttpsError('not-found', 'The comment was not found.');
  }
  const rootRef = target.get('parentCommentId')
    ? reviewRef.collection('comments').doc(String(target.get('parentCommentId')))
    : targetRef;
  const root = rootRef.path === targetRef.path ? target : await rootRef.get();
  if (!root.exists || root.get('status') !== 'published') throw new HttpsError('not-found', 'The comment was not found.');
  const documents = root.id === target.id ? [root] : [root, target];
  const authorIds = [...new Set(documents.map((document) => String(document.get('authorId'))))];
  const [reactionDocuments, authorDocuments] = await Promise.all([
    db.getAll(...documents.map((document) => document.ref.collection('reactions').doc(uid))),
    db.getAll(...authorIds.map((id) => db.collection('users').doc(id))),
  ]);
  const reactedIds = new Set(reactionDocuments.filter((document) => document.exists).map((document) => document.ref.parent.parent?.id));
  const authorPhotoById = new Map(authorDocuments.map((document) => [document.id, document.exists && document.get('photoUrl') ? String(document.get('photoUrl')) : null]));
  return {
    items: documents.map((document) => ({
      id: document.id,
      reviewId: input.reviewId,
      authorId: String(document.get('authorId')),
      authorDisplayName: String(document.get('authorDisplayName')),
      authorPhotoUrl: authorPhotoById.get(String(document.get('authorId'))) ?? null,
      parentCommentId: document.get('parentCommentId') ? String(document.get('parentCommentId')) : null,
      reactionCount: Number(document.get('reactionCount') ?? 0),
      replyCount: Number(document.get('replyCount') ?? 0),
      reacted: reactedIds.has(document.id),
      text: String(document.get('text')),
      createdAt: timestampToIso(document.get('createdAt')),
    })),
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
  const usernames = [...new Set([...text.matchAll(MENTION_PATTERN)].flatMap((match) => (
    match[1] ? [normalizeUsername(match[1])] : []
  )))].slice(0, 10);
  if (usernames.length === 0) return [];
  const claims = await db.getAll(...usernames.map(usernameReference));
  const claimedUserIds = claims.flatMap((claim) => claim.exists && claim.get('uid') ? [String(claim.get('uid'))] : []);
  const unresolvedUsernames = usernames.filter((_, index) => !claims[index]?.exists);
  if (unresolvedUsernames.length === 0) return [...new Set(claimedUserIds)];

  // Username claims are populated by a rolling migration. searchTokens was
  // already normalized on old profiles, so it is a bounded, case-insensitive
  // bridge for mentions until every account has a claim document.
  const legacyMatches = await Promise.all(unresolvedUsernames.map(async (username) => {
    const profiles = await db.collection('users').where('searchTokens', 'array-contains', `p:${username}`).limit(2).get();
    return profiles.docs.flatMap((profile) => (
      normalizeUsername(String(profile.get('username') ?? '')) === username ? [profile.id] : []
    ));
  }));
  return [...new Set([...claimedUserIds, ...legacyMatches.flat()])];
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

type StoredDishReview = {
  id?: unknown;
  photoPath?: unknown;
  photoUrl?: unknown;
  rating?: unknown;
  title?: unknown;
};

async function attachDishPhotoUrls(
  review: FirebaseFirestore.DocumentSnapshot,
): Promise<void> {
  // The auth/function test contour deliberately does not start Storage. Never let it
  // fall through to a real bucket when Application Default Credentials are present.
  if (isFirebaseEmulator()
    && !process.env.FIREBASE_STORAGE_EMULATOR_HOST
    && !process.env.STORAGE_EMULATOR_HOST) return;
  const dishes = Array.isArray(review.get('dishReviews'))
    ? review.get('dishReviews') as StoredDishReview[]
    : [];
  if (dishes.length === 0 || dishes.every((dish) => typeof dish.photoUrl === 'string')) return;
  const bucket = getStorage().bucket();
  const enriched = await Promise.all(dishes.map(async (dish) => {
    if (typeof dish.photoUrl === 'string' || typeof dish.photoPath !== 'string') return dish;
    try {
      return { ...dish, photoUrl: await getDownloadURL(bucket.file(dish.photoPath)) };
    } catch (error) {
      console.warn(`Unable to resolve the review photo ${dish.photoPath}.`, error);
      return dish;
    }
  }));
  if (enriched.some((dish, index) => dish !== dishes[index])) {
    const resolvedUrlByPath = new Map(enriched.flatMap((dish) =>
      typeof dish.photoPath === 'string' && typeof dish.photoUrl === 'string' ? [[dish.photoPath, dish.photoUrl]] : []));
    // The trigger can run while its author edits the review. Re-read in a
    // transaction and add URLs only to matching, still-current photo paths.
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(review.ref);
      if (!current.exists) return;
      const currentDishes = Array.isArray(current.get('dishReviews'))
        ? current.get('dishReviews') as StoredDishReview[]
        : [];
      const merged = currentDishes.map((dish) => {
        const photoUrl = typeof dish.photoPath === 'string' ? resolvedUrlByPath.get(dish.photoPath) : undefined;
        return photoUrl && typeof dish.photoUrl !== 'string' ? { ...dish, photoUrl } : dish;
      });
      if (merged.some((dish, index) => dish !== currentDishes[index])) {
        transaction.update(review.ref, { dishReviews: merged, updatedAt: FieldValue.serverTimestamp() });
      }
    });
  }
}

/** Heavy post-publication work runs after the callable has returned to the app. */
export const processReviewEffects = onDocumentCreated({
  document: 'reviews/{reviewId}',
  database: firestoreDatabaseId,
  region: 'europe-west1',
  retry: true,
}, async (event) => {
  const review = event.data;
  if (!review?.exists || review.get('status') !== 'published') return;
  const authorId = String(review.get('authorId') ?? '');
  if (!authorId) return;
  const effectRef = db.collection('_reviewEffectEvents').doc(event.id);
  const claim = await db.runTransaction(async (transaction) => {
    const [effect, currentReview] = await Promise.all([
      transaction.get(effectRef),
      transaction.get(review.ref),
    ]);
    // The create-event snapshot remains published after a delete/moderation
    // update. Check the current document in the lease transaction, so that a
    // concurrent status change retries this transaction rather than sending
    // notifications for content which is no longer visible.
    if (!currentReview.exists || currentReview.get('status') !== 'published') return { claimed: false, review: null };
    if (effect.get('status') === 'complete') return false;
    // A duplicate delivery retries while a live worker owns the lease. If the
    // worker died, a later delivery can reclaim it after the short lease.
    const leaseExpiresAt = effect.get('leaseExpiresAt') as Timestamp | undefined;
    if (effect.exists && leaseExpiresAt instanceof Timestamp && leaseExpiresAt.toMillis() > Date.now()) {
      throw new Error(`Review effect ${event.id} is already processing.`);
    }
    transaction.set(effectRef, {
      reviewId: event.params.reviewId,
      status: 'processing',
      leaseExpiresAt: Timestamp.fromMillis(Date.now() + 5 * 60_000),
      // TTL retains the completed marker long enough to deduplicate delayed
      // Eventarc deliveries without growing this internal collection forever.
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60_000),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { claimed: true, review: currentReview };
  });
  if (claim === false || !claim.claimed || !claim.review) return;
  const activeReview = claim.review;
  const xp = Math.max(0, Number((await db.collection('users').doc(authorId).get()).get('xp') ?? 0));
  const storedXpBefore = Number(activeReview.get('xpBefore'));
  const previousXp = Number.isFinite(storedXpBefore) ? Math.max(0, storedXpBefore) : Math.max(0, xp - 50);
  const storedXpAfter = Number(activeReview.get('xpAfter'));
  const nextXp = Number.isFinite(storedXpAfter) ? Math.max(0, storedXpAfter) : xp;
  const completedEffects = (await effectRef.get()).get('completedEffects') as Record<string, unknown> | undefined ?? {};
  const effects: Array<[string, () => Promise<void>]> = [
    ['photoUrls', () => attachDishPhotoUrls(activeReview)],
    ['announcement', () => announceReview(event.params.reviewId, authorId, String(activeReview.get('authorDisplayName') ?? 'Someone'), {
      id: String(activeReview.get('venueId') ?? ''),
      name: String(activeReview.get('venueName') ?? 'a place'),
      city: String(activeReview.get('venueCity') ?? ''),
      reviewCount: activeReview.get('wasFirstVenueReview') === true ? 0 : 1,
    })],
    ['levelNotification', () => notifyLevelChange(authorId, previousXp, nextXp)],
    ['rewardNotifications', () => syncRewardNotifications(authorId)],
  ];
  for (const [name, run] of effects) {
    if (completedEffects[name] === true) continue;
    try {
      await run();
      // Store progress immediately after each completed side effect. A retry
      // after a later failure resumes from here instead of re-delivering the
      // earlier notification fan-out.
      await effectRef.set({ [`completedEffects.${name}`]: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      console.warn(`Review effect ${name} failed for ${event.params.reviewId}.`, error);
      throw error;
    }
  }
  await effectRef.set({ status: 'complete', completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
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
    const reviewCount = Math.max(0, Number(venue.get('reviewCount') ?? 0));
    const averageRating = Math.max(0, Number(venue.get('rating') ?? 0));
    const xpBefore = Math.max(0, Number(user.get('xp') ?? 0));
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
      wasFirstVenueReview: reviewCount === 0,
      xpBefore,
      xpAfter: xpBefore + 50,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(venueRef, {
      rating: ((averageRating * reviewCount) + input.rating) / (reviewCount + 1),
      reviewCount: reviewCount + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    addXp(transaction, userRef, 50, {
      xp: xpBefore,
      monthlyXp: Number(user.get('monthlyXp') ?? 0),
    });
    transaction.update(userRef, {
      reviewCount: FieldValue.increment(1),
      rewardProgressDirty: true,
      rewardProgressVersion: FieldValue.increment(1),
    });
  });

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
    const previousDishes = Array.isArray(review.get('dishReviews')) ? review.get('dishReviews') as StoredDishReview[] : [];
    const photoUrlByPath = new Map(previousDishes.flatMap((dish) =>
      typeof dish.photoPath === 'string' && typeof dish.photoUrl === 'string' ? [[dish.photoPath, dish.photoUrl]] : []));
    const dishReviews = input.dishReviews.map((dish) => ({
      ...dish,
      ...(photoUrlByPath.get(dish.photoPath) ? { photoUrl: photoUrlByPath.get(dish.photoPath) } : {}),
    }));
    transaction.update(reviewRef, {
      rating: input.rating,
      text: input.text,
      tags: input.tags,
      tag: input.tags[0] ?? null,
      dishReviews,
      dishNames: dishReviews.map((dish) => dish.title),
      updatedAt: now,
    });
    transaction.update(venueRef, {
      rating: Math.max(0, Math.min(5, ((average * count) - oldRating + input.rating) / count)),
      updatedAt: now,
    });
    transaction.update(db.collection('users').doc(uid), {
      rewardProgressDirty: true,
      rewardProgressVersion: FieldValue.increment(1),
    });
  });
  try {
    await attachDishPhotoUrls(await reviewRef.get());
  } catch (error) {
    console.warn(`Unable to resolve review photos after editing ${input.reviewId}.`, error);
  }
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
        rewardProgressDirty: true,
        rewardProgressVersion: FieldValue.increment(1),
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
    const authorRef = input.targetType === 'review'
      ? db.collection('users').doc(String(content.get('authorId')))
      : null;
    const author = authorRef ? await transaction.get(authorRef) : null;
    await enforceRateLimit(transaction, uid, input.targetType === 'review' ? 'react-review' : 'react-content', 120, 60_000);
    const currentCount = Math.max(0, Number(content.get('reactionCount') ?? 0));
    const active = !reaction.exists;
    const reactionCount = Math.max(0, currentCount + (active ? 1 : -1));
    if (active) transaction.create(reactionRef, { userId: uid, reaction: input.reaction, createdAt: FieldValue.serverTimestamp() });
    else transaction.delete(reactionRef);
    transaction.update(contentRef, { reactionCount, updatedAt: FieldValue.serverTimestamp() });
    const authorXp = Math.max(0, Number(author?.get('xp') ?? 0));
    if (authorRef && author?.exists) {
      addXp(transaction, authorRef, active ? 5 : -5, {
        xp: authorXp,
        monthlyXp: Number(author.get('monthlyXp') ?? 0),
      });
    }
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
      if (levelForXp(authorXp + 5) > levelForXp(authorXp)) {
        const level = levelForXp(authorXp + 5);
        queueNotification(transaction, {
          recipientId: String(content.get('authorId') ?? ''),
          type: 'level-up',
          eventKey: `level-${level}`,
          params: { level },
          targetId: String(level),
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
    const [profile, comment, reaction, idempotency] = await Promise.all([
      transaction.get(db.collection('users').doc(uid)), transaction.get(commentRef), transaction.get(reactionRef), transaction.get(idempotencyRef),
    ]);
    if (!profile.exists || profile.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    if (idempotency.exists) return { active: Boolean(idempotency.get('active')), reactionCount: Number(idempotency.get('reactionCount')) };
    if (!comment.exists || comment.get('status') !== 'published') throw new HttpsError('not-found', 'The comment was not found.');
    await enforceRateLimit(transaction, uid, 'react-comment', 120, 60_000);
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
    const parentId = comment.get('parentCommentId');
    const parentRef = parentId ? reviewRef.collection('comments').doc(String(parentId)) : null;
    const parent = parentRef ? await transaction.get(parentRef) : null;
    // Delete the root immediately. Its replies are cleaned in bounded batches
    // by the schedule below, so a popular thread never becomes undeletable
    // because it exceeds Firestore's transaction write limit.
    const deletingRoot = !parentRef;
    transaction.update(commentRef, {
      status: 'deleted',
      ...(deletingRoot ? { replyDeletionPending: true } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(reviewRef, {
      commentCount: Math.max(0, Number(review.get('commentCount') ?? 0) - 1),
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

const COMMENT_REPLY_CLEANUP_BATCH_SIZE = 400;

/**
 * Removes replies from deleted root comments without making comment deletion
 * depend on the size of the discussion. A root is already hidden immediately;
 * this job only reconciles its now-unreachable replies and review count.
 */
export const cleanupDeletedCommentReplies = onSchedule({
  schedule: 'every 5 minutes',
  region: 'europe-west1',
  timeZone: 'UTC',
  maxInstances: 1,
}, async () => {
  const roots = await db.collectionGroup('comments')
    .where('replyDeletionPending', '==', true)
    .limit(10)
    .get();
  for (const root of roots.docs) {
    const reviewRef = root.ref.parent.parent;
    if (!reviewRef) continue;
    const replies = await root.ref.parent
      .where('parentCommentId', '==', root.id)
      .where('status', '==', 'published')
      .limit(COMMENT_REPLY_CLEANUP_BATCH_SIZE)
      .get();
    if (replies.empty) {
      await root.ref.update({ replyDeletionPending: FieldValue.delete(), replyCount: 0, updatedAt: FieldValue.serverTimestamp() });
      continue;
    }
    const batch = db.batch();
    for (const reply of replies.docs) {
      batch.update(reply.ref, { status: 'deleted', updatedAt: FieldValue.serverTimestamp() });
    }
    batch.update(reviewRef, {
      commentCount: FieldValue.increment(-replies.size),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.update(root.ref, {
      replyCount: FieldValue.increment(-replies.size),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }
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
