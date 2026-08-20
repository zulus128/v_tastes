import { describe, expect, it } from 'vitest';
import {
  calculateRecommendationMatch,
  isRecommendation,
} from '../../functions/src/modules/discover/recommendations';

describe('recommendation matching', () => {
  it('does not recommend an unrelated highly rated restaurant', () => {
    const match = calculateRecommendationMatch({
      favoriteCuisines: [],
      favoriteDish: 'salad',
      rating: 4.7,
      searchableText: 'Wasabi by Morimoto Japanese Omakase Salmon nigiri',
    });

    expect(match).toEqual({
      cuisineMatch: false,
      dishMatch: false,
      matchPercent: 19,
      preferenceMatched: false,
      ratingPoints: 19,
    });
    expect(isRecommendation(match)).toBe(false);
  });

  it('recommends a restaurant that matches a saved cuisine', () => {
    const match = calculateRecommendationMatch({
      favoriteCuisines: ['Japanese'],
      favoriteDish: 'salad',
      rating: 4.7,
      searchableText: 'Wasabi by Morimoto Japanese Omakase',
    });

    expect(match.matchPercent).toBe(69);
    expect(match.cuisineMatch).toBe(true);
    expect(isRecommendation(match)).toBe(true);
  });

  it('uses tags and popular dishes for favorite-dish matching', () => {
    const match = calculateRecommendationMatch({
      favoriteCuisines: [],
      favoriteDish: 'salad',
      rating: 4.5,
      searchableText: 'Green Table Healthy Fresh Caesar salad',
    });

    expect(match.matchPercent).toBe(48);
    expect(match.dishMatch).toBe(true);
    expect(isRecommendation(match)).toBe(true);
  });

  it('caps venue quality at twenty points', () => {
    expect(calculateRecommendationMatch({
      favoriteCuisines: ['Japanese'],
      favoriteDish: 'Omakase',
      rating: 99,
      searchableText: 'Japanese Omakase',
    }).matchPercent).toBe(100);
  });
});
