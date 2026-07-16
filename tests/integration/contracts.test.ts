import {
  createReviewInputSchema,
  createUserProfileInputSchema,
  reactToReviewInputSchema,
} from '@tastes/contracts';
import { describe, expect, it } from 'vitest';

describe('public API contracts', () => {
  it('accepts a valid review', () => {
    expect(createReviewInputSchema.parse({
      venueId: 'demo-cafe',
      rating: 5,
      text: 'Great place',
    })).toEqual({ venueId: 'demo-cafe', rating: 5, text: 'Great place' });
  });

  it('rejects protected or malformed input', () => {
    expect(createReviewInputSchema.safeParse({
      authorId: 'someone-else',
      venueId: 'demo-cafe',
      rating: 100,
      text: '',
    }).success).toBe(false);
  });

  it('normalizes profile and reaction commands', () => {
    expect(createUserProfileInputSchema.parse({ displayName: '  Demo User  ' }).displayName).toBe('Demo User');
    expect(reactToReviewInputSchema.parse({ reviewId: 'review-1', reaction: 'like' })).toEqual({
      reviewId: 'review-1',
      reaction: 'like',
    });
  });
});
