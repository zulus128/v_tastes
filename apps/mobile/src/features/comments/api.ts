import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTastesApi } from '../../session/SessionProvider';

export function useComments(reviewId: string) {
  const api = useTastesApi();
  return useInfiniteQuery({
    queryKey: ['comments', reviewId],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const response = await api.getComments({ reviewId, cursor: pageParam, limit: 30 });
      return response.data;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: reviewId.length > 0,
  });
}

export function useAddComment(reviewId: string) {
  const api = useTastesApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.addComment({ reviewId, text }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['comments', reviewId] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
      ]);
    },
  });
}
