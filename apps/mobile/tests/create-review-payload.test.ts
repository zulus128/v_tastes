import { describe, expect, it } from 'vitest';
import { dishReviewPayload } from '../src/features/create-review/reviewPayload';
import { updateDishReviewDraft } from '../src/features/create-review/dishDraft';

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

describe('updateDishReviewDraft', () => {
  it('preserves a selected photo across later title and rating updates', () => {
    const initial = {
      id: 'dish-1',
      photoUri: '',
      rating: 0,
      title: '',
    };
    const withPhoto = updateDishReviewDraft(initial, {
      photoUri: 'file:///selected-dish.jpg',
    });
    const withTitle = updateDishReviewDraft(withPhoto, { title: 'Waffles' });
    const completed = updateDishReviewDraft(withTitle, { rating: 5 });

    expect(completed).toEqual({
      id: 'dish-1',
      photoUri: 'file:///selected-dish.jpg',
      rating: 5,
      title: 'Waffles',
    });
  });
});
