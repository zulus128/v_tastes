import type { Review } from '@tastes/contracts';

type Dish = Review['dishReviews'][number];
type Visit = NonNullable<Review['visits']>[number];

const dishKey = (title: string) =>
  title.trim().normalize('NFKC').toLocaleLowerCase('en-US');

/** Preserve engagement and dish identity while appending an immutable visit. */
export function appendReviewVisit(input: {
  dishes: Dish[];
  visits: Visit[];
  changes: Dish[];
  visit: Visit;
}): { dishes: Dish[]; visits: Visit[] } {
  const dishes = input.dishes.map((dish) => ({ ...dish }));
  const seen = new Set<string>();
  for (const change of input.changes) {
    const key = dishKey(change.title);
    if (seen.has(key)) throw new Error('Choose each dish only once per visit.');
    seen.add(key);
    const index = dishes.findIndex(
      (dish) => dish.id === change.id || dishKey(dish.title) === key,
    );
    const previous = index >= 0 ? dishes[index] : undefined;
    const history = previous?.history ?? [];
    const photo = {
      ...(change.photoPath ? { photoPath: change.photoPath } : {}),
      ...(change.photoUrl ? { photoUrl: change.photoUrl } : {}),
      ...(change.thumbnailPath ? { thumbnailPath: change.thumbnailPath } : {}),
      ...(change.thumbnailUrl ? { thumbnailUrl: change.thumbnailUrl } : {}),
    };
    const next: Dish = {
      ...previous,
      ...change,
      ...photo,
      id: previous?.id ?? change.id,
      firstVisitId: previous?.firstVisitId ?? input.visit.id,
      latestVisitId: input.visit.id,
      history: [
        ...history,
        {
          visitId: input.visit.id,
          createdAt: input.visit.createdAt,
          rating: change.rating,
          ...photo,
        },
      ],
    };
    // New uploads must not retain a stale download URL from the previous photo.
    if (change.photoPath && change.photoPath !== previous?.photoPath)
      delete next.photoUrl;
    if (
      change.thumbnailPath &&
      change.thumbnailPath !== previous?.thumbnailPath
    )
      delete next.thumbnailUrl;
    if (index < 0) dishes.push(next);
    else dishes[index] = next;
  }
  dishes.sort((left, right) => {
    const leftLatest = left.latestVisitId === input.visit.id;
    const rightLatest = right.latestVisitId === input.visit.id;
    return (
      Number(rightLatest) - Number(leftLatest) ||
      (leftLatest && rightLatest
        ? Number(right.firstVisitId === input.visit.id) -
          Number(left.firstVisitId === input.visit.id)
        : 0)
    );
  });
  return { dishes, visits: [...input.visits, input.visit] };
}
