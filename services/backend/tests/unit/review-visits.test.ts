import { describe, expect, it } from 'vitest';
import { appendReviewVisit } from '../../functions/src/modules/reviews/visits';

const first = {
  id: 'march',
  createdAt: '2026-03-01T12:00:00Z',
  rating: 4,
  text: 'First visit',
};
const latest = {
  id: 'october',
  createdAt: '2026-10-21T12:00:00Z',
  rating: 4.5,
  text: 'Returned',
};
const tuna = {
  id: 'tuna',
  title: 'Tuna Tartare',
  rating: 4.5,
  firstVisitId: first.id,
  latestVisitId: first.id,
  photoPath: 'review-images/user/first/tuna',
  history: [{ visitId: first.id, createdAt: first.createdAt, rating: 4.5 }],
};

describe('repeat visit dish history', () => {
  it('keeps one dish when its title is reused with another draft ID', () => {
    const result = appendReviewVisit({
      dishes: [tuna],
      visits: [first],
      visit: latest,
      changes: [
        { id: 'draft-tuna', title: ' tuna tartare ', rating: 4 },
        { id: 'pasta', title: 'Pasta', rating: 5 },
      ],
    });
    expect(result.dishes.map((dish) => dish.id)).toEqual(['pasta', 'tuna']);
    expect(result.dishes[1]).toMatchObject({
      rating: 4,
      firstVisitId: 'march',
      latestVisitId: 'october',
      photoPath: tuna.photoPath,
    });
    expect(result.dishes[1].history?.map((rating) => rating.rating)).toEqual([
      4.5, 4,
    ]);
    expect(result.visits).toEqual([first, latest]);
    expect(tuna.rating).toBe(4.5);
  });

  it('records an unchanged rating as another visit without duplicating the dish', () => {
    const result = appendReviewVisit({
      dishes: [tuna],
      visits: [first],
      visit: latest,
      changes: [{ id: 'tuna', title: tuna.title, rating: tuna.rating }],
    });
    expect(result.dishes).toHaveLength(1);
    expect(result.dishes[0].history).toHaveLength(2);
    expect(result.dishes[0].latestVisitId).toBe('october');
  });

  it('retains dishes that were not ordered again and does not invent history', () => {
    const result = appendReviewVisit({
      dishes: [tuna],
      visits: [first],
      visit: latest,
      changes: [],
    });
    expect(result.dishes[0]).toEqual(tuna);
    expect(result.visits).toHaveLength(2);
  });

  it('does not keep the previous download URL after a new photo upload', () => {
    const result = appendReviewVisit({
      dishes: [{ ...tuna, photoUrl: 'https://example.com/old.jpg' }],
      visits: [first],
      visit: latest,
      changes: [
        {
          id: 'tuna',
          title: tuna.title,
          rating: 4,
          photoPath: 'review-images/user/october/tuna',
        },
      ],
    });
    expect(result.dishes[0].photoUrl).toBeUndefined();
    expect(result.dishes[0].photoPath).toContain('october');
  });

  it('rejects duplicate dishes in one visit', () => {
    expect(() =>
      appendReviewVisit({
        dishes: [tuna],
        visits: [first],
        visit: latest,
        changes: [tuna, { ...tuna, id: 'second', title: ' TUNA TARTARE ' }],
      }),
    ).toThrow('only once');
  });
});
