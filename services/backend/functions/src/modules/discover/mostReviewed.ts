import type { Venue } from '@tastes/contracts';

// T-012: lifetime Tastes review count, no manual tag gate. Ties break on
// rating confidence (higher rating at equal volume) and then venue ID so
// equal-count ordering is stable between requests.
export function compareMostReviewed(left: Venue, right: Venue): number {
  return (
    (right.reviewCount ?? 0) - (left.reviewCount ?? 0) ||
    (right.rating ?? 0) - (left.rating ?? 0) ||
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
