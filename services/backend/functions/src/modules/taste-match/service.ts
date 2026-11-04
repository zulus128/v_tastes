import type {
  GetTasteRecommendationsInput,
  TasteRecommendationsResult,
  Venue,
} from '@tastes/contracts';
import {
  FieldPath,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { TasteMatchEngine } from './reference/engine';
import { loadDishCatalog, TAXONOMY_VERSION } from './catalog';
import { projectDishRatings } from './projection';
import type { Engine, EngineInput } from './types';

const chunks = <T>(items: T[], size = 30): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
const fixtureSources = new Set(['seed', 'test', 'stress-image-scroll']);
const unique = <T>(items: T[]): T[] => [...new Set(items)];
const byId = (docs: DocumentSnapshot[]): DocumentSnapshot[] => [
  ...new Map(docs.map((d) => [d.id, d])).values(),
];
const makeEngine = TasteMatchEngine as unknown as new (
  data: EngineInput,
) => Engine;
const coordinates = (
  doc: DocumentSnapshot,
): { lat: number; lng: number } | undefined => {
  const lat = doc.get('latitude'),
    lng = doc.get('longitude');
  return typeof lat === 'number' &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
    ? { lat, lng }
    : undefined;
};

export async function tasteRecommendations(
  database: Firestore,
  uid: string,
  options: GetTasteRecommendationsInput = {},
): Promise<TasteRecommendationsResult> {
  const now = Date.now(),
    user = database.collection('users').doc(uid);
  const [
    catalog,
    viewer,
    own,
    following,
    followers,
    blocked,
    reverseBlocked,
    hidden,
    overrides,
  ] = await Promise.all([
    loadDishCatalog(database),
    user.get(),
    database
      .collection('reviews')
      .where('authorId', '==', uid)
      .where('status', '==', 'published')
      .limit(501)
      .get(),
    user.collection('following').limit(501).get(),
    user.collection('followers').limit(501).get(),
    user.collection('blocked').get(),
    database.collectionGroup('blocked').where('userId', '==', uid).get(),
    user.collection('hiddenReviews').get(),
    database
      .collection('_communityOverrides')
      .where('excluded', '==', true)
      .get(),
  ]);
  if (!viewer.exists || viewer.get('status') !== 'active')
    throw new HttpsError(
      'failed-precondition',
      'An active profile is required.',
    );
  const city = String(viewer.get('city') ?? '').trim();
  const location =
    options.latitude !== undefined && options.longitude !== undefined
      ? { lat: options.latitude, lng: options.longitude }
      : undefined;
  const blockedIds = new Set([
    ...blocked.docs.map((d) => d.id),
    ...reverseBlocked.docs.flatMap((d) =>
      d.ref.parent.parent ? [d.ref.parent.parent.id] : [],
    ),
  ]);
  const hiddenIds = new Set(hidden.docs.map((d) => d.id));
  const excluded = new Set(
    overrides.docs.map((d) => `${d.get('targetType')}:${d.get('targetId')}`),
  );
  const ownRatings = own.docs
    .slice(0, 500)
    .flatMap((d) => projectDishRatings(d, catalog, now).ratings);
  const dishIds = unique(ownRatings.map((r) => r.canonicalDishId)).slice(
    0,
    150,
  );
  const followingIds = following.docs
    .map((d) => d.id)
    .filter((id) => !blockedIds.has(id))
    .slice(0, 100);
  const peers = await Promise.all(
    chunks(dishIds).map((ids) =>
      database
        .collection('_tasteReviewEvidence')
        .where('canonicalDishIds', 'array-contains-any', ids)
        .orderBy(FieldPath.documentId())
        .limit(501)
        .get(),
    ),
  );
  const overlapCounts = new Map<string, Set<string>>();
  for (const doc of peers.flatMap((p) => p.docs)) {
    const author = String(doc.get('authorId') ?? '');
    if (!author || author === uid || blockedIds.has(author)) continue;
    const set = overlapCounts.get(author) ?? new Set<string>();
    for (const id of doc.get('canonicalDishIds') ?? [])
      if (dishIds.includes(id)) set.add(id);
    overlapCounts.set(author, set);
  }
  const matchedCandidateIds = [...overlapCounts]
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .slice(0, 100)
    .map(([id]) => id);
  const authorIds = unique([...matchedCandidateIds, ...followingIds]);
  const candidateReviews = await Promise.all(
    chunks(authorIds).map((ids) =>
      database
        .collection('_tasteReviewEvidence')
        .where('authorId', 'in', ids)
        .orderBy(FieldPath.documentId())
        .limit(1001)
        .get(),
    ),
  );
  // The local fallback uses recent *dish* evidence, not venue HOT labels.
  // Its exact label states how many people rated this dish 4+ in seven days.
  const local =
    city && !location
      ? await database
          .collection('_tasteReviewEvidence')
          .where('city', '==', city.toLowerCase())
          .orderBy('latestRatedAt', 'desc')
          .limit(501)
          .get()
      : await database
          .collection('_tasteReviewEvidence')
          .orderBy('latestRatedAt', 'desc')
          .limit(501)
          .get();
  const indexed = byId([
    ...candidateReviews.flatMap((s) => s.docs),
    ...local.docs,
  ]);
  // Re-read live reviews; stale projections can aid retrieval but cannot expose
  // deleted/hidden content, deleted dishes, changed votes or merged aliases.
  const live = (
    await Promise.all(
      chunks(
        indexed.map((d) => d.id),
        100,
      ).map((ids) =>
        database.getAll(
          ...ids.map((id) => database.collection('reviews').doc(id)),
        ),
      ),
    )
  ).flat();
  const reviews = byId([...own.docs, ...live]).filter(
    (d) =>
      d.exists &&
      !hiddenIds.has(d.id) &&
      (d.get('authorId') === uid || !excluded.has(`review:${d.id}`)),
  );
  const ratingsByReview = new Map(
    reviews.map((d) => [d.id, projectDishRatings(d, catalog, now).ratings]),
  );
  const prospective = [...ratingsByReview.values()]
    .flat()
    .filter((r) => !blockedIds.has(r.userId));
  const ids = unique([uid, ...prospective.map((r) => r.userId)]),
    venueIds = unique(prospective.map((r) => r.venueId));
  const [profiles, places] = await Promise.all([
    Promise.all(
      chunks(ids, 100).map((group) =>
        database.getAll(
          ...group.map((id) => database.collection('users').doc(id)),
        ),
      ),
    ).then((x) => x.flat()),
    venueIds.length
      ? Promise.all(
          chunks(venueIds, 100).map((group) =>
            database.getAll(
              ...group.map((id) => database.collection('venues').doc(id)),
            ),
          ),
        ).then((x) => x.flat())
      : Promise.resolve([]),
  ]);
  const activeUsers = new Map(
    profiles
      .filter(
        (d) =>
          d.exists &&
          d.get('status') === 'active' &&
          !blockedIds.has(d.id) &&
          (d.id === uid ||
            (!excluded.has(`user:${d.id}`) &&
              !fixtureSources.has(d.get('source')) &&
              d.get('isTestUser') !== true &&
              d.get('suspicious') !== true)),
      )
      .map((d) => [d.id, d]),
  );
  const activeVenues = new Map(
    places
      .filter(
        (d) =>
          d.exists &&
          d.get('status') === 'active' &&
          typeof d.get('name') === 'string' &&
          d.get('name').trim(),
      )
      .map((d) => [d.id, d]),
  );
  const followingSet = new Set(followingIds),
    followerSet = new Set(followers.docs.map((d) => d.id));
  const ratings = prospective.filter(
    (r) => activeUsers.has(r.userId) && activeVenues.has(r.venueId),
  );
  const relationships: EngineInput['relationships'] = authorIds
    .filter((id) => activeUsers.has(id) && followingSet.has(id) && id !== uid)
    .map((id) => ({
      type: followerSet.has(id) ? 'friend' : 'follow',
      fromUserId: uid,
      toUserId: id,
    }));
  const engine = new makeEngine({
    taxonomy: {
      version: TAXONOMY_VERSION,
      dishes: [...catalog.dishes.values()],
    },
    users: [...activeUsers].map(([id, d]) => ({
      id,
      displayName:
        String(d.get('displayName') ?? '')
          .trim()
          .slice(0, 160) || 'Tastes member',
      active: true,
    })),
    venues: [...activeVenues].map(([id, d]) => ({
      id,
      name: String(d.get('name') ?? '').slice(0, 200),
      city: String(d.get('city') ?? '').trim() || null,
      active: true,
      ...(coordinates(d) ? { location: coordinates(d)! } : {}),
    })),
    ratings,
    relationships,
    clock: () => now,
  });
  const result = engine.recommend(uid, {
    ...(city && !location ? { city } : {}),
    ...(location ? { location, radiusKm: options.radiusKm ?? 25 } : {}),
    novelty: options.novelty ?? 'canonical_dish',
    limit: options.limit ?? 6,
  });
  const ratingReviews = new Map<string, DocumentSnapshot>();
  for (const doc of reviews)
    for (const rating of ratingsByReview.get(doc.id) ?? [])
      ratingReviews.set(rating.id, doc);
  const recommendations = result.recommendations.flatMap((card) => {
    const evidence = card.evidence.find((e) => e.supports),
      review = evidence ? ratingReviews.get(evidence.ratingId) : undefined;
    const place = activeVenues.get(card.venue.id);
    if (!place || !review) return [];
    const dishId = evidence!.ratingId.slice(review.id.length + 1);
    const dishes: Record<string, unknown>[] = Array.isArray(
      review.get('dishReviews'),
    )
      ? review.get('dishReviews')
      : [];
    const dish = dishes.find(
      (d) => d && typeof d === 'object' && d.id === dishId,
    );
    const photo =
      typeof dish?.thumbnailUrl === 'string'
        ? dish.thumbnailUrl
        : typeof dish?.photoUrl === 'string'
          ? dish.photoUrl
          : undefined;
    const photoPath =
      typeof dish?.thumbnailPath === 'string'
        ? dish.thumbnailPath
        : typeof dish?.photoPath === 'string'
          ? dish.photoPath
          : undefined;
    const venue: Venue = {
      id: place.id,
      name: String(place.get('name')),
      city: String(place.get('city') ?? ''),
      status: 'active',
      ...(typeof place.get('imageUrl') === 'string'
        ? { imageUrl: place.get('imageUrl') }
        : {}),
      ...(typeof place.get('category') === 'string'
        ? { category: place.get('category') }
        : {}),
      ...(typeof place.get('rating') === 'number'
        ? { rating: place.get('rating') }
        : {}),
      ...(typeof place.get('reviewCount') === 'number'
        ? { reviewCount: place.get('reviewCount') }
        : {}),
      ...(coordinates(place)
        ? {
            latitude: coordinates(place)!.lat,
            longitude: coordinates(place)!.lng,
          }
        : {}),
      ...(card.distanceKm !== null ? { distanceKm: card.distanceKm } : {}),
    };
    return [
      {
        id: card.id,
        canonicalDishId: card.canonicalDishId,
        canonicalDishName: card.canonicalDishName,
        venue,
        dishRating: card.weightedRating,
        ...(photo ? { dishPhotoUrl: photo } : {}),
        ...(photoPath ? { dishPhotoPath: photoPath } : {}),
        tier: card.tier,
        confidence: card.confidence,
        supporterCount: card.supporterCount,
        reviewerCount: card.reviewerCount,
        headline: card.explanation.headline.replace(
          ' and 1 others in ',
          ' and 1 other person in ',
        ),
        connection: card.explanation.connection,
        reviewId: review.id,
      },
    ];
  });
  return {
    state: result.state,
    distinctRatedDishes: result.distinctRatedDishes,
    requiredDishCount: result.requiredDishCount,
    matchedUserCount: result.matchedUserCount,
    recommendations,
    modelVersion: result.modelVersion,
    generatedAt: result.generatedAt,
    candidatePoolLimited:
      own.size > 500 ||
      following.size > 100 ||
      followers.size > 500 ||
      overlapCounts.size > 100 ||
      dishIds.length >= 150 ||
      peers.some((s) => s.size > 500) ||
      candidateReviews.some((s) => s.size > 1000) ||
      local.size > 500,
  };
}
