import type { TastesApi } from '@tastes/firebase-client';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { discoverFeedQueryKey, feedQueryKey } from '../src/features/queryKeys';
import { prefetchPrimaryLists } from '../src/navigation/prefetchPrimaryLists';

describe('prefetchPrimaryLists', () => {
  it('loads primary list data into the query cache before navigation', async () => {
    const page = { items: [], nextCursor: null };
    const api = {
      getDiscoverFeed: vi
        .fn()
        .mockResolvedValue({ data: { popularReviews: [] } }),
      getDiscoverPeople: vi.fn().mockResolvedValue({ data: {} }),
      getFavourites: vi.fn().mockResolvedValue({ data: page }),
      getFeed: vi.fn().mockResolvedValue({ data: page }),
      getLeaderboard: vi.fn().mockResolvedValue({ data: page }),
      getVenues: vi.fn().mockResolvedValue({ data: page }),
      listConversations: vi.fn().mockResolvedValue({ data: page }),
    } as unknown as TastesApi;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await prefetchPrimaryLists(queryClient, api, 'user-1');

    expect(api.getFeed).toHaveBeenCalledTimes(2);
    expect(api.getVenues).toHaveBeenCalledWith({ cursor: null, limit: 20 });
    expect(api.listConversations).toHaveBeenCalledWith({
      cursor: null,
      limit: 50,
    });
    expect(
      queryClient.getQueryData(feedQueryKey('user-1', 'friends')),
    ).toBeDefined();
    expect(queryClient.getQueryData(discoverFeedQueryKey('user-1'))).toEqual({
      popularReviews: [],
    });
  });
});
