import {
  FieldValue,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { idempotentDocumentId } from '../../shared/mutations';
import { timestampToIso } from '../../shared/serialization';
import { mergeHistoricalReviews } from '../reviews/merge-history';

const MAX_REVIEWS = 200;
const MAX_WRITES = 450;

/** Merge a bounded venue atomically, including overlapping authors' visit histories. */
export async function mergeVenueRecords(
  db: Firestore,
  sourceVenueId: string,
  targetVenueId: string,
  actorId: string,
) {
  if (sourceVenueId === targetVenueId)
    throw new HttpsError('invalid-argument', 'Choose two different venues.');
  const sourceRef = db.collection('venues').doc(sourceVenueId);
  const targetRef = db.collection('venues').doc(targetVenueId);
  return db.runTransaction(async (transaction) => {
    const [source, target] = await transaction.getAll(sourceRef, targetRef);
    if (!source!.exists || !target!.exists)
      throw new HttpsError(
        'not-found',
        'Both venues must exist before merging.',
      );
    if (source!.get('status') === 'merged') {
      if (source!.get('mergedInto') !== targetVenueId)
        throw new HttpsError(
          'failed-precondition',
          'This venue was already merged into another venue.',
        );
      return { movedReviews: 0, mergedReviews: 0, alreadyMerged: true };
    }
    if (source!.get('status') !== 'active')
      throw new HttpsError(
        'failed-precondition',
        'The source venue must be active before merging.',
      );
    if (target!.get('status') !== 'active')
      throw new HttpsError(
        'failed-precondition',
        'The destination venue must be active.',
      );
    const snapshot = await transaction.get(
      db
        .collection('reviews')
        .where('venueId', 'in', [sourceVenueId, targetVenueId])
        .limit(MAX_REVIEWS + 1),
    );
    if (snapshot.size > MAX_REVIEWS)
      throw new HttpsError(
        'resource-exhausted',
        'This merge requires a separate migration. No data has been changed.',
      );
    const writes = new Map<string, DocumentData>();
    const copies = new Map<string, DocumentData>();
    const deleted = new Set<string>();
    const live = snapshot.docs.filter((review) =>
      ['published', 'hidden'].includes(String(review.get('status'))),
    );
    const groups = new Map<string, typeof live>();
    for (const review of live) {
      const authorId = String(review.get('authorId'));
      groups.set(authorId, [...(groups.get(authorId) ?? []), review]);
    }
    const identity = {
      venueId: targetVenueId,
      venueName: target!.get('name'),
      venueCity: target!.get('city') ?? '',
    };
    for (const review of snapshot.docs)
      if (review.get('venueId') === sourceVenueId)
        writes.set(review.ref.path, identity);
    const claims = new Map<string, string>();
    const affectedAuthors = new Set<string>();
    for (const [authorId, reviews] of groups) {
      if (reviews.length === 1) {
        claims.set(authorId, reviews[0]!.id);
        continue;
      }
      if (reviews.some((review) => review.get('status') !== 'published'))
        throw new HttpsError(
          'failed-precondition',
          'Resolve hidden reviews by the same author before merging venues. No data has been changed.',
        );
      for (let offset = 0; offset < reviews.length; offset += 30) {
        const reports = await transaction.get(
          db
            .collection('reports')
            .where(
              'targetId',
              'in',
              reviews.slice(offset, offset + 30).map((r) => r.id),
            )
            .limit(MAX_WRITES + 1),
        );
        if (
          reports.size > MAX_WRITES ||
          reports.docs.some(
            (r) =>
              r.get('targetType') === 'review' && r.get('status') === 'pending',
          )
        )
          throw new HttpsError(
            'failed-precondition',
            'Resolve pending review reports before combining an author’s reviews. No data has been changed.',
          );
      }
      const merged = mergeHistoricalReviews(
        reviews.map((review) => ({
          ...review.data(),
          id: review.id,
          authorId,
          venueId: targetVenueId,
          createdAt: timestampToIso(review.get('createdAt')),
          rating: Number(review.get('rating')),
          text: String(review.get('text') ?? ''),
          dishReviews: review.get('dishReviews') ?? [],
        })),
      );
      const canonical = reviews.find(
        (review) => review.id === merged.canonicalId,
      )!;
      const children = new Map<string, DocumentSnapshot>();
      let legacyLikes = 0;
      for (const review of reviews) {
        const [comments, reactions] = await Promise.all([
          transaction.get(
            review.ref.collection('comments').limit(MAX_WRITES + 1),
          ),
          transaction.get(
            review.ref.collection('reactions').limit(MAX_WRITES + 1),
          ),
        ]);
        if (comments.size > MAX_WRITES || reactions.size > MAX_WRITES)
          throw new HttpsError(
            'resource-exhausted',
            'This review history requires a separate migration. No data has been changed.',
          );
        legacyLikes += Math.max(
          0,
          Number(review.get('reactionCount') ?? 0) - reactions.size,
        );
        for (const child of [...comments.docs, ...reactions.docs]) {
          const relative = child.ref.path.slice(review.ref.path.length + 1);
          const existing = children.get(relative);
          if (existing && relative.startsWith('comments/'))
            throw new HttpsError(
              'failed-precondition',
              'Comment identifiers conflict. No data has been changed.',
            );
          // Keep a single liker record, preferring the original timestamp.
          if (
            !existing ||
            timestampToIso(child.get('createdAt')) <
              timestampToIso(existing.get('createdAt'))
          )
            children.set(relative, child);
          if (child.ref.parent.id === 'comments') {
            const nested = await transaction.get(
              child.ref.collection('reactions').limit(MAX_WRITES + 1),
            );
            if (nested.size > MAX_WRITES)
              throw new HttpsError(
                'resource-exhausted',
                'This comment requires a separate migration. No data has been changed.',
              );
            for (const reaction of nested.docs)
              children.set(`${relative}/reactions/${reaction.id}`, reaction);
          }
        }
      }
      if (children.size > MAX_WRITES)
        throw new HttpsError(
          'resource-exhausted',
          'This history requires a separate migration. No data has been changed.',
        );
      for (const [relative, child] of children) {
        const path = `${canonical.ref.path}/${relative}`;
        if (path !== child.ref.path)
          copies.set(path, {
            ...child.data(),
            ...(child.get('reviewId') !== undefined
              ? { reviewId: canonical.id }
              : {}),
          });
      }
      const allMergedIds = new Set(
        reviews.flatMap((r) => [r.id, ...(r.get('mergedReviewIds') ?? [])]),
      );
      allMergedIds.delete(canonical.id);
      writes.set(canonical.ref.path, {
        ...identity,
        ...merged.patch,
        mergedReviewIds: [...allMergedIds],
        reactionCount:
          [...children.keys()].filter((path) => /^reactions\/[^/]+$/.test(path))
            .length + legacyLikes,
        legacyReactionCount: legacyLikes,
        commentCount: [...children.entries()].filter(
          ([path, doc]) =>
            /^comments\/[^/]+$/.test(path) && doc.get('status') === 'published',
        ).length,
      });
      for (const review of reviews) {
        if (review.id === canonical.id) continue;
        deleted.add(review.id);
        writes.set(review.ref.path, {
          ...identity,
          status: 'deleted',
          mergedIntoReviewId: canonical.id,
          mergedAt: FieldValue.serverTimestamp(),
        });
      }
      claims.set(authorId, canonical.id);
      affectedAuthors.add(authorId);
    }
    const userCounts = new Map<string, number>();
    for (const authorId of affectedAuthors) {
      const [user, reviews] = await Promise.all([
        transaction.get(db.collection('users').doc(authorId)),
        transaction.get(
          db
            .collection('reviews')
            .where('authorId', '==', authorId)
            .where('status', '==', 'published'),
        ),
      ]);
      if (user.exists)
        userCounts.set(
          authorId,
          reviews.docs.filter((review) => !deleted.has(review.id)).length,
        );
    }
    const sourceAuthors = new Set(
      snapshot.docs
        .filter((r) => r.get('venueId') === sourceVenueId)
        .map((r) => String(r.get('authorId'))),
    );
    const [savedPlaces, favoriteUsers] = await Promise.all([
      transaction.get(
        db
          .collectionGroup('savedVenues')
          .where('venueId', '==', sourceVenueId)
          .limit(MAX_WRITES + 1),
      ),
      transaction.get(
        db
          .collection('users')
          .where('tastePreferences.favoriteVenueId', '==', sourceVenueId)
          .limit(MAX_WRITES + 1),
      ),
    ]);
    if (savedPlaces.size > MAX_WRITES || favoriteUsers.size > MAX_WRITES)
      throw new HttpsError(
        'resource-exhausted',
        'This merge requires a separate migration. No data has been changed.',
      );
    const savedMoves = [];
    for (const saved of savedPlaces.docs) {
      if (!/^users\/[^/]+\/savedVenues\/[^/]+$/.test(saved.ref.path)) continue;
      const destination = saved.ref.parent.doc(targetVenueId);
      const existing = await transaction.get(destination);
      const folders = [
        ...new Set([
          ...(saved.get('folderIds') ?? []),
          ...(existing.get('folderIds') ?? []),
        ]),
      ];
      const savedAt = timestampToIso(saved.get('createdAt'));
      const existingAt = timestampToIso(existing.get('createdAt'));
      savedMoves.push({
        saved,
        destination,
        existing,
        data: {
          ...saved.data(),
          ...existing.data(),
          venueId: targetVenueId,
          folderIds: folders,
          createdAt:
            existingAt > savedAt
              ? existing.get('createdAt')
              : saved.get('createdAt'),
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
    }
    const writeCount =
      writes.size +
      copies.size +
      claims.size +
      sourceAuthors.size +
      userCounts.size +
      3 * savedMoves.length +
      favoriteUsers.size +
      2;
    if (
      writeCount > MAX_WRITES ||
      Buffer.byteLength(
        JSON.stringify({
          reviews: [...writes, ...copies],
          savedPlaces: savedMoves.map((move) => [
            move.saved.data(),
            move.existing.data(),
            move.data,
          ]),
        }),
      ) > 7_000_000
    )
      throw new HttpsError(
        'resource-exhausted',
        'This merge requires a separate migration. No data has been changed.',
      );
    // Every read precedes every write. Root review/venue reads also serialize
    // concurrent reviews, visits, comments, moderation and retried merge calls.
    for (const [path, data] of copies) transaction.set(db.doc(path), data);
    for (const [path, data] of writes)
      transaction.update(db.doc(path), {
        ...data,
        updatedAt: FieldValue.serverTimestamp(),
      });
    for (const authorId of sourceAuthors)
      transaction.delete(
        db
          .collection('reviewOwnership')
          .doc(idempotentDocumentId(authorId, 'review-owner', sourceVenueId)),
      );
    for (const [authorId, reviewId] of claims)
      transaction.set(
        db
          .collection('reviewOwnership')
          .doc(idempotentDocumentId(authorId, 'review-owner', targetVenueId)),
        { authorId, venueId: targetVenueId, reviewId },
      );
    for (const [authorId, reviewCount] of userCounts)
      transaction.update(db.collection('users').doc(authorId), {
        reviewCount,
        updatedAt: FieldValue.serverTimestamp(),
      });
    for (const move of savedMoves) {
      const archive = db
        .collection('_venueMergeArchives')
        .doc(`${sourceVenueId}:${targetVenueId}`)
        .collection('savedVenues')
        .doc(move.saved.ref.parent.parent!.id);
      transaction.set(archive, {
        sourcePath: move.saved.ref.path,
        source: move.saved.data(),
        targetPath: move.destination.path,
        previousTarget: move.existing.data() ?? null,
        mergedBy: actorId,
        mergedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(move.destination, move.data);
      transaction.delete(move.saved.ref);
    }
    for (const user of favoriteUsers.docs)
      transaction.update(user.ref, {
        'tastePreferences.favoriteVenueId': targetVenueId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    const published = snapshot.docs.filter(
      (r) => r.get('status') === 'published' && !deleted.has(r.id),
    );
    const sum = published.reduce(
      (total, r) =>
        total + Number(writes.get(r.ref.path)?.rating ?? r.get('rating')),
      0,
    );
    transaction.update(sourceRef, {
      status: 'merged',
      mergedInto: targetVenueId,
      reviewCount: 0,
      rating: 0,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorId,
    });
    transaction.update(targetRef, {
      reviewCount: published.length,
      rating: published.length ? sum / published.length : 0,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorId,
    });
    return {
      movedReviews: snapshot.docs.filter(
        (r) => r.get('venueId') === sourceVenueId,
      ).length,
      mergedReviews: deleted.size,
      alreadyMerged: false,
    };
  });
}
