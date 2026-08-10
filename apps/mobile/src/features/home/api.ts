import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useAuthenticatedUserId, useTastesApi } from '../../session/SessionProvider';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import type { FeedItem, Page } from '@tastes/contracts';
import type {
  ReportReviewInput,
} from '@tastes/contracts';

type FeedReactionState = Record<string, boolean>;

const feedScopes = ['friends', 'local'] as const;
type FeedScope = typeof feedScopes[number];

type FeedReactionMutationContext = {
  previousReactions: FeedReactionState;
  previousPagesByScope: Array<{ scope: FeedScope; data: InfiniteData<Page<FeedItem>> | undefined }>;
};

const feedQueryKey = (userId: string, scope: FeedScope) => ['feed', userId, scope] as const;
const reactionQueryKey = (userId: string) => ['feedReactions', userId] as const;

export function useFeed(scope: 'friends' | 'local') {
  const api = useTastesApi();
  const userId = useAuthenticatedUserId();
  return useInfiniteQuery({
    queryKey: ['feed', userId, scope],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const response = await api.getFeed({ scope, cursor: pageParam, limit: 20 });
      return response.data;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function useLatestFeedItem(scope: 'friends' | 'local') {
  const api = useTastesApi();
  const userId = useAuthenticatedUserId();
  return useQuery({
    queryKey: ['feedLatest', userId, scope],
    queryFn: async () => {
      const response = await api.getFeed({ scope, limit: 1 });
      return response.data.items[0] ?? null;
    },
    staleTime: 45_000,
    refetchInterval: 20_000,
  });
}

export function useFeedReactionState() {
  const userId = useAuthenticatedUserId();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: reactionQueryKey(userId),
    queryFn: async () => {
      return queryClient.getQueryData<FeedReactionState>(reactionQueryKey(userId)) ?? {};
    },
    initialData: () => queryClient.getQueryData<FeedReactionState>(reactionQueryKey(userId)) ?? {},
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useReactToReview() {
  const api = useTastesApi();
  const userId = useAuthenticatedUserId();
  const queryClient = useQueryClient();
  return useMutation<{ active: boolean; reactionCount: number }, Error, string, FeedReactionMutationContext>({
    mutationFn: async (reviewId: string) => {
      const response = await api.reactToReview({
      reviewId,
      idempotencyKey: createIdempotencyKey('feed-reaction'),
      reaction: 'like',
      });
      return response.data;
    },
    onMutate: async (reviewId) => {
      const reactionCacheKey = reactionQueryKey(userId);
      const previousReactions = queryClient.getQueryData<FeedReactionState>(reactionCacheKey) ?? {};
      const previousActive = previousReactions[reviewId] ?? false;
      const nextActive = !previousActive;
      const delta = nextActive ? 1 : -1;

      await queryClient.cancelQueries({ queryKey: ['feed', userId] });
      queryClient.setQueryData<FeedReactionState>(reactionCacheKey, {
        ...previousReactions,
        [reviewId]: nextActive,
      });

      const previousPagesByScope: Array<{ scope: FeedScope; data: InfiniteData<Page<FeedItem>> | undefined }> = [];
      feedScopes.forEach((feedScope) => {
        const key = feedQueryKey(userId, feedScope);
        const previousPageData = queryClient.getQueryData<InfiniteData<Page<FeedItem>>>(key);
        previousPagesByScope.push({ scope: feedScope, data: previousPageData });
        if (!previousPageData) {
          return;
        }

        queryClient.setQueryData<InfiniteData<Page<FeedItem>>>(key, (current) => {
          if (!current) {
            return previousPageData;
          }
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((candidate) => (candidate.id === reviewId
                ? {
                  ...candidate,
                  reactionCount: Math.max(0, candidate.reactionCount + delta),
                }
                : candidate)),
            })),
          };
        });
      });

      return {
        previousReactions,
        previousPagesByScope,
      };
    },
    onSuccess: async (response, reviewId) => {
      const reactionCacheKey = reactionQueryKey(userId);
      const previousReactions = queryClient.getQueryData<FeedReactionState>(reactionCacheKey) ?? {};
      queryClient.setQueryData<FeedReactionState>(reactionCacheKey, {
        ...previousReactions,
        [reviewId]: response.active,
      });

      feedScopes.forEach((feedScope) => {
        queryClient.setQueryData<InfiniteData<Page<FeedItem>>>(feedQueryKey(userId, feedScope), (current) => {
          if (!current) return current;
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((candidate) => (candidate.id === reviewId
                ? { ...candidate, reactionCount: response.reactionCount }
                : candidate)),
            })),
          };
        });
      });
    },
    onError: (_error, _reviewId, context) => {
      if (!context) {
        return;
      }
      const reactionCacheKey = reactionQueryKey(userId);
      if (context.previousReactions) {
        queryClient.setQueryData<FeedReactionState>(reactionCacheKey, context.previousReactions);
      }
      context.previousPagesByScope?.forEach(({ scope, data }) => {
        queryClient.setQueryData(feedQueryKey(userId, scope), data);
      });
    },
  });
}

export function useHideReview() {
  const api = useTastesApi();
  const userId = useAuthenticatedUserId();
  const queryClient = useQueryClient();
  return useMutation<string, Error, string, { previousPagesByScope: Array<{ scope: FeedScope; data: InfiniteData<Page<FeedItem>> | undefined }> }>({
    mutationFn: async (reviewId: string) => {
      const response = await api.hideReview({ reviewId });
      return response.data.id;
    },
    onMutate: async (reviewId) => {
      const previousPagesByScope: Array<{ scope: FeedScope; data: InfiniteData<Page<FeedItem>> | undefined }> = [];
      await queryClient.cancelQueries({ queryKey: ['feed', userId] });

      feedScopes.forEach((feedScope) => {
        const key = feedQueryKey(userId, feedScope);
        const previousPageData = queryClient.getQueryData<InfiniteData<Page<FeedItem>>>(key);
        previousPagesByScope.push({ scope: feedScope, data: previousPageData });
        if (!previousPageData) {
          return;
        }
        queryClient.setQueryData<InfiniteData<Page<FeedItem>>>(key, (current) => {
          if (!current) {
            return previousPageData;
          }
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.filter((candidate) => candidate.id !== reviewId),
            })),
          };
        });
      });

      return { previousPagesByScope };
    },
    onError: (_error, _reviewId, context) => {
      context?.previousPagesByScope.forEach(({ scope, data }) => {
        queryClient.setQueryData(feedQueryKey(userId, scope), data);
      });
    },
  });
}

export function useReportReview() {
  const api = useTastesApi();
  return useMutation<{ id: string }, Error, Omit<ReportReviewInput, 'idempotencyKey'>>({
    mutationFn: async (input) => {
      const response = await api.reportReview({
      ...input,
      idempotencyKey: createIdempotencyKey('report-review'),
      });
      return response.data;
    },
  });
}
