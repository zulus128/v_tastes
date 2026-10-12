import type { ReviewTag } from '@tastes/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadJpegImageVariant } from '../../infrastructure/imageUpload';
import { useTastesApi } from '../../session/SessionProvider';

export interface DishReviewDraft {
  id: string;
  photoUri: string;
  rating: number;
  title: string;
}

export interface CreateReviewDraft {
  dishReviews: DishReviewDraft[];
  idempotencyKey: string;
  rating: number;
  tags: ReviewTag[];
  text: string;
  venueId: string;
}

async function uploadDishPhoto(
  userId: string,
  idempotencyKey: string,
  dish: DishReviewDraft,
) {
  const photoPath = `review-images/${userId}/${idempotencyKey}/${dish.id}`;
  const thumbnailPath = `${photoPath}-thumbnail`;
  // Drafts can survive app restarts and may predate the picker-side resize.
  // Recompress at the upload boundary so every Storage object obeys the same
  // 1080px / JPEG quality budget, including restored drafts.
  await Promise.all([
    uploadJpegImageVariant({
      actions: [{ resize: { height: 1080, width: 1080 } }],
      compress: 0.75,
      path: photoPath,
      uri: dish.photoUri,
    }),
    uploadJpegImageVariant({
      actions: [{ resize: { height: 360, width: 360 } }],
      compress: 0.68,
      path: thumbnailPath,
      uri: dish.photoUri,
    }),
  ]);
  return {
    id: dish.id,
    photoPath,
    thumbnailPath,
    rating: dish.rating,
    title: dish.title.trim(),
  };
}

export function useCreateReview(userId: string) {
  const api = useTastesApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: CreateReviewDraft) => {
      const dishReviews = await Promise.all(
        draft.dishReviews.map((dish) =>
          uploadDishPhoto(userId, draft.idempotencyKey, dish),
        ),
      );
      const response = await api.createReview({
        dishReviews,
        idempotencyKey: draft.idempotencyKey,
        rating: draft.rating,
        tags: draft.tags,
        text: draft.text.trim(),
        venueId: draft.venueId,
      });
      return response.data;
    },
    onSuccess: async (_, draft) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feed', userId] }),
        queryClient.invalidateQueries({ queryKey: ['leaderboard', userId] }),
        queryClient.invalidateQueries({ queryKey: ['place', draft.venueId] }),
        queryClient.invalidateQueries({ queryKey: ['discover'] }),
        queryClient.invalidateQueries({ queryKey: ['favourites', userId] }),
      ]);
    },
  });
}
