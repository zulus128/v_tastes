import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuthenticatedUserId, useTastesApi } from '../../session/SessionProvider';

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
