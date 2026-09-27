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

export function fallbackReviewPhoto(
  photoUrls: Array<string | null | undefined>,
  reviewIndex: number,
  dishIndex: number,
): string | undefined {
  const usablePhotos = photoUrls.filter(
    (url): url is string => typeof url === 'string' && url.trim().length > 0,
  );
  if (usablePhotos.length === 0) return undefined;
  return usablePhotos[(reviewIndex + dishIndex) % usablePhotos.length];
}
