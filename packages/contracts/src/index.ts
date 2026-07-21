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

export const phoneNumberSchema = z.string().trim().regex(
  /^\+[1-9]\d{7,14}$/,
  'The phone number must use E.164 format, for example +905551234567.',
);

export const requestPhoneOtpInputSchema = z.object({
  phoneNumber: phoneNumberSchema,
});

export const verifyPhoneOtpInputSchema = z.object({
  challengeId: z.string().min(16).max(128),
  code: z.string().regex(/^\d{4}$/, 'The verification code must contain 4 digits.'),
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
export type RequestPhoneOtpInput = z.infer<typeof requestPhoneOtpInputSchema>;
export type VerifyPhoneOtpInput = z.infer<typeof verifyPhoneOtpInputSchema>;

export interface RequestPhoneOtpResult {
  challengeId: string;
  resendAvailableAt: string;
  expiresAt: string;
  localCode?: string;
}

export interface VerifyPhoneOtpResult {
  customToken: string;
  isNewUser: boolean;
}

export type ApiErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'invalid-argument'
  | 'not-found'
  | 'failed-precondition'
  | 'resource-exhausted'
  | 'internal';
