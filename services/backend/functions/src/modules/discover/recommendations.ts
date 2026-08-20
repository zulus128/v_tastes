export const RECOMMENDATION_MATCH_THRESHOLD = 45;

export interface RecommendationMatchInput {
  favoriteCuisines: string[];
  favoriteDish: string;
  rating: number | null | undefined;
  searchableText: string;
}

export interface RecommendationMatch {
  cuisineMatch: boolean;
  dishMatch: boolean;
  matchPercent: number;
  preferenceMatched: boolean;
  ratingPoints: number;
}

const normalize = (value: string) => value.trim().toLocaleLowerCase();

/**
 * Match score (0-100): cuisine 50 points, favorite dish 30 points,
 * and venue quality up to 20 points. A quality score alone is never enough
 * to make a venue a recommendation: at least one saved taste must match.
 */
export function calculateRecommendationMatch(input: RecommendationMatchInput): RecommendationMatch {
  const searchableText = normalize(input.searchableText);
  const cuisineMatch = input.favoriteCuisines
    .map(normalize)
    .filter(Boolean)
    .some((cuisine) => searchableText.includes(cuisine));
  const favoriteDish = normalize(input.favoriteDish);
  const dishMatch = Boolean(favoriteDish && searchableText.includes(favoriteDish));
  const rating = Math.max(0, Math.min(5, Number(input.rating ?? 0)));
  const ratingPoints = Math.round((rating / 5) * 20);
  const matchPercent = (cuisineMatch ? 50 : 0) + (dishMatch ? 30 : 0) + ratingPoints;

  return {
    cuisineMatch,
    dishMatch,
    matchPercent,
    preferenceMatched: cuisineMatch || dishMatch,
    ratingPoints,
  };
}

export function isRecommendation(match: RecommendationMatch): boolean {
  return match.preferenceMatched && match.matchPercent >= RECOMMENDATION_MATCH_THRESHOLD;
}
