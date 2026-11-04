import type { FeedItem, TasteRecommendation } from '@tastes/contracts';

/** Reference placement: after organic posts 2, 6 and 10, without repeating evidence already shown. */
export function tasteFeedInsertions(
  posts: FeedItem[],
  cards: TasteRecommendation[],
): Map<number, TasteRecommendation> {
  const result = new Map<number, TasteRecommendation>(),
    seenOfferings = new Set<string>(),
    unknownVenues = new Set<string>(),
    used = new Set<string>();
  let next = 0;
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]!;
    const dishIds = (post.dishReviews ?? [])
      .map((d) => d.canonicalDishId)
      .filter((id): id is string => !!id);
    if (!dishIds.length) unknownVenues.add(post.venueId);
    for (const id of dishIds)
      seenOfferings.add(JSON.stringify([id, post.venueId]));
    if (i < 1 || (i - 1) % 4 !== 0) continue;
    while (next < cards.length) {
      const card = cards[next++]!,
        key = JSON.stringify([card.canonicalDishId, card.venue.id]);
      if (
        used.has(card.id) ||
        unknownVenues.has(card.venue.id) ||
        seenOfferings.has(key)
      )
        continue;
      result.set(i, card);
      used.add(card.id);
      seenOfferings.add(key);
      break;
    }
  }
  return result;
}
