import { createHash } from 'node:crypto';
import type { CanonicalDish, DishReviewInput } from '@tastes/contracts';
import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import starterDishes from './starter-catalog.json';

export const TAXONOMY_VERSION = 'tastes-canonical-v1';
export const foldDishName = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');

/** Exact approved aliases only. Extra ingredients/variants never fuzzy-merge. */
export class DishCatalog {
  readonly dishes = new Map<string, CanonicalDish>();
  readonly aliases = new Map<string, string>();
  constructor(dishes: CanonicalDish[]) {
    for (const dish of dishes) {
      if (this.dishes.has(dish.id)) throw new Error('Duplicate canonical dish');
      this.dishes.set(dish.id, dish);
      for (const name of [dish.name, ...dish.aliases]) {
        const alias = foldDishName(name),
          previous = this.aliases.get(alias);
        if (!alias || (previous && previous !== dish.id))
          throw new Error('Conflicting canonical aliases');
        this.aliases.set(alias, dish.id);
      }
    }
  }
  resolve(title: string): CanonicalDish | undefined {
    return this.dishes.get(this.aliases.get(foldDishName(title)) ?? '');
  }
  suggest(query: string, limit: number): CanonicalDish[] {
    const folded = foldDishName(query),
      words = folded.split(' ').filter(Boolean);
    return [...this.dishes.values()]
      .map((dish) => {
        const score = Math.max(
          ...[dish.name, ...dish.aliases].map((name) => {
            const text = foldDishName(name);
            return text === folded
              ? 100
              : text.startsWith(folded)
                ? 20
                : words.filter((w) => text.split(' ').includes(w)).length;
          }),
        );
        return { dish, score };
      })
      .filter((x) => !folded || x.score > 0)
      .sort((a, b) => b.score - a.score || a.dish.id.localeCompare(b.dish.id))
      .slice(0, limit)
      .map((x) => x.dish);
  }
  confirm<T extends DishReviewInput>(dishes: T[]): T[] {
    const seen = new Set<string>();
    return dishes.map((dish) => {
      const canonical = dish.canonicalDishId
        ? this.dishes.get(dish.canonicalDishId)
        : this.resolve(dish.title);
      if (
        dish.canonicalDishId &&
        (!canonical ||
          (!dish.canonicalDishConfirmed &&
            this.resolve(dish.title)?.id !== canonical.id))
      )
        throw new HttpsError(
          'invalid-argument',
          'Confirm the exact dish before selecting a canonical match.',
        );
      if (!canonical) return dish;
      if (seen.has(canonical.id))
        throw new HttpsError(
          'invalid-argument',
          'Choose each canonical dish only once per visit.',
        );
      seen.add(canonical.id);
      return {
        ...dish,
        canonicalDishId: canonical.id,
        canonicalDishConfirmed: true,
        canonicalDishName: canonical.name,
        taxonomyVersion: TAXONOMY_VERSION,
      };
    });
  }
}

/** Explicit inactive rows may retire starter entries. No fictional ratings are seeded. */
export async function loadDishCatalog(db: Firestore): Promise<DishCatalog> {
  const snapshot = await db.collection('_canonicalDishes').limit(2001).get();
  if (snapshot.size > 2000)
    throw new HttpsError(
      'resource-exhausted',
      'Canonical catalogue needs pagination before expansion.',
    );
  const dishes = new Map(starterDishes.map((d) => [d.id, d as CanonicalDish]));
  for (const doc of snapshot.docs) {
    if (doc.get('status') !== 'active') {
      dishes.delete(doc.id);
      continue;
    }
    const name = doc.get('name'),
      aliases = doc.get('aliases');
    if (
      typeof name !== 'string' ||
      !Array.isArray(aliases) ||
      !aliases.every((a) => typeof a === 'string')
    )
      throw new Error('Invalid approved canonical catalogue entry');
    dishes.set(doc.id, { id: doc.id, name, aliases });
  }
  return new DishCatalog([...dishes.values()]);
}

export function normalizationRequestId(name: string): string {
  return createHash('sha256').update(foldDishName(name)).digest('hex');
}
