import type { DiscoverTag } from '@tastes/contracts';

export const feedQueryKey = (userId: string, scope: 'friends' | 'local') =>
  ['feed', userId, scope] as const;

export const discoverFeedQueryKey = (
  userId: string,
  profileSignature?: string,
) => ['discover', 'feed', userId, profileSignature] as const;

export const discoverPeopleQueryKey = (userId: string) =>
  ['discover', 'people', userId] as const;

export const discoverVenuesQueryKey = (
  userId: string,
  filter: { category?: string; tag?: DiscoverTag },
) =>
  [
    'discover',
    'venues',
    userId,
    filter.category ?? null,
    filter.tag ?? null,
  ] as const;

export const favouritesQueryKey = (userId: string) =>
  ['favourites', userId] as const;

export const leaderboardQueryKey = (
  userId: string,
  period: 'month' | 'allTime',
  audience: 'friends' | 'local',
) => ['leaderboard', userId, period, audience] as const;

export const conversationHistoryQueryKey = (userId: string) =>
  ['conversations', userId, 'history'] as const;

export const conversationMessagesQueryKey = (conversationId: string) =>
  ['messages', conversationId, 'history'] as const;

export const commentsQueryKey = (userId: string, reviewId: string) =>
  ['comments', userId, reviewId] as const;

export const notificationsQueryKey = (userId: string) =>
  ['notifications', userId, 'list'] as const;

export const requestsQueryKey = (userId: string) =>
  ['requests', userId] as const;

export const placeQueryKey = (venueId: string) => ['place', venueId] as const;

export const placeReviewsQueryKey = (
  venueId: string,
  sort: string,
  scope = 'all',
) => ['place', venueId, 'reviews', sort, scope] as const;
