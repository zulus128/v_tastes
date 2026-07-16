import type {
  AddCommentInput,
  CreateReviewInput,
  CreateUserProfileInput,
  HealthCheckResult,
  ReactToReviewInput,
} from '@tastes/contracts';
import type { Functions } from 'firebase/functions';
import { httpsCallable } from 'firebase/functions';

export interface IdResult {
  id: string;
}

export interface ReactionResult {
  active: boolean;
  reactionCount: number;
}

export function createTastesApi(functions: Functions) {
  return {
    healthCheck: () =>
      httpsCallable<Record<string, never>, HealthCheckResult>(functions, 'healthCheck')({}),
    createUserProfile: (input: CreateUserProfileInput) =>
      httpsCallable<CreateUserProfileInput, IdResult>(functions, 'createUserProfile')(input),
    createReview: (input: CreateReviewInput) =>
      httpsCallable<CreateReviewInput, IdResult>(functions, 'createReview')(input),
    addComment: (input: AddCommentInput) =>
      httpsCallable<AddCommentInput, IdResult>(functions, 'addComment')(input),
    reactToReview: (input: ReactToReviewInput) =>
      httpsCallable<ReactToReviewInput, ReactionResult>(functions, 'reactToReview')(input),
  };
}

export type TastesApi = ReturnType<typeof createTastesApi>;
