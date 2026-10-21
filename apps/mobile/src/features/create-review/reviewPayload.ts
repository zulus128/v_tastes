export interface DishReviewPayloadSource {
  id: string;
  rating: number;
  title: string;
}

export function dishReviewPayload(dish: DishReviewPayloadSource) {
  return {
    id: dish.id,
    rating: dish.rating,
    title: dish.title.trim(),
  };
}
