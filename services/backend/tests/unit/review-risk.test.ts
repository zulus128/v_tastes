import { describe, expect, it } from 'vitest';
import {
  nearDuplicate,
  reviewRisk,
} from '../../functions/src/modules/reviews/risk';
const text =
  'The grilled fish was excellent with fresh herbs, tender vegetables, a rich sauce and warm bread. The service was attentive throughout our meal.';
const review = {
  id: 'one',
  authorId: 'a',
  venueId: 'v',
  text,
  createdAt: 10_000_000,
};
describe('manual review spam risk signals', () => {
  it('recognizes long copied text but does not flag short common phrases', () => {
    expect(nearDuplicate(text, text.toUpperCase())).toBe(true);
    expect(nearDuplicate('Great food!', 'Great food!')).toBe(false);
    expect(
      nearDuplicate(
        text,
        'We ordered soup. It arrived cold and lacked seasoning. The atmosphere and prices were reasonable, but the food needs work.',
      ),
    ).toBe(false);
    expect(
      reviewRisk(review, [review, { ...review, id: 'two', authorId: 'b' }], [])
        .queue,
    ).toBe(true);
  });
  it('does not flag a single shared-network visit or manufacture missing historical network data', () => {
    const reviews = ['a', 'b'].map((authorId) => ({
      ...review,
      authorId,
      id: authorId,
      text: '',
    }));
    const accounts = ['a', 'b'].map((id) => ({
      id,
      createdAt: review.createdAt - 1000,
      networkHash: 'network',
    }));
    expect(reviewRisk(reviews[0]!, reviews, accounts).queue).toBe(false);
    expect(
      reviewRisk(review, [review], [{ id: 'a', createdAt: 0 }]).queue,
    ).toBe(false);
  });
  it('queues coordinated new accounts on one network for humans without changing content', () => {
    const reviews = ['a', 'b', 'c'].map((authorId) => ({
      ...review,
      authorId,
      id: authorId,
      text: '',
    }));
    const accounts = ['a', 'b', 'c'].map((id) => ({
      id,
      createdAt: review.createdAt - 1000,
      networkHash: 'network',
    }));
    expect(reviewRisk(reviews[0]!, reviews, accounts)).toMatchObject({
      score: 70,
      queue: true,
    });
    expect(reviews.every((item) => item.text === '')).toBe(true);
  });
});
