'use strict';

const {
  assert,
  nonempty,
  numeric,
  timestamp,
  keyOf,
  clamp,
  DAY,
  decay,
} = require('./utils');
const TRAIT_VERSION = 'dish-traits-v1';
const TRAITS = Object.freeze({
  'cuisine.italian': 'Italian culinary preparation',
  'cuisine.spanish': 'Spanish culinary preparation',
  'cuisine.french': 'French culinary preparation',
  'cuisine.japanese': 'Japanese culinary preparation',
  'cuisine.chinese': 'Chinese culinary preparation',
  'cuisine.mexican': 'Mexican culinary preparation',
  'cuisine.korean': 'Korean culinary preparation',
  'cuisine.indian': 'Indian culinary preparation',
  'ingredient.starchy':
    'Pasta, rice, bread or potato is a substantial component',
  'ingredient.dairy':
    'Dairy is a substantial ingredient; not an allergen guarantee',
  'ingredient.egg': 'Egg is an ingredient',
  'ingredient.red_meat': 'Red meat is a substantial component',
  'ingredient.poultry': 'Poultry is a substantial component',
  'ingredient.seafood': 'Seafood is a substantial component',
  'ingredient.mushroom': 'Mushrooms are substantial, not a trace garnish',
  'ingredient.leafy_greens': 'Leafy vegetables are substantial, not a garnish',
  'ingredient.vegetable_forward':
    'Vegetables dominate the dish; herbs or sauce alone do not qualify',
  'ingredient.nuts': 'Nuts are an ingredient; not an allergen guarantee',
  'flavor.herbaceous': 'Prominent herb flavor',
  'flavor.spicy': 'Prominent chili heat',
  'flavor.peppery': 'Prominent black pepper flavor',
  'flavor.sweet': 'Predominantly sweet',
  'flavor.acidic': 'Prominent citrus, vinegar or sour flavor',
  'flavor.smoky': 'Prominent smoke flavor',
  'preparation.fried': 'Fried preparation is supported by the recipe',
  'preparation.grilled': 'Grilled preparation is supported by the recipe',
  'preparation.roasted': 'Roasted preparation is supported by the recipe',
  'preparation.steamed': 'Steamed preparation is supported by the recipe',
  'preparation.raw': 'Served without cooking substantial primary ingredients',
  'richness.oily':
    'Oil or rendered fat is prominent by quantity/technique; a little oil does not qualify',
  'richness.creamy': 'Creamy texture, not proof of cream or dairy',
  'texture.crispy': 'Crisp texture is supported by preparation',
});

function sourceUrl(value) {
  const u = new URL(nonempty(value, 'source URL', 2000));
  assert(
    u.protocol === 'https:' && !u.username && !u.password,
    'Sources must use credential-free HTTPS',
  );
  // URLs are stored, never fetched by this module. The researcher uses provider web search.
  assert(
    !['localhost', '127.0.0.1', '::1'].includes(u.hostname),
    'Source must be a public reference',
  );
  u.hash = '';
  return u.href;
}
function validateProfile(
  input,
  { now, taxonomyVersion, knownDish, knownVenue },
) {
  assert(input && typeof input === 'object', 'Dish profile is required');
  const canonicalDishId = nonempty(input.canonicalDishId, 'canonicalDishId');
  knownDish(canonicalDishId);
  const venueId = input.venueId ?? null;
  assert(venueId === null || knownVenue(venueId), 'Unknown profile venue');
  assert(
    ['canonical_typical', 'venue_verified'].includes(input.scope),
    'Invalid evidence scope',
  );
  assert(
    (input.scope === 'venue_verified') === (venueId !== null),
    'Venue evidence must be scoped to one offering',
  );
  assert(
    input.taxonomyVersion === taxonomyVersion,
    'Profile taxonomy mismatch',
  );
  assert(input.traitVersion === TRAIT_VERSION, 'Profile vocabulary mismatch');
  const researchedAt = timestamp(input.researchedAt, 'researchedAt');
  const expiresAt = timestamp(input.expiresAt, 'expiresAt');
  assert(
    researchedAt <= now &&
      expiresAt > researchedAt &&
      expiresAt - researchedAt <= 180 * DAY,
    'Invalid profile freshness',
  );
  assert(
    Array.isArray(input.sources) && input.sources.length <= 12,
    'At most 12 sources',
  );
  const sources = input.sources.map((s) => ({
    url: sourceUrl(s.url),
    title: nonempty(s.title, 'source title', 300),
    kind: ['recipe', 'venue_menu'].includes(s.kind)
      ? s.kind
      : (() => {
          throw new TypeError('Invalid source kind');
        })(),
  }));
  assert(
    input.scope !== 'venue_verified' ||
      sources.some((s) => s.kind === 'venue_menu'),
    'Venue traits require venue-menu evidence',
  );
  assert(
    Array.isArray(input.traits) && input.traits.length <= 24,
    'At most 24 traits',
  );
  const used = new Set();
  const traits = input.traits.map((t) => {
    assert(
      Object.hasOwn(TRAITS, t.tag) && !used.has(t.tag),
      'Unknown or duplicate internal trait',
    );
    used.add(t.tag);
    const urls = [...new Set((t.sourceUrls || []).map(sourceUrl))];
    assert(
      urls.length && urls.every((url) => sources.some((s) => s.url === url)),
      'Each trait needs known source evidence',
    );
    assert(
      ['recipe_inference', 'menu_statement'].includes(t.basis),
      'Invalid trait basis',
    );
    assert(
      t.basis !== 'menu_statement' || input.scope === 'venue_verified',
      'Generic recipes cannot establish a venue preparation',
    );
    return {
      tag: t.tag,
      confidence: Math.min(
        numeric(t.confidence, 'trait confidence', 0, 1),
        input.scope === 'canonical_typical' ? 0.75 : 0.95,
      ),
      sourceUrls: urls,
      basis: t.basis,
      reason: nonempty(t.reason, 'trait reason', 350),
    };
  });
  const list = (value, label) => {
    assert(Array.isArray(value) && value.length <= 30, 'Invalid ' + label);
    return value.map((v) => nonempty(v, label, 100));
  };
  return {
    canonicalDishId,
    venueId,
    scope: input.scope,
    taxonomyVersion,
    traitVersion: TRAIT_VERSION,
    researchedAt,
    expiresAt,
    sources,
    traits,
    ingredients: list(input.ingredients || [], 'ingredient'),
    methods: list(input.methods || [], 'method'),
    provider: nonempty(input.provider || 'curated', 'provider', 100),
  };
}

class DishTraits {
  constructor(engine, state = {}) {
    this.engine = engine;
    this.profiles = new Map();
    this.jobs = new Map();
    for (const p of state.profiles || []) this.put(p);
    for (const job of state.jobs || []) {
      engine.normalizer.get(job.canonicalDishId);
      this.jobs.set(job.canonicalDishId, structuredClone(job));
    }
  }
  exportData() {
    return structuredClone({
      profiles: [...this.profiles.values()],
      jobs: [...this.jobs.values()],
    });
  }
  put(profile) {
    const p = validateProfile(profile, {
      now: this.engine.now(),
      taxonomyVersion: this.engine.normalizer.version,
      knownDish: (id) => this.engine.normalizer.get(id),
      knownVenue: (id) => this.engine.venues.has(id),
    });
    this.profiles.set(keyOf(p.canonicalDishId, p.venueId), p);
    return structuredClone(p);
  }
  get(dishId, venueId, now = this.engine.now()) {
    for (const id of [keyOf(dishId, venueId), keyOf(dishId, null)]) {
      const p = this.profiles.get(id);
      if (p && p.researchedAt <= now && p.expiresAt > now) return p;
    }
    return null;
  }
  enqueue(dishId) {
    if (this.get(dishId, null)) return false;
    const previous = this.jobs.get(dishId),
      now = this.engine.now();
    if (
      previous &&
      ['pending', 'running', 'retry', 'failed'].includes(previous.status)
    )
      return false;
    this.jobs.set(dishId, {
      canonicalDishId: dishId,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      lastError: null,
      attemptTimes: previous?.attemptTimes || [],
    });
    return true;
  }
  due() {
    const now = this.engine.now();
    return [...this.jobs.values()]
      .filter(
        (j) =>
          ['pending', 'retry'].includes(j.status) && j.nextAttemptAt <= now,
      )
      .sort(
        (a, b) =>
          a.createdAt - b.createdAt ||
          a.canonicalDishId.localeCompare(b.canonicalDishId),
      );
  }
  retry(dishId) {
    const j = this.jobs.get(dishId);
    assert(j, 'Unknown research job');
    j.status = 'pending';
    j.attempts = 0;
    j.nextAttemptAt = this.engine.now();
    j.lastError = null;
  }
  // Internal use only. Never return this profile through the consumer API.
  affinity(userId, now = this.engine.now()) {
    const rows = [...(this.engine.byUser.get(userId) || [])].map((k) =>
      this.engine.ratings.get(k),
    );
    const byDish = new Map();
    for (const r of rows) {
      if (r.ratedAt > now) continue;
      const p = this.get(r.canonicalDishId, r.venueId, now);
      if (!p) continue;
      if (!byDish.has(r.canonicalDishId)) byDish.set(r.canonicalDishId, []);
      byDish.get(r.canonicalDishId).push({ r, p });
    }
    const aggregates = new Map();
    for (const [dishId, entries] of byDish) {
      const oneDish = new Map();
      for (const { r, p } of entries)
        for (const t of p.traits) {
          if (t.confidence < 0.65) continue;
          const w =
            t.confidence *
            decay(r.ratedAt, now, this.engine.config.profileHalfLifeDays);
          if (!oneDish.has(t.tag)) oneDish.set(t.tag, { sum: 0, weight: 0 });
          const a = oneDish.get(t.tag);
          a.sum += ((r.rating - 3) / 2) * w;
          a.weight += w;
        }
      for (const [tag, a] of oneDish) {
        if (!a.weight) continue;
        if (!aggregates.has(tag))
          aggregates.set(tag, { sum: 0, weight: 0, dishIds: [] });
        const total = aggregates.get(tag);
        // At most one canonical dish worth of evidence, however many venues were rated.
        const weight = Math.min(1, a.weight / entries.length);
        total.sum += (a.sum / a.weight) * weight;
        total.weight += weight;
        total.dishIds.push(dishId);
      }
    }
    return new Map(
      [...aggregates].map(([tag, a]) => [
        tag,
        {
          preference: a.sum / (a.weight + 3),
          evidenceDishes: a.dishIds.length,
          dishIds: a.dishIds,
        },
      ]),
    );
  }
  adjustment(userId, dishId, venueId, now, affinity) {
    const p = this.get(dishId, venueId, now);
    if (!p) return 0;
    affinity = affinity || this.affinity(userId, now);
    const groups = new Map();
    for (const t of p.traits) {
      const a = affinity.get(t.tag);
      if (!a || a.evidenceDishes < 3 || t.confidence < 0.65) continue;
      const group = t.tag.split('.')[0];
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(a.preference * t.confidence);
    }
    if (!groups.size) return 0;
    // Balance feature families so a longer ingredient list cannot dominate.
    const score =
      [...groups.values()].reduce(
        (s, v) => s + v.reduce((a, b) => a + b, 0) / v.length,
        0,
      ) / groups.size;
    return clamp(score, -1, 1) * 0.05; // At most ±5 points on the displayed 0–100 ranking scale.
  }
}
module.exports = {
  DishTraits,
  TRAITS,
  TRAIT_VERSION,
  validateProfile,
  sourceUrl,
};
