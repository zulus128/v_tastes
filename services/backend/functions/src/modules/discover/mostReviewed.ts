import type { Venue } from '@tastes/contracts';

// Shrink sparse ratings toward a neutral prior of 3 stars / 10 reviews.
// This is a ranking heuristic, not a statistical probability.
export function ratingConfidence(
  venue: Pick<Venue, 'rating' | 'reviewCount'>,
): number {
  const count = Math.max(0, venue.reviewCount ?? 0);
  if (!count) return 0;
  return (
    (Math.max(0.5, Math.min(5, venue.rating ?? 3)) * count + 30) / (count + 10)
  );
}

// T-012: lifetime Tastes count, then volume-adjusted rating and stable ID.
export function compareMostReviewed(left: Venue, right: Venue): number {
  return (
    (right.reviewCount ?? 0) - (left.reviewCount ?? 0) ||
    ratingConfidence(right) - ratingConfidence(left) ||
    left.id.localeCompare(right.id)
  );
}

function normalizeCity(city: string | null | undefined): string {
  return String(city ?? '')
    .trim()
    .toLocaleLowerCase('en-US');
}

// Per-city ranking: venues from the viewer's city only. When the viewer has
// no city, the global ranking is used. An empty city stays empty rather than
// presenting venues from another country as local.
export function rankMostReviewed(
  venues: readonly Venue[],
  userCity: string | null | undefined,
  take: number,
): Venue[] {
  const reviewed = venues
    .filter((venue) => (venue.reviewCount ?? 0) > 0)
    .sort(compareMostReviewed);
  const city = normalizeCity(userCity);
  const local = city
    ? reviewed.filter((venue) => normalizeCity(venue.city) === city)
    : [];
  return (city ? local : reviewed).slice(0, take);
}
