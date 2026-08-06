import { getPlaceInputSchema, getPlaceReviewsInputSchema, getVenuesInputSchema } from '@tastes/contracts';
import type {
  DiscoverFeed,
  DiscoverPeopleResult,
  DiscoverPerson,
  DiscoverReview,
  DiscoverTag,
  PlaceDetails,
  PlaceReview,
  Venue,
} from '@tastes/contracts';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireUserId } from '../../shared/auth';
import { db } from '../../shared/firebase';
import { callableOptions } from '../../shared/options';
import { decodeCursor, encodeCursor } from '../../shared/pagination';
import { timestampToIso } from '../../shared/serialization';
import { parseInput } from '../../shared/validation';

function toVenue(document: QueryDocumentSnapshot): Venue {
  return {
    id: document.id,
    name: String(document.get('name') ?? ''),
    city: String(document.get('city') ?? ''),
    status: document.get('status') as Venue['status'],
    address: document.get('address') ? String(document.get('address')) : undefined,
    category: document.get('category') ? String(document.get('category')) : undefined,
    imageUrl: document.get('imageUrl') ? String(document.get('imageUrl')) : undefined,
    priceLevel: document.get('priceLevel') != null ? Number(document.get('priceLevel')) : undefined,
    distanceKm: document.get('distanceKm') != null ? Number(document.get('distanceKm')) : undefined,
    rating: document.get('rating') != null ? Number(document.get('rating')) : undefined,
    reviewCount: document.get('reviewCount') != null ? Number(document.get('reviewCount')) : undefined,
    latitude: document.get('latitude') != null ? Number(document.get('latitude')) : undefined,
    longitude: document.get('longitude') != null ? Number(document.get('longitude')) : undefined,
    discoverTags: Array.isArray(document.get('discoverTags'))
      ? (document.get('discoverTags') as unknown[]).filter((value): value is string => typeof value === 'string') as DiscoverTag[]
      : [],
  };
}

function toDiscoverPerson(document: QueryDocumentSnapshot, following: boolean): DiscoverPerson {
  return {
    userId: document.id,
    displayName: String(document.get('displayName') ?? ''),
    username: document.get('username') ? String(document.get('username')) : null,
    photoUrl: document.get('photoUrl') ? String(document.get('photoUrl')) : null,
    bio: String(document.get('bio') ?? ''),
    favoriteCuisines: Array.isArray(document.get('favoriteCuisines'))
      ? (document.get('favoriteCuisines') as unknown[]).filter((value): value is string => typeof value === 'string')
      : [],
    weeklyFollowerGrowth: Number(document.get('weeklyFollowerGrowth') ?? 0),
    followerCount: Number(document.get('followerCount') ?? 0),
    followingCount: Number(document.get('followingCount') ?? 0),
    reviewCount: Number(document.get('reviewCount') ?? 0),
    following,
    createdAt: timestampToIso(document.get('createdAt')),
  };
}

async function fetchTaggedVenues(
  tag: DiscoverTag,
  orderField: 'rating' | 'reviewCount',
  direction: FirebaseFirestore.OrderByDirection,
  take: number,
): Promise<Venue[]> {
  const snapshot = await db.collection('venues')
    .where('status', '==', 'active')
    .where('discoverTags', 'array-contains', tag)
    .orderBy(orderField, direction)
    .limit(take)
    .get();
  return snapshot.docs.map(toVenue);
}

export const getDiscoverFeed = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const [trending, newSpots, mostReviewed, forYou, hiddenGems, reviewsSnapshot, topReviewerSnapshot] = await Promise.all([
    fetchTaggedVenues('trending', 'rating', 'desc', 3),
    fetchTaggedVenues('new', 'reviewCount', 'asc', 3),
    fetchTaggedVenues('most-reviewed', 'reviewCount', 'desc', 6),
    fetchTaggedVenues('for-you', 'rating', 'desc', 3),
    fetchTaggedVenues('hidden-gem', 'reviewCount', 'asc', 2),
    db.collection('reviews').where('status', '==', 'published').orderBy('reactionCount', 'desc').limit(3).get(),
    db.collection('users').where('status', '==', 'active').orderBy('reviewCount', 'desc').limit(10).get(),
  ]);

  const reviewVenueIds = [...new Set(reviewsSnapshot.docs.map((document) => String(document.get('venueId'))))];
  const reviewAuthorIds = [...new Set(reviewsSnapshot.docs.map((document) => String(document.get('authorId'))))];
  const [reviewVenueDocs, reviewAuthorDocs] = reviewVenueIds.length > 0 || reviewAuthorIds.length > 0
    ? await Promise.all([
      reviewVenueIds.length > 0
        ? db.getAll(...reviewVenueIds.map((id) => db.collection('venues').doc(id)))
        : Promise.resolve([]),
      reviewAuthorIds.length > 0
        ? db.getAll(...reviewAuthorIds.map((id) => db.collection('users').doc(id)))
        : Promise.resolve([]),
    ])
    : [[], []];
  const venueDetailsById = new Map(
    reviewVenueDocs.map((document) => [document.id, {
      category: document.exists ? String(document.get('category') ?? '') : '',
      imageUrl: document.exists && document.get('imageUrl') ? String(document.get('imageUrl')) : null,
    }]),
  );
  const photoUrlByAuthorId = new Map(
    reviewAuthorDocs.map((document) => [document.id, document.exists && document.get('photoUrl') ? String(document.get('photoUrl')) : null]),
  );
  const popularReviews: DiscoverReview[] = reviewsSnapshot.docs.map((document) => ({
    id: document.id,
    authorId: String(document.get('authorId')),
    authorDisplayName: String(document.get('authorDisplayName')),
    authorPhotoUrl: photoUrlByAuthorId.get(String(document.get('authorId'))) ?? null,
    venueId: String(document.get('venueId')),
    venueName: String(document.get('venueName')),
    venueCategory: venueDetailsById.get(String(document.get('venueId')))?.category ?? '',
    venueImageUrl: venueDetailsById.get(String(document.get('venueId')))?.imageUrl ?? null,
    rating: Number(document.get('rating')),
    text: String(document.get('text')),
    reactionCount: Number(document.get('reactionCount') ?? 0),
    commentCount: Number(document.get('commentCount') ?? 0),
    createdAt: timestampToIso(document.get('createdAt')),
  }));

  const topReviewerDoc = topReviewerSnapshot.docs.find((document) => document.id !== uid);
  let topReviewer: DiscoverPerson | null = null;
  if (topReviewerDoc) {
    const followingDoc = await db.collection('users').doc(uid).collection('following').doc(topReviewerDoc.id).get();
    topReviewer = toDiscoverPerson(topReviewerDoc, followingDoc.exists);
  }

  const feed: DiscoverFeed = {
    hero: trending[0] ?? mostReviewed[0] ?? null,
    trending,
    newSpots,
    mostReviewed,
    forYou,
    hiddenGems,
    popularReviews,
    topReviewer,
  };
  return feed;
});

async function fetchPeople(
  orderField: 'weeklyFollowerGrowth' | 'createdAt' | 'followerCount',
  take: number,
  excludeUserId: string,
): Promise<QueryDocumentSnapshot[]> {
  const snapshot = await db.collection('users')
    .where('status', '==', 'active')
    .orderBy(orderField, 'desc')
    .limit(take + 1)
    .get();
  return snapshot.docs
    .filter((document) => document.id !== excludeUserId)
    .slice(0, take);
}

export const getDiscoverPeople = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const [trendingDocs, freshDocs, suggestedDocs] = await Promise.all([
    fetchPeople('weeklyFollowerGrowth', 6, uid),
    fetchPeople('createdAt', 6, uid),
    fetchPeople('followerCount', 6, uid),
  ]);
  const candidateIds = [...new Set([...trendingDocs, ...freshDocs, ...suggestedDocs].map((document) => document.id))];
  const followingDocs = candidateIds.length > 0
    ? await db.getAll(...candidateIds.map((id) => db.collection('users').doc(uid).collection('following').doc(id)))
    : [];
  const followingIds = new Set(followingDocs.filter((document) => document.exists).map((document) => document.id));
  const toPeople = (documents: QueryDocumentSnapshot[]) => documents.map(
    (document) => toDiscoverPerson(document, followingIds.has(document.id)),
  );

  const result: DiscoverPeopleResult = {
    trending: toPeople(trendingDocs),
    new: toPeople(freshDocs),
    suggested: toPeople(suggestedDocs),
  };
  return result;
});

export const getVenues = onCall(callableOptions, async (request) => {
  requireUserId(request);
  const input = parseInput(getVenuesInputSchema, request.data);
  const cursor = decodeCursor(input.cursor);

  let venuesQuery = db.collection('venues').where('status', '==', 'active') as FirebaseFirestore.Query;
  if (input.category) {
    venuesQuery = venuesQuery.where('category', '==', input.category);
  }
  if (input.tag) {
    venuesQuery = venuesQuery.where('discoverTags', 'array-contains', input.tag);
  }
  venuesQuery = venuesQuery.orderBy('rating', 'desc');

  if (cursor) {
    if (typeof cursor.value !== 'number') {
      throw new HttpsError('invalid-argument', 'The venues cursor is invalid.');
    }
    venuesQuery = venuesQuery.startAfter(cursor.value);
  }

  const snapshot = await venuesQuery.limit(input.limit + 1).get();
  const pageDocs = snapshot.docs.slice(0, input.limit) as QueryDocumentSnapshot[];
  const last = pageDocs.at(-1);

  return {
    items: pageDocs.map(toVenue),
    nextCursor: snapshot.docs.length > input.limit && last
      ? encodeCursor({ id: last.id, value: Number(last.get('rating') ?? 0) })
      : null,
  };
});

export const getPlace = onCall(callableOptions, async (request) => {
  requireUserId(request);
  const { venueId } = parseInput(getPlaceInputSchema, request.data);
  const document = await db.collection('venues').doc(venueId).get();
  if (!document.exists || document.get('status') !== 'active') {
    throw new HttpsError('not-found', 'The place was not found.');
  }
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
      ? (document.get('photoUrls') as unknown[]).filter((value): value is string => typeof value === 'string')
      : [],
    photoCount: Math.max(0, Number(document.get('photoCount') ?? 0)),
    chips: Array.isArray(document.get('placeTags'))
      ? (document.get('placeTags') as unknown[]).filter((value): value is string => typeof value === 'string')
      : [],
    popularDishes,
  };
  return details;
});

export const getPlaceReviews = onCall(callableOptions, async (request) => {
  requireUserId(request);
  const { venueId, sort } = parseInput(getPlaceReviewsInputSchema, request.data);
  const venue = await db.collection('venues').doc(venueId).get();
  if (!venue.exists || venue.get('status') !== 'active') {
    throw new HttpsError('not-found', 'The place was not found.');
  }
  const reviews = await db.collection('reviews')
    .where('venueId', '==', venueId)
    .where('status', '==', 'published')
    .limit(50)
    .get();
  const authors = [...new Set(reviews.docs.map((document) => String(document.get('authorId'))))];
  const authorDocs = authors.length > 0
    ? await db.getAll(...authors.map((id) => db.collection('users').doc(id)))
    : [];
  const authorById = new Map(authorDocs.map((document) => [document.id, document]));
  const items: PlaceReview[] = reviews.docs.map((document) => {
    const author = authorById.get(String(document.get('authorId')));
    return {
      id: document.id,
      authorId: String(document.get('authorId')),
      authorDisplayName: String(document.get('authorDisplayName') ?? ''),
      authorUsername: author?.exists && author.get('username') ? String(author.get('username')) : null,
      authorPhotoUrl: author?.exists && author.get('photoUrl') ? String(author.get('photoUrl')) : null,
      rating: Number(document.get('rating') ?? 0),
      text: String(document.get('text') ?? ''),
      reactionCount: Number(document.get('reactionCount') ?? 0),
      commentCount: Number(document.get('commentCount') ?? 0),
      createdAt: timestampToIso(document.get('createdAt')),
      tag: document.get('tag') ? String(document.get('tag')) : null,
      dishNames: Array.isArray(document.get('dishNames'))
        ? (document.get('dishNames') as unknown[]).filter((value): value is string => typeof value === 'string')
        : [],
      tags: Array.isArray(document.get('tags')) ? document.get('tags') as PlaceReview['tags'] : [],
      dishReviews: Array.isArray(document.get('dishReviews'))
        ? document.get('dishReviews') as PlaceReview['dishReviews']
        : [],
    };
  });
  const compare = {
    highest: (a: PlaceReview, b: PlaceReview) => b.rating - a.rating,
    lowest: (a: PlaceReview, b: PlaceReview) => a.rating - b.rating,
    popular: (a: PlaceReview, b: PlaceReview) => b.reactionCount - a.reactionCount,
    recent: (a: PlaceReview, b: PlaceReview) => b.createdAt.localeCompare(a.createdAt),
    oldest: (a: PlaceReview, b: PlaceReview) => a.createdAt.localeCompare(b.createdAt),
  }[sort];
  return items.sort(compare);
});
