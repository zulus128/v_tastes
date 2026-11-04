import { describe, it, expect } from 'vitest';
import { mergeHistoricalReviews } from '../../functions/src/modules/reviews/merge-history';

const first = {
  id: 'first',
  authorId: 'author',
  venueId: 'venue',
  createdAt: '2026-03-01T12:00:00Z',
  rating: 4,
  text: 'First visit text',
  tags: ['casual'],
  dishReviews: [
    { id: 'one', title: 'Pasta', rating: 4, photoPath: 'original/pasta' },
  ],
};
const second = {
  ...first,
  id: 'second',
  createdAt: '2026-04-01T12:00:00Z',
  rating: 5,
  text: 'Second visit text',
  isPinned: true,
  dishReviews: [
    { id: 'different', title: ' pasta ', rating: 5 },
    { id: 'one', title: 'Soup', rating: 3, photoPath: 'new/soup' },
  ],
};
describe('historical review consolidation', () => {
  it('preserves texts, photos, dish identity and chronology regardless of input order', () => {
    const forward = mergeHistoricalReviews([first, second]);
    expect(mergeHistoricalReviews([second, first])).toEqual(forward);
    expect(forward.canonicalId).toBe('first');
    expect(forward.patch).toMatchObject({
      visitCount: 2,
      previousRating: 4,
      rating: 5,
      text: second.text,
      isPinned: true,
    });
    expect(forward.patch.visits.map((visit) => visit.text)).toEqual([
      first.text,
      second.text,
    ]);
    expect(forward.patch.dishReviews).toHaveLength(2);
    const pasta = forward.patch.dishReviews.find(
      (dish) => dish.title.trim() === 'pasta',
    );
    expect(pasta).toMatchObject({ rating: 5, photoPath: 'original/pasta' });
    expect(pasta?.history?.map((entry) => entry.rating)).toEqual([4, 5]);
    expect(pasta?.history?.[0]?.photoPath).toBe('original/pasta');
    expect(new Set(forward.patch.dishReviews.map((dish) => dish.id)).size).toBe(
      2,
    );
  });
  it('preserves visits and photos already recorded on revised reviews', () => {
    const revised = {
      ...first,
      visits: [
        {
          id: 'march',
          createdAt: first.createdAt,
          rating: 3,
          text: 'Original',
        },
        {
          id: 'later',
          createdAt: '2026-03-15T12:00:00Z',
          rating: 4,
          text: 'Returned',
        },
      ],
      dishReviews: [
        {
          ...first.dishReviews[0]!,
          history: [
            {
              visitId: 'march',
              createdAt: first.createdAt,
              rating: 3,
              photoPath: 'older/pasta',
            },
            {
              visitId: 'later',
              createdAt: '2026-03-15T12:00:00Z',
              rating: 4,
              photoPath: 'original/pasta',
            },
          ],
        },
      ],
    };
    const result = mergeHistoricalReviews([revised, second]);
    expect(result.patch.visits.map((visit) => visit.text)).toEqual([
      'Original',
      'Returned',
      second.text,
    ]);
    const pasta = result.patch.dishReviews.find(
      (dish) => dish.title.trim() === 'pasta',
    );
    expect(pasta?.history?.map((entry) => entry.rating)).toEqual([3, 4, 5]);
    expect(pasta?.history?.[0]?.photoPath).toBe('older/pasta');
  });
  it('refuses reviews belonging to another author or venue', () => {
    expect(() =>
      mergeHistoricalReviews([first, { ...second, authorId: 'other' }]),
    ).toThrow('same author');
    expect(() =>
      mergeHistoricalReviews([first, { ...second, venueId: 'other' }]),
    ).toThrow('same author');
  });
});
