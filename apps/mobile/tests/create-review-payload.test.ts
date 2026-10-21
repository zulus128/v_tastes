import { describe, expect, it } from 'vitest';
import { dishReviewPayload } from '../src/features/create-review/reviewPayload';

describe('dishReviewPayload', () => {
  it('keeps a dish review valid when the optional photo is omitted', () => {
    expect(
      dishReviewPayload({
        id: 'dish-1',
        rating: 4.5,
        title: '  Tagliolini  ',
      }),
    ).toEqual({
      id: 'dish-1',
      rating: 4.5,
      title: 'Tagliolini',
    });
  });
});
