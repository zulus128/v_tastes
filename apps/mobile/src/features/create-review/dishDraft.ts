import type { DishReviewDraft } from './api';

export function updateDishReviewDraft(
  current: DishReviewDraft,
  patch: Partial<Omit<DishReviewDraft, 'id'>>,
): DishReviewDraft {
  const next = { ...current, ...patch };
  if (patch.title !== undefined && patch.title !== current.title) {
    delete next.canonicalDishId;
    delete next.canonicalDishConfirmed;
  }
  return next;
}
