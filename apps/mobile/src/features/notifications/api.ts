import { useQuery } from '@tanstack/react-query';
import { useAuthenticatedUserId, useTastesApi } from '../../session/SessionProvider';

export const unreadNotificationCountQueryKey = (userId: string) =>
  ['notifications', userId, 'unread-count'] as const;

export function useUnreadNotificationCount() {
  const api = useTastesApi();
  const userId = useAuthenticatedUserId();
  return useQuery({
    queryKey: unreadNotificationCountQueryKey(userId),
    queryFn: async () => (await api.getUnreadNotificationCount()).data.count,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}
