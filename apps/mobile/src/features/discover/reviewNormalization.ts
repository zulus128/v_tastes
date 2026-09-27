import type { PlaceReview } from '@tastes/contracts';

function isPlaceReview(value: unknown): value is PlaceReview {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

export function normalizePlaceReviewPage(page: unknown): PlaceReview[] {
  const items = Array.isArray(page)
    ? page
    : typeof page === 'object' && page !== null
      ? (page as { items?: unknown }).items
      : [];
  return Array.isArray(items)
    ? items.filter(isPlaceReview).map((review) => ({
        ...review,
        // Production contains reviews written before these arrays were added.
        // Normalize them at the API boundary so every Place card stays safe.
        dishNames: Array.isArray(review.dishNames) ? review.dishNames : [],
        dishReviews: Array.isArray(review.dishReviews)
          ? review.dishReviews.map((dish) => ({
              ...dish,
              photoPath:
                typeof dish.photoPath === 'string' ? dish.photoPath : '',
            }))
          : [],
        tags: Array.isArray(review.tags) ? review.tags : [],
      }))
    : [];
}
