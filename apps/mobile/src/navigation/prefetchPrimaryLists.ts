import type { TastesApi } from '@tastes/firebase-client';
import type { QueryClient } from '@tanstack/react-query';
import {
  conversationHistoryQueryKey,
  discoverFeedQueryKey,
  discoverPeopleQueryKey,
  discoverVenuesQueryKey,
  favouritesQueryKey,
  feedQueryKey,
  leaderboardQueryKey,
  notificationsQueryKey,
  requestsQueryKey,
} from '../features/queryKeys';

export function prefetchPrimaryLists(
  queryClient: QueryClient,
  api: TastesApi,
  userId: string,
) {
  const nextCursor = (page: { nextCursor?: string | null }) =>
    page.nextCursor ?? undefined;

  return Promise.allSettled([
    ...(['friends', 'local'] as const).map((scope) =>
      queryClient.prefetchInfiniteQuery({
        queryKey: feedQueryKey(userId, scope),
        initialPageParam: null as string | null,
        queryFn: async ({ pageParam }) =>
          (await api.getFeed({ scope, cursor: pageParam, limit: 20 })).data,
        getNextPageParam: nextCursor,
      }),
    ),
    queryClient.prefetchQuery({
      queryKey: discoverFeedQueryKey(userId),
      queryFn: async () => (await api.getDiscoverFeed()).data,
    }),
    queryClient.prefetchQuery({
      queryKey: discoverPeopleQueryKey(userId),
      queryFn: async () => (await api.getDiscoverPeople()).data,
    }),
    queryClient.prefetchInfiniteQuery({
      queryKey: discoverVenuesQueryKey(userId, {}),
      initialPageParam: null as string | null,
      queryFn: async ({ pageParam }) =>
        (await api.getVenues({ cursor: pageParam, limit: 20 })).data,
      getNextPageParam: nextCursor,
    }),
    queryClient.prefetchInfiniteQuery({
      queryKey: conversationHistoryQueryKey(userId),
      initialPageParam: null as string | null,
      queryFn: async ({ pageParam }) =>
        (await api.listConversations({ cursor: pageParam, limit: 50 })).data,
      getNextPageParam: nextCursor,
    }),
    queryClient.prefetchInfiniteQuery({
      queryKey: favouritesQueryKey(userId),
      initialPageParam: null as string | null,
      queryFn: async ({ pageParam }) =>
        (await api.getFavourites({ cursor: pageParam, limit: 10 })).data,
      getNextPageParam: nextCursor,
    }),
    queryClient.prefetchInfiniteQuery({
      queryKey: leaderboardQueryKey(userId, 'month', 'friends'),
      initialPageParam: null as string | null,
      queryFn: async ({ pageParam }) =>
        (
          await api.getLeaderboard({
            period: 'month',
            audience: 'friends',
            cursor: pageParam,
            limit: 30,
          })
        ).data,
      getNextPageParam: nextCursor,
    }),
    queryClient.prefetchInfiniteQuery({
      queryKey: notificationsQueryKey(userId),
      initialPageParam: null as string | null,
      queryFn: async ({ pageParam }) =>
        (await api.listNotifications({ cursor: pageParam, limit: 20 })).data,
      getNextPageParam: nextCursor,
    }),
    queryClient.prefetchQuery({
      queryKey: requestsQueryKey(userId),
      queryFn: async () => (await api.listRequests()).data,
    }),
  ]);
}
