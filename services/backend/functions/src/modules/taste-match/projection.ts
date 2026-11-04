import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db, firestoreDatabaseId } from '../../shared/firebase';
import {
  type DishCatalog,
  TAXONOMY_VERSION,
  loadDishCatalog,
  normalizationRequestId,
} from './catalog';
import type { CanonicalRating } from './types';

const fixtureSources = new Set(['seed', 'test', 'stress-image-scroll']);
export const timeMillis = (value: unknown): number =>
  value instanceof Timestamp
    ? value.toMillis()
    : typeof value === 'string'
      ? Date.parse(value)
      : typeof value === 'number'
        ? value
        : NaN;
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Source is the current root review, not an eventually delivered trigger snapshot. */
export function projectDishRatings(
  review: DocumentSnapshot,
  catalog: DishCatalog,
  now: number,
): {
  ratings: CanonicalRating[];
  unresolved: string[];
} {
  if (
    !review.exists ||
    review.get('status') !== 'published' ||
    review.get('mergedIntoReviewId') ||
    fixtureSources.has(review.get('source'))
  )
    return { ratings: [], unresolved: [] };
  const userId = review.get('authorId'),
    venueId = review.get('venueId');
  if (typeof userId !== 'string' || typeof venueId !== 'string')
    return { ratings: [], unresolved: [] };
  const dishes: unknown[] = Array.isArray(review.get('dishReviews'))
    ? review.get('dishReviews')
    : [];
  const ratings: CanonicalRating[] = [],
    unresolved: string[] = [];
  for (const input of dishes.slice(0, 500)) {
    const dish = record(input);
    if (!dish || typeof dish.title !== 'string' || typeof dish.id !== 'string')
      continue;
    const canonical =
      dish.canonicalDishConfirmed === true &&
      typeof dish.canonicalDishId === 'string'
        ? catalog.dishes.get(dish.canonicalDishId)
        : catalog.resolve(dish.title);
    if (!canonical) {
      unresolved.push(dish.title.slice(0, 120));
      continue;
    }
    const history = (Array.isArray(dish.history) ? dish.history : [])
      .map(record)
      .filter((x): x is Record<string, unknown> => !!x)
      .sort((a, b) => timeMillis(b.createdAt) - timeMillis(a.createdAt));
    // Editing text/photos must not make an old dish rating appear fresh. History
    // is authoritative for revised reviews; legacy ratings use publication time.
    const decisions = [
      timeMillis(dish.ratedAt),
      timeMillis(history[0]?.createdAt),
    ].filter(Number.isFinite);
    const ratedAt = decisions.length
      ? Math.max(...decisions)
      : timeMillis(review.get('createdAt'));
    const rating = Number(dish.rating);
    if (
      !Number.isFinite(ratedAt) ||
      ratedAt > now ||
      ratedAt < 0 ||
      !Number.isFinite(rating) ||
      rating < 0.5 ||
      rating > 5
    )
      continue;
    ratings.push({
      id: `${review.id}:${dish.id}`,
      userId,
      venueId,
      canonicalDishId: canonical.id,
      rating,
      ratedAt,
      rawDishName: dish.title.slice(0, 120),
      taxonomyVersion: TAXONOMY_VERSION,
      visibility:
        review.get('visibility') === 'private'
          ? 'private'
          : review.get('visibility') === 'followers'
            ? 'followers'
            : review.get('visibility') === 'friends'
              ? 'friends'
              : 'public',
    });
  }
  return { ratings, unresolved };
}

export async function refreshTasteReviewProjection(
  database: Firestore,
  reviewId: string,
  catalog?: DishCatalog,
): Promise<void> {
  catalog ??= await loadDishCatalog(database);
  const approved = catalog;
  await database.runTransaction(async (tx) => {
    const current = await tx.get(database.collection('reviews').doc(reviewId));
    const projected = projectDishRatings(current, approved, Date.now());
    const target = database.collection('_tasteReviewEvidence').doc(reviewId);
    if (!projected.ratings.length) tx.delete(target);
    else
      tx.set(target, {
        authorId: current.get('authorId'),
        venueId: current.get('venueId'),
        city: String(current.get('venueCity') ?? '')
          .trim()
          .toLowerCase(),
        canonicalDishIds: [
          ...new Set(projected.ratings.map((r) => r.canonicalDishId)),
        ],
        latestRatedAt: Math.max(...projected.ratings.map((r) => r.ratedAt)),
        sourceVersion: current.updateTime ?? null,
        taxonomyVersion: TAXONOMY_VERSION,
        updatedAt: FieldValue.serverTimestamp(),
      });
    for (const title of [...new Set(projected.unresolved)].slice(0, 50))
      tx.set(
        database
          .collection('_dishNormalizationQueue')
          .doc(normalizationRequestId(title)),
        {
          rawName: title,
          status: 'pending',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  });
}

export const indexTasteReview = onDocumentWritten(
  {
    document: 'reviews/{reviewId}',
    database: firestoreDatabaseId,
    region: 'europe-west1',
    retry: true,
  },
  async (event) => {
    const before = event.data?.before,
      after = event.data?.after;
    const relevant = [
      'status',
      'visibility',
      'authorId',
      'venueId',
      'venueCity',
      'dishReviews',
      'createdAt',
      'mergedIntoReviewId',
    ];
    if (
      before?.exists &&
      after?.exists &&
      relevant.every(
        (field) =>
          JSON.stringify(before.get(field)) ===
          JSON.stringify(after.get(field)),
      )
    )
      return;
    await refreshTasteReviewProjection(db, event.params.reviewId);
  },
);
