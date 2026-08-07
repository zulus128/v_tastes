import { z } from 'zod';

export const userProfileSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string().min(2).max(80),
  bio: z.string().max(500).default(''),
  photoPath: z.string().max(512).nullable().default(null),
  photoUrl: z.url().nullable().default(null),
  status: z.enum(['active', 'suspended', 'banned', 'deleted']),
});

export const createUserProfileInputSchema = z.object({
  displayName: z.string().trim()
    .min(2, 'Your name must be at least 2 characters long.')
    .max(80, 'Your name must be at most 80 characters long.'),
  username: z.string().trim()
    .min(2, 'The username must be at least 2 characters long.')
    .max(40, 'The username must be at most 40 characters long.')
    .regex(/^[a-zA-Z0-9._]+$/, 'The username can only use Latin letters, numbers, dots, and underscores.')
    .optional(),
  city: z.string().trim().min(2).max(120).optional(),
  bio: z.string().trim().max(500).optional(),
  photoPath: z.string().trim().min(1).max(512).optional(),
});

export const updateProfilePhotoInputSchema = z.object({
  photoPath: z.string().trim().min(1).max(512),
});

export const discoverTagSchema = z.enum(['trending', 'most-reviewed', 'new', 'for-you', 'hidden-gem']);

export const venueSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  city: z.string().min(1),
  status: z.enum(['active', 'hidden', 'pending', 'merged']),
  address: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  imageUrl: z.url().optional(),
  priceLevel: z.number().int().min(1).max(4).optional(),
  distanceKm: z.number().nonnegative().optional(),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().nonnegative().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  discoverTags: z.array(discoverTagSchema).optional(),
});

export const reviewSchema = z.object({
  id: z.string().min(1),
  authorId: z.string().min(1),
  authorDisplayName: z.string().min(1),
  venueId: z.string().min(1),
  venueName: z.string().min(1),
  rating: z.number().min(1).max(5),
  text: z.string().min(1).max(2_000),
  tags: z.array(z.enum(['casual', 'date-night', 'birthday', 'children'])).max(4).default([]),
  dishReviews: z.array(z.object({
    id: z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9._:-]+$/),
    title: z.string().trim().min(1).max(120),
    rating: z.number().min(1).max(5),
    photoPath: z.string().trim().min(1).max(512),
  })).max(5).default([]),
  status: z.enum(['published', 'hidden', 'deleted']),
  commentCount: z.number().int().nonnegative(),
  reactionCount: z.number().int().nonnegative(),
});

export const idempotencyKeySchema = z.string().trim().min(16).max(128).regex(/^[a-zA-Z0-9._:-]+$/);

export const reviewTagSchema = z.enum(['casual', 'date-night', 'birthday', 'children']);

export const dishReviewInputSchema = z.object({
  id: z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9._:-]+$/),
  title: z.string().trim()
    .min(1, 'Enter the dish name.')
    .max(120, 'The dish name must be at most 120 characters long.'),
  rating: z.number().min(1).max(5),
  photoPath: z.string().trim()
    .min(1)
    .max(512)
    .regex(/^review-images\/[a-zA-Z0-9._:-]+\/[a-zA-Z0-9._:-]+\/[a-zA-Z0-9._:-]+$/),
});

export const createReviewInputSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  venueId: z.string().min(1),
  rating: z.number().min(1).max(5),
  text: z.string().trim().min(1).max(2_000),
  tags: z.array(reviewTagSchema).max(4).default([]),
  dishReviews: z.array(dishReviewInputSchema).max(5).default([]),
});

export const addCommentInputSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  reviewId: z.string().min(1),
  text: z.string().trim().min(1).max(1_000),
});

export const reactToReviewInputSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  reviewId: z.string().min(1),
  reaction: z.enum(['like']),
});

export const reportReasonSchema = z.enum([
  'Spam',
  'Inappropriate',
  'Harassment',
  'Misinformation',
  'Hate',
  'Safety risk',
  'Something else',
]);

export const hideReviewInputSchema = z.object({
  reviewId: z.string().min(1),
});

export const reportReviewInputSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  reviewId: z.string().min(1),
  reason: reportReasonSchema,
  details: z.string().trim().max(300).optional(),
});

export const followUserInputSchema = z.object({
  targetUserId: z.string().min(1).max(128),
});

export const createConversationInputSchema = z.object({
  targetUserId: z.string().min(1).max(128),
});

export const createActivityInputSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  venueId: z.string().trim().min(1).max(128),
  startsAt: z.string().datetime(),
  memberIds: z.array(z.string().min(1).max(128)).min(1).max(20),
}).refine(
  (input) => new Set(input.memberIds).size === input.memberIds.length,
  { message: 'Choose each member only once.', path: ['memberIds'] },
);

export const respondToActivityInvitationInputSchema = z.object({
  activityId: z.string().min(1).max(128),
  response: z.enum(['accepted', 'declined']),
});

export const sendMessageInputSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  conversationId: z.string().min(1).max(128),
  text: z.string().trim().min(1, 'Enter a message.').max(4_000),
});

export const conversationInputSchema = z.object({
  conversationId: z.string().min(1).max(128),
});

export const markConversationReadInputSchema = conversationInputSchema.extend({
  throughMessageId: z.string().min(1).max(128),
});

export const expoPushTokenSchema = z.string().trim().min(20).max(512).regex(
  /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9._~+/=-]+\]$/,
  'The Expo push token is invalid.',
);

export const registerPushTokenInputSchema = z.object({
  token: expoPushTokenSchema,
  platform: z.enum(['android', 'ios']),
});

export const unregisterPushTokenInputSchema = z.object({
  token: expoPushTokenSchema,
});

export const folderNameSchema = z.string().trim()
  .min(1, 'Enter a folder name.')
  .max(40, 'The folder name must be at most 40 characters long.');

export const createFolderInputSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  name: folderNameSchema,
});

export const renameFolderInputSchema = z.object({
  folderId: z.string().min(1).max(128),
  name: folderNameSchema,
});

export const deleteFolderInputSchema = z.object({
  folderId: z.string().min(1).max(128),
});

export const saveVenueInputSchema = z.object({
  venueId: z.string().min(1).max(128),
  folderIds: z.array(z.string().min(1).max(128)).max(20).default([]),
});

export const unsaveVenueInputSchema = z.object({
  venueId: z.string().min(1).max(128),
});

export const pageInputSchema = z.object({
  cursor: z.string().min(1).max(4_096).nullable().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const getFeedInputSchema = pageInputSchema.extend({
  scope: z.enum(['friends', 'local']).default('friends'),
});

export const getCommentsInputSchema = pageInputSchema.extend({
  reviewId: z.string().min(1),
});

export const listConversationsInputSchema = pageInputSchema;

export const getMessagesInputSchema = pageInputSchema.extend({
  conversationId: z.string().min(1).max(128),
});

export const getLeaderboardInputSchema = pageInputSchema.extend({
  period: z.enum(['month', 'allTime']).default('month'),
});

export const getVenuesInputSchema = pageInputSchema.extend({
  category: z.string().trim().min(1).max(60).optional(),
  tag: discoverTagSchema.optional(),
}).refine(
  (input) => !(input.category && input.tag),
  'Choose either a category or a Discover tag.',
);

export const getPlaceInputSchema = z.object({
  venueId: z.string().trim().min(1).max(128),
});

export const placeReviewSortSchema = z.enum(['highest', 'lowest', 'popular', 'recent', 'oldest']);

export const getPlaceReviewsInputSchema = getPlaceInputSchema.extend({
  sort: placeReviewSortSchema.default('recent'),
});

export const completeOnboardingInputSchema = z.object({
  version: z.number().int().positive(),
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
export type UpdateProfilePhotoInput = z.infer<typeof updateProfilePhotoInputSchema>;
export type DiscoverTag = z.infer<typeof discoverTagSchema>;
export type Venue = z.infer<typeof venueSchema>;
export type GetVenuesInput = z.infer<typeof getVenuesInputSchema>;
export type GetPlaceInput = z.infer<typeof getPlaceInputSchema>;
export type GetPlaceReviewsInput = z.infer<typeof getPlaceReviewsInputSchema>;
export type PlaceReviewSort = z.infer<typeof placeReviewSortSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type ReviewTag = z.infer<typeof reviewTagSchema>;
export type DishReviewInput = z.infer<typeof dishReviewInputSchema>;
export type CreateReviewInput = z.infer<typeof createReviewInputSchema>;
export type AddCommentInput = z.infer<typeof addCommentInputSchema>;
export type ReactToReviewInput = z.infer<typeof reactToReviewInputSchema>;
export type HideReviewInput = z.infer<typeof hideReviewInputSchema>;
export type ReportReason = z.infer<typeof reportReasonSchema>;
export type ReportReviewInput = z.infer<typeof reportReviewInputSchema>;
export type FollowUserInput = z.infer<typeof followUserInputSchema>;
export type CreateConversationInput = z.infer<typeof createConversationInputSchema>;
export type CreateActivityInput = z.infer<typeof createActivityInputSchema>;
export type RespondToActivityInvitationInput = z.infer<typeof respondToActivityInvitationInputSchema>;
export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;
export type ConversationInput = z.infer<typeof conversationInputSchema>;
export type MarkConversationReadInput = z.infer<typeof markConversationReadInputSchema>;
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenInputSchema>;
export type UnregisterPushTokenInput = z.infer<typeof unregisterPushTokenInputSchema>;
export type CreateFolderInput = z.infer<typeof createFolderInputSchema>;
export type RenameFolderInput = z.infer<typeof renameFolderInputSchema>;
export type DeleteFolderInput = z.infer<typeof deleteFolderInputSchema>;
export type SaveVenueInput = z.infer<typeof saveVenueInputSchema>;
export type UnsaveVenueInput = z.infer<typeof unsaveVenueInputSchema>;
export type PageInput = z.infer<typeof pageInputSchema>;
export type GetFeedInput = z.infer<typeof getFeedInputSchema>;
export type GetCommentsInput = z.infer<typeof getCommentsInputSchema>;
export type ListConversationsInput = z.infer<typeof listConversationsInputSchema>;
export type GetMessagesInput = z.infer<typeof getMessagesInputSchema>;
export type GetLeaderboardInput = z.infer<typeof getLeaderboardInputSchema>;
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingInputSchema>;
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

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface FeedItem extends Review {
  createdAt: string;
}

export interface Comment {
  id: string;
  reviewId: string;
  authorId: string;
  authorDisplayName: string;
  text: string;
  createdAt: string;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  username: string | null;
  photoUrl: string | null;
  xp: number;
  rank: number;
}

export interface SessionStatus {
  profileExists: boolean;
  onboardingVersion: number;
  onboardingComplete: boolean;
}

export interface FollowResult {
  following: boolean;
}

export interface ConversationParticipant {
  userId: string;
  displayName: string;
  username: string | null;
  photoUrl: string | null;
}

export interface ConversationSummary {
  id: string;
  kind: 'direct' | 'activity';
  participantIds: string[];
  otherParticipant: ConversationParticipant | null;
  activityId: string | null;
  title: string | null;
  imageUrl: string | null;
  organizerId: string | null;
  invitationStatus: 'pending' | 'accepted' | 'declined' | null;
  lastMessage: {
    id: string;
    senderId: string;
    text: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  recipientIds: string[];
  text: string;
  createdAt: string;
}

export interface MarkConversationReadResult {
  conversationId: string;
  unreadCount: 0;
}

export interface PushTokenResult {
  registered: boolean;
}

export interface FavouriteFolder {
  id: string;
  name: string;
  placeCount: number;
  createdAt: string;
}

export interface FavouritePlace {
  venueId: string;
  folderIds: string[];
  savedAt: string;
  name: string;
  city: string;
  address: string;
  category: string;
  imageUrl: string | null;
  priceLevel: number;
  distanceKm: number;
  rating: number;
  reviewCount: number;
}

export interface FavouritesResult {
  folders: FavouriteFolder[];
  places: FavouritePlace[];
}

export interface SaveVenueResult {
  saved: boolean;
  folderIds: string[];
}

export interface ProfilePhotoResult {
  photoPath: string;
  photoUrl: string;
}

export interface ActivityCandidate {
  userId: string;
  displayName: string;
  username: string | null;
  photoUrl: string | null;
}

export interface DiscoverPerson {
  userId: string;
  displayName: string;
  username: string | null;
  photoUrl: string | null;
  bio: string;
  favoriteCuisines: string[];
  weeklyFollowerGrowth: number;
  followerCount: number;
  followingCount: number;
  reviewCount: number;
  following: boolean;
  createdAt: string;
}

export interface DiscoverReview {
  id: string;
  authorId: string;
  authorDisplayName: string;
  authorPhotoUrl: string | null;
  venueId: string;
  venueName: string;
  venueCategory: string;
  venueImageUrl: string | null;
  rating: number;
  text: string;
  reactionCount: number;
  commentCount: number;
  createdAt: string;
}

export interface DiscoverFeed {
  hero: Venue | null;
  trending: Venue[];
  newSpots: Venue[];
  mostReviewed: Venue[];
  forYou: Venue[];
  hiddenGems: Venue[];
  popularReviews: DiscoverReview[];
  topReviewer: DiscoverPerson | null;
}

export interface PlaceDish {
  name: string;
  rating: number;
}

export interface PlaceDetails {
  venue: Venue;
  phone: string | null;
  website: string | null;
  openingHours: Array<{ day: string; hours: string }>;
  photoUrls: string[];
  photoCount: number;
  chips: string[];
  popularDishes: PlaceDish[];
}

export interface PlaceReview {
  id: string;
  authorId: string;
  authorDisplayName: string;
  authorUsername: string | null;
  authorPhotoUrl: string | null;
  rating: number;
  text: string;
  reactionCount: number;
  commentCount: number;
  createdAt: string;
  tag: string | null;
  dishNames: string[];
  tags: ReviewTag[];
  dishReviews: DishReviewInput[];
}

export interface DiscoverPeopleResult {
  trending: DiscoverPerson[];
  new: DiscoverPerson[];
  suggested: DiscoverPerson[];
}

export type ApiErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'invalid-argument'
  | 'not-found'
  | 'failed-precondition'
  | 'resource-exhausted'
  | 'unavailable'
  | 'deadline-exceeded'
  | 'internal';
