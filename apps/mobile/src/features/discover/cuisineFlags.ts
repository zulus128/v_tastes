// Canonical cuisine -> country flag emoji, matching the Figma tag chips
// (e.g. "Italian 🇮🇹"). Keep in sync with the CUISINES filter options in
// DiscoverFiltersScreen.tsx.
export const CUISINE_FLAGS: Record<string, string> = {
  Italian: '🇮🇹',
  Japanese: '🇯🇵',
  Georgian: '🇬🇪',
  Thai: '🇹🇭',
  American: '🇺🇸',
  Russian: '🇷🇺',
  Korean: '🇰🇷',
  Indian: '🇮🇳',
  Mexican: '🇲🇽',
  Chinese: '🇨🇳',
};

export function cuisineFlag(cuisine: string | null | undefined): string | undefined {
  return cuisine ? CUISINE_FLAGS[cuisine] : undefined;
}
