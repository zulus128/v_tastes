import type { FeedItem, Venue } from '@tastes/contracts';
import type { ProfileData } from './api';

export type TasteHighlight = {
  emoji: string;
  id: 'cuisine' | 'vibe' | 'dish' | 'place';
  label: string;
  meta: string;
  value: string;
};

const GENERIC_PLACE_CATEGORIES = new Set([
  'bar',
  'cafe',
  'coffee',
  'restaurant',
]);

function displayLabel(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLocaleLowerCase())
    .join(' ');
}

function mostCommon(values: readonly string[]) {
  const counts = new Map<string, number>();
  values
    .filter(Boolean)
    .forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return (
    [...counts].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )[0] ?? null
  );
}

function vibeEmoji(value: string) {
  const normalized = value.toLocaleLowerCase();
  if (normalized.includes('night') || normalized.includes('date')) return '🌙';
  if (normalized.includes('fancy')) return '🥂';
  if (normalized.includes('quick')) return '⚡';
  if (normalized.includes('birthday')) return '🎂';
  if (normalized.includes('children') || normalized.includes('family'))
    return '👨‍👩‍👧';
  return '🍽️';
}

function dishEmoji(value: string) {
  const normalized = value.toLocaleLowerCase();
  if (normalized.includes('sushi')) return '🍣';
  if (normalized.includes('pizza')) return '🍕';
  if (normalized.includes('burger')) return '🍔';
  if (normalized.includes('pasta')) return '🍝';
  return '🍴';
}

export function buildTasteHighlights({
  favoritePlaceName,
  profile,
  reviews,
  venues,
}: {
  favoritePlaceName: string | null;
  profile: ProfileData;
  reviews: readonly FeedItem[];
  venues: readonly Venue[];
}): TasteHighlight[] {
  const venuesById = new Map(venues.map((venue) => [venue.id, venue]));
  const cuisines = reviews.flatMap((review) => {
    const category = venuesById.get(review.venueId)?.category?.trim();
    return category &&
      !GENERIC_PLACE_CATEGORIES.has(category.toLocaleLowerCase())
      ? [category]
      : [];
  });
  const topCuisine = mostCommon(cuisines);
  const topVibe = mostCommon(reviews.flatMap((review) => review.tags));
  const cuisineValue =
    topCuisine?.[0] ?? profile.favoriteCuisines[0] ?? 'Not set';
  const vibeValue = topVibe?.[0] ?? 'Not set';
  const dishValue = profile.favoriteDish ?? 'Not set';
  const placeValue = favoritePlaceName ?? 'Not set';

  return [
    {
      id: 'cuisine',
      emoji: '🍝',
      label: 'Top cuisine',
      value: displayLabel(cuisineValue),
      meta: `${topCuisine?.[1] ?? 0} reviews`,
    },
    {
      id: 'vibe',
      emoji: vibeEmoji(vibeValue),
      label: 'Favourite vibe',
      value: displayLabel(vibeValue),
      meta: `${topVibe?.[1] ?? 0} reviews`,
    },
    {
      id: 'dish',
      emoji: dishEmoji(dishValue),
      label: 'Favourite dish',
      value: dishValue,
      meta: '',
    },
    {
      id: 'place',
      emoji: '❤️',
      label: 'Favourite place',
      value: placeValue,
      meta: '',
    },
  ];
}
