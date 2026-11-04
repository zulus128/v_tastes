'use strict';
const { randomUUID } = require('node:crypto');
const { assert, nonempty, numeric, timestamp, DAY } = require('./utils');
const MODEL_VERSION = 'taste-match-v2-internal-traits';
const EVENT_TYPES = [
  'impression',
  'open',
  'save',
  'unsave',
  'dismiss',
  'rated',
];

class Tracking {
  constructor(engine, state = {}) {
    this.engine = engine;
    this.history = structuredClone(state.history || []);
    this.sequence = state.sequence || 0;
    this.events = structuredClone(state.events || []);
    this.requests = new Map(
      (state.requests || []).map((r) => [r.id, structuredClone(r)]),
    );
    this.consent = new Map(state.consent || []);
    this.prune();
  }
  exportData() {
    return structuredClone({
      history: this.history,
      sequence: this.sequence,
      events: this.events,
      requests: [...this.requests.values()],
      consent: [...this.consent],
    });
  }
  prune() {
    const now = this.engine.now();
    this.events = this.events
      .filter((e) => e.recordedAt >= now - 90 * DAY)
      .slice(-10000);
    for (const [id, r] of this.requests)
      if (r.generatedAt < now - 7 * DAY) this.requests.delete(id);
    while (this.requests.size > 2000)
      this.requests.delete(this.requests.keys().next().value);
    this.history = this.history.slice(-10000);
  }
  enabled(userId) {
    return this.consent.get(userId) !== false;
  }
  setConsent(userId, enabled) {
    this.engine.requireUser(userId);
    assert(typeof enabled === 'boolean', 'enabled must be boolean');
    this.consent.set(userId, enabled);
    if (!enabled) {
      this.events = this.events.filter((e) => e.userId !== userId);
      for (const [id, r] of this.requests)
        if (r.userId === userId) this.requests.delete(id);
    }
    return { enabled };
  }
  change(operation, before, after) {
    const r = after || before;
    this.history.push({
      sequence: ++this.sequence,
      userId: r.userId,
      ratingId: r.id,
      operation,
      before: before ? structuredClone(before) : null,
      after: after ? structuredClone(after) : null,
      recordedAt: this.engine.now(),
    });
    this.prune();
  }
  request(userId, result) {
    if (!this.enabled(userId)) return null;
    this.prune();
    const id = randomUUID();
    this.requests.set(id, {
      id,
      userId,
      generatedAt: this.engine.now(),
      modelVersion: MODEL_VERSION,
      taxonomyVersion: result.taxonomyVersion,
      cards: result.recommendations.map((r, position) => ({
        cardId: r.id,
        canonicalDishId: r.canonicalDishId ?? null,
        venueId: r.venue.id,
        tier: r.tier,
        position,
        rankScore: r.rankScore,
      })),
    });
    this.prune();
    return id;
  }
  validate(input, { allowRated = false } = {}) {
    this.engine.requireUser(input.userId);
    assert(
      EVENT_TYPES.includes(input.type) &&
        (allowRated || input.type !== 'rated'),
      'Invalid event type; ratings are attributed by the server',
    );
    const id = nonempty(input.id, 'event.id');
    const requestId = nonempty(input.requestId, 'requestId');
    const cardId = nonempty(input.cardId, 'cardId', 1000);
    const now = this.engine.now(),
      occurredAt = timestamp(input.occurredAt ?? now, 'occurredAt');
    assert(
      occurredAt <= now && occurredAt >= now - 7 * DAY,
      'Event timestamp is outside the accepted window',
    );
    const request = this.requests.get(requestId);
    assert(
      request &&
        request.userId === input.userId &&
        request.generatedAt >= now - 7 * DAY,
      'Unknown or expired recommendation request',
    );
    assert(
      occurredAt >= request.generatedAt,
      'Event predates its recommendation',
    );
    const card = request.cards.find((c) => c.cardId === cardId);
    assert(card, 'Card was not served in this request');
    return {
      id,
      userId: input.userId,
      requestId,
      cardId,
      type: input.type,
      occurredAt,
      recordedAt: now,
      dwellMs:
        input.dwellMs == null
          ? null
          : numeric(input.dwellMs, 'dwellMs', 0, 3600000),
      sessionId:
        input.sessionId == null ? null : nonempty(input.sessionId, 'sessionId'),
      tier: card.tier,
      position: card.position,
      modelVersion: request.modelVersion,
      canonicalDishId: card.canonicalDishId,
      venueId: card.venueId,
    };
  }
  record(input, options) {
    this.engine.requireUser(input.userId);
    if (!this.enabled(input.userId))
      return { stored: false, reason: 'tracking_disabled' };
    this.prune();
    const event = this.validate(input, options),
      existing = this.events.find((e) => e.id === event.id);
    if (existing) {
      const clean = (e) => {
        const { recordedAt, ...v } = e;
        return JSON.stringify(v);
      };
      assert(clean(existing) === clean(event), 'Conflicting event ID');
      return { stored: false, reason: 'idempotent_replay' };
    }
    if (
      ['impression', 'rated'].includes(event.type) &&
      this.events.some(
        (e) =>
          e.userId === event.userId &&
          e.requestId === event.requestId &&
          e.cardId === event.cardId &&
          e.type === event.type,
      )
    )
      return { stored: false, reason: 'duplicate_action' };
    this.events.push(event);
    this.prune();
    return { stored: true, eventId: event.id };
  }
  summary(userId) {
    this.engine.requireUser(userId);
    this.prune();
    const e = this.events.filter((e) => e.userId === userId),
      counts = Object.fromEntries(
        EVENT_TYPES.map((k) => [k, e.filter((x) => x.type === k).length]),
      );
    const seen = new Set(
      e
        .filter((x) => x.type === 'impression')
        .map((x) => x.requestId + '|' + x.cardId),
    );
    const opened = new Set(
      e
        .filter(
          (x) => x.type === 'open' && seen.has(x.requestId + '|' + x.cardId),
        )
        .map((x) => x.requestId + '|' + x.cardId),
    );
    return {
      enabled: this.enabled(userId),
      counts,
      observedCardOpenRate: seen.size ? opened.size / seen.size : null,
      retainedRatingChanges: this.history.filter((h) => h.userId === userId)
        .length,
    };
  }
  erase(userId) {
    this.events = this.events.filter((e) => e.userId !== userId);
    this.history = this.history.filter((e) => e.userId !== userId);
    for (const [id, r] of this.requests)
      if (r.userId === userId) this.requests.delete(id);
    this.consent.delete(userId);
  }
}
module.exports = { Tracking, MODEL_VERSION, EVENT_TYPES };
