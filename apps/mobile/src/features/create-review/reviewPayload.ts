export interface DishReviewPayloadSource {
  id: string;
  rating: number;
  title: string;
  canonicalDishId?: string;
  canonicalDishConfirmed?: boolean;
}

export function dishReviewPayload(dish: DishReviewPayloadSource) {
  return {
    id: dish.id,
    rating: dish.rating,
    title: dish.title.trim(),
    ...(dish.canonicalDishId
      ? {
          canonicalDishId: dish.canonicalDishId,
          canonicalDishConfirmed: dish.canonicalDishConfirmed === true,
        }
      : {}),
  };
}
