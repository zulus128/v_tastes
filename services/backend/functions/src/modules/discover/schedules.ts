import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../../shared/firebase';
import {
  DISCOVERY_SIGNAL_VERSION,
  calculateVenueSignals,
  stableBadge,
  type SignalReview,
  type SignalUser,
} from './signals';

function millis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'string')
    return Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
  return 0;
}

/** Scores are audited without changing production rankings until explicitly validated. */
export async function calculateDiscoveryShadow(now = Date.now()) {
  const [venues, reviews, users, previous, config] = await Promise.all([
    db.collection('venues').where('status', '==', 'active').get(),
    db.collection('reviews').where('status', '==', 'published').get(),
    db.collection('users').where('status', '==', 'active').get(),
    db.collection('_discoverySignals').get(),
    db.collection('configuration').doc('discovery').get(),
  ]);
  const mode =
    config.get('mode') === 'enabled' &&
    config.get('validatedAlgorithmVersion') === DISCOVERY_SIGNAL_VERSION &&
    millis(config.get('validatedAt')) > 0
      ? 'enabled'
      : 'shadow';
  const signalUsers: SignalUser[] = users.docs.map((user) => ({
    id: user.id,
    status: String(user.get('status')),
    createdAt: millis(user.get('createdAt')),
    source: user.get('source'),
    suspicious:
      user.get('suspicious') === true || user.get('isTestAccount') === true,
  }));
  const signalReviews: SignalReview[] = reviews.docs.map((review) => ({
    id: review.id,
    authorId: String(review.get('authorId')),
    venueId: String(review.get('venueId')),
    createdAt:
      millis(review.get('latestVisitAt')) || millis(review.get('createdAt')),
    rating: Number(review.get('rating')),
    status: 'published',
    source:
      review.get('latestVisitSource') === 'user'
        ? undefined
        : review.get('source'),
    hasPhoto: (review.get('dishReviews') ?? []).some(
      (dish: { photoUrl?: string; photoPath?: string }) =>
        !!(dish.photoPath || dish.photoUrl),
    ),
  }));
  const scores = calculateVenueSignals({
    now,
    users: signalUsers,
    reviews: signalReviews,
    venues: venues.docs.map((venue) => ({
      id: venue.id,
      city: String(venue.get('city') ?? ''),
      status: 'active',
    })),
  });
  const previousById = new Map(previous.docs.map((doc) => [doc.id, doc]));
  const output = scores.map((score) => {
    const old = previousById.get(score.venueId);
    const hot = stableBadge({
      candidate: score.hotCandidate,
      positiveShare: score.unique7d ? score.positive7d / score.unique7d : 1,
      now,
      previousCandidateSince:
        millis(old?.get('hotCandidateSince')) || undefined,
      previousEnabledUntil: millis(old?.get('hotEnabledUntil')) || undefined,
    });
    const trending = stableBadge({
      candidate: score.trendingCandidate,
      positiveShare: score.unique48h ? score.positive48h / score.unique48h : 1,
      now,
      previousCandidateSince:
        millis(old?.get('trendingCandidateSince')) || undefined,
      previousEnabledUntil:
        millis(old?.get('trendingEnabledUntil')) || undefined,
    });
    return {
      ...score,
      mode,
      algorithmVersion: DISCOVERY_SIGNAL_VERSION,
      hotCandidateSince: hot.candidateSince
        ? Timestamp.fromMillis(hot.candidateSince)
        : null,
      hotEnabledUntil: hot.enabledUntil
        ? Timestamp.fromMillis(hot.enabledUntil)
        : null,
      trendingCandidateSince: trending.candidateSince
        ? Timestamp.fromMillis(trending.candidateSince)
        : null,
      trendingEnabledUntil: trending.enabledUntil
        ? Timestamp.fromMillis(trending.enabledUntil)
        : null,
      calculatedAt: Timestamp.fromMillis(now),
    };
  });
  for (let offset = 0; offset < output.length; offset += 400) {
    const batch = db.batch();
    for (const score of output.slice(offset, offset + 400))
      batch.set(db.collection('_discoverySignals').doc(score.venueId), score);
    await batch.commit();
  }
  await db
    .collection('_discoverySignalRuns')
    .doc(new Date(now).toISOString().slice(0, 13))
    .set({
      mode,
      algorithmVersion: DISCOVERY_SIGNAL_VERSION,
      calculatedAt: Timestamp.fromMillis(now),
      venueCount: venues.size,
      reviewCount: reviews.size,
      userCount: users.size,
      hotCandidates: scores
        .filter((score) => score.hotCandidate)
        .map((score) => score.venueId),
      trendingCandidates: scores
        .filter((score) => score.trendingCandidate)
        .map((score) => score.venueId),
      thresholds: {
        minimumAccountAgeDays: 7,
        minimumHotPositiveAuthors: 5,
        minimumTrendingPositiveAuthors: 3,
        minimumPositiveShare: 0.75,
        minimumHotMarketRatio: 1.5,
        minimumTrendingBaselineRatio: 2,
        stabilityHours: 1,
        minimumBadgeHours: 24,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
  return {
    mode,
    venues: output.length,
    hotCandidates: scores.filter((score) => score.hotCandidate).length,
    trendingCandidates: scores.filter((score) => score.trendingCandidate)
      .length,
  };
}

export const refreshDiscoverySignals = onSchedule(
  {
    schedule: 'every 60 minutes',
    region: 'europe-west1',
    timeZone: 'UTC',
    maxInstances: 1,
    retryCount: 3,
  },
  async () => {
    await calculateDiscoveryShadow();
  },
);
