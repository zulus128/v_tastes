import { describe, expect, it } from 'vitest';
import {
  calculateVenueSignals,
  classifyNewSpot,
  DAY_MS,
  distanceKm,
  selectLocalVenues,
  stableBadge,
  validSignalUser,
} from '../../functions/src/modules/discover/signals';

const now = Date.parse('2026-11-04T12:00:00Z');
const users = Array.from({ length: 12 }, (_, i) => ({
  id: `user-${i}`,
  status: 'active',
  createdAt: now - 60 * DAY_MS,
}));
const venues = [
  { id: 'a', city: 'Monaco', status: 'active' },
  { id: 'b', city: 'Monaco', status: 'active' },
  { id: 'c', city: 'London', status: 'active' },
];
const review = (i: number, overrides = {}) => ({
  id: `review-${i}`,
  authorId: users[i]!.id,
  venueId: 'a',
  createdAt: now - DAY_MS,
  rating: 5,
  status: 'published',
  hasPhoto: true,
  ...overrides,
});

describe('auditable discovery signals', () => {
  it('separates seven-day HOT activity from a 48-hour TRENDING spike', () => {
    const results = calculateVenueSignals({
      now,
      users,
      venues,
      reviews: [0, 1, 2, 3, 4].map((i) => review(i)),
    });
    expect(results[0]).toMatchObject({
      positive7d: 5,
      positive48h: 5,
      hotCandidate: true,
      trendingCandidate: true,
    });
    const older = calculateVenueSignals({
      now,
      users,
      venues,
      reviews: [0, 1, 2, 3, 4].map((i) =>
        review(i, { createdAt: now - 3 * DAY_MS }),
      ),
    });
    expect(older[0]).toMatchObject({
      positive7d: 5,
      positive48h: 0,
      hotCandidate: true,
      trendingCandidate: false,
    });
  });
  it('does not turn negative spikes into either badge', () => {
    const results = calculateVenueSignals({
      now,
      users,
      venues,
      reviews: [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
        review(i, { rating: i < 3 ? 5 : 1 }),
      ),
    });
    expect(results[0]).toMatchObject({
      hotCandidate: false,
      trendingCandidate: false,
      positive7d: 3,
    });
  });
  it('counts each reviewer once and excludes fixtures, suspended and new accounts', () => {
    const results = calculateVenueSignals({
      now,
      users: [
        ...users,
        { id: 'new', status: 'active', createdAt: now - DAY_MS },
        { id: 'banned', status: 'suspended', createdAt: now - 90 * DAY_MS },
      ],
      venues,
      reviews: [
        review(0),
        review(0, { id: 'duplicate' }),
        review(1, { source: 'seed' }),
        review(2, { authorId: 'new' }),
        review(3, { authorId: 'banned' }),
        review(4, { status: 'hidden' }),
        review(5, { createdAt: now + DAY_MS }),
      ],
    });
    expect(results[0]).toMatchObject({
      unique7d: 1,
      hotCandidate: false,
      trendingCandidate: false,
    });
    expect(
      validSignalUser(
        { id: 'unknown-date', createdAt: 0, status: 'active' },
        now,
      ),
    ).toBe(false);
  });
  it('compares with the venue baseline and isolates markets by city', () => {
    const reviews = [0, 1, 2].map((i) => review(i));
    const base = calculateVenueSignals({ now, users, venues, reviews });
    const withForeignMarket = calculateVenueSignals({
      now,
      users,
      venues,
      reviews: [
        ...reviews,
        ...[3, 4, 5, 6, 7, 8, 9].map((i) => review(i, { venueId: 'c' })),
      ],
    });
    expect(withForeignMarket[0]?.hotScore).toBe(base[0]?.hotScore);
    expect(withForeignMarket[0]?.trendingScore).toBe(base[0]?.trendingScore);
    const withHistory = calculateVenueSignals({
      now,
      users,
      venues,
      reviews: [
        ...reviews,
        ...[3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) =>
          review(i, { createdAt: now - 10 * DAY_MS }),
        ),
      ],
    });
    expect(withHistory[0]!.trendingScore).toBeLessThan(base[0]!.trendingScore);
  });
  it('waits for stability and immediately removes badges after negative activity', () => {
    expect(stableBadge({ now, candidate: true, positiveShare: 1 })).toEqual({
      candidateSince: now,
      enabledUntil: null,
    });
    const stable = stableBadge({
      now,
      candidate: true,
      positiveShare: 1,
      previousCandidateSince: now - 60 * 60_000,
    });
    expect(stable.enabledUntil).toBe(now + DAY_MS);
    expect(
      stableBadge({
        now,
        candidate: false,
        positiveShare: 1,
        previousEnabledUntil: now + DAY_MS,
      }).enabledUntil,
    ).toBe(now + DAY_MS);
    expect(
      stableBadge({
        now,
        candidate: false,
        positiveShare: 0.4,
        previousEnabledUntil: now + DAY_MS,
      }).enabledUntil,
    ).toBeNull();
  });
});

describe('new venue dates and local scope', () => {
  it('distinguishes verified openings from new-on-Tastes publication and expires both', () => {
    expect(
      classifyNewSpot({
        now,
        verifiedOpeningDate: now - 89 * DAY_MS,
        firstPublishedAt: now - DAY_MS,
      }),
    ).toBe('just-opened');
    expect(
      classifyNewSpot({
        now,
        verifiedOpeningDate: now - 91 * DAY_MS,
        firstPublishedAt: now - 29 * DAY_MS,
      }),
    ).toBe('new-on-tastes');
    expect(
      classifyNewSpot({
        now,
        verifiedOpeningDate: now - 91 * DAY_MS,
        firstPublishedAt: now - 31 * DAY_MS,
      }),
    ).toBeNull();
    expect(
      classifyNewSpot({ now, verifiedOpeningDate: now + DAY_MS }),
    ).toBeNull();
    expect(classifyNewSpot({ now })).toBeNull();
  });
  it('uses the saved city without location and never falls back to a foreign city', () => {
    expect(
      selectLocalVenues(venues, ' monaco ').venues.map((venue) => venue.id),
    ).toEqual(['a', 'b']);
    expect(selectLocalVenues(venues, 'Paris').venues).toEqual([]);
    expect(selectLocalVenues(venues, '').venues).toEqual([]);
  });
  it('starts at five kilometres and expands without adding remote venues', () => {
    const location = { latitude: 43.7384, longitude: 7.4246 };
    const located = [0, 0.01, 0.02].map((offset, i) => ({
      id: String(i),
      city: 'Monaco',
      latitude: location.latitude + offset,
      longitude: location.longitude,
    }));
    const far = { id: 'far', city: 'London', latitude: 51.5, longitude: -0.12 };
    const near = selectLocalVenues([...located, far], 'London', location);
    expect(near.radiusKm).toBe(5);
    expect(near.venues).toHaveLength(3);
    expect(distanceKm(location, far)).toBeGreaterThan(1000);
    const expanded = selectLocalVenues(
      [
        located[0]!,
        { ...located[1]!, latitude: location.latitude + 0.07 },
        { ...located[2]!, latitude: location.latitude + 0.08 },
        far,
      ],
      'London',
      location,
    );
    expect(expanded.radiusKm).toBe(10);
    expect(expanded.venues).toHaveLength(3);
  });
});
