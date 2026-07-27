import { useInfiniteQuery } from '@tanstack/react-query';
import { useTastesApi } from '../../session/SessionProvider';

export function useLeaderboard(period: 'month' | 'allTime') {
  const api = useTastesApi();
  return useInfiniteQuery({
    queryKey: ['leaderboard', period],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const response = await api.getLeaderboard({ period, cursor: pageParam, limit: 30 });
      return response.data;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
