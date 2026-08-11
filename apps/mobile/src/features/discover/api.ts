import type { DiscoverTag } from '@tastes/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTastesApi } from '../../session/SessionProvider';

export const discoverFeedQueryKey = (userId: string) => ['discover', 'feed', userId] as const;
export const discoverPeopleQueryKey = (userId: string) => ['discover', 'people', userId] as const;
export const placeQueryKey = (venueId: string) => ['place', venueId] as const;
export const placeReviewsQueryKey = (venueId: string, sort: string, scope = 'all') => ['place', venueId, 'reviews', sort, scope] as const;
export type DiscoverVenueFilter = {
  category?: string;
  tag?: DiscoverTag;
};

export const discoverVenuesQueryKey = (userId: string, filter: DiscoverVenueFilter) => [
  'discover',
  'venues',
  userId,
  filter.category ?? null,
  filter.tag ?? null,
] as const;

export function useDiscoverFeed(userId: string) {
  const api = useTastesApi();
  return useQuery({
    queryKey: discoverFeedQueryKey(userId),
    queryFn: async () => (await api.getDiscoverFeed()).data,
  });
}

export function useDiscoverPeople(userId: string) {
  const api = useTastesApi();
  return useQuery({
    queryKey: discoverPeopleQueryKey(userId),
    queryFn: async () => (await api.getDiscoverPeople()).data,
  });
}

export function useDiscoverVenues(userId: string, filter: DiscoverVenueFilter = {}) {
  const api = useTastesApi();
  return useInfiniteQuery({
    queryKey: discoverVenuesQueryKey(userId, filter),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => (
      await api.getVenues({ ...filter, cursor: pageParam, limit: 20 })
    ).data,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function usePlace(venueId: string) {
  const api = useTastesApi();
  return useQuery({
    queryKey: placeQueryKey(venueId),
    queryFn: async () => (await api.getPlace({ venueId })).data,
    enabled: venueId.length > 0,
  });
}

export function usePlaceReviews(venueId: string, sort: 'highest' | 'lowest' | 'popular' | 'recent' | 'oldest', scope: 'all' | 'friends' = 'all') {
  const api = useTastesApi();
  return useQuery({
    queryKey: placeReviewsQueryKey(venueId, sort, scope),
    queryFn: async () => (await api.getPlaceReviews({ venueId, sort, scope })).data,
  });
}

export function useToggleFollow(userId: string) {
  const api = useTastesApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ targetUserId, following }: { targetUserId: string; following: boolean }) => (
      following ? api.unfollowUser({ targetUserId }) : api.followUser({ targetUserId })
    ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: discoverFeedQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: discoverPeopleQueryKey(userId) }),
      ]);
    },
  });
}
