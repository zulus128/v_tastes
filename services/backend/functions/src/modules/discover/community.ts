import { DAY_MS, validSignalUser, type SignalUser } from './signals';

export interface CommunityUser extends SignalUser {
  displayName: string;
  username: string;
  city: string;
  followerCount: number;
}
export interface CommunityReview {
  id: string;
  authorId: string;
  city: string;
  status: string;
  source?: string;
  text: string;
  hasPhoto: boolean;
  createdAt: number;
}
export interface CommunityEvent {
  kind: string;
  actorId: string;
  targetId: string;
  createdAt: number;
  originalCreatedAt?: number;
}
export interface CommunityEngagement {
  reviewId: string;
  actorId: string;
  kind: 'like' | 'comment';
  createdAt: number;
  text?: string;
}
export interface CommunityFollow {
  actorId: string;
  targetId: string;
  createdAt: number;
}
const fixtures = new Set(['seed', 'test', 'stress-image-scroll']);
const cityKey = (city: string) =>
  city.trim().normalize('NFKC').toLocaleLowerCase('en-US');

/** Shadow scores only: neither lifetime counters nor seed fixtures invent recent activity. */
export function calculateCommunitySignals(input: {
  now: number;
  users: CommunityUser[];
  reviews: CommunityReview[];
  follows: CommunityFollow[];
  engagement: CommunityEngagement[];
  events: CommunityEvent[];
}) {
  const users = new Map(input.users.map((user) => [user.id, user]));
  const valid = (id: string) => validSignalUser(users.get(id), input.now);
  const recent = (at: number) =>
    Number.isFinite(at) && at >= input.now - 7 * DAY_MS && at <= input.now;
  const firstKnown = new Map<string, number>();
  const repeats = new Map<string, number>();
  for (const event of input.events) {
    const family = event.kind.startsWith('follow-')
      ? 'follow'
      : event.kind.startsWith('reaction-')
        ? 'like'
        : null;
    if (!family) continue;
    const key = `${family}:${event.actorId}:${event.targetId}`;
    const at =
      event.originalCreatedAt && event.originalCreatedAt > 0
        ? Math.min(event.createdAt, event.originalCreatedAt)
        : event.createdAt;
    if (at > 0) firstKnown.set(key, Math.min(firstKnown.get(key) ?? at, at));
    if (
      recent(event.createdAt) &&
      (event.kind === 'follow-created' || event.kind === 'reaction-added')
    )
      repeats.set(key, (repeats.get(key) ?? 0) + 1);
  }
  const eligibleReviews = input.reviews.filter(
    (review) =>
      review.status === 'published' &&
      !fixtures.has(review.source ?? '') &&
      valid(review.authorId) &&
      review.createdAt > 0 &&
      review.createdAt <= input.now &&
      (review.text.trim().length >= 40 || review.hasPhoto),
  );
  const reviews = new Map(eligibleReviews.map((review) => [review.id, review]));
  const byReview = new Map<
    string,
    Map<string, { at: number; weight: number }>
  >();
  for (const item of input.engagement) {
    const review = reviews.get(item.reviewId);
    if (!review || item.actorId === review.authorId || !valid(item.actorId))
      continue;
    const pair = `like:${item.actorId}:${item.reviewId}`;
    const at =
      item.kind === 'like'
        ? Math.min(item.createdAt, firstKnown.get(pair) ?? item.createdAt)
        : item.createdAt;
    if (!recent(at) || (item.kind === 'like' && (repeats.get(pair) ?? 0) > 1))
      continue;
    // Count one meaningful comment per person; punctuation/emoji-only bursts do not count.
    if (
      item.kind === 'comment' &&
      (item.text?.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 20
    )
      continue;
    const key = `${item.kind}:${item.actorId}`;
    const entries = byReview.get(item.reviewId) ?? new Map();
    const previous = entries.get(key);
    if (!previous || at < previous.at)
      entries.set(key, { at, weight: item.kind === 'comment' ? 2 : 1 });
    byReview.set(item.reviewId, entries);
  }
  const reviewScores = eligibleReviews
    .map((review) => {
      const entries = [...(byReview.get(review.id)?.values() ?? [])];
      return {
        reviewId: review.id,
        authorId: review.authorId,
        city: cityKey(review.city),
        uniqueLikes7d: entries.filter((entry) => entry.weight === 1).length,
        uniqueCommenters7d: entries.filter((entry) => entry.weight === 2)
          .length,
        recentEngagement: entries.length,
        score: entries.reduce(
          (total, item) =>
            total +
            item.weight * Math.exp(-(input.now - item.at) / (7 * DAY_MS)),
          0,
        ),
        publishedAt: review.createdAt,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.recentEngagement - a.recentEngagement ||
        b.publishedAt - a.publishedAt ||
        a.reviewId.localeCompare(b.reviewId),
    );
  const followers = new Map<string, Set<string>>();
  for (const follow of input.follows) {
    if (
      follow.actorId === follow.targetId ||
      !valid(follow.actorId) ||
      !valid(follow.targetId)
    )
      continue;
    const key = `follow:${follow.actorId}:${follow.targetId}`;
    const at = Math.min(
      follow.createdAt,
      firstKnown.get(key) ?? follow.createdAt,
    );
    if (!recent(at) || (repeats.get(key) ?? 0) > 1) continue;
    const set = followers.get(follow.targetId) ?? new Set();
    set.add(follow.actorId);
    followers.set(follow.targetId, set);
  }
  const peopleScores = input.users
    .filter(
      (user) =>
        valid(user.id) &&
        user.displayName.trim().length >= 2 &&
        user.username.trim().length >= 3 &&
        eligibleReviews.some(
          (review) =>
            review.authorId === user.id &&
            review.createdAt >= input.now - 30 * DAY_MS,
        ),
    )
    .map((user) => ({
      userId: user.id,
      city: cityKey(user.city),
      uniqueFollowers7d: followers.get(user.id)?.size ?? 0,
      reviewEngagement: reviewScores
        .filter((review) => review.authorId === user.id)
        .reduce((sum, review) => sum + review.recentEngagement, 0),
      followerCount: user.followerCount,
    }))
    .sort(
      (a, b) =>
        b.uniqueFollowers7d - a.uniqueFollowers7d ||
        b.reviewEngagement - a.reviewEngagement ||
        b.followerCount - a.followerCount ||
        a.userId.localeCompare(b.userId),
    );
  return { reviewScores, peopleScores };
}
