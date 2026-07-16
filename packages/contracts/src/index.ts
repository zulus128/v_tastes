import { z } from 'zod';

export const userProfileSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string().min(2).max(80),
  bio: z.string().max(500).default(''),
  photoUrl: z.url().nullable().default(null),
  status: z.enum(['active', 'suspended', 'banned', 'deleted']),
});

export const createUserProfileInputSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(500).optional(),
});

export const venueSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  city: z.string().min(1),
  status: z.enum(['active', 'hidden', 'pending', 'merged']),
});

export const reviewSchema = z.object({
  id: z.string().min(1),
  authorId: z.string().min(1),
  authorDisplayName: z.string().min(1),
  venueId: z.string().min(1),
  venueName: z.string().min(1),
  rating: z.number().min(1).max(5),
  text: z.string().min(1).max(2_000),
  status: z.enum(['published', 'hidden', 'deleted']),
  commentCount: z.number().int().nonnegative(),
  reactionCount: z.number().int().nonnegative(),
});

export const createReviewInputSchema = z.object({
  venueId: z.string().min(1),
  rating: z.number().min(1).max(5),
  text: z.string().trim().min(1).max(2_000),
});

export const addCommentInputSchema = z.object({
  reviewId: z.string().min(1),
  text: z.string().trim().min(1).max(1_000),
});

export const reactToReviewInputSchema = z.object({
  reviewId: z.string().min(1),
  reaction: z.enum(['like']),
});

export const healthCheckResultSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('tastes-backend'),
  timestamp: z.string().datetime(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type CreateUserProfileInput = z.infer<typeof createUserProfileInputSchema>;
export type Venue = z.infer<typeof venueSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type CreateReviewInput = z.infer<typeof createReviewInputSchema>;
export type AddCommentInput = z.infer<typeof addCommentInputSchema>;
export type ReactToReviewInput = z.infer<typeof reactToReviewInputSchema>;
export type HealthCheckResult = z.infer<typeof healthCheckResultSchema>;

export type ApiErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'invalid-argument'
  | 'not-found'
  | 'failed-precondition'
  | 'resource-exhausted'
  | 'internal';
