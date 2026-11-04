import { z } from 'zod';
import type { Venue } from './index';

export const canonicalDishIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/);
export const canonicalDishSelectionSchema = z.object({
  canonicalDishId: canonicalDishIdSchema.optional(),
  canonicalDishConfirmed: z.boolean().optional(),
});
export const getCanonicalDishesInputSchema = z.object({
  query: z.string().trim().max(120).default(''),
  limit: z.number().int().min(1).max(20).default(8),
});
export type GetCanonicalDishesInput = z.input<
  typeof getCanonicalDishesInputSchema
>;
export interface CanonicalDish {
  id: string;
  name: string;
  aliases: string[];
}
export interface CanonicalDishesResult {
  version: string;
  dishes: CanonicalDish[];
  exactId: string | null;
}
export const getTasteRecommendationsInputSchema = z
  .object({
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    radiusKm: z.number().min(1).max(100).optional(),
    novelty: z
      .enum(['canonical_dish', 'dish_at_venue'])
      .default('canonical_dish'),
    limit: z.number().int().min(1).max(20).default(6),
  })
  .refine(
    (v) => (v.latitude === undefined) === (v.longitude === undefined),
    'Provide both coordinates.',
  )
  .refine(
    (v) => v.radiusKm === undefined || v.latitude !== undefined,
    'A radius requires location.',
  );
export type GetTasteRecommendationsInput = z.input<
  typeof getTasteRecommendationsInputSchema
>;
export type TasteRecommendationTier = 'taste_match' | 'social' | 'trending';
export interface TasteRecommendation {
  id: string;
  canonicalDishId: string;
  canonicalDishName: string;
  venue: Venue;
  dishRating: number;
  dishPhotoUrl?: string;
  dishPhotoPath?: string;
  tier: TasteRecommendationTier;
  confidence: 'limited' | 'developing' | 'strong' | 'not_personalized';
  supporterCount: number;
  reviewerCount: number;
  headline: string;
  connection: string | null;
  reviewId: string;
}
export interface TasteRecommendationsResult {
  state:
    | 'cold_start'
    | 'insufficient_overlap'
    | 'no_match_candidates'
    | 'personalized';
  distinctRatedDishes: number;
  requiredDishCount: number;
  matchedUserCount: number;
  recommendations: TasteRecommendation[];
  modelVersion: string;
  generatedAt: string;
  candidatePoolLimited: boolean;
}
