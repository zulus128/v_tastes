import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../../shared/firebase';
import { getStorage } from 'firebase-admin/storage';
import {
  calculateCommunitySignals,
  type CommunityEngagement,
} from './community';
import { queueReviewRisks } from '../reviews/risk-monitor';
import {
  DISCOVERY_SIGNAL_VERSION,
  calculateVenueSignals,
  stableBadge,
  validSignalUser,
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
  const [followDocs, reactionDocs, commentDocs, eventDocs] = await Promise.all([
    db.collectionGroup('followers').get(),
    db.collectionGroup('reactions').get(),
    db.collectionGroup('comments').get(),
    db.collection('_activityEvents').get(),
  ]);
  const riskAudit = await queueReviewRisks(now);
  const riskReviewIds = new Set(riskAudit.riskReviewIds);
  const validPhotoAuthors = new Set(
    signalUsers
      .filter((user) => validSignalUser(user, now))
      .map((user) => user.id),
  );
  const photoPaths = [
    ...new Set(
      reviews.docs
        .filter(
          (review) =>
            validPhotoAuthors.has(String(review.get('authorId'))) &&
            (!['seed', 'test', 'stress-image-scroll'].includes(
              String(review.get('source') ?? ''),
            ) ||
              review.get('latestVisitSource') === 'user'),
        )
        .flatMap((review) =>
          (Array.isArray(review.get('dishReviews'))
            ? review.get('dishReviews')
            : []
          ).flatMap((dish: { photoPath?: unknown }) =>
            typeof dish.photoPath === 'string' &&
            dish.photoPath.startsWith(
              `review-images/${review.get('authorId')}/`,
            )
              ? [dish.photoPath]
              : [],
          ),
        ),
    ),
  ];
  const existingPhotos = new Set<string>();
  for (let offset = 0; offset < photoPaths.length; offset += 20) {
    await Promise.all(
      photoPaths.slice(offset, offset + 20).map(async (path) => {
        try {
          if ((await getStorage().bucket().file(path).exists())[0])
            existingPhotos.add(path);
        } catch {
          /* Unverified photos do not make a review eligible. */
        }
      }),
    );
  }
  const commentByPath = new Map(
    commentDocs.docs.map((comment) => [comment.ref.path, comment]),
  );
  const engagement: CommunityEngagement[] = [
    ...reactionDocs.docs
      .filter((doc) => /^reviews\/[^/]+\/reactions\/[^/]+$/.test(doc.ref.path))
      .map((doc) => ({
        reviewId: doc.ref.parent.parent!.id,
        actorId: doc.id,
        kind: 'like' as const,
        createdAt: millis(doc.get('createdAt')),
      })),
    ...commentDocs.docs
      .filter(
        (doc) =>
          /^reviews\/[^/]+\/comments\/[^/]+$/.test(doc.ref.path) &&
          doc.get('status') === 'published' &&
          (!doc.get('parentCommentId') ||
            commentByPath
              .get(`${doc.ref.parent.path}/${doc.get('parentCommentId')}`)
              ?.get('status') === 'published'),
      )
      .map((doc) => ({
        reviewId: doc.ref.parent.parent!.id,
        actorId: String(doc.get('authorId')),
        kind: 'comment' as const,
        text: String(doc.get('text') ?? ''),
        createdAt: millis(doc.get('createdAt')),
      })),
  ];
  const community = calculateCommunitySignals({
    now,
    users: users.docs.map((user) => ({
      ...signalUsers.find((item) => item.id === user.id)!,
      displayName: String(user.get('displayName') ?? ''),
      username: String(user.get('username') ?? ''),
      city: String(user.get('city') ?? ''),
      followerCount: Number(user.get('followerCount') ?? 0),
    })),
    reviews: reviews.docs
      .filter((review) => !riskReviewIds.has(review.id))
      .map((review) => ({
        id: review.id,
        authorId: String(review.get('authorId')),
        city: String(review.get('venueCity') ?? ''),
        createdAt:
          millis(review.get('latestVisitAt')) ||
          millis(review.get('createdAt')),
        status: 'published',
        source:
          review.get('latestVisitSource') === 'user'
            ? undefined
            : review.get('source'),
        text: String(review.get('text') ?? ''),
        hasPhoto: (review.get('dishReviews') ?? []).some(
          (dish: { photoPath?: string }) =>
            !!dish.photoPath && existingPhotos.has(dish.photoPath),
        ),
      })),
    follows: followDocs.docs
      .filter((doc) => /^users\/[^/]+\/followers\/[^/]+$/.test(doc.ref.path))
      .map((doc) => ({
        targetId: doc.ref.parent.parent!.id,
        actorId: doc.id,
        createdAt:
          millis(doc.get('createdAt')) || millis(doc.get('followedAt')),
      })),
    engagement,
    events: eventDocs.docs.map((doc) => ({
      kind: String(doc.get('kind')),
      actorId: String(doc.get('actorId')),
      targetId: String(doc.get('targetId')),
      createdAt: millis(doc.get('createdAt')),
      originalCreatedAt: millis(doc.get('originalCreatedAt')),
    })),
  });
  // Never publish unvalidated community rankings into the live feed.
  const firstEventTime = eventDocs.docs.reduce((earliest, doc) => {
    const at = millis(doc.get('createdAt'));
    return at > 0 ? Math.min(earliest, at) : earliest;
  }, Number.POSITIVE_INFINITY);
  const communityAudit = {
    mode: 'shadow',
    algorithmVersion: 1,
    calculatedAt: Timestamp.fromMillis(now),
    eventCount: eventDocs.size,
    reviewCount: community.reviewScores.length,
    userCount: community.peopleScores.length,
    firstObservedEventAt: Number.isFinite(firstEventTime)
      ? Timestamp.fromMillis(firstEventTime)
      : null,
    thresholds: {
      windowDays: 7,
      minimumAccountAgeDays: 7,
      minimumReviewTextLength: 40,
      minimumCommentLetters: 20,
      commentWeight: 2,
      maximumPairAdds7d: 1,
    },
  };
  for (const [collection, rows] of [
    [
      '_communityReviewSignals',
      community.reviewScores.map((row) => ({ id: row.reviewId, ...row })),
    ],
    [
      '_communityPeopleSignals',
      community.peopleScores.map((row) => ({ id: row.userId, ...row })),
    ],
  ] as const) {
    for (let offset = 0; offset < rows.length; offset += 400) {
      const batch = db.batch();
      for (const row of rows.slice(offset, offset + 400))
        batch.set(db.collection(collection).doc(row.id), {
          ...row,
          ...communityAudit,
        });
      await batch.commit();
    }
  }
  await db
    .collection('_communitySignalRuns')
    .doc(new Date(now).toISOString().slice(0, 13))
    .set(communityAudit);
  const scores = calculateVenueSignals({
    now,
    users: signalUsers,
    reviews: signalReviews.filter((review) => !riskReviewIds.has(review.id)),
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
    communityMode: 'shadow',
    communityReviewCandidates: community.reviewScores.filter(
      (score) => score.score > 0,
    ).length,
    communityPeopleCandidates: community.peopleScores.filter(
      (score) => score.uniqueFollowers7d > 0,
    ).length,
    riskQueued: riskAudit.queued,
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
    timeoutSeconds: 300,
  },
  async () => {
    await calculateDiscoveryShadow();
  },
);
