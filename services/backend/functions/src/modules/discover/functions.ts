import { signalTime } from './community-policy';
import { communitySelection } from './community-selection';
import { resolveVenue } from '../../shared/venue-alias';
import {
  getPlaceInputSchema,
  getDiscoverFeedInputSchema,
  getPlaceReviewsInputSchema,
  getVenuesInputSchema,
  searchPeopleInputSchema,
} from '@tastes/contracts';
import type {
  DiscoverFeed,
  DiscoverPeopleResult,
  DiscoverPerson,
  DiscoverReview,
  DiscoverTag,
  PlaceDetails,
  PlaceReview,
  Page,
  Venue,
} from '@tastes/contracts';
import {
  FieldPath,
  Timestamp,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireUserId } from '../../shared/auth';
import { db } from '../../shared/firebase';
import { callableOptions } from '../../shared/options';
import {
  cursorDate,
  decodeCursor,
  encodeCursor,
} from '../../shared/pagination';
import { timestampToIso } from '../../shared/serialization';
import { parseInput } from '../../shared/validation';
import {
  calculateRecommendationMatch,
  isRecommendation,
} from './recommendations';
import { rankMostReviewed } from './mostReviewed';
import {
  DISCOVERY_SIGNAL_VERSION,
  classifyNewSpot,
  distanceKm,
  selectLocalVenues,
} from './signals';
import { userSearchCandidateTokens, userSearchScore } from '../users/search';

function toVenue(
  document: QueryDocumentSnapshot,
  matchPercent?: number,
): Venue {
  return {
    id: document.id,
    name: String(document.get('name') ?? ''),
    city: String(document.get('city') ?? ''),
    status: document.get('status') as Venue['status'],
    address: document.get('address')
      ? String(document.get('address'))
      : undefined,
    category: document.get('category')
      ? String(document.get('category'))
      : undefined,
    imageUrl: document.get('imageUrl')
      ? String(document.get('imageUrl'))
      : undefined,
    priceLevel:
      document.get('priceLevel') != null
        ? Number(document.get('priceLevel'))
        : undefined,
    distanceKm:
      document.get('distanceKm') != null
        ? Number(document.get('distanceKm'))
        : undefined,
    rating:
      document.get('rating') != null
        ? Number(document.get('rating'))
        : undefined,
    reviewCount:
      document.get('reviewCount') != null
        ? Number(document.get('reviewCount'))
        : undefined,
    ...(matchPercent == null ? {} : { matchPercent }),
    latitude:
      document.get('latitude') != null
        ? Number(document.get('latitude'))
        : undefined,
    longitude:
      document.get('longitude') != null
        ? Number(document.get('longitude'))
        : undefined,
    discoverTags: Array.isArray(document.get('discoverTags'))
      ? ((document.get('discoverTags') as unknown[]).filter(
          (value): value is string => typeof value === 'string',
        ) as DiscoverTag[])
      : [],
  };
}

function toDiscoverPerson(
  document: QueryDocumentSnapshot,
  following: boolean,
): DiscoverPerson {
  return {
    userId: document.id,
    displayName: String(document.get('displayName') ?? ''),
    username: document.get('username')
      ? String(document.get('username'))
      : null,
    photoUrl: document.get('photoUrl')
      ? String(document.get('photoUrl'))
      : null,
    bio: String(document.get('bio') ?? ''),
    favoriteCuisines: Array.isArray(document.get('favoriteCuisines'))
      ? (document.get('favoriteCuisines') as unknown[]).filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
    weeklyFollowerGrowth: Number(document.get('weeklyFollowerGrowth') ?? 0),
    followerCount: Number(document.get('followerCount') ?? 0),
    followingCount: Number(document.get('followingCount') ?? 0),
    reviewCount: Number(document.get('reviewCount') ?? 0),
    following,
    createdAt: timestampToIso(document.get('createdAt')),
  };
}

interface RecommendationCandidate {
  searchableText: string;
  venue: Venue;
}

function recommendationCandidates(
  documents: QueryDocumentSnapshot[],
): RecommendationCandidate[] {
  return documents.map((document) => {
    const placeTags = Array.isArray(document.get('placeTags'))
      ? (document.get('placeTags') as unknown[]).filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const popularDishes = Array.isArray(document.get('popularDishes'))
      ? (document.get('popularDishes') as unknown[]).flatMap((value) => {
          if (!value || typeof value !== 'object') return [];
          const name = (value as { name?: unknown }).name;
          return typeof name === 'string' ? [name] : [];
        })
      : [];
    const venue = toVenue(document);
    return {
      venue,
      searchableText: [
        venue.name,
        venue.category,
        ...placeTags,
        ...popularDishes,
      ]
        .filter(Boolean)
        .join(' '),
    };
  });
}

export const getDiscoverFeed = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(getDiscoverFeedInputSchema, request.data ?? {});
  const userProfile = await db.collection('users').doc(uid).get();
  const userCity = String(userProfile.get('city') ?? '')
    .trim()
    .toLocaleLowerCase();
  const favoriteCuisines = Array.isArray(userProfile.get('favoriteCuisines'))
    ? (userProfile.get('favoriteCuisines') as unknown[])
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.toLocaleLowerCase())
    : [];
  const favoriteDish = String(
    (
      userProfile.get('tastePreferences') as
        { favoriteDish?: unknown } | undefined
    )?.favoriteDish ?? '',
  )
    .trim()
    .toLocaleLowerCase();
  const userRef = db.collection('users').doc(uid);
  const [
    activeVenueSnapshot,
    reviewsSnapshot,
    topReviewerSnapshot,
    ownReviews,
    savedVenues,
    following,
    signalSnapshot,
    discoveryConfig,
    community,
  ] = await Promise.all([
    db.collection('venues').where('status', '==', 'active').get(),
    db
      .collection('reviews')
      .where('status', '==', 'published')
      .orderBy('reactionCount', 'desc')
      .limit(12)
      .get(),
    db.collection('users').where('status', '==', 'active').get(),
    db
      .collection('reviews')
      .where('authorId', '==', uid)
      .where('status', '==', 'published')
      .limit(100)
      .get(),
    userRef.collection('savedVenues').limit(500).get(),
    userRef.collection('following').limit(50).get(),
    db.collection('_discoverySignals').get(),
    db.collection('configuration').doc('discovery').get(),
    communitySelection(),
  ]);
  const mostReviewedCandidates = activeVenueSnapshot.docs.map((document) => {
    const venue = toVenue(document);
    delete venue.distanceKm;
    return venue;
  });
  const forYouCandidates = recommendationCandidates(
    activeVenueSnapshot.docs.filter((document) =>
      (document.get('discoverTags') ?? []).includes('for-you'),
    ),
  ).map((candidate) => {
    delete candidate.venue.distanceKm;
    return candidate;
  });
  const mostReviewed = rankMostReviewed(mostReviewedCandidates, userCity, 6);
  const now = Date.now();
  const location =
    input.latitude !== undefined && input.longitude !== undefined
      ? { latitude: input.latitude, longitude: input.longitude }
      : undefined;
  const local = selectLocalVenues(mostReviewedCandidates, userCity, location);
  const localVenues = local.venues.map((venue) =>
    location && venue.latitude !== undefined && venue.longitude !== undefined
      ? {
          ...venue,
          distanceKm: distanceKm(location, {
            latitude: venue.latitude,
            longitude: venue.longitude,
          }),
        }
      : venue,
  );
  const areaLabel = local.radiusKm
    ? `Within ${local.radiusKm} km of your location`
    : 'In your city';
  const automaticEnabled =
    discoveryConfig.get('mode') === 'enabled' &&
    discoveryConfig.get('validatedAlgorithmVersion') ===
      DISCOVERY_SIGNAL_VERSION &&
    discoveryConfig.get('validatedAt');
  const venueDocs = new Map(
    activeVenueSnapshot.docs.map((document) => [document.id, document]),
  );
  const scores = new Map(
    signalSnapshot.docs.map((document) => [document.id, document]),
  );
  const toMillis = (value: unknown): number =>
    value instanceof Timestamp
      ? value.toMillis()
      : typeof value === 'string'
        ? Date.parse(value) || 0
        : 0;
  const signalEligible = (venue: Venue, signal: 'hot' | 'trending') => {
    const score = scores.get(venue.id);
    const overrides = venueDocs.get(venue.id)?.get('discoverOverrides') as
      { hot?: string; trending?: string } | undefined;
    return (
      !!automaticEnabled &&
      overrides?.[signal] !== 'exclude' &&
      score?.get('mode') === 'enabled' &&
      score.get('algorithmVersion') === DISCOVERY_SIGNAL_VERSION &&
      toMillis(score.get('calculatedAt')) >= now - 2 * 60 * 60_000 &&
      toMillis(score.get(`${signal}EnabledUntil`)) > now
    );
  };
  const byRating = (a: Venue, b: Venue) =>
    (b.rating ?? 0) - (a.rating ?? 0) || a.id.localeCompare(b.id);
  const automaticTrending = localVenues
    .filter((venue) => signalEligible(venue, 'trending'))
    .sort(
      (a, b) =>
        Number(scores.get(b.id)?.get('trendingScore')) -
          Number(scores.get(a.id)?.get('trendingScore')) || byRating(a, b),
    );
  const curatedTrending = localVenues
    .filter(
      (venue) =>
        venue.discoverTags?.includes('trending') &&
        (
          venueDocs.get(venue.id)?.get('discoverOverrides') as
            { trending?: string } | undefined
        )?.trending !== 'exclude',
    )
    .sort(byRating);
  const trending = [
    ...new Map(
      [...automaticTrending, ...curatedTrending].map((venue) => [
        venue.id,
        venue,
      ]),
    ).values(),
  ].slice(0, 3);
  const hot = localVenues
    .filter((venue) => signalEligible(venue, 'hot'))
    .sort(
      (a, b) =>
        Number(scores.get(b.id)?.get('hotScore')) -
          Number(scores.get(a.id)?.get('hotScore')) ||
        (a.distanceKm ?? 0) - (b.distanceKm ?? 0) ||
        byRating(a, b),
    );
  const editorialHero = localVenues
    .filter((venue) => venueDocs.get(venue.id)?.get('hotSpot') === true)
    .sort(byRating)[0];
  const hero =
    editorialHero ??
    hot[0] ??
    trending[0] ??
    [...localVenues].sort(byRating)[0] ??
    null;
  const hiddenGems = localVenues
    .filter((venue) => venue.discoverTags?.includes('hidden-gem'))
    .sort(
      (a, b) => (a.reviewCount ?? 0) - (b.reviewCount ?? 0) || byRating(a, b),
    )
    .slice(0, 2);
  const newSpotLabels: NonNullable<DiscoverFeed['newSpotLabels']> = {};
  const datedSpots = localVenues
    .flatMap((venue) => {
      const document = venueDocs.get(venue.id)!;
      if (!venue.name || !venue.address) return [];
      const openingDate =
        toMillis(document.get('verifiedOpeningDate')) || undefined;
      const publishedDate =
        toMillis(document.get('firstPublishedAt')) || undefined;
      const kind = classifyNewSpot({
        now,
        ...(openingDate ? { verifiedOpeningDate: openingDate } : {}),
        ...(publishedDate ? { firstPublishedAt: publishedDate } : {}),
      });
      if (!kind) return [];
      newSpotLabels[venue.id] =
        kind === 'just-opened' ? 'Just opened' : 'New on Tastes';
      return [
        { venue, date: kind === 'just-opened' ? openingDate! : publishedDate! },
      ];
    })
    .sort(
      (a, b) =>
        b.date - a.date ||
        (a.venue.distanceKm ?? 0) - (b.venue.distanceKm ?? 0) ||
        byRating(a.venue, b.venue),
    );
  const curatedNew = localVenues
    .filter((venue) => {
      const document = venueDocs.get(venue.id)!;
      return (
        venue.discoverTags?.includes('new') &&
        !toMillis(document.get('verifiedOpeningDate')) &&
        !toMillis(document.get('firstPublishedAt'))
      );
    })
    .sort(byRating);
  for (const venue of curatedNew) newSpotLabels[venue.id] = 'Editor’s pick';
  const newSpots = [
    ...new Map(
      [...datedSpots.map((spot) => spot.venue), ...curatedNew].map((venue) => [
        venue.id,
        venue,
      ]),
    ).values(),
  ].slice(0, 3);
  const preferenceVenueIds = [
    ...new Set(
      [
        ...ownReviews.docs.map((review) => String(review.get('venueId') ?? '')),
        ...savedVenues.docs.map((saved) =>
          String(saved.get('venueId') ?? saved.id),
        ),
      ].filter(Boolean),
    ),
  ];
  const [preferenceVenues, followedProfiles] = await Promise.all([
    preferenceVenueIds.length > 0
      ? db.getAll(
          ...preferenceVenueIds.map((id) => db.collection('venues').doc(id)),
        )
      : Promise.resolve([]),
    following.docs.length > 0
      ? db.getAll(
          ...following.docs.map((edge) => db.collection('users').doc(edge.id)),
        )
      : Promise.resolve([]),
  ]);
  const categoryByVenue = new Map(
    preferenceVenues.map((venue) => [
      venue.id,
      String(venue.get('category') ?? ''),
    ]),
  );
  const cuisineWeights = new Map<string, number>();
  favoriteCuisines.forEach((cuisine) =>
    cuisineWeights.set(cuisine, (cuisineWeights.get(cuisine) ?? 0) + 1),
  );
  ownReviews.docs.forEach((review) => {
    const cuisine = String(
      review.get('cuisine') ??
        categoryByVenue.get(String(review.get('venueId') ?? '')) ??
        '',
    )
      .trim()
      .toLocaleLowerCase();
    if (cuisine)
      cuisineWeights.set(cuisine, (cuisineWeights.get(cuisine) ?? 0) + 3);
  });
  savedVenues.docs.forEach((saved) => {
    const cuisine = String(
      categoryByVenue.get(String(saved.get('venueId') ?? saved.id)) ?? '',
    )
      .trim()
      .toLocaleLowerCase();
    if (cuisine)
      cuisineWeights.set(cuisine, (cuisineWeights.get(cuisine) ?? 0) + 2);
  });
  const moodWeights = new Map<string, number>();
  ownReviews.docs.forEach((review) => {
    const tags = Array.isArray(review.get('tags'))
      ? (review.get('tags') as unknown[])
      : [];
    tags
      .filter((tag): tag is string => typeof tag === 'string')
      .forEach((tag) => moodWeights.set(tag, (moodWeights.get(tag) ?? 0) + 1));
  });
  const friendTastes = followedProfiles
    .filter((profile) => profile.exists && profile.get('status') === 'active')
    .flatMap((profile) => {
      const cuisines = Array.isArray(profile.get('favoriteCuisines'))
        ? (profile.get('favoriteCuisines') as unknown[]).filter(
            (value): value is string => typeof value === 'string',
          )
        : [];
      return cuisines.map((cuisine) => ({
        cuisine: cuisine.toLocaleLowerCase(),
        name: String(profile.get('displayName') ?? 'A friend'),
      }));
    });
  const rankedCuisines = [...cuisineWeights.entries()].sort(
    (a, b) => b[1] - a[1],
  );
  const rankedMoods = [...moodWeights.entries()].sort((a, b) => b[1] - a[1]);
  const forYou = forYouCandidates
    .filter(
      ({ venue }) =>
        !userCity || venue.city.trim().toLocaleLowerCase() === userCity,
    )
    .map(({ venue, searchableText }) => {
      const match = calculateRecommendationMatch({
        favoriteCuisines: rankedCuisines.map(([cuisine]) => cuisine),
        favoriteDish,
        rating: venue.rating,
        searchableText,
      });
      const normalized = searchableText.toLocaleLowerCase();
      const cuisine = rankedCuisines.find(([value]) =>
        normalized.includes(value),
      );
      const mood = rankedMoods.find(
        ([value]) =>
          normalized.includes(value.replace('-', ' ')) ||
          normalized.includes(value),
      );
      const friend = friendTastes.find(({ cuisine: value }) =>
        normalized.includes(value),
      );
      const preferenceScore = cuisine?.[1] ?? 0;
      const moodScore = mood?.[1] ?? 0;
      const friendScore = friend ? 1 : 0;
      const recommendationReason = cuisine
        ? `Because you ❤️ ${venue.category ?? cuisine[0]}`
        : mood
          ? `Saved for ${mood[0].replace('-', ' ')}`
          : friend
            ? `Matches ${friend.name}’s tastes`
            : venue.category
              ? `Because you ❤️ ${venue.category}`
              : 'Popular near you';
      return {
        venue,
        match,
        preferenceScore,
        moodScore,
        friendScore,
        recommendationReason,
      };
    })
    .filter(
      ({ match, preferenceScore, moodScore, friendScore }) =>
        isRecommendation(match) ||
        preferenceScore > 0 ||
        moodScore > 0 ||
        friendScore > 0,
    )
    .sort(
      (left, right) =>
        right.preferenceScore - left.preferenceScore ||
        right.moodScore - left.moodScore ||
        right.friendScore - left.friendScore ||
        right.match.matchPercent - left.match.matchPercent ||
        (right.venue.rating ?? 0) - (left.venue.rating ?? 0),
    )
    .slice(0, 3)
    .map(({ venue, match, recommendationReason }) => ({
      ...venue,
      matchPercent: match.matchPercent,
      recommendationReason,
    }));

  const activeAuthors = new Set(topReviewerSnapshot.docs.map((doc) => doc.id));
  const activePlaces = new Set(activeVenueSnapshot.docs.map((doc) => doc.id));
  const eligibleReview = (doc: QueryDocumentSnapshot) =>
    doc.get('status') === 'published' &&
    activeAuthors.has(String(doc.get('authorId'))) &&
    activePlaces.has(String(doc.get('venueId'))) &&
    !community.excluded.has(`review:${doc.id}`) &&
    !community.excluded.has(`user:${doc.get('authorId')}`);
  const reviewCandidates = reviewsSnapshot.docs.filter(eligibleReview);
  let page = reviewsSnapshot;
  while (reviewCandidates.length < 3 && page.size === 12) {
    page = await db
      .collection('reviews')
      .where('status', '==', 'published')
      .orderBy('reactionCount', 'desc')
      .startAfter(page.docs.at(-1)!)
      .limit(12)
      .get();
    reviewCandidates.push(...page.docs.filter(eligibleReview));
  }
  const scoredIds = community.enabled
    ? [...community.reviews]
        .filter(([, score]) => Number(score.score) > 0)
        .map(([id]) => id)
    : [];
  const scoredReviews: QueryDocumentSnapshot[] = [];
  for (let offset = 0; offset < scoredIds.length; offset += 100) {
    const batch = await db.getAll(
      ...scoredIds
        .slice(offset, offset + 100)
        .map((id) => db.collection('reviews').doc(id)),
    );
    scoredReviews.push(
      ...batch
        .filter((doc) => doc.exists)
        .map((doc) => doc as QueryDocumentSnapshot)
        .filter(eligibleReview),
    );
  }
  const automaticReviews = community.enabled
    ? scoredReviews
        .sort((a, b) => {
          const left = community.reviews.get(a.id)!;
          const right = community.reviews.get(b.id)!;
          return (
            Number(
              !!userCity &&
                String(b.get('venueCity') ?? '')
                  .trim()
                  .toLocaleLowerCase() === userCity,
            ) -
              Number(
                !!userCity &&
                  String(a.get('venueCity') ?? '')
                    .trim()
                    .toLocaleLowerCase() === userCity,
              ) ||
            Number(right.score) - Number(left.score) ||
            Number(right.recentEngagement) - Number(left.recentEngagement) ||
            Number(right.publishedAt) - Number(left.publishedAt) ||
            a.id.localeCompare(b.id)
          );
        })
        .slice(0, 3)
    : [];
  const selectedReviews = automaticReviews.length
    ? automaticReviews
    : reviewCandidates.slice(0, 3);
  const reviewVenueIds = [
    ...new Set(
      selectedReviews.map((document) => String(document.get('venueId'))),
    ),
  ];
  const reviewAuthorIds = [
    ...new Set(
      selectedReviews.map((document) => String(document.get('authorId'))),
    ),
  ];
  const [reviewVenueDocs, reviewAuthorDocs] =
    reviewVenueIds.length > 0 || reviewAuthorIds.length > 0
      ? await Promise.all([
          reviewVenueIds.length > 0
            ? db.getAll(
                ...reviewVenueIds.map((id) => db.collection('venues').doc(id)),
              )
            : Promise.resolve([]),
          reviewAuthorIds.length > 0
            ? db.getAll(
                ...reviewAuthorIds.map((id) => db.collection('users').doc(id)),
              )
            : Promise.resolve([]),
        ])
      : [[], []];
  const venueDetailsById = new Map(
    reviewVenueDocs.map((document) => [
      document.id,
      {
        category: document.exists ? String(document.get('category') ?? '') : '',
        city: document.exists ? String(document.get('city') ?? '') : '',
        imageUrl:
          document.exists && document.get('imageUrl')
            ? String(document.get('imageUrl'))
            : null,
      },
    ]),
  );
  const photoUrlByAuthorId = new Map(
    reviewAuthorDocs.map((document) => [
      document.id,
      document.exists && document.get('photoUrl')
        ? String(document.get('photoUrl'))
        : null,
    ]),
  );
  const popularReviews: DiscoverReview[] = selectedReviews.map((document) => ({
    id: document.id,
    authorId: String(document.get('authorId')),
    authorDisplayName: String(document.get('authorDisplayName')),
    authorPhotoUrl:
      photoUrlByAuthorId.get(String(document.get('authorId'))) ?? null,
    venueId: String(document.get('venueId')),
    venueName: String(document.get('venueName')),
    venueCity:
      venueDetailsById.get(String(document.get('venueId')))?.city ??
      String(document.get('venueCity') ?? ''),
    venueCategory:
      venueDetailsById.get(String(document.get('venueId')))?.category ?? '',
    cuisine: String(
      document.get('cuisine') ??
        venueDetailsById.get(String(document.get('venueId')))?.category ??
        '',
    ),
    venueImageUrl:
      venueDetailsById.get(String(document.get('venueId')))?.imageUrl ?? null,
    rating: Number(document.get('rating')),
    text: String(document.get('text')),
    reactionCount: Number(document.get('reactionCount') ?? 0),
    commentCount: Number(document.get('commentCount') ?? 0),
    tags: Array.isArray(document.get('tags'))
      ? (document.get('tags') as DiscoverReview['tags'])
      : [],
    createdAt: timestampToIso(document.get('createdAt')),
  }));

  const topReviewerDoc = [...topReviewerSnapshot.docs]
    .sort(
      (a, b) =>
        Number(b.get('reviewCount') ?? 0) - Number(a.get('reviewCount') ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .find(
      (document) =>
        document.id !== uid && !community.excluded.has(`user:${document.id}`),
    );
  let topReviewer: DiscoverPerson | null = null;
  if (topReviewerDoc) {
    const followingDoc = await db
      .collection('users')
      .doc(uid)
      .collection('following')
      .doc(topReviewerDoc.id)
      .get();
    topReviewer = toDiscoverPerson(topReviewerDoc, followingDoc.exists);
  }

  const feed: DiscoverFeed = {
    hero,
    heroIsHot: hero ? signalEligible(hero, 'hot') : false,
    areaLabel,
    trendingSubtitle: trending.every((venue) =>
      signalEligible(venue, 'trending'),
    )
      ? `Recent positive activity · ${areaLabel}`
      : `Editor’s picks · ${areaLabel}`,
    newSpotLabels,
    trending,
    newSpots,
    mostReviewed,
    forYou,
    hiddenGems,
    popularReviewsAreAutomatic: automaticReviews.length > 0,
    popularReviews,
    topReviewer,
  };
  return feed;
});

export const getDiscoverPeople = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const [users, viewer, community] = await Promise.all([
    db.collection('users').where('status', '==', 'active').get(),
    db.collection('users').doc(uid).get(),
    communitySelection(),
  ]);
  const cityKey = (value: unknown) =>
    String(value ?? '')
      .trim()
      .normalize('NFKC')
      .toLocaleLowerCase('en-US');
  const viewerCity = cityKey(viewer.get('city'));
  const candidates = users.docs.filter(
    (document) =>
      document.id !== uid &&
      !community.excluded.has(`user:${document.id}`) &&
      document.get('isTestAccount') !== true &&
      document.get('suspicious') !== true &&
      !['seed', 'test', 'stress-image-scroll'].includes(
        String(document.get('source') ?? ''),
      ),
  );
  const select = (field: 'followerCount' | 'createdAt') =>
    [...candidates]
      .filter(
        (doc) =>
          field !== 'createdAt' ||
          (signalTime(doc.get('createdAt')) >= Date.now() - 30 * 86_400_000 &&
            signalTime(doc.get('createdAt')) <= Date.now()),
      )
      .sort((a, b) => {
        const local = (document: QueryDocumentSnapshot) =>
          !!viewerCity && cityKey(document.get('city')) === viewerCity;
        const value = (document: QueryDocumentSnapshot) => {
          const stored: unknown = document.get(field);
          return field === 'createdAt'
            ? stored instanceof Timestamp
              ? stored.toMillis()
              : typeof stored === 'string'
                ? Date.parse(stored) || 0
                : 0
            : Number(stored ?? 0);
        };
        return (
          Number(local(b)) - Number(local(a)) ||
          value(b) - value(a) ||
          a.id.localeCompare(b.id)
        );
      })
      .slice(0, 6);
  // Until shadow results are validated, these are follow suggestions, not seeded weekly growth.
  const automatic = community.enabled
    ? candidates
        .filter(
          (doc) =>
            Number(community.people.get(doc.id)?.uniqueFollowers7d ?? 0) > 0 &&
            Number(doc.get('reviewCount') ?? 0) > 0,
        )
        .sort((a, b) => {
          const left = community.people.get(a.id)!;
          const right = community.people.get(b.id)!;
          return (
            Number(!!viewerCity && cityKey(b.get('city')) === viewerCity) -
              Number(!!viewerCity && cityKey(a.get('city')) === viewerCity) ||
            Number(right.uniqueFollowers7d) - Number(left.uniqueFollowers7d) ||
            Number(right.reviewEngagement) - Number(left.reviewEngagement) ||
            Number(b.get('followerCount') ?? 0) -
              Number(a.get('followerCount') ?? 0) ||
            a.id.localeCompare(b.id)
          );
        })
        .slice(0, 6)
    : [];
  const trendingDocs = automatic.length ? automatic : select('followerCount');
  const freshDocs = select('createdAt');
  const suggestedDocs = select('followerCount');
  const candidateIds = [
    ...new Set(
      [...trendingDocs, ...freshDocs, ...suggestedDocs].map(
        (document) => document.id,
      ),
    ),
  ];
  const followingDocs =
    candidateIds.length > 0
      ? await db.getAll(
          ...candidateIds.map((id) =>
            db.collection('users').doc(uid).collection('following').doc(id),
          ),
        )
      : [];
  const followingIds = new Set(
    followingDocs
      .filter((document) => document.exists)
      .map((document) => document.id),
  );
  const toPeople = (documents: QueryDocumentSnapshot[]) =>
    documents.map((document) =>
      toDiscoverPerson(document, followingIds.has(document.id)),
    );

  const result: DiscoverPeopleResult = {
    trendingIsAutomatic: automatic.length > 0,
    trending: toPeople(trendingDocs),
    new: toPeople(freshDocs),
    suggested: toPeople(suggestedDocs),
  };
  return result;
});

export const searchPeople = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(searchPeopleInputSchema, request.data);
  const candidateTokens = userSearchCandidateTokens(input.query);
  if (candidateTokens.length === 0) return [];

  const snapshot = await db
    .collection('users')
    .where('status', '==', 'active')
    .where('searchTokens', 'array-contains-any', candidateTokens)
    .limit(100)
    .get();
  const ranked = snapshot.docs
    .filter((document) => document.id !== uid)
    .flatMap((document) => {
      const score = userSearchScore(
        input.query,
        String(document.get('displayName') ?? ''),
        document.get('username') ? String(document.get('username')) : null,
      );
      return score == null ? [] : [{ document, score }];
    })
    .sort(
      (left, right) =>
        left.score - right.score ||
        Number(right.document.get('followerCount') ?? 0) -
          Number(left.document.get('followerCount') ?? 0) ||
        left.document.id.localeCompare(right.document.id),
    )
    .slice(0, input.limit);

  const followingDocs =
    ranked.length > 0
      ? await db.getAll(
          ...ranked.map(({ document }) =>
            db
              .collection('users')
              .doc(uid)
              .collection('following')
              .doc(document.id),
          ),
        )
      : [];
  const followingIds = new Set(
    followingDocs
      .filter((document) => document.exists)
      .map((document) => document.id),
  );
  return ranked.map(({ document }) =>
    toDiscoverPerson(document, followingIds.has(document.id)),
  );
});

export const getVenues = onCall(callableOptions, async (request) => {
  requireUserId(request);
  const input = parseInput(getVenuesInputSchema, request.data);
  const cursor = decodeCursor(input.cursor);

  let venuesQuery = db
    .collection('venues')
    .where('status', '==', 'active') as FirebaseFirestore.Query;
  if (input.category) {
    venuesQuery = venuesQuery.where('category', '==', input.category);
  }
  if (input.tag) {
    venuesQuery = venuesQuery.where(
      'discoverTags',
      'array-contains',
      input.tag,
    );
  }
  venuesQuery = venuesQuery
    .orderBy('rating', 'desc')
    .orderBy(FieldPath.documentId(), 'desc');

  if (cursor) {
    if (typeof cursor.value !== 'number') {
      throw new HttpsError('invalid-argument', 'The venues cursor is invalid.');
    }
    venuesQuery = venuesQuery.startAfter(cursor.value, cursor.id);
  }

  let snapshot: FirebaseFirestore.QuerySnapshot;
  try {
    snapshot = await venuesQuery.limit(input.limit + 1).get();
  } catch (error) {
    // Category filtering used to fail on environments where the compound
    // index had not propagated yet. Keep the Places tab usable while the
    // index catches up; the normal indexed query remains the fast path.
    if (!input.category || cursor) throw error;
    const fallbackSnapshot = await db
      .collection('venues')
      .where('status', '==', 'active')
      .where('category', '==', input.category)
      .limit(Math.max(input.limit, 100))
      .get();
    const fallbackDocs = [...fallbackSnapshot.docs].sort(
      (left, right) =>
        Number(right.get('rating') ?? 0) - Number(left.get('rating') ?? 0),
    );
    return {
      items: fallbackDocs.slice(0, input.limit).map(toVenue),
      nextCursor: null,
    };
  }
  const pageDocs = snapshot.docs.slice(
    0,
    input.limit,
  ) as QueryDocumentSnapshot[];
  const last = pageDocs.at(-1);

  return {
    items: pageDocs.map(toVenue),
    nextCursor:
      snapshot.docs.length > input.limit && last
        ? encodeCursor({ id: last.id, value: Number(last.get('rating') ?? 0) })
        : null,
  };
});

export const getPlace = onCall(callableOptions, async (request) => {
  requireUserId(request);
  const { venueId } = parseInput(getPlaceInputSchema, request.data);
  const document = await resolveVenue(venueId);
  const openingHours = Array.isArray(document.get('openingHours'))
    ? (document.get('openingHours') as unknown[]).flatMap((value) => {
        if (!value || typeof value !== 'object') return [];
        const item = value as { day?: unknown; hours?: unknown };
        return typeof item.day === 'string' && typeof item.hours === 'string'
          ? [{ day: item.day, hours: item.hours }]
          : [];
      })
    : [];
  const popularDishes = Array.isArray(document.get('popularDishes'))
    ? (document.get('popularDishes') as unknown[]).flatMap((value) => {
        if (!value || typeof value !== 'object') return [];
        const item = value as { name?: unknown; rating?: unknown };
        return typeof item.name === 'string' && typeof item.rating === 'number'
          ? [{ name: item.name, rating: item.rating }]
          : [];
      })
    : [];
  const details: PlaceDetails = {
    venue: toVenue(document as QueryDocumentSnapshot),
    phone: document.get('phone') ? String(document.get('phone')) : null,
    website: document.get('website') ? String(document.get('website')) : null,
    openingHours,
    photoUrls: Array.isArray(document.get('photoUrls'))
      ? (document.get('photoUrls') as unknown[]).filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
    photoCount: Math.max(0, Number(document.get('photoCount') ?? 0)),
    chips: Array.isArray(document.get('placeTags'))
      ? (document.get('placeTags') as unknown[]).filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
    popularDishes,
  };
  return details;
});

export const getPlaceReviews = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(getPlaceReviewsInputSchema, request.data);
  const { sort, scope } = input;
  const cursor = decodeCursor(input.cursor);
  const venue = await resolveVenue(input.venueId);
  const venueId = venue.id;
  const ordering = {
    highest: { field: 'rating', direction: 'desc' },
    lowest: { field: 'rating', direction: 'asc' },
    popular: { field: 'reactionCount', direction: 'desc' },
    recent: { field: 'createdAt', direction: 'desc' },
    oldest: { field: 'createdAt', direction: 'asc' },
  }[sort] as {
    field: 'rating' | 'reactionCount' | 'createdAt';
    direction: FirebaseFirestore.OrderByDirection;
  };
  let reviewsQuery = db
    .collection('reviews')
    .where('venueId', '==', venueId)
    .where('status', '==', 'published')
    .orderBy(ordering.field, ordering.direction)
    .orderBy(FieldPath.documentId(), ordering.direction);
  if (cursor) {
    const value =
      ordering.field === 'createdAt'
        ? Timestamp.fromDate(cursorDate(cursor.value))
        : cursor.value;
    if (ordering.field !== 'createdAt' && typeof value !== 'number') {
      throw new HttpsError(
        'invalid-argument',
        'The place reviews cursor is invalid.',
      );
    }
    reviewsQuery = reviewsQuery.startAfter(value, cursor.id);
  }
  const reviews = await reviewsQuery.limit(input.limit + 1).get();
  const pageDocs = reviews.docs.slice(0, input.limit);
  const authors = [
    ...new Set(pageDocs.map((document) => String(document.get('authorId')))),
  ];
  const authorDocs =
    authors.length > 0
      ? await db.getAll(...authors.map((id) => db.collection('users').doc(id)))
      : [];
  const authorById = new Map(
    authorDocs.map((document) => [document.id, document]),
  );
  const friendIds =
    scope === 'friends'
      ? new Set(
          (
            await db.collection('users').doc(uid).collection('following').get()
          ).docs.map((document) => document.id),
        )
      : null;
  const items: PlaceReview[] = pageDocs
    .filter(
      (document) =>
        !friendIds || friendIds.has(String(document.get('authorId'))),
    )
    .map((document) => {
      const author = authorById.get(String(document.get('authorId')));
      return {
        id: document.id,
        authorId: String(document.get('authorId')),
        authorDisplayName: String(document.get('authorDisplayName') ?? ''),
        authorUsername:
          author?.exists && author.get('username')
            ? String(author.get('username'))
            : null,
        authorPhotoUrl:
          author?.exists && author.get('photoUrl')
            ? String(author.get('photoUrl'))
            : null,
        venueCity: String(document.get('venueCity') ?? venue.get('city') ?? ''),
        cuisine: String(document.get('cuisine') ?? venue.get('category') ?? ''),
        rating: Number(document.get('rating') ?? 0),
        text: String(document.get('text') ?? ''),
        reactionCount: Number(document.get('reactionCount') ?? 0),
        commentCount: Number(document.get('commentCount') ?? 0),
        createdAt: timestampToIso(document.get('createdAt')),
        tag: document.get('tag') ? String(document.get('tag')) : null,
        dishNames: Array.isArray(document.get('dishNames'))
          ? (document.get('dishNames') as unknown[]).filter(
              (value): value is string => typeof value === 'string',
            )
          : [],
        tags: Array.isArray(document.get('tags'))
          ? (document.get('tags') as PlaceReview['tags'])
          : [],
        dishReviews: Array.isArray(document.get('dishReviews'))
          ? (document.get('dishReviews') as PlaceReview['dishReviews'])
          : [],
        visitCount: Number(document.get('visitCount') ?? 1),
        visits: Array.isArray(document.get('visits'))
          ? (document.get('visits') as PlaceReview['visits'])
          : [],
      };
    });
  const last = pageDocs.at(-1);
  const result: Page<PlaceReview> = {
    items,
    nextCursor:
      reviews.size > input.limit && last
        ? encodeCursor({
            id: last.id,
            value:
              ordering.field === 'createdAt'
                ? timestampToIso(last.get(ordering.field))
                : Number(last.get(ordering.field) ?? 0),
          })
        : null,
  };
  return result;
});
