import { describe, expect, it } from 'vitest';
import type { FeedItem, TasteRecommendation } from '@tastes/contracts';
import { tasteFeedInsertions } from '../src/features/taste-match/feedInsertions';

const card = (id: string, venueId: string, dishId: string) =>
  ({
    id,
    venue: { id: venueId },
    canonicalDishId: dishId,
  }) as TasteRecommendation;
const post = (id: number, venueId = 'other-' + id, dishId = 'known-' + id) =>
  ({
    id: String(id),
    venueId,
    dishReviews: [{ canonicalDishId: dishId }],
  }) as FeedItem;
describe('taste recommendation feed placement', () => {
  it('inserts after posts 2, 6 and 10 and does not repeat a served offering', () => {
    const cards = [
      card('one', 'a', 'pesto'),
      card('one', 'a', 'pesto'),
      card('two', 'b', 'pizza'),
      card('three', 'c', 'ragu'),
    ];
    const inserted = tasteFeedInsertions(
      Array.from({ length: 12 }, (_, i) => post(i)),
      cards,
    );
    expect([...inserted.keys()]).toEqual([1, 5, 9]);
    expect([...inserted.values()].map((c) => c.id)).toEqual([
      'one',
      'two',
      'three',
    ]);
  });
  it('skips an already shown dish/venue and an unknown-dish review at that venue', () => {
    const posts = [post(1, 'a', 'pesto'), { ...post(2, 'b'), dishReviews: [] }];
    const inserted = tasteFeedInsertions(posts, [
      card('a', 'a', 'pesto'),
      card('b', 'b', 'pizza'),
      card('c', 'c', 'ragu'),
    ]);
    expect(inserted.get(1)?.id).toBe('c');
  });
  it('does not invent placements without enough organic posts', () => {
    expect(
      tasteFeedInsertions([post(1)], [card('one', 'a', 'pesto')]).size,
    ).toBe(0);
  });
});
