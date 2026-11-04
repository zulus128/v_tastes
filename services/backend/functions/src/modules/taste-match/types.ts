import type {
  TasteRecommendationsResult,
  TasteRecommendationTier,
  CanonicalDish,
} from '@tastes/contracts';

export interface CanonicalRating {
  id: string;
  userId: string;
  canonicalDishId: string;
  venueId: string;
  rating: number;
  ratedAt: number;
  visibility: 'public' | 'private' | 'followers' | 'friends';
  rawDishName: string;
  taxonomyVersion: string;
}
export interface EngineInput {
  taxonomy: { version: string; dishes: CanonicalDish[] };
  users: { id: string; displayName: string; active: boolean }[];
  venues: {
    id: string;
    name: string;
    city: string | null;
    active: boolean;
    location?: { lat: number; lng: number };
  }[];
  ratings: CanonicalRating[];
  relationships: {
    type: 'follow' | 'friend' | 'block';
    fromUserId: string;
    toUserId: string;
  }[];
  clock: () => number;
}
export interface EngineCard {
  id: string;
  canonicalDishId: string;
  canonicalDishName: string;
  venue: { id: string };
  distanceKm: number | null;
  weightedRating: number;
  tier: TasteRecommendationTier;
  confidence: 'limited' | 'developing' | 'strong' | 'not_personalized';
  supporterCount: number;
  reviewerCount: number;
  explanation: { headline: string; connection: string | null };
  evidence: { ratingId: string; supports: boolean }[];
}
export interface ReferenceResult extends Omit<
  TasteRecommendationsResult,
  'recommendations' | 'candidatePoolLimited'
> {
  recommendations: EngineCard[];
}
export interface Engine {
  recommend(
    userId: string,
    options: {
      city?: string;
      location?: { lat: number; lng: number };
      radiusKm?: number;
      novelty?: 'canonical_dish' | 'dish_at_venue';
      limit?: number;
      excludeDishIds?: string[];
      excludeVenueIds?: string[];
    },
  ): ReferenceResult;
  findTasteMatches(userId: string): unknown[];
}
