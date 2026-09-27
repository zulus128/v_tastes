import { describe, expect, it } from 'vitest';
import {
  fallbackReviewPhoto,
  normalizePlaceReviewPage,
} from '../src/features/discover/reviewNormalization';

describe('place review normalization', () => {
  it('keeps legacy reviews renderable when array fields are absent', () => {
    const [review] = normalizePlaceReviewPage({
      items: [
        {
          id: 'legacy-review',
          authorId: 'legacy-author',
          authorDisplayName: 'Legacy reviewer',
          authorUsername: null,
          authorPhotoUrl: null,
          venueCity: 'Istanbul',
          cuisine: 'Japanese',
          rating: 4.8,
          text: 'A persisted review from before tags and dishes were added.',
          reactionCount: 0,
          commentCount: 0,
          createdAt: '2026-09-01T12:00:00.000Z',
          tag: null,
          dishReviews: [
            {
              id: 'legacy-dish',
              title: 'Salmon nigiri',
              rating: 4.8,
              photoPath: null,
            },
          ],
        },
      ],
    });

    expect(review.tags).toEqual([]);
    expect(review.dishNames).toEqual([]);
    expect(review.dishReviews).toEqual([
      {
        id: 'legacy-dish',
        title: 'Salmon nigiri',
        rating: 4.8,
        photoPath: '',
      },
    ]);
  });

  it('ignores malformed review entries', () => {
    expect(normalizePlaceReviewPage({ items: [null, {}, { id: 42 }] })).toEqual(
      [],
    );
  });

  it('rotates venue photos as fallbacks for legacy dish reviews', () => {
    const photos = ['', 'sushi.jpg', null, 'restaurant.png'];

    expect(fallbackReviewPhoto(photos, 0, 0)).toBe('sushi.jpg');
    expect(fallbackReviewPhoto(photos, 1, 0)).toBe('restaurant.png');
    expect(fallbackReviewPhoto(photos, 1, 1)).toBe('sushi.jpg');
    expect(fallbackReviewPhoto([], 0, 0)).toBeUndefined();
  });
});
