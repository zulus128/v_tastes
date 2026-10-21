import { describe, expect, it } from 'vitest';
import { profileReviewFilterSummary } from '../src/features/profile/profileReviewFilters';

describe('profileReviewFilterSummary', () => {
  it('formats a single active filter', () => {
    expect(
      profileReviewFilterSummary({
        filterCount: 1,
        totalCount: 5,
        visibleCount: 3,
      }),
    ).toBe('3 of 5 reviews · 1 filter');
  });

  it('pluralizes multiple active filters', () => {
    expect(
      profileReviewFilterSummary({
        filterCount: 2,
        totalCount: 8,
        visibleCount: 4,
      }),
    ).toBe('4 of 8 reviews · 2 filters');
  });
});
