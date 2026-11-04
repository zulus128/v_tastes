'use strict';

const { assert, nonempty, fold, compareIds } = require('./utils');

class DishNormalizer {
  constructor({ version, dishes }, { aiResolver = null } = {}) {
    this.version = nonempty(version, 'taxonomy.version');
    assert(
      Array.isArray(dishes) && dishes.length > 0,
      'taxonomy.dishes must be a nonempty array',
    );
    this.dishes = new Map();
    this.aliases = new Map();
    this.aiResolver = aiResolver;
    for (const input of dishes) {
      const dish = {
        id: nonempty(input.id, 'dish.id'),
        name: nonempty(input.name, 'dish.name'),
        aliases: (input.aliases || []).map((a) => nonempty(a, 'dish.alias')),
      };
      assert(
        !this.dishes.has(dish.id),
        'Duplicate canonical dish ID: ' + dish.id,
      );
      this.dishes.set(dish.id, dish);
      for (const alias of [dish.name, ...dish.aliases]) {
        const normalized = fold(alias);
        assert(normalized, 'An alias must contain letters or numbers');
        const existing = this.aliases.get(normalized);
        assert(
          !existing || existing === dish.id,
          'Ambiguous approved alias: ' + alias,
        );
        this.aliases.set(normalized, dish.id);
      }
    }
  }

  get(id) {
    const dish = this.dishes.get(id);
    assert(dish, 'Unknown canonicalDishId: ' + id);
    return structuredClone(dish);
  }

  // Autocomplete only. Lexical similarity never authorizes an automatic merge.
  suggest(name, limit = 8) {
    const query = fold(name);
    if (!query) return [];
    const queryTokens = new Set(query.split(' '));
    return [...this.dishes.values()]
      .map((dish) => {
        const lexicalScore = Math.max(
          ...[dish.name, ...dish.aliases].map((alias) => {
            const text = fold(alias);
            const tokens = new Set(text.split(' '));
            const shared = [...queryTokens].filter((t) => tokens.has(t)).length;
            return Math.max(
              shared / (queryTokens.size + tokens.size - shared),
              text.startsWith(query) ? 0.9 : 0,
            );
          }),
        );
        return { canonicalDishId: dish.id, name: dish.name, lexicalScore };
      })
      .filter((d) => d.lexicalScore > 0)
      .sort(
        (a, b) =>
          b.lexicalScore - a.lexicalScore ||
          compareIds(a.canonicalDishId, b.canonicalDishId),
      )
      .slice(0, limit)
      .map(({ lexicalScore, ...dish }) => dish);
  }

  async resolve({ name = '', menuDescription = '', imageDataUrl = null }) {
    assert(
      typeof name === 'string' && name.length <= 200,
      'name must be text of at most 200 characters',
    );
    assert(
      typeof menuDescription === 'string' && menuDescription.length <= 2000,
      'menuDescription must be text of at most 2000 characters',
    );
    assert(name.trim() || imageDataUrl, 'Provide a dish name or image');
    if (imageDataUrl !== null) {
      assert(
        typeof imageDataUrl === 'string' &&
          imageDataUrl.length <= 6_000_000 &&
          /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
            imageDataUrl,
          ),
        'imageDataUrl must be a JPEG, PNG or WebP base64 data URL, at most 6 MB encoded',
      );
    }
    const canonicalDishId = this.aliases.get(fold(name));
    // Extra description/image can contradict a short name. Require confirmation
    // in that case instead of ignoring richer evidence (e.g. "vegan carbonara").
    if (canonicalDishId && !menuDescription.trim() && !imageDataUrl) {
      return {
        status: 'resolved',
        canonicalDishId,
        canonicalDishName: this.get(canonicalDishId).name,
        source: 'approved_alias',
        taxonomyVersion: this.version,
        rawName: name,
      };
    }
    const candidates = this.suggest(name);
    const unresolved = {
      status: 'needs_confirmation',
      canonicalDishId: null,
      taxonomyVersion: this.version,
      rawName: name,
      candidates,
      message:
        'Choose the exact dish or ask for a new canonical dish. No rating has been stored.',
    };
    if (!this.aiResolver) return { ...unresolved, source: 'autocomplete' };
    try {
      // Small reference taxonomy. For a large catalog replace this with a
      // curated candidate-retrieval service; the model may only suggest these IDs.
      const shortlist =
        this.dishes.size <= 100
          ? [...this.dishes.values()].map((d) => ({
              canonicalDishId: d.id,
              name: d.name,
            }))
          : candidates;
      const result = await this.aiResolver({
        name,
        menuDescription,
        imageDataUrl,
        candidates: shortlist,
      });
      if (result?.canonicalDishId != null) {
        assert(
          shortlist.some((d) => d.canonicalDishId === result.canonicalDishId),
          'AI returned a canonical ID outside the candidate set',
        );
        const proposed = {
          canonicalDishId: result.canonicalDishId,
          name: this.get(result.canonicalDishId).name,
        };
        unresolved.candidates = [
          proposed,
          ...candidates.filter(
            (d) => d.canonicalDishId !== proposed.canonicalDishId,
          ),
        ];
      }
      return {
        ...unresolved,
        source: 'ai_suggestion',
        message:
          'Confirm the exact dish. Photo and AI suggestions are never written automatically.',
      };
    } catch {
      return {
        ...unresolved,
        source: 'autocomplete',
        resolverUnavailable: true,
      };
    }
  }
}

module.exports = { DishNormalizer };
