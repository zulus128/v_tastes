import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthenticatedUserId, useTastesApi } from '../../session/SessionProvider';

export interface AddCommentCommand {
  idempotencyKey: string;
  parentCommentId?: string | null;
  text: string;
}

export function useComments(reviewId: string) {
  const api = useTastesApi();
  const userId = useAuthenticatedUserId();
  return useInfiniteQuery({
    queryKey: ['comments', userId, reviewId],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const response = await api.getComments({ reviewId, cursor: pageParam, limit: 30 });
      return response.data;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: reviewId.length > 0,
  });
}

export function useReactToComment(reviewId: string) {
  const api = useTastesApi();
  const userId = useAuthenticatedUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, idempotencyKey }: { commentId: string; idempotencyKey: string }) => api.reactToComment({ reviewId, commentId, idempotencyKey, reaction: 'like' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comments', userId, reviewId] }),
  });
}

export function useDeleteComment(reviewId: string) {
  const api = useTastesApi();
  const userId = useAuthenticatedUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api.deleteComment({ reviewId, commentId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comments', userId, reviewId] }),
  });
}

export function useAddComment(reviewId: string) {
  const api = useTastesApi();
  const userId = useAuthenticatedUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: AddCommentCommand) => api.addComment({ reviewId, ...command }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['comments', userId, reviewId] }),
        queryClient.invalidateQueries({ queryKey: ['feed', userId] }),
      ]);
    },
  });
}
