export const DISCOVERY_SIGNAL_VERSION = 1;
export const DAY_MS = 86_400_000;
export interface SignalUser {
  id: string;
  status: string;
  createdAt: number;
  source?: string;
  suspicious?: boolean;
}
export interface SignalReview {
  id: string;
  authorId: string;
  venueId: string;
  createdAt: number;
  rating: number;
  status: string;
  source?: string;
  hasPhoto: boolean;
}
export interface SignalVenue {
  id: string;
  city: string;
  status: string;
}
export interface VenueSignal {
  venueId: string;
  city: string;
  unique7d: number;
  positive7d: number;
  unique48h: number;
  positive48h: number;
  positivePrevious28d: number;
  hotScore: number;
  trendingScore: number;
  hotCandidate: boolean;
  trendingCandidate: boolean;
}
const fixtureSources = new Set(['seed', 'stress-image-scroll', 'test']);
export function validSignalUser(
  user: SignalUser | undefined,
  now: number,
): boolean {
  return (
    !!user &&
    user.status === 'active' &&
    user.createdAt > 0 &&
    Number.isFinite(user.createdAt) &&
    !user.suspicious &&
    !fixtureSources.has(user.source ?? '') &&
    user.createdAt <= now - 7 * DAY_MS
  );
}
const cityKey = (city: string) =>
  city.trim().normalize('NFKC').toLocaleLowerCase('en-US');

/** Conservative initial thresholds; audit in shadow mode before enabling badges. */
export function calculateVenueSignals(input: {
  now: number;
  venues: SignalVenue[];
  users: SignalUser[];
  reviews: SignalReview[];
}): VenueSignal[] {
  const users = new Map(input.users.map((user) => [user.id, user]));
  const latest = new Map<string, SignalReview>();
  for (const review of input.reviews) {
    if (
      review.status !== 'published' ||
      fixtureSources.has(review.source ?? '') ||
      !validSignalUser(users.get(review.authorId), input.now) ||
      review.createdAt > input.now ||
      review.createdAt < input.now - 30 * DAY_MS
    )
      continue;
    const key = `${review.venueId}:${review.authorId}`;
    const previous = latest.get(key);
    if (
      !previous ||
      previous.createdAt < review.createdAt ||
      (previous.createdAt === review.createdAt && previous.id < review.id)
    )
      latest.set(key, review);
  }
  const rows = input.venues
    .filter((venue) => venue.status === 'active')
    .map((venue) => {
      const reviews = [...latest.values()].filter(
        (review) => review.venueId === venue.id,
      );
      const week = reviews.filter(
        (review) => review.createdAt >= input.now - 7 * DAY_MS,
      );
      const recent = reviews.filter(
        (review) => review.createdAt >= input.now - 2 * DAY_MS,
      );
      const baseline = reviews.filter(
        (review) => review.createdAt < input.now - 2 * DAY_MS,
      );
      const positive = (review: SignalReview) => review.rating >= 4;
      const weighted = week.filter(positive).reduce((score, review) => {
        const user = users.get(review.authorId)!;
        const accountWeight = Math.min(
          1,
          (input.now - user.createdAt) / (30 * DAY_MS),
        );
        return (
          score +
          Math.exp(-(input.now - review.createdAt) / (7 * DAY_MS)) *
            accountWeight *
            (review.hasPhoto ? 1.1 : 1)
        );
      }, 0);
      return {
        venueId: venue.id,
        city: cityKey(venue.city),
        unique7d: week.length,
        positive7d: week.filter(positive).length,
        unique48h: recent.length,
        positive48h: recent.filter(positive).length,
        positivePrevious28d: baseline.filter(positive).length,
        weighted,
      };
    });
  return rows.map((row) => {
    const market = rows
      .filter((other) => other.city === row.city)
      .map((other) => other.weighted)
      .sort((a, b) => a - b);
    const middle = Math.floor(market.length / 2);
    const median =
      market.length % 2
        ? market[middle]!
        : ((market[middle - 1] ?? 0) + (market[middle] ?? 0)) / 2;
    const hotScore = row.weighted / Math.max(1, median);
    const trendingScore =
      (row.positive48h + 1) / (row.positivePrevious28d / 14 + 1);
    const positiveWeek =
      row.unique7d > 0 && row.positive7d / row.unique7d >= 0.75;
    const positiveRecent =
      row.unique48h > 0 && row.positive48h / row.unique48h >= 0.75;
    const { weighted: _weighted, ...audit } = row;
    void _weighted;
    return {
      ...audit,
      hotScore,
      trendingScore,
      hotCandidate: positiveWeek && row.positive7d >= 5 && hotScore >= 1.5,
      trendingCandidate:
        positiveRecent && row.positive48h >= 3 && trendingScore >= 2,
    };
  });
}

export function stableBadge(input: {
  candidate: boolean;
  previousCandidateSince?: number | undefined;
  previousEnabledUntil?: number | undefined;
  positiveShare: number;
  now: number;
}): { candidateSince: number | null; enabledUntil: number | null } {
  // A negative spike never retains a badge through the stability grace period.
  if (input.positiveShare < 0.75)
    return { candidateSince: null, enabledUntil: null };
  const candidateSince = input.candidate
    ? (input.previousCandidateSince ?? input.now)
    : null;
  if (candidateSince !== null && input.now - candidateSince >= 60 * 60_000)
    return {
      candidateSince,
      enabledUntil: Math.max(
        input.previousEnabledUntil ?? 0,
        input.now + DAY_MS,
      ),
    };
  return {
    candidateSince,
    enabledUntil:
      (input.previousEnabledUntil ?? 0) > input.now
        ? input.previousEnabledUntil!
        : null,
  };
}

export function classifyNewSpot(input: {
  now: number;
  verifiedOpeningDate?: number;
  firstPublishedAt?: number;
}): 'just-opened' | 'new-on-tastes' | null {
  if (
    input.verifiedOpeningDate !== undefined &&
    input.verifiedOpeningDate <= input.now &&
    input.verifiedOpeningDate >= input.now - 90 * DAY_MS
  )
    return 'just-opened';
  if (
    input.firstPublishedAt !== undefined &&
    input.firstPublishedAt <= input.now &&
    input.firstPublishedAt >= input.now - 30 * DAY_MS
  )
    return 'new-on-tastes';
  return null;
}

export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude),
    dLon = rad(b.longitude - a.longitude);
  return (
    6371 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(a.latitude)) *
              Math.cos(rad(b.latitude)) *
              Math.sin(dLon / 2) ** 2,
        ),
      ),
    )
  );
}

export function selectLocalVenues<
  T extends {
    city: string;
    latitude?: number | undefined;
    longitude?: number | undefined;
  },
>(
  venues: T[],
  city: string,
  location?: { latitude: number; longitude: number },
): { venues: T[]; radiusKm: number | null } {
  if (!location)
    return {
      venues: city.trim()
        ? venues.filter((venue) => cityKey(venue.city) === cityKey(city))
        : [],
      radiusKm: null,
    };
  const located = venues.filter(
    (venue) =>
      Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude),
  );
  for (const radius of [5, 10, 25]) {
    const nearby = located.filter(
      (venue) =>
        distanceKm(location, {
          latitude: venue.latitude!,
          longitude: venue.longitude!,
        }) <= radius,
    );
    if (nearby.length >= 3 || radius === 25)
      return { venues: nearby, radiusKm: radius };
  }
  return { venues: [], radiusKm: 25 };
}
