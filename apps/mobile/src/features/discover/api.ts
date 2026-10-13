import type { DiscoverFeed, DiscoverTag } from '@tastes/contracts';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTastesApi } from '../../session/SessionProvider';
import {
  discoverFeedQueryKey,
  discoverPeopleQueryKey,
  discoverVenuesQueryKey,
  placeQueryKey,
  placeReviewsQueryKey,
} from '../queryKeys';
import { normalizePlaceReviewPage } from './reviewNormalization';

export {
  discoverFeedQueryKey,
  discoverPeopleQueryKey,
  discoverVenuesQueryKey,
  placeQueryKey,
  placeReviewsQueryKey,
} from '../queryKeys';
export const peopleSearchQueryKey = (userId: string, query: string) =>
  ['discover', 'people-search', userId, query] as const;
export const venueSearchQueryKey = (query: string) =>
  ['venues', 'search', query] as const;
export type DiscoverVenueFilter = {
  category?: string;
  tag?: DiscoverTag;
};

export function normalizeDiscoverFeed(feed: DiscoverFeed): DiscoverFeed {
  return {
    ...feed,
    popularReviews: feed.popularReviews.map((review) => ({
      ...review,
      // Older persisted reviews predate tags. Keep those records renderable
      // instead of letting a missing optional field crash the whole feed.
      tags: Array.isArray(review.tags) ? review.tags : [],
    })),
  };
}

export function useDiscoverFeed(userId: string, profileSignature?: string) {
  const api = useTastesApi();
  return useQuery({
    queryKey: discoverFeedQueryKey(userId, profileSignature),
    queryFn: async () => (await api.getDiscoverFeed()).data,
    select: normalizeDiscoverFeed,
  });
}

export function useDiscoverPeople(userId: string) {
  const api = useTastesApi();
  return useQuery({
    queryKey: discoverPeopleQueryKey(userId),
    queryFn: async () => (await api.getDiscoverPeople()).data,
  });
}

export function usePeopleSearch(userId: string, query: string) {
  const api = useTastesApi();
  const normalized = query.trim();
  return useQuery({
    queryKey: peopleSearchQueryKey(userId, normalized),
    queryFn: async () =>
      (await api.searchPeople({ query: normalized, limit: 20 })).data,
    enabled: normalized.length >= 2,
  });
}

export function useDiscoverVenues(
  userId: string,
  filter: DiscoverVenueFilter = {},
) {
  const api = useTastesApi();
  return useInfiniteQuery({
    queryKey: discoverVenuesQueryKey(userId, filter),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (
        await api.getVenues({
          ...(filter.category ? { category: filter.category } : {}),
          ...(filter.tag ? { tag: filter.tag } : {}),
          cursor: pageParam,
          limit: 20,
        })
      ).data,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function useVenueSearch(query: string) {
  const api = useTastesApi();
  const normalized = query.trim();
  return useQuery({
    queryKey: venueSearchQueryKey(normalized),
    queryFn: async () =>
      (await api.searchVenues({ query: normalized, limit: 20 })).data,
    enabled: normalized.length >= 2,
  });
}

export function usePlace(venueId: string) {
  const api = useTastesApi();
  return useQuery({
    queryKey: placeQueryKey(venueId),
    queryFn: async () => (await api.getPlace({ venueId })).data,
    enabled: venueId.length > 0,
    staleTime: 30_000,
  });
}

export function usePlaceReviews(
  venueId: string,
  sort: 'highest' | 'lowest' | 'popular' | 'recent' | 'oldest',
  scope: 'all' | 'friends' = 'all',
) {
  const api = useTastesApi();
  return useInfiniteQuery({
    queryKey: placeReviewsQueryKey(venueId, sort, scope),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (
        await api.getPlaceReviews({
          venueId,
          sort,
          scope,
          cursor: pageParam,
          limit: 20,
        })
      ).data,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
    select: (data) => data.pages.flatMap(normalizePlaceReviewPage),
    // Switching sort/scope changes the query key; without this, the whole
    // toolbar+list would briefly get swapped for the loading spinner every
    // time, leaving a jarring blank gap where the previous reviews were.
    placeholderData: keepPreviousData,
  });
}

export function useToggleFollow(userId: string) {
  const api = useTastesApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      targetUserId,
      following,
    }: {
      targetUserId: string;
      following: boolean;
    }) =>
      following
        ? api.unfollowUser({ targetUserId })
        : api.followUser({ targetUserId }),
    onMutate: async ({ targetUserId, following }) => {
      await queryClient.cancelQueries({ queryKey: ['discover'] });
      const snapshots = queryClient.getQueriesData({ queryKey: ['discover'] });
      const nextFollowing = !following;
      const update = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(update);
        if (!value || typeof value !== 'object') return value;
        const record = value as Record<string, unknown>;
        const next = Object.fromEntries(
          Object.entries(record).map(([key, entry]) => [key, update(entry)]),
        );
        if (record.userId === targetUserId) next.following = nextFollowing;
        return next;
      };
      for (const [queryKey, data] of snapshots)
        queryClient.setQueryData(queryKey, update(data));
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      for (const [queryKey, data] of context?.snapshots ?? [])
        queryClient.setQueryData(queryKey, data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: discoverFeedQueryKey(userId),
        }),
        queryClient.invalidateQueries({
          queryKey: discoverPeopleQueryKey(userId),
        }),
        queryClient.invalidateQueries({
          queryKey: ['discover', 'people-search', userId],
        }),
      ]);
    },
  });
}
