type FilterablePlace = {
  category?: string | null;
  distanceKm?: number | null;
  isOpen?: boolean | null;
  priceLevel?: number | null;
  rating?: number | null;
};

function valueFor(filters: string[], prefix: string) {
  return filters.find((value) => value.startsWith(`${prefix}:`))?.slice(prefix.length + 1);
}

export function matchesPlaceFilters(place: FilterablePlace, filters: string[]) {
  const venue = valueFor(filters, 'Venue')?.toLowerCase();
  const category = place.category?.toLowerCase() ?? '';
  if (venue === 'cafe' && !category.includes('cafe') && !category.includes('coffee')) return false;
  if (venue === 'bar' && !category.includes('bar') && !category.includes('pub') && !category.includes('club')) return false;
  if (venue === 'restaurant' && /cafe|coffee|bar|pub|club/.test(category)) return false;

  const ratingRange = valueFor(filters, 'Rating')?.split('-').map(Number);
  if (ratingRange?.length === 2 && place.rating != null) {
    if (place.rating < ratingRange[0]! || place.rating > ratingRange[1]!) return false;
  }

  const cuisines = filters
    .filter((value) => /🇮🇹|🇯🇵|🇬🇪|🇹🇭|🇺🇸|🇷🇺|🇰🇷|🇮🇳|🇲🇽|🇨🇳/.test(value))
    .map((value) => value.split(' ')[0]?.toLowerCase());
  if (cuisines.length > 0 && !cuisines.some((value) => value && category.includes(value))) return false;

  const budgets = filters.filter((value) => /^\${1,3}\s/.test(value));
  if (budgets.length > 0 && !budgets.some((value) => value.startsWith('$'.repeat(place.priceLevel ?? 1)))) return false;

  const coffee = filters.filter((value) => ['Matcha 🍵', 'Coffee ☕', 'Vegan coffee 🥛'].includes(value));
  if (coffee.length > 0 && !coffee.some((value) => (
    (value === 'Matcha 🍵' && category.includes('matcha'))
    || (value === 'Coffee ☕' && (category.includes('coffee') || category.includes('cafe')))
    || (value === 'Vegan coffee 🥛' && (category.includes('vegan') || category.includes('cafe')))
  ))) return false;

  if (filters.includes('Vegetarian 🥦') && !/vegetarian|vegan/.test(category)) return false;

  const maximumDistance = Number.parseFloat(valueFor(filters, 'Distance') ?? '');
  if (Number.isFinite(maximumDistance) && place.distanceKm != null && place.distanceKm > maximumDistance) return false;

  if (valueFor(filters, 'OpenNow') === 'true' && place.isOpen === false) return false;
  return true;
}
