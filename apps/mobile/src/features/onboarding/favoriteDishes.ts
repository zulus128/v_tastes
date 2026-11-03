// Favourite dish catalog shared by onboarding and Profile Settings.
export const favoriteDishes = [
  'Burgers',
  'Pasta',
  'Pizza',
  'Sushi',
  'Tacos',
  'Salads',
  'Ramen',
  'Steak',
  'Fish',
  'Curry',
] as const;

export type FavoriteDish = (typeof favoriteDishes)[number];
