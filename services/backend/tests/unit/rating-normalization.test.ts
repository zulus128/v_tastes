import { describe, expect, it } from 'vitest';
import { createReviewInputSchema } from '@tastes/contracts';
import {
  normalizeIndividualRating,
  reviewRatingPatch,
} from '../../functions/src/modules/reviews/rating-normalization';

describe('founder-approved individual rating scale', () => {
  it('accepts the half-star minimum and normalizes legacy decimal submissions', () => {
    const input = {
      idempotencyKey: 'half-star-draft-0001',
      venueId: 'venue',
      text: 'A review',
      rating: 0.5,
      dishReviews: [{ id: 'dish', title: 'Soup', rating: 4.7 }],
    };
    expect(createReviewInputSchema.parse(input)).toMatchObject({
      rating: 0.5,
      dishReviews: [{ rating: 4.5 }],
    });
    expect(
      createReviewInputSchema.parse({ ...input, rating: 4.3 }).rating,
    ).toBe(4.5);
    expect(
      createReviewInputSchema.safeParse({ ...input, rating: 0 }).success,
    ).toBe(false);
  });
  it('normalizes nested visit and dish histories without changing text or photos', () => {
    const original = {
      rating: 4.3,
      previousRating: 3.2,
      text: 'Keep me',
      dishReviews: [
        {
          id: 'dish',
          title: 'Pasta',
          rating: 4.9,
          photoPath: 'keep/photo',
          history: [
            {
              visitId: 'first',
              rating: 3.7,
              photoUrl: 'https://example.com/old.jpg',
            },
          ],
        },
      ],
      visits: [{ id: 'first', rating: 3.2, text: 'Earlier text' }],
    };
    const patch = reviewRatingPatch(original);
    const normalized = { ...original, ...patch };
    expect(normalized).toMatchObject({
      rating: 4.5,
      previousRating: 3,
      text: 'Keep me',
      dishReviews: [
        {
          rating: 5,
          photoPath: 'keep/photo',
          history: [{ rating: 3.5, photoUrl: 'https://example.com/old.jpg' }],
        },
      ],
      visits: [{ rating: 3, text: 'Earlier text' }],
    });
    expect(reviewRatingPatch(normalized)).toEqual({});
    expect(original.rating).toBe(4.3);
  });
  it.each([undefined, NaN, Infinity, 0, -1, 5.1])(
    'refuses invalid values instead of inventing a score: %s',
    (value) => {
      expect(() => normalizeIndividualRating(value)).toThrow();
    },
  );
});
