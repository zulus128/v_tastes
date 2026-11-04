'use strict';

const { DishNormalizer } = require('./normalizer');
const { SocialGraph } = require('./social-graph');
const { DishTraits } = require('./dish-traits');
const { Tracking, MODEL_VERSION } = require('./tracking');
const {
  DAY,
  clamp,
  round,
  compareIds,
  keyOf,
  assert,
  nonempty,
  numeric,
  timestamp,
  location,
  haversine,
  fold,
  decay,
  indexAdd,
} = require('./utils');

const DEFAULTS = Object.freeze({
  minProfileDishes: 5,
  minOverlap: 3,
  minAgreeingDishes: 3,
  agreementTolerance: 1,
  minAgreementFraction: 0.6,
  overlapShrinkage: 4,
  minMatchScore: 0.1,
  highRating: 4,
  profileHalfLifeDays: 180,
  recommendationHalfLifeDays: 90,
  maxRecommendationAgeDays: 730,
  friendMultiplier: 1.3,
  followMultiplier: 1.15,
  maxNeighbors: 100,
  defaultRadiusKm: 25,
  maxPerVenue: 2,
  trendWindowDays: 7,
  trendBaselineDays: 21,
  minTrendRaters: 3,
});

const RANK_WEIGHTS = Object.freeze({
  tasteMatch: 0.4,
  rating: 0.3,
  consensus: 0.2,
  proximity: 0.1,
});

function validatedConfig(options) {
  const config = { ...DEFAULTS, ...options };
  for (const key of Object.keys(options))
    assert(key in DEFAULTS, 'Unknown option: ' + key);
  for (const key of Object.keys(config))
    numeric(config[key], key, Number.EPSILON, 1e6);
  for (const key of [
    'minProfileDishes',
    'minOverlap',
    'minAgreeingDishes',
    'maxNeighbors',
    'maxPerVenue',
    'minTrendRaters',
  ]) {
    assert(Number.isInteger(config[key]), key + ' must be an integer');
  }
  for (const key of [
    'profileHalfLifeDays',
    'recommendationHalfLifeDays',
    'maxRecommendationAgeDays',
    'trendWindowDays',
    'trendBaselineDays',
  ])
    numeric(config[key], key, 1, 1e6);
  assert(
    config.minAgreeingDishes <= config.minOverlap,
    'minAgreeingDishes cannot exceed minOverlap',
  );
  numeric(config.minAgreementFraction, 'minAgreementFraction', 0, 1);
  numeric(config.minMatchScore, 'minMatchScore', 0, 1);
  numeric(config.highRating, 'highRating', 1, 5);
  numeric(config.agreementTolerance, 'agreementTolerance', 0.01, 4);
  numeric(config.friendMultiplier, 'friendMultiplier', 1, 2);
  numeric(config.followMultiplier, 'followMultiplier', 1, 2);
  return Object.freeze(config);
}

function validateExperience(input) {
  if (input == null) return null;
  assert(
    input && typeof input === 'object' && !Array.isArray(input),
    'experience must be an object',
  );
  const allowed = [
    'note',
    'wouldOrderAgain',
    'portion',
    'pricePaid',
    'currency',
  ];
  assert(
    Object.keys(input).every((k) => allowed.includes(k)),
    'Unknown experience field',
  );
  const out = {};
  if (input.note != null) {
    assert(
      typeof input.note === 'string' && input.note.length <= 1000,
      'note must be at most 1000 characters',
    );
    out.note = input.note;
  }
  if (input.wouldOrderAgain != null) {
    assert(
      typeof input.wouldOrderAgain === 'boolean',
      'wouldOrderAgain must be boolean',
    );
    out.wouldOrderAgain = input.wouldOrderAgain;
  }
  if (input.portion != null) {
    assert(
      ['small', 'regular', 'large', 'shared'].includes(input.portion),
      'Invalid portion',
    );
    out.portion = input.portion;
  }
  if (input.pricePaid != null) {
    out.pricePaid = numeric(input.pricePaid, 'pricePaid', 0, 100000);
    assert(
      /^[A-Z]{3}$/.test(input.currency),
      'Provide a three-letter currency',
    );
    out.currency = input.currency;
  } else assert(input.currency == null, 'currency requires pricePaid');
  return out;
}

class TasteMatchEngine {
  constructor({
    taxonomy,
    users,
    venues,
    ratings = [],
    relationships = [],
    options = {},
    internalState = {},
    clock = Date.now,
  }) {
    assert(typeof clock === 'function', 'clock must be a function');
    this.clock = clock;
    this._hydrating = true;
    this.config = validatedConfig(options);
    this.normalizer = new DishNormalizer(taxonomy);
    this.users = new Map();
    this.venues = new Map();
    this.ratings = new Map(); // One latest vote per user + canonical dish + venue.
    this.ratingIds = new Map();
    this.byUser = new Map();
    this.byDish = new Map();
    this.byOffering = new Map();
    assert(
      Array.isArray(users) && Array.isArray(venues),
      'users and venues must be arrays',
    );
    for (const u of users) {
      const user = {
        id: nonempty(u.id, 'user.id'),
        displayName: nonempty(u.displayName, 'displayName'),
        active: u.active !== false,
      };
      assert(!this.users.has(user.id), 'Duplicate user ID: ' + user.id);
      this.users.set(user.id, user);
    }
    for (const v of venues) {
      const venue = {
        id: nonempty(v.id, 'venue.id'),
        name: nonempty(v.name, 'venue.name'),
        city: v.city == null ? null : nonempty(v.city, 'venue.city'),
        location:
          v.location == null ? null : location(v.location, 'venue.location'),
        active: v.active !== false,
        googlePlaceId:
          v.googlePlaceId == null
            ? null
            : nonempty(v.googlePlaceId, 'googlePlaceId'),
      };
      assert(!this.venues.has(venue.id), 'Duplicate venue ID: ' + venue.id);
      this.venues.set(venue.id, venue);
    }
    this.social = new SocialGraph();
    for (const relation of relationships) this.setRelationship(relation);
    for (const rating of ratings) {
      if (this.users.get(rating.userId)?.active === false) continue;
      this.recordRating(rating);
    }
    this.tracking = new Tracking(this, internalState.tracking);
    this.dishTraits = new DishTraits(this, internalState.dishTraits);
    this._hydrating = false;
  }

  now() {
    return timestamp(this.clock(), 'clock');
  }
  exportData() {
    return structuredClone({
      taxonomy: {
        version: this.normalizer.version,
        dishes: [...this.normalizer.dishes.values()],
      },
      users: [...this.users.values()],
      venues: [...this.venues.values()],
      ratings: [...this.ratings.values()],
      relationships: [...this.social.edges].map((key) => {
        const [type, fromUserId, toUserId] = JSON.parse(key);
        return { type, fromUserId, toUserId };
      }),
      options: { ...this.config },
      internalState: {
        version: 1,
        tracking: this.tracking.exportData(),
        dishTraits: this.dishTraits.exportData(),
      },
    });
  }
  requireUser(userId) {
    assert(
      this.users.get(userId)?.active,
      'Unknown or inactive user: ' + userId,
    );
  }

  setRelationship(relation) {
    assert(
      this.users.has(relation.fromUserId) && this.users.has(relation.toUserId),
      'Relationships must reference known users',
    );
    this.social.add(relation);
  }

  recordRating(input) {
    const rating = {
      id: nonempty(input.id, 'rating.id'),
      userId: nonempty(input.userId, 'userId'),
      canonicalDishId: nonempty(input.canonicalDishId, 'canonicalDishId'),
      venueId: nonempty(input.venueId, 'venueId'),
      rating: numeric(input.rating, 'rating', 0.5, 5),
      ratedAt: timestamp(input.ratedAt),
      visibility: input.visibility ?? 'public',
      rawDishName:
        input.rawDishName == null
          ? null
          : nonempty(input.rawDishName, 'rawDishName'),
      taxonomyVersion: input.taxonomyVersion ?? this.normalizer.version,
      experience: validateExperience(input.experience),
    };
    this.requireUser(rating.userId);
    this.normalizer.get(rating.canonicalDishId);
    assert(
      this.venues.has(rating.venueId),
      'Unknown venueId: ' + rating.venueId,
    );
    assert(
      rating.taxonomyVersion === this.normalizer.version,
      'Taxonomy version mismatch; explicitly migrate canonical IDs before ingestion',
    );
    assert(
      ['public', 'followers', 'friends', 'private'].includes(rating.visibility),
      'Invalid visibility',
    );
    assert(rating.ratedAt <= this.now(), 'Future ratings are not accepted');
    const key = keyOf(rating.userId, rating.canonicalDishId, rating.venueId);
    const existingKey = this.ratingIds.get(rating.id);
    assert(
      !existingKey || existingKey === key,
      'A rating ID cannot be reused for another tuple',
    );
    const previous = this.ratings.get(key);
    if (previous) {
      if (
        rating.ratedAt < previous.ratedAt ||
        (rating.ratedAt === previous.ratedAt &&
          compareIds(rating.id, previous.id) < 0)
      ) {
        return {
          stored: false,
          reason: 'older_rating',
          rating: structuredClone(previous),
        };
      }
      if (rating.ratedAt === previous.ratedAt && rating.id === previous.id) {
        assert(
          JSON.stringify(rating) === JSON.stringify(previous),
          'Conflicting rating with the same ID and timestamp; supply a newer timestamp',
        );
        return {
          stored: false,
          reason: 'idempotent_replay',
          rating: structuredClone(previous),
        };
      }
      this.ratingIds.delete(previous.id);
    }
    this.ratings.set(key, Object.freeze(rating));
    this.ratingIds.set(rating.id, key);
    indexAdd(this.byUser, rating.userId, key);
    indexAdd(this.byDish, rating.canonicalDishId, key);
    indexAdd(
      this.byOffering,
      keyOf(rating.canonicalDishId, rating.venueId),
      key,
    );
    if (!this._hydrating) {
      this.tracking.change(previous ? 'update' : 'create', previous, rating);
      this.dishTraits.enqueue(rating.canonicalDishId);
    }
    return { stored: true, rating: structuredClone(rating) };
  }

  deleteRating(ratingId) {
    const key = this.ratingIds.get(ratingId);
    if (!key) return false;
    const rating = this.ratings.get(key);
    this.ratings.delete(key);
    this.ratingIds.delete(ratingId);
    this.byUser.get(rating.userId)?.delete(key);
    this.byDish.get(rating.canonicalDishId)?.delete(key);
    this.byOffering
      .get(keyOf(rating.canonicalDishId, rating.venueId))
      ?.delete(key);
    this.tracking.change('delete', rating, null);
    return true;
  }

  recommendTracked(userId, options = {}) {
    const result = this.recommend(userId, options);
    return { ...result, requestId: this.tracking.request(userId, result) };
  }
  recordRecommendationEvent(input) {
    return this.tracking.record(input);
  }
  setTrackingConsent(userId, enabled) {
    return this.tracking.setConsent(userId, enabled);
  }
  getActivitySummary(userId) {
    return this.tracking.summary(userId);
  }
  deleteUserData(userId) {
    this.requireUser(userId);
    for (const key of [...(this.byUser.get(userId) || [])])
      this.deleteRating(this.ratings.get(key).id);
    this.tracking.erase(userId);
    for (const key of [...this.social.edges])
      if (JSON.parse(key).slice(1).includes(userId))
        this.social.edges.delete(key);
    this.users.set(userId, {
      id: userId,
      displayName: 'Deleted user',
      active: false,
    });
    return { deleted: true };
  }

  canRead(viewerId, rating, now) {
    if (
      !rating ||
      rating.ratedAt > now ||
      !this.users.get(rating.userId)?.active
    )
      return false;
    if (viewerId === rating.userId) return true;
    const relation = this.social.relation(viewerId, rating.userId);
    if (relation === 'blocked') return false;
    return (
      rating.visibility === 'public' ||
      (rating.visibility === 'friends' && relation === 'friend') ||
      (rating.visibility === 'followers' &&
        (relation === 'friend' || relation === 'follow'))
    );
  }

  _fingerprint(authorId, viewerId, now) {
    const dishes = new Map();
    for (const key of [...(this.byUser.get(authorId) || [])].sort(compareIds)) {
      const r = this.ratings.get(key);
      if (!this.canRead(viewerId, r, now)) continue;
      const weight = decay(r.ratedAt, now, this.config.profileHalfLifeDays);
      if (weight === 0) continue; // Extreme configured decay must not create 0/0.
      if (!dishes.has(r.canonicalDishId)) {
        dishes.set(r.canonicalDishId, {
          weightedSum: 0,
          weight: 0,
          ratingIds: [],
          venueIds: [],
        });
      }
      const dish = dishes.get(r.canonicalDishId);
      dish.weightedSum += r.rating * weight;
      dish.weight += weight;
      dish.ratingIds.push(r.id);
      dish.venueIds.push(r.venueId);
    }
    return new Map(
      [...dishes].map(([id, d]) => [
        id,
        {
          canonicalDishId: id,
          name: this.normalizer.get(id).name,
          rating: d.weightedSum / d.weight,
          freshness: d.weight / d.ratingIds.length,
          ratingIds: d.ratingIds.sort(compareIds),
          venueIds: d.venueIds.sort(compareIds),
        },
      ]),
    );
  }

  getFingerprint(userId) {
    this.requireUser(userId);
    const fingerprint = this._fingerprint(userId, userId, this.now());
    return {
      userId,
      distinctDishCount: fingerprint.size,
      ready: fingerprint.size >= this.config.minProfileDishes,
      requiredDishCount: this.config.minProfileDishes,
      dishes: [...fingerprint.values()].map((d) => ({
        ...d,
        rating: round(d.rating, 2),
      })),
    };
  }

  _matches(userId, target, now) {
    if (target.size < this.config.minProfileDishes) return [];
    // Inverted retrieval: only compare people with an actually shared canonical dish.
    const candidates = new Set();
    const visibleCounts = new Map();
    for (const dishId of target.keys()) {
      const raters = new Set();
      for (const key of this.byDish.get(dishId) || []) {
        const r = this.ratings.get(key);
        if (this.canRead(userId, r, now)) {
          raters.add(r.userId);
          if (r.userId !== userId) candidates.add(r.userId);
        }
      }
      visibleCounts.set(dishId, raters.size);
    }
    const matches = [];
    for (const otherId of candidates) {
      const other = this._fingerprint(otherId, userId, now);
      const overlaps = [];
      let weightedAgreement = 0;
      let totalWeight = 0;
      for (const [dishId, a] of target) {
        const b = other.get(dishId);
        if (!b) continue;
        const delta = Math.abs(a.rating - b.rating);
        const rarity = clamp(
          1 + Math.log((candidates.size + 1) / visibleCounts.get(dishId)),
          1,
          2,
        );
        const weight = rarity * Math.min(a.freshness, b.freshness);
        const agreement = clamp(
          1 - delta / (2 * this.config.agreementTolerance),
        );
        weightedAgreement += weight * agreement;
        totalWeight += weight;
        overlaps.push({
          canonicalDishId: dishId,
          name: a.name,
          targetRating: round(a.rating, 2),
          otherRating: round(b.rating, 2),
          agrees: delta <= this.config.agreementTolerance + 1e-9,
          bothLiked:
            a.rating >= this.config.highRating &&
            b.rating >= this.config.highRating,
          targetRatingIds: a.ratingIds,
          otherRatingIds: b.ratingIds,
          targetVenueIds: a.venueIds,
          otherVenueIds: b.venueIds,
        });
      }
      const agreeing = overlaps.filter((d) => d.agrees).length;
      if (
        overlaps.length < this.config.minOverlap ||
        agreeing < this.config.minAgreeingDishes ||
        agreeing / overlaps.length < this.config.minAgreementFraction
      )
        continue;
      const similarity = totalWeight ? weightedAgreement / totalWeight : 0;
      const reliability =
        totalWeight / (totalWeight + this.config.overlapShrinkage);
      const baseScore = similarity * reliability;
      if (baseScore < this.config.minMatchScore) continue;
      const relation = this.social.relation(userId, otherId);
      const socialMultiplier =
        relation === 'friend'
          ? this.config.friendMultiplier
          : relation === 'follow'
            ? this.config.followMultiplier
            : 1;
      matches.push({
        userId: otherId,
        displayName: this.users.get(otherId).displayName,
        relation,
        sharedDishCount: overlaps.length,
        agreeingDishCount: agreeing,
        similarity,
        reliability,
        baseScore,
        socialMultiplier,
        matchScore: baseScore * socialMultiplier,
        overlaps: overlaps.sort(
          (a, b) =>
            Number(b.bothLiked && b.agrees) - Number(a.bothLiked && a.agrees) ||
            compareIds(a.canonicalDishId, b.canonicalDishId),
        ),
      });
    }
    return matches
      .sort(
        (a, b) => b.matchScore - a.matchScore || compareIds(a.userId, b.userId),
      )
      .slice(0, this.config.maxNeighbors);
  }

  findTasteMatches(userId) {
    this.requireUser(userId);
    const now = this.now();
    return this._matches(userId, this._fingerprint(userId, userId, now), now);
  }

  _context(userId, options) {
    this.requireUser(userId);
    assert(
      options && typeof options === 'object' && !Array.isArray(options),
      'options must be an object',
    );
    for (const field of ['excludeDishIds', 'excludeVenueIds']) {
      assert(
        options[field] == null ||
          (Array.isArray(options[field]) &&
            options[field].every((v) => typeof v === 'string' && v.length)),
        field + ' must be an array of IDs',
      );
    }
    const context = {
      userId,
      now: this.now(),
      limit: options.limit ?? 10,
      city: options.city == null ? null : fold(nonempty(options.city, 'city')),
      location: options.location == null ? null : location(options.location),
      radiusKm: options.radiusKm ?? this.config.defaultRadiusKm,
      novelty: options.novelty ?? 'canonical_dish',
      excludeDishIds: new Set(options.excludeDishIds || []),
      excludeVenueIds: new Set(options.excludeVenueIds || []),
      knownDishes: new Set(),
      knownOfferings: new Set(),
      knownVenues: new Set(),
    };
    numeric(context.limit, 'limit', 0, 50);
    assert(Number.isInteger(context.limit), 'limit must be an integer');
    numeric(context.radiusKm, 'radiusKm', 0, 20_050);
    assert(
      options.radiusKm == null || context.location,
      'radiusKm requires location',
    );
    assert(
      ['canonical_dish', 'dish_at_venue'].includes(context.novelty),
      'Invalid novelty mode',
    );
    for (const key of this.byUser.get(userId) || []) {
      const r = this.ratings.get(key);
      context.knownDishes.add(r.canonicalDishId);
      context.knownOfferings.add(keyOf(r.canonicalDishId, r.venueId));
      context.knownVenues.add(r.venueId);
    }
    return context;
  }

  _geo(venue, context) {
    if (!venue.active || context.excludeVenueIds.has(venue.id)) return null;
    if (context.city && fold(venue.city || '') !== context.city) return null;
    if (context.location) {
      if (!venue.location) return null;
      const distanceKm = haversine(context.location, venue.location);
      if (distanceKm > context.radiusKm + 1e-9) return null;
      return {
        distanceKm: round(distanceKm, 2),
        proximity: Math.exp(-distanceKm / 5),
      };
    }
    return { distanceKm: null, proximity: context.city ? 1 : 0.5 };
  }

  _eligible(dishId, venueId, context) {
    if (context.excludeDishIds.has(dishId)) return null;
    if (context.novelty === 'canonical_dish' && context.knownDishes.has(dishId))
      return null;
    if (context.knownOfferings.has(keyOf(dishId, venueId))) return null;
    return this._geo(this.venues.get(venueId), context);
  }

  _pool(userWeights, context) {
    const pool = new Map();
    for (const [userId, entry] of userWeights) {
      for (const key of [...(this.byUser.get(userId) || [])].sort(compareIds)) {
        const r = this.ratings.get(key);
        if (
          !this.canRead(context.userId, r, context.now) ||
          context.now - r.ratedAt > this.config.maxRecommendationAgeDays * DAY
        )
          continue;
        const geo = this._eligible(r.canonicalDishId, r.venueId, context);
        if (!geo) continue;
        const weight =
          entry.weight *
          decay(r.ratedAt, context.now, this.config.recommendationHalfLifeDays);
        if (weight === 0) continue;
        const offeringKey = keyOf(r.canonicalDishId, r.venueId);
        if (!pool.has(offeringKey))
          pool.set(offeringKey, {
            dishId: r.canonicalDishId,
            venueId: r.venueId,
            geo,
            votes: [],
          });
        pool.get(offeringKey).votes.push({
          rating: r,
          entry,
          weight,
        });
      }
    }
    return pool;
  }

  _card(item, tier, rankScore, context, extra = {}) {
    const venue = this.venues.get(item.venueId);
    const high = item.votes
      .filter((v) => v.rating.rating >= this.config.highRating)
      .sort(
        (a, b) =>
          b.weight - a.weight || compareIds(a.rating.userId, b.rating.userId),
      );
    const totalWeight = item.votes.reduce((s, v) => s + v.weight, 0);
    const weightedRating =
      item.votes.reduce((s, v) => s + v.rating.rating * v.weight, 0) /
      totalWeight;
    const lead = high[0];
    const who = this.users.get(lead.rating.userId).displayName;
    const more = high.length - 1;
    const dishName = this.normalizer.get(item.dishId).name;
    let headline;
    let connection = null;
    if (tier === 'taste_match') {
      headline = more
        ? who +
          ' and ' +
          more +
          ' other ' +
          (more === 1 ? 'person' : 'people') +
          ' with similar dish ratings loved ' +
          dishName +
          ' at ' +
          venue.name +
          '.'
        : who +
          ' has similar dish ratings to you and loved ' +
          dishName +
          ' at ' +
          venue.name +
          '.';
      const match = lead.entry.match;
      const anchor = match.overlaps.find((d) => d.agrees && d.bothLiked);
      connection = anchor
        ? 'You and ' + who + ' both rated ' + anchor.name + ' highly.'
        : 'You and ' +
          who +
          ' rated ' +
          match.agreeingDishCount +
          ' shared dishes similarly.';
    } else if (tier === 'social') {
      headline = more
        ? who +
          ' and ' +
          more +
          ' others in your friends and follows loved ' +
          dishName +
          ' at ' +
          venue.name +
          '.'
        : (this.social.relation(context.userId, lead.rating.userId) === 'friend'
            ? 'Your friend ' + who
            : who + ', who you follow,') +
          ' loved ' +
          dishName +
          ' at ' +
          venue.name +
          '.';
    } else {
      headline =
        extra.recentHighRaterCount +
        ' people rated ' +
        dishName +
        ' at ' +
        venue.name +
        ' ' +
        this.config.highRating +
        '+ in the last ' +
        this.config.trendWindowDays +
        ' days.';
    }
    return {
      id: keyOf('dish', item.dishId, item.venueId),
      kind: 'dish',
      source: 'tastes',
      tier,
      canonicalDishId: item.dishId,
      canonicalDishName: dishName,
      venue: structuredClone(venue),
      distanceKm: item.geo.distanceKm,
      rankScore: round(rankScore * 100, 2), // Ordering score, NOT a probability.
      weightedRating: round(weightedRating, 2),
      supporterCount: high.length,
      reviewerCount: item.votes.length,
      confidence:
        tier !== 'taste_match'
          ? 'not_personalized'
          : high.length >= 5 && lead.entry.match.sharedDishCount >= 5
            ? 'strong'
            : high.length >= 3
              ? 'developing'
              : 'limited',
      explanation: { headline, connection },
      evidence: item.votes.map((v) => ({
        ratingId: v.rating.id,
        userId: v.rating.userId,
        displayName: this.users.get(v.rating.userId).displayName,
        rating: v.rating.rating,
        ratedAt: new Date(v.rating.ratedAt).toISOString(),
        relation: this.social.relation(context.userId, v.rating.userId),
        supports: v.rating.rating >= this.config.highRating,
        sharedDishCount: v.entry.match?.sharedDishCount ?? 0,
      })),
      ...extra,
    };
  }

  recommend(userId, options = {}) {
    const context = this._context(userId, options);
    const target = this._fingerprint(userId, userId, context.now);
    const matches = this._matches(userId, target, context.now);
    const matchedUsers = new Map(
      matches.map((m) => [m.userId, { weight: m.matchScore, match: m }]),
    );
    const personalized = [];
    const internalAffinity = this.dishTraits.affinity(userId, context.now);
    const vetoed = new Set();
    for (const [key, item] of this._pool(matchedUsers, context)) {
      const totalWeight = item.votes.reduce((s, v) => s + v.weight, 0);
      const average =
        item.votes.reduce((s, v) => s + v.rating.rating * v.weight, 0) /
        totalWeight;
      // Include negative matched votes; never cherry-pick only positive reviews.
      if (average + 1e-9 < this.config.highRating) {
        vetoed.add(key);
        continue;
      }
      const high = item.votes.filter(
        (v) => v.rating.rating >= this.config.highRating,
      );
      if (!high.length) continue;
      const tasteMatch =
        high.reduce(
          (s, v) =>
            s +
            clamp(v.entry.weight) *
              decay(
                v.rating.ratedAt,
                context.now,
                this.config.recommendationHalfLifeDays,
              ),
          0,
        ) / high.length;
      const consensus =
        ((high.length / (high.length + 2)) * high.length) / item.votes.length;
      const components = {
        tasteMatch,
        rating: (average - 1) / 4,
        consensus,
        proximity: item.geo.proximity,
      };
      const score = Object.entries(RANK_WEIGHTS).reduce(
        (s, [key, weight]) => s + components[key] * weight,
        0,
      );
      const adjustment = this.dishTraits.adjustment(
        userId,
        item.dishId,
        item.venueId,
        context.now,
        internalAffinity,
      );
      personalized.push(
        this._card(item, 'taste_match', clamp(score + adjustment), context, {
          components,
        }),
      );
    }

    const socialUsers = new Map();
    for (const user of this.users.values()) {
      if (!user.active || user.id === userId) continue;
      const relation = this.social.relation(userId, user.id);
      if (relation === 'friend' || relation === 'follow')
        socialUsers.set(user.id, {
          weight:
            relation === 'friend'
              ? this.config.friendMultiplier
              : this.config.followMultiplier,
        });
    }
    const social = [];
    for (const [key, item] of this._pool(socialUsers, context)) {
      if (vetoed.has(key)) continue;
      const high = item.votes.filter(
        (v) => v.rating.rating >= this.config.highRating,
      );
      const weight = item.votes.reduce((s, v) => s + v.weight, 0);
      const average =
        item.votes.reduce((s, v) => s + v.rating.rating * v.weight, 0) / weight;
      if (!high.length || average + 1e-9 < this.config.highRating) continue;
      const support = high.reduce((s, v) => s + v.weight, 0);
      const score =
        (0.45 * (average - 1)) / 4 +
        (0.4 * support) / (support + 2) +
        0.15 * item.geo.proximity;
      social.push(this._card(item, 'social', score, context));
    }

    const trending = [];
    // Without a location or city we cannot truthfully claim something is local.
    if (context.city || context.location) {
      const window = this.config.trendWindowDays * DAY;
      const baselineWindow = this.config.trendBaselineDays * DAY;
      for (const [key, ratingKeys] of this.byOffering) {
        if (vetoed.has(key)) continue;
        const [dishId, venueId] = JSON.parse(key);
        const geo = this._eligible(dishId, venueId, context);
        if (!geo) continue;
        const visible = [...ratingKeys]
          .sort(compareIds)
          .map((k) => this.ratings.get(k))
          .filter(
            (r) =>
              r.userId !== userId &&
              this.canRead(userId, r, context.now) &&
              context.now - r.ratedAt < window + baselineWindow,
          );
        const recent = visible.filter((r) => context.now - r.ratedAt < window);
        const high = recent.filter((r) => r.rating >= this.config.highRating);
        if (high.length < this.config.minTrendRaters) continue;
        const average =
          recent.reduce((s, r) => s + r.rating, 0) / recent.length;
        if (average + 1e-9 < this.config.highRating) continue;
        const olderHigh = visible.filter(
          (r) =>
            context.now - r.ratedAt >= window &&
            r.rating >= this.config.highRating,
        );
        const baselinePerWindow = (olderHigh.length * window) / baselineWindow;
        const momentum = clamp(
          (high.length - baselinePerWindow) /
            (high.length + baselinePerWindow + 1),
        );
        const score =
          (0.5 * high.length) / (high.length + 3) +
          0.25 * momentum +
          (0.15 * (average - 1)) / 4 +
          0.1 * geo.proximity;
        const item = {
          dishId,
          venueId,
          geo,
          votes: recent.map((rating) => ({ rating, weight: 1, entry: {} })),
        };
        trending.push(
          this._card(item, 'trending', score, context, {
            recentHighRaterCount: high.length,
            baselineHighRatersPerWindow: round(baselinePerWindow, 2),
            momentum: round(momentum),
          }),
        );
      }
    }

    const external = [];
    assert(
      Array.isArray(options.externalPlaces ?? []),
      'externalPlaces must be an array',
    );
    for (const p of options.externalPlaces || []) {
      const placeId = nonempty(p.placeId, 'external placeId');
      const venue = {
        id: p.venueId || keyOf('google_places', placeId),
        googlePlaceId: placeId,
        name: nonempty(p.name, 'external place name'),
        city: p.city ?? null,
        location: p.location == null ? null : location(p.location),
        active: p.active !== false,
      };
      // An external card cannot sneak an already-visited internal venue back in.
      const internal =
        this.venues.get(p.venueId) ||
        [...this.venues.values()].find((v) => v.googlePlaceId === placeId);
      if (
        internal &&
        (!internal.active ||
          context.knownVenues.has(internal.id) ||
          context.excludeVenueIds.has(internal.id))
      )
        continue;
      if (context.knownVenues.has(venue.id)) continue;
      const geo = this._geo(venue, context);
      if (!geo) continue;
      if (p.rating != null) numeric(p.rating, 'external rating', 1, 5);
      external.push({
        id: keyOf('google_places', placeId),
        kind: 'venue',
        source: 'google_places',
        tier: 'external',
        venue,
        distanceKm: geo.distanceKm,
        rankScore: round(geo.proximity * 100, 2),
        externalRating: p.rating ?? null,
        weightedRating: null,
        supporterCount: 0,
        reviewerCount: 0,
        confidence: 'not_personalized',
        explanation: {
          headline: venue.name + ' · External listing from Google Places',
          connection:
            'No dish-level Taste Match evidence is available for this listing.',
        },
        // The caller supplies provider attribution payloads for the app to render.
        attributions: structuredClone(p.attributions || []),
        evidence: [],
      });
    }

    const result = [];
    const used = new Set();
    const venueCounts = new Map();
    const representedPlaceIds = new Set();
    for (const tier of [personalized, social, trending, external]) {
      tier.sort((a, b) => b.rankScore - a.rankScore || compareIds(a.id, b.id));
      for (const card of tier) {
        if (result.length >= context.limit) break;
        if (
          used.has(card.id) ||
          (venueCounts.get(card.venue.id) || 0) >= this.config.maxPerVenue
        )
          continue;
        if (
          card.kind === 'venue' &&
          (venueCounts.has(card.venue.id) ||
            representedPlaceIds.has(card.venue.googlePlaceId))
        )
          continue;
        result.push(card);
        used.add(card.id);
        venueCounts.set(
          card.venue.id,
          (venueCounts.get(card.venue.id) || 0) + 1,
        );
        if (card.venue.googlePlaceId)
          representedPlaceIds.add(card.venue.googlePlaceId);
      }
    }
    return {
      userId,
      generatedAt: new Date(context.now).toISOString(),
      modelVersion: MODEL_VERSION,
      taxonomyVersion: this.normalizer.version,
      state:
        target.size < this.config.minProfileDishes
          ? 'cold_start'
          : !matches.length
            ? 'insufficient_overlap'
            : !personalized.length
              ? 'no_match_candidates'
              : 'personalized',
      distinctRatedDishes: target.size,
      requiredDishCount: this.config.minProfileDishes,
      matchedUserCount: matches.length,
      novelty: context.novelty,
      scoreMeaning: 'Within-tier ranking score; not a match probability.',
      recommendations: result,
    };
  }
}

module.exports = { TasteMatchEngine, DEFAULTS, RANK_WEIGHTS };
