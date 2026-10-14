import type { TastesApi } from '@tastes/firebase-client';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  commentsQueryKey,
  conversationMessagesQueryKey,
  placeQueryKey,
  placeReviewsQueryKey,
} from '../src/features/queryKeys';
import {
  prefetchComments,
  prefetchCommentsForReviews,
  prefetchConversationMessages,
  prefetchPlace,
} from '../src/navigation/prefetchNextLists';

describe('next-screen list prefetching', () => {
  it('caches first pages before opening comments, places, and conversations', async () => {
    const page = { items: [], nextCursor: null };
    const api = {
      getComments: vi.fn().mockResolvedValue({ data: page }),
      getMessages: vi.fn().mockResolvedValue({ data: page }),
      getPlace: vi.fn().mockResolvedValue({ data: { venue: { id: 'v1' } } }),
      getPlaceReviews: vi.fn().mockResolvedValue({ data: page }),
    } as unknown as TastesApi;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await Promise.all([
      prefetchComments(queryClient, api, 'u1', 'r1'),
      prefetchConversationMessages(queryClient, api, 'c1'),
      prefetchPlace(queryClient, api, 'v1'),
    ]);

    expect(
      queryClient.getQueryData(commentsQueryKey('u1', 'r1')),
    ).toBeDefined();
    expect(
      queryClient.getQueryData(conversationMessagesQueryKey('c1')),
    ).toBeDefined();
    expect(queryClient.getQueryData(placeQueryKey('v1'))).toBeDefined();
    expect(
      queryClient.getQueryData(placeReviewsQueryKey('v1', 'recent', 'all')),
    ).toBeDefined();
  });

  it('prefetches visible review comments concurrently and deduplicates ids', async () => {
    const releases: Array<() => void> = [];
    const api = {
      getComments: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            releases.push(() =>
              resolve({ data: { items: [], nextCursor: null } }),
            );
          }),
      ),
    } as unknown as TastesApi;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const pending = prefetchCommentsForReviews(queryClient, api, 'u1', [
      'r1',
      'r2',
      'r1',
    ]);

    await vi.waitFor(() => expect(api.getComments).toHaveBeenCalledTimes(2));
    releases.forEach((release) => release());
    await pending;

    expect(
      queryClient.getQueryData(commentsQueryKey('u1', 'r1')),
    ).toBeDefined();
    expect(
      queryClient.getQueryData(commentsQueryKey('u1', 'r2')),
    ).toBeDefined();
  });
});
