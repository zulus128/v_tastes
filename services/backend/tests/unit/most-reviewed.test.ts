import type { Venue } from '@tastes/contracts';
import { describe, expect, it } from 'vitest';
import { rankMostReviewed } from '../../functions/src/modules/discover/mostReviewed';

function venue(
  id: string,
  city: string,
  reviewCount: number,
  rating?: number,
): Venue {
  return { id, name: id, city, status: 'active', reviewCount, rating };
}

describe('most reviewed ranking (T-012)', () => {
  const venues = [
    venue('b', 'Monaco', 10, 4.2),
    venue('a', 'Monaco', 10, 4.2),
    venue('c', 'monaco', 10, 4.8),
    venue('d', 'Istanbul', 40, 4.0),
    venue('e', 'Monaco', 0, 5.0),
  ];

  it('ranks by review count with rating then venue ID as tie-breakers', () => {
    expect(rankMostReviewed(venues, null, 6).map((item) => item.id)).toEqual([
      'd',
      'c',
      'a',
      'b',
    ]);
  });

  it('scopes the ranking to the viewer city', () => {
    expect(
      rankMostReviewed(venues, 'monaco', 6).map((item) => item.id),
    ).toEqual(['c', 'a', 'b']);
  });

  it('does not substitute foreign venues for a city without reviews', () => {
    expect(rankMostReviewed(venues, 'Paris', 2).map((item) => item.id)).toEqual(
      [],
    );
  });

  it('excludes venues without Tastes reviews', () => {
    expect(
      rankMostReviewed(venues, null, 6).some((item) => item.id === 'e'),
    ).toBe(false);
  });
});

it('shrinks sparse venue ratings toward a neutral prior', async () => {
  const { ratingConfidence } =
    await import('../../functions/src/modules/discover/mostReviewed');
  expect(ratingConfidence({ rating: 5, reviewCount: 1 })).toBeLessThan(
    ratingConfidence({ rating: 4.5, reviewCount: 100 }),
  );
  expect(ratingConfidence({ rating: 5, reviewCount: 0 })).toBe(0);
  expect(ratingConfidence({ rating: 4.5, reviewCount: 10 })).toBe(3.75);
});
