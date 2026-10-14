import type { TastesApi } from '@tastes/firebase-client';
import type { QueryClient } from '@tanstack/react-query';
import {
  commentsQueryKey,
  conversationMessagesQueryKey,
  placeQueryKey,
  placeReviewsQueryKey,
} from '../features/queryKeys';

const nextCursor = (page: { nextCursor?: string | null }) =>
  page.nextCursor ?? undefined;

export function prefetchComments(
  queryClient: QueryClient,
  api: TastesApi,
  userId: string,
  reviewId: string,
) {
  return queryClient.prefetchInfiniteQuery({
    queryKey: commentsQueryKey(userId, reviewId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (
        await api.getComments({
          reviewId,
          cursor: pageParam,
          limit: 30,
        })
      ).data,
    getNextPageParam: nextCursor,
    staleTime: 30_000,
  });
}

export function prefetchCommentsForReviews(
  queryClient: QueryClient,
  api: TastesApi,
  userId: string,
  reviewIds: string[],
) {
  return Promise.allSettled(
    [...new Set(reviewIds)]
      .filter(Boolean)
      .map((reviewId) => prefetchComments(queryClient, api, userId, reviewId)),
  );
}

export function prefetchPlace(
  queryClient: QueryClient,
  api: TastesApi,
  venueId: string,
) {
  return Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: placeQueryKey(venueId),
      queryFn: async () => (await api.getPlace({ venueId })).data,
      staleTime: 30_000,
    }),
    queryClient.prefetchInfiniteQuery({
      queryKey: placeReviewsQueryKey(venueId, 'recent', 'all'),
      initialPageParam: null as string | null,
      queryFn: async ({ pageParam }) =>
        (
          await api.getPlaceReviews({
            venueId,
            sort: 'recent',
            scope: 'all',
            cursor: pageParam,
            limit: 20,
          })
        ).data,
      getNextPageParam: nextCursor,
      staleTime: 30_000,
    }),
  ]);
}

export function prefetchConversationMessages(
  queryClient: QueryClient,
  api: TastesApi,
  conversationId: string,
) {
  return queryClient.prefetchInfiniteQuery({
    queryKey: conversationMessagesQueryKey(conversationId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (
        await api.getMessages({
          conversationId,
          cursor: pageParam,
          limit: 50,
        })
      ).data,
    getNextPageParam: nextCursor,
    staleTime: 15_000,
  });
}
