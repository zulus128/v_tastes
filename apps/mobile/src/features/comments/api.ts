import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { Comment, CommentsPage } from '@tastes/contracts';
import type { ReactionResult } from '@tastes/firebase-client';
import {
  useAuthenticatedUserId,
  useTastesApi,
} from '../../session/SessionProvider';
import { commentsQueryKey } from '../queryKeys';

export interface AddCommentCommand {
  idempotencyKey: string;
  parentCommentId?: string | null;
  text: string;
}

export function useComments(reviewId: string) {
  const api = useTastesApi();
  const userId = useAuthenticatedUserId();
  return useInfiniteQuery({
    queryKey: commentsQueryKey(userId, reviewId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const response = await api.getComments({
        reviewId,
        cursor: pageParam,
        limit: 30,
      });
      return response.data;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: reviewId.length > 0,
    staleTime: 30_000,
  });
}

export function useReactToComment(reviewId: string) {
  const api = useTastesApi();
  const userId = useAuthenticatedUserId();
  const queryClient = useQueryClient();
  const queryKey = commentsQueryKey(userId, reviewId);
  return useMutation<
    ReactionResult,
    Error,
    { commentId: string; idempotencyKey: string },
    { previous: InfiniteData<CommentsPage> | undefined }
  >({
    mutationFn: async ({
      commentId,
      idempotencyKey,
    }: {
      commentId: string;
      idempotencyKey: string;
    }) => {
      const response = await api.reactToComment({
        reviewId,
        commentId,
        idempotencyKey,
        reaction: 'like',
      });
      return response.data;
    },
    onMutate: async ({ commentId }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<InfiniteData<CommentsPage>>(queryKey);
      queryClient.setQueryData<InfiniteData<CommentsPage>>(
        queryKey,
        (current) => {
          if (!current) return current;
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((comment) => {
                if (comment.id !== commentId) return comment;
                const active = !comment.reacted;
                return {
                  ...comment,
                  reacted: active,
                  reactionCount: Math.max(
                    0,
                    comment.reactionCount + (active ? 1 : -1),
                  ),
                };
              }),
            })),
          };
        },
      );
      return { previous };
    },
    onSuccess: (result, { commentId }) => {
      queryClient.setQueryData<InfiniteData<CommentsPage>>(
        queryKey,
        (current) => {
          if (!current) return current;
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((comment) =>
                comment.id === commentId
                  ? {
                      ...comment,
                      reacted: result.active,
                      reactionCount: result.reactionCount,
                    }
                  : comment,
              ),
            })),
          };
        },
      );
    },
    onError: (_error, _variables, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous);
    },
  });
}

export function useDeleteComment(reviewId: string) {
  const api = useTastesApi();
  const userId = useAuthenticatedUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      api.deleteComment({ reviewId, commentId }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: commentsQueryKey(userId, reviewId),
      }),
  });
}

export function useAddComment(reviewId: string) {
  const api = useTastesApi();
  const userId = useAuthenticatedUserId();
  const queryClient = useQueryClient();
  const queryKey = commentsQueryKey(userId, reviewId);
  return useMutation({
    mutationFn: (command: AddCommentCommand) =>
      api.addComment({ reviewId, ...command }),
    onMutate: async (command) => {
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<InfiniteData<CommentsPage>>(queryKey);
      const optimisticId = `pending-comment-${command.idempotencyKey}`;
      const optimisticComment: Comment = {
        id: optimisticId,
        reviewId,
        authorId: userId,
        authorDisplayName: 'You',
        authorPhotoUrl: null,
        parentCommentId: command.parentCommentId ?? null,
        reactionCount: 0,
        replyCount: 0,
        reacted: false,
        text: command.text,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<InfiniteData<CommentsPage>>(
        queryKey,
        (current) => {
          if (!current?.pages[0]) return current;
          return {
            ...current,
            pages: [
              {
                ...current.pages[0],
                items: [
                  ...(command.parentCommentId ? [] : [optimisticComment]),
                  ...current.pages[0].items.map((comment) =>
                    command.parentCommentId === comment.id
                      ? { ...comment, replyCount: comment.replyCount + 1 }
                      : comment,
                  ),
                  ...(command.parentCommentId ? [optimisticComment] : []),
                ],
              },
              ...current.pages.slice(1),
            ],
          };
        },
      );
      return { optimisticId, previous };
    },
    onSuccess: (response, _command, context) => {
      queryClient.setQueryData<InfiniteData<CommentsPage>>(
        queryKey,
        (current) => {
          if (!current) return current;
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((comment) =>
                comment.id === context.optimisticId
                  ? { ...comment, id: response.data.id }
                  : comment,
              ),
            })),
          };
        },
      );
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['feed', userId] });
    },
    onError: (_error, _command, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous);
    },
  });
}
