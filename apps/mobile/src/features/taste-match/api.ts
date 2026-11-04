import { useQuery } from '@tanstack/react-query';
import type { GetTasteRecommendationsInput } from '@tastes/contracts';
import {
  useAuthenticatedUserId,
  useTastesApi,
} from '../../session/SessionProvider';

export function useTasteRecommendations(
  location: GetTasteRecommendationsInput = {},
) {
  const api = useTastesApi(),
    uid = useAuthenticatedUserId();
  return useQuery({
    queryKey: [
      'taste-recommendations',
      uid,
      location.latitude?.toFixed(3),
      location.longitude?.toFixed(3),
      location.novelty ?? 'canonical_dish',
    ],
    queryFn: async () => (await api.getTasteRecommendations(location)).data,
    enabled: !!uid && typeof api.getTasteRecommendations === 'function',
    staleTime: 30_000,
  });
}
