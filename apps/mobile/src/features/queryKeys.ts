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
