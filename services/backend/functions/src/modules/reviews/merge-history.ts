import type { Review } from '@tastes/contracts';
import { appendReviewVisit } from './visits';

type Visit = NonNullable<Review['visits']>[number];
type Dish = Review['dishReviews'][number];
export interface HistoricalReview {
  id: string;
  authorId: string;
  venueId: string;
  createdAt: string;
  rating: number;
  text: string;
  tags?: string[];
  dishReviews: Dish[];
  visits?: Visit[];
  isPinned?: boolean;
}

/** Build a deterministic history without losing the individual source reviews. */
export function mergeHistoricalReviews(reviews: HistoricalReview[]) {
  if (reviews.length < 2) throw new Error('At least two reviews are required.');
  const first = reviews[0]!;
  if (
    reviews.some(
      (r) => r.authorId !== first.authorId || r.venueId !== first.venueId,
    )
  )
    throw new Error(
      'Only reviews by the same author at the same venue can be merged.',
    );
  const ordered = [...reviews].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  const events = ordered
    .flatMap((review) => {
      const visits = review.visits?.length
        ? review.visits
        : [
            {
              id: `${review.id}:first`,
              createdAt: review.createdAt,
              rating: review.rating,
              text: review.text,
            },
          ];
      return visits.map((visit, index) => ({
        review,
        visit: { ...visit, id: `${review.id}:${visit.id}` },
        changes: review.dishReviews.flatMap((dish) => {
          const history = dish.history?.find(
            (entry) => entry.visitId === visit.id,
          );
          if (!history && dish.history?.length) return [];
          if (!history && index !== visits.length - 1) return [];
          // Dish IDs are scoped to their original review. Across reviews, only a
          // matching normalized title identifies the same dish.
          const details = { ...dish };
          delete details.history;
          delete details.firstVisitId;
          delete details.latestVisitId;
          return [
            {
              ...details,
              id: `${review.id.slice(0, 48)}:${dish.id}`.slice(0, 128),
              ...(history
                ? {
                    rating: history.rating,
                    photoPath: history.photoPath,
                    photoUrl: history.photoUrl,
                    thumbnailPath: history.thumbnailPath,
                    thumbnailUrl: history.thumbnailUrl,
                  }
                : {}),
            },
          ];
        }),
      }));
    })
    .sort(
      (a, b) =>
        a.visit.createdAt.localeCompare(b.visit.createdAt) ||
        a.visit.id.localeCompare(b.visit.id),
    );
  let merged: { dishes: Dish[]; visits: Visit[] } = { dishes: [], visits: [] };
  for (const event of events) {
    const changes = event.changes.map(
      (dish) =>
        Object.fromEntries(
          Object.entries(dish).filter(([, value]) => value !== undefined),
        ) as Dish,
    );
    merged = appendReviewVisit({ ...merged, changes, visit: event.visit });
  }
  const latest = events.at(-1)!;
  const result = {
    canonicalId: ordered[0]!.id,
    patch: {
      dishReviews: merged.dishes,
      dishNames: merged.dishes.map((dish) => dish.title),
      visits: merged.visits,
      visitCount: merged.visits.length,
      latestVisitAt: latest.visit.createdAt,
      previousRating: merged.visits.at(-2)!.rating,
      rating: latest.visit.rating,
      text: latest.visit.text,
      tags: latest.review.tags ?? [],
      tag: latest.review.tags?.[0] ?? null,
      isPinned: reviews.some((review) => review.isPinned),
      mergedReviewIds: ordered.slice(1).map((review) => review.id),
    },
  };
  if (
    merged.dishes.length > 500 ||
    Buffer.byteLength(JSON.stringify(result.patch)) > 700_000
  )
    throw new Error('Merged history exceeds the supported review size.');
  return result;
}
