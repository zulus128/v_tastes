import type { DishReviewDraft } from './api';

export function updateDishReviewDraft(
  current: DishReviewDraft,
  patch: Partial<Omit<DishReviewDraft, 'id'>>,
): DishReviewDraft {
  return { ...current, ...patch };
}
