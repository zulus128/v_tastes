import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthenticatedUserId, useTastesApi } from '../../session/SessionProvider';
import { createIdempotencyKey } from '../../infrastructure/idempotency';

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

export function useReactToReview() {
  const api = useTastesApi();
  const userId = useAuthenticatedUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reviewId: string) => api.reactToReview({
      reviewId,
      idempotencyKey: createIdempotencyKey('feed-reaction'),
      reaction: 'like',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['feed', userId] });
    },
  });
}
