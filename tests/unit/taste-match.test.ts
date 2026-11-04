import { describe, expect, it } from 'vitest';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { TasteMatchEngine } from '../../services/backend/functions/src/modules/taste-match/reference/engine';
import { DishCatalog } from '../../services/backend/functions/src/modules/taste-match/catalog';
import { projectDishRatings } from '../../services/backend/functions/src/modules/taste-match/projection';
import type {
  Engine,
  EngineInput,
} from '../../services/backend/functions/src/modules/taste-match/types';
import source from './taste-match-fixture.json';

const NOW = Date.UTC(2026, 10, 4);
function fixture(): EngineInput {
  return {
    ...structuredClone(source),
    clock: () => NOW,
  } as unknown as EngineInput;
}
const construct = TasteMatchEngine as unknown as new (
  data: EngineInput,
) => Engine;
const recommend = (
  data = fixture(),
  uid = 'winston',
  novelty: 'canonical_dish' | 'dish_at_venue' = 'canonical_dish',
) => new construct(data).recommend(uid, { city: 'Rome', novelty, limit: 10 });

describe('Anton taste matching reference wired to Tastes', () => {
  it('matches shared dishes across different venues and recommends a specific new dish/venue', () => {
    const result = recommend();
    expect(result.state).toBe('personalized');
    expect(result.matchedUserCount).toBeGreaterThanOrEqual(3);
    const pesto = result.recommendations.find(
      (c) => c.canonicalDishId === 'pesto-pasta' && c.venue.id === 'casa-verde',
    );
    expect(pesto?.tier).toBe('taste_match');
    expect(pesto?.supporterCount).toBe(3);
    expect(pesto?.explanation.headline).toContain('similar dish ratings');
    expect(pesto?.explanation.connection).toContain('both rated');
  });
  it('does not turn social following into a qualified match when fewer than five distinct dishes are rated', () => {
    const data = fixture();
    data.ratings = data.ratings.filter(
      (r) =>
        r.userId !== 'winston' ||
        ['cacio-e-pepe', 'tiramisu'].includes(r.canonicalDishId),
    );
    const result = recommend(data);
    expect(result.state).toBe('cold_start');
    expect(result.distinctRatedDishes).toBe(2);
    expect(result.recommendations.some((c) => c.tier === 'taste_match')).toBe(
      false,
    );
    expect(result.recommendations.some((c) => c.tier === 'social')).toBe(true);
  });
  it('does not count the same canonical dish at many venues as distinct matching evidence', () => {
    const data = fixture();
    data.ratings = data.ratings.filter(
      (r) => r.userId !== 'winston' || r.canonicalDishId === 'cacio-e-pepe',
    );
    const vote = data.ratings.find((r) => r.userId === 'winston')!;
    for (let i = 0; i < 5; i++)
      data.ratings.push({
        ...vote,
        id: 'duplicate-' + i,
        venueId: data.venues[i]!.id,
        ratedAt: NOW - i * 1000,
      });
    const result = recommend(data);
    expect(result.distinctRatedDishes).toBe(1);
    expect(result.matchedUserCount).toBe(0);
  });
  it('keeps negative matched ratings in the offering average and vetoes it in every fallback tier', () => {
    const data = fixture();
    const vote = data.ratings.find(
      (r) => r.userId === 'sofia' && r.canonicalDishId === 'pesto-pasta',
    )!;
    vote.rating = 0.5;
    expect(
      recommend(data).recommendations.some(
        (c) =>
          c.canonicalDishId === 'pesto-pasta' && c.venue.id === 'casa-verde',
      ),
    ).toBe(false);
  });
  it('enforces bilateral blocks, private ratings, inactive venues and locality', () => {
    const data = fixture();
    data.relationships.push({
      type: 'block',
      fromUserId: 'sofia',
      toUserId: 'winston',
    });
    data.ratings.forEach((r) => {
      if (r.userId === 'marco') r.visibility = 'private';
    });
    data.venues.find((v) => v.id === 'osteria-luna')!.active = false;
    const result = recommend(data);
    expect(JSON.stringify(result.recommendations)).not.toContain('Sofia');
    expect(JSON.stringify(result.recommendations)).not.toContain('Marco');
    expect(
      result.recommendations.every((c) => c.venue.id !== 'osteria-luna'),
    ).toBe(true);
  });
  it('uses canonical novelty by default and allows an untried version at another venue only in explicit venue mode', () => {
    const data = fixture(),
      vote = data.ratings.find(
        (r) => r.userId === 'sofia' && r.canonicalDishId === 'pesto-pasta',
      )!;
    data.ratings.push({
      ...vote,
      id: 'own-pesto',
      userId: 'winston',
      venueId: 'first-table',
    });
    expect(
      recommend(data).recommendations.some(
        (c) => c.canonicalDishId === 'pesto-pasta',
      ),
    ).toBe(false);
    expect(
      recommend(data, 'winston', 'dish_at_venue').recommendations.some(
        (c) =>
          c.canonicalDishId === 'pesto-pasta' && c.venue.id === 'casa-verde',
      ),
    ).toBe(true);
  });
  it('accepts the app’s 0.5-star scale without rejecting a profile or hiding disagreement', () => {
    const data = fixture();
    data.ratings.find(
      (r) => r.userId === 'winston' && r.canonicalDishId === 'mushroom-risotto',
    )!.rating = 0.5;
    expect(() => recommend(data)).not.toThrow();
  });
});

describe('canonical dish boundary and projection', () => {
  const catalog = new DishCatalog(source.taxonomy.dishes);
  it('resolves only approved exact aliases and keeps ingredient variants separate', () => {
    expect(catalog.resolve('Pasta Carbonara')?.id).toBe('carbonara');
    expect(catalog.resolve('vegan carbonara')?.id).toBe('vegan-carbonara');
    expect(catalog.resolve('carbonara with truffle')).toBeUndefined();
    expect(catalog.resolve('fish with lemon')).toBeUndefined();
  });
  it('requires confirmation for a non-exact selection, and rejects duplicate canonical dishes in a visit', () => {
    const dish = {
      id: 'one',
      title: 'fish with lemon',
      rating: 4.5,
      canonicalDishId: 'lemon-sea-bass',
    };
    expect(() => catalog.confirm([dish])).toThrow('Confirm the exact dish');
    expect(
      catalog.confirm([{ ...dish, canonicalDishConfirmed: true }])[0]
        ?.canonicalDishId,
    ).toBe('lemon-sea-bass');
    expect(() =>
      catalog.confirm([
        { id: 'a', title: 'carbonara', rating: 4 },
        { id: 'b', title: 'pasta carbonara', rating: 5 },
      ]),
    ).toThrow('once per visit');
  });
  function snapshot(data: Record<string, unknown>): DocumentSnapshot {
    return {
      id: 'review',
      exists: true,
      get: (key: string) => data[key],
    } as unknown as DocumentSnapshot;
  }
  it('takes real dish ratings and latest visit decisions rather than venue ratings or text-edit freshness', () => {
    const review = snapshot({
      authorId: 'person',
      venueId: 'place',
      status: 'published',
      rating: 5,
      createdAt: NOW - 200_000,
      updatedAt: NOW,
      dishReviews: [
        {
          id: 'd',
          title: 'carbonara',
          rating: 0.5,
          ratedAt: new Date(NOW - 100_000).toISOString(),
          history: [
            { rating: 0.5, createdAt: new Date(NOW - 1000).toISOString() },
          ],
        },
        { id: 'unknown', title: 'unresolved fish', rating: 5 },
      ],
    });
    const result = projectDishRatings(review, catalog, NOW);
    expect(result.ratings).toHaveLength(1);
    expect(result.ratings[0]).toMatchObject({
      rating: 0.5,
      canonicalDishId: 'carbonara',
      ratedAt: NOW - 1000,
    });
    expect(result.unresolved).toEqual(['unresolved fish']);
  });
  it('removes hidden and archived reviews from evidence and ignores invalid/future dish votes', () => {
    const base = {
      authorId: 'person',
      venueId: 'place',
      createdAt: NOW + 1,
      dishReviews: [{ id: 'd', title: 'carbonara', rating: 5 }],
    };
    for (const more of [
      { status: 'hidden' },
      { status: 'published', mergedIntoReviewId: 'other' },
      { status: 'published' },
    ])
      expect(
        projectDishRatings(snapshot({ ...base, ...more }), catalog, NOW)
          .ratings,
      ).toEqual([]);
  });
});
