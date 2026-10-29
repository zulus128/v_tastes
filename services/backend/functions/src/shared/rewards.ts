import type { RewardProgress } from '@tastes/contracts';
import { db } from './firebase';
import { sendNotification } from './notifications';

export const LEVEL_XP = 250;
export function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(Math.max(0, xp) / LEVEL_XP) + 1);
}

function progress(value: number, target: number): number {
  return Math.min(1, value / target);
}

function reviewText(document: FirebaseFirestore.QueryDocumentSnapshot): string {
  const dishNames = Array.isArray(document.get('dishNames'))
    ? document.get('dishNames')
    : [];
  const dishReviews = Array.isArray(document.get('dishReviews'))
    ? document.get('dishReviews')
    : [];
  return [
    document.get('text'),
    ...dishNames,
    ...dishReviews.map((dish: unknown) =>
      dish && typeof dish === 'object' && 'title' in dish
        ? (dish as { title?: unknown }).title
        : '',
    ),
  ]
    .join(' ')
    .toLocaleLowerCase();
}

/** Compatibility payload for installed clients that still render rewards. */
export async function computeRewards(
  profileId: string,
): Promise<RewardProgress[]> {
  const reviews = await db
    .collection('reviews')
    .where('authorId', '==', profileId)
    .where('status', '==', 'published')
    .limit(200)
    .get();
  const venueIds = [
    ...new Set(
      reviews.docs
        .map((review) => String(review.get('venueId') ?? ''))
        .filter(Boolean),
    ),
  ];
  const venueSnapshots = venueIds.length
    ? await db.getAll(
        ...venueIds.map((venueId) => db.collection('venues').doc(venueId)),
      )
    : [];
  const venues = new Map(venueSnapshots.map((venue) => [venue.id, venue]));
  const burgerVenues = new Set<string>();
  const matchaCafes = new Set<string>();
  const exploredAreas = new Set<string>();
  let foundTiramisu = false;

  reviews.docs.forEach((review) => {
    const venueId = String(review.get('venueId') ?? '');
    const venue = venues.get(venueId);
    const category = String(venue?.get('category') ?? '').toLocaleLowerCase();
    const name = String(venue?.get('name') ?? '').toLocaleLowerCase();
    const searchable = reviewText(review);
    if (
      category.includes('burger') ||
      name.includes('burger') ||
      searchable.includes('burger')
    ) {
      burgerVenues.add(venueId);
    }
    if (category.includes('cafe') && searchable.includes('matcha'))
      matchaCafes.add(venueId);
    if (searchable.includes('tiramisu')) foundTiramisu = true;
    const address = String(venue?.get('address') ?? '');
    const area = (address.split(',').at(-1) || venue?.get('city') || '')
      .toString()
      .trim()
      .toLocaleLowerCase();
    if (area) exploredAreas.add(area);
  });

  return [
    {
      id: 'burger',
      name: 'Burger Lover',
      description: 'Review 10 burger places',
      progress: progress(burgerVenues.size, 10),
      completed: burgerVenues.size >= 10,
      xp: 150,
    },
    {
      id: 'tiramisu',
      name: 'Tiramisu Connaisseur',
      description: 'Find the perfect tiramisu',
      progress: foundTiramisu ? 1 : 0,
      completed: foundTiramisu,
      xp: 100,
    },
    {
      id: 'matcha',
      name: 'Matcha Hunter',
      description: 'Try matcha in 5 cafés',
      progress: progress(matchaCafes.size, 5),
      completed: matchaCafes.size >= 5,
      xp: 100,
    },
    {
      id: 'city',
      name: 'City Explorer',
      description: 'Review places in 5 areas',
      progress: progress(exploredAreas.size, 5),
      completed: exploredAreas.size >= 5,
      xp: 150,
    },
  ];
}

export function storedRewardProgress(value: unknown): RewardProgress[] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const rewards = value.filter(
    (entry): entry is RewardProgress =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof (entry as RewardProgress).id === 'string' &&
      typeof (entry as RewardProgress).progress === 'number',
  );
  return rewards.length === value.length ? rewards : null;
}

/** Raises the level-up notification when an XP change crosses a level boundary. */
export async function notifyLevelChange(
  profileId: string,
  previousXp: number,
  nextXp: number,
): Promise<void> {
  const previousLevel = levelForXp(previousXp);
  const nextLevel = levelForXp(nextXp);
  if (nextLevel <= previousLevel) return;
  await sendNotification({
    recipientId: profileId,
    type: 'level-up',
    eventKey: `level-${nextLevel}`,
    params: { level: nextLevel },
    targetId: String(nextLevel),
  });
}
