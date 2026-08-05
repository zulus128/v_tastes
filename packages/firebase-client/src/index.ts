import type {
  AddCommentInput,
  ApiErrorCode,
  Comment,
  CompleteOnboardingInput,
  ConversationSummary,
  CreateActivityInput,
  CreateConversationInput,
  CreateFolderInput,
  CreateReviewInput,
  CreateUserProfileInput,
  DeleteFolderInput,
  DiscoverFeed,
  DiscoverPeopleResult,
  FeedItem,
  FavouritesResult,
  FollowResult,
  FollowUserInput,
  GetCommentsInput,
  GetFeedInput,
  GetLeaderboardInput,
  GetMessagesInput,
  GetPlaceInput,
  GetPlaceReviewsInput,
  GetVenuesInput,
  HealthCheckResult,
  ActivityCandidate,
  LeaderboardEntry,
  ListConversationsInput,
  MarkConversationReadInput,
  MarkConversationReadResult,
  PlaceDetails,
  PlaceReview,
  Page,
  ProfilePhotoResult,
  ReactToReviewInput,
  RespondToActivityInvitationInput,
  RegisterPushTokenInput,
  RenameFolderInput,
  RequestPhoneOtpInput,
  RequestPhoneOtpResult,
  SessionStatus,
  SaveVenueInput,
  SaveVenueResult,
  SendMessageInput,
  ChatMessage,
  PushTokenResult,
  UnsaveVenueInput,
  UnregisterPushTokenInput,
  UpdateProfilePhotoInput,
  Venue,
  VerifyPhoneOtpInput,
  VerifyPhoneOtpResult,
} from '@tastes/contracts';
import type { Functions } from 'firebase/functions';
import { httpsCallable, type HttpsCallableResult } from 'firebase/functions';

export const callableOperationNames = [
  'healthCheck',
  'requestPhoneOtp',
  'verifyPhoneOtp',
  'getSessionStatus',
  'completeOnboarding',
  'createUserProfile',
  'updateProfilePhoto',
  'followUser',
  'unfollowUser',
  'createConversation',
  'listActivityCandidates',
  'createActivity',
  'respondToActivityInvitation',
  'listConversations',
  'getMessages',
  'sendMessage',
  'markConversationRead',
  'registerPushToken',
  'unregisterPushToken',
  'getFavourites',
  'createFolder',
  'renameFolder',
  'deleteFolder',
  'saveVenue',
  'unsaveVenue',
  'getFeed',
  'createReview',
  'getComments',
  'addComment',
  'reactToReview',
  'getLeaderboard',
  'getDiscoverFeed',
  'getDiscoverPeople',
  'getVenues',
  'getPlace',
  'getPlaceReviews',
] as const;

export type CallableOperationName = typeof callableOperationNames[number];

export interface IdResult {
  id: string;
}

export interface ReactionResult {
  active: boolean;
  reactionCount: number;
}

export class TastesApiError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'TastesApiError';
    this.retryable = code === 'unavailable' || code === 'deadline-exceeded' || code === 'internal';
  }
}

interface ValidationIssue {
  path?: unknown;
  message?: unknown;
}

/**
 * Human-readable message for an API failure. Validation errors carry the
 * per-field zod messages in `details.issues`; surface the first one instead
 * of the generic "The request payload is invalid.".
 */
export function apiErrorMessage(error: unknown): string {
  const normalized = normalizeApiError(error);
  if (normalized.code === 'invalid-argument') {
    const issues = (normalized.details as { issues?: ValidationIssue[] } | undefined)?.issues;
    const message = issues?.find((issue) => typeof issue.message === 'string')?.message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return normalized.message;
}

export function normalizeApiError(error: unknown): TastesApiError {
  if (error instanceof TastesApiError) return error;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const rawCode = typeof candidate?.code === 'string'
    ? candidate.code.replace(/^functions\//, '')
    : 'internal';
  const supportedCodes: ApiErrorCode[] = [
    'unauthenticated',
    'permission-denied',
    'invalid-argument',
    'not-found',
    'failed-precondition',
    'resource-exhausted',
    'unavailable',
    'deadline-exceeded',
    'internal',
  ];
  const code = supportedCodes.includes(rawCode as ApiErrorCode)
    ? rawCode as ApiErrorCode
    : 'internal';
  const message = typeof candidate?.message === 'string' && candidate.message.length > 0
    ? candidate.message
    : 'Something went wrong. Please try again.';
  return new TastesApiError(code, message, candidate?.details, { cause: error });
}

export interface TastesApiOptions {
  onUnauthenticated?: (error: TastesApiError) => void | Promise<void>;
  onError?: (error: TastesApiError, operation: string) => void;
}

export function createTastesApi(functions: Functions, options: TastesApiOptions = {}) {
  async function invoke<Input, Output>(
    operation: CallableOperationName,
    input: Input,
  ): Promise<HttpsCallableResult<Output>> {
    try {
      return await httpsCallable<Input, Output>(functions, operation)(input);
    } catch (error) {
      const normalized = normalizeApiError(error);
      options.onError?.(normalized, operation);
      if (normalized.code === 'unauthenticated') {
        await options.onUnauthenticated?.(normalized);
      }
      throw normalized;
    }
  }

  return {
    healthCheck: () => invoke<Record<string, never>, HealthCheckResult>('healthCheck', {}),
    requestPhoneOtp: (input: RequestPhoneOtpInput) =>
      invoke<RequestPhoneOtpInput, RequestPhoneOtpResult>('requestPhoneOtp', input),
    verifyPhoneOtp: (input: VerifyPhoneOtpInput) =>
      invoke<VerifyPhoneOtpInput, VerifyPhoneOtpResult>('verifyPhoneOtp', input),
    getSessionStatus: () =>
      invoke<Record<string, never>, SessionStatus>('getSessionStatus', {}),
    completeOnboarding: (input: CompleteOnboardingInput) =>
      invoke<CompleteOnboardingInput, { onboardingVersion: number }>('completeOnboarding', input),
    createUserProfile: (input: CreateUserProfileInput) =>
      invoke<CreateUserProfileInput, IdResult>('createUserProfile', input),
    updateProfilePhoto: (input: UpdateProfilePhotoInput) =>
      invoke<UpdateProfilePhotoInput, ProfilePhotoResult>('updateProfilePhoto', input),
    followUser: (input: FollowUserInput) =>
      invoke<FollowUserInput, FollowResult>('followUser', input),
    unfollowUser: (input: FollowUserInput) =>
      invoke<FollowUserInput, FollowResult>('unfollowUser', input),
    createConversation: (input: CreateConversationInput) =>
      invoke<CreateConversationInput, IdResult>('createConversation', input),
    listActivityCandidates: () =>
      invoke<Record<string, never>, ActivityCandidate[]>('listActivityCandidates', {}),
    createActivity: (input: CreateActivityInput) =>
      invoke<CreateActivityInput, IdResult>('createActivity', input),
    respondToActivityInvitation: (input: RespondToActivityInvitationInput) =>
      invoke<RespondToActivityInvitationInput, IdResult>('respondToActivityInvitation', input),
    listConversations: (input: ListConversationsInput) =>
      invoke<ListConversationsInput, Page<ConversationSummary>>('listConversations', input),
    getMessages: (input: GetMessagesInput) =>
      invoke<GetMessagesInput, Page<ChatMessage>>('getMessages', input),
    sendMessage: (input: SendMessageInput) =>
      invoke<SendMessageInput, IdResult>('sendMessage', input),
    markConversationRead: (input: MarkConversationReadInput) =>
      invoke<MarkConversationReadInput, MarkConversationReadResult>('markConversationRead', input),
    registerPushToken: (input: RegisterPushTokenInput) =>
      invoke<RegisterPushTokenInput, PushTokenResult>('registerPushToken', input),
    unregisterPushToken: (input: UnregisterPushTokenInput) =>
      invoke<UnregisterPushTokenInput, PushTokenResult>('unregisterPushToken', input),
    getFavourites: () =>
      invoke<Record<string, never>, FavouritesResult>('getFavourites', {}),
    createFolder: (input: CreateFolderInput) =>
      invoke<CreateFolderInput, IdResult>('createFolder', input),
    renameFolder: (input: RenameFolderInput) =>
      invoke<RenameFolderInput, IdResult>('renameFolder', input),
    deleteFolder: (input: DeleteFolderInput) =>
      invoke<DeleteFolderInput, IdResult>('deleteFolder', input),
    saveVenue: (input: SaveVenueInput) =>
      invoke<SaveVenueInput, SaveVenueResult>('saveVenue', input),
    unsaveVenue: (input: UnsaveVenueInput) =>
      invoke<UnsaveVenueInput, SaveVenueResult>('unsaveVenue', input),
    getFeed: (input: GetFeedInput) =>
      invoke<GetFeedInput, Page<FeedItem>>('getFeed', input),
    createReview: (input: CreateReviewInput) =>
      invoke<CreateReviewInput, IdResult>('createReview', input),
    getComments: (input: GetCommentsInput) =>
      invoke<GetCommentsInput, Page<Comment>>('getComments', input),
    addComment: (input: AddCommentInput) =>
      invoke<AddCommentInput, IdResult>('addComment', input),
    reactToReview: (input: ReactToReviewInput) =>
      invoke<ReactToReviewInput, ReactionResult>('reactToReview', input),
    getLeaderboard: (input: GetLeaderboardInput) =>
      invoke<GetLeaderboardInput, Page<LeaderboardEntry>>('getLeaderboard', input),
    getDiscoverFeed: () =>
      invoke<Record<string, never>, DiscoverFeed>('getDiscoverFeed', {}),
    getDiscoverPeople: () =>
      invoke<Record<string, never>, DiscoverPeopleResult>('getDiscoverPeople', {}),
    getVenues: (input: GetVenuesInput) =>
      invoke<GetVenuesInput, Page<Venue>>('getVenues', input),
    getPlace: (input: GetPlaceInput) =>
      invoke<GetPlaceInput, PlaceDetails>('getPlace', input),
    getPlaceReviews: (input: GetPlaceReviewsInput) =>
      invoke<GetPlaceReviewsInput, PlaceReview[]>('getPlaceReviews', input),
  };
}

export type TastesApi = ReturnType<typeof createTastesApi>;
