import {
  searchVenuesInputSchema,
  submitUserVenueInputSchema,
  type Venue,
} from '@tastes/contracts';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireUserId } from '../../shared/auth';
import { db } from '../../shared/firebase';
import { enforceRateLimit } from '../../shared/mutations';
import { callableOptions } from '../../shared/options';
import { parseInput } from '../../shared/validation';

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  primaryTypeDisplayName?: { text?: string };
  postalAddress?: { locality?: string; administrativeArea?: string };
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
};

const googlePriceLevels: Record<string, number> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

function firestoreVenue(document: FirebaseFirestore.QueryDocumentSnapshot): Venue {
  return {
    id: document.id,
    name: String(document.get('name') ?? ''),
    city: String(document.get('city') ?? ''),
    status: 'active',
    address: document.get('address') ? String(document.get('address')) : undefined,
    category: document.get('category') ? String(document.get('category')) : undefined,
    imageUrl: document.get('imageUrl') ? String(document.get('imageUrl')) : undefined,
    priceLevel: document.get('priceLevel') == null ? undefined : Number(document.get('priceLevel')),
    rating: document.get('rating') == null ? undefined : Number(document.get('rating')),
    reviewCount: document.get('reviewCount') == null ? undefined : Number(document.get('reviewCount')),
    latitude: document.get('latitude') == null ? undefined : Number(document.get('latitude')),
    longitude: document.get('longitude') == null ? undefined : Number(document.get('longitude')),
  };
}

function externalVenue(place: GooglePlace): Venue | null {
  if (!place.id || !place.displayName?.text) return null;
  return {
    id: `google:${place.id}`,
    name: place.displayName.text,
    city: place.postalAddress?.locality ?? place.postalAddress?.administrativeArea ?? 'Unknown',
    status: 'active',
    address: place.formattedAddress,
    category: place.primaryTypeDisplayName?.text,
    priceLevel: place.priceLevel ? googlePriceLevels[place.priceLevel] : undefined,
    rating: place.rating,
    reviewCount: place.userRatingCount,
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
  };
}

async function googlePlaces(query: string, limit: number, latitude?: number, longitude?: number): Promise<Venue[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.primaryTypeDisplayName',
        'places.postalAddress',
        'places.location',
        'places.rating',
        'places.userRatingCount',
        'places.priceLevel',
      ].join(','),
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: limit,
      ...(latitude === undefined || longitude === undefined ? {} : {
        locationBias: { circle: { center: { latitude, longitude }, radius: 25_000 } },
      }),
    }),
  });
  if (!response.ok) throw new Error(`Google Places returned ${response.status}.`);
  const payload = await response.json() as { places?: GooglePlace[] };
  return (payload.places ?? []).flatMap((place) => {
    const venue = externalVenue(place);
    return venue ? [venue] : [];
  });
}

export const searchVenues = onCall(callableOptions, async (request) => {
  requireUserId(request);
  const input = parseInput(searchVenuesInputSchema, request.data);
  const normalized = input.query.toLocaleLowerCase();
  const localSnapshot = await db.collection('venues').where('status', '==', 'active').limit(200).get();
  const local = localSnapshot.docs
    .filter((document) => [document.get('name'), document.get('address'), document.get('city'), document.get('category')]
      .some((value) => String(value ?? '').toLocaleLowerCase().includes(normalized)))
    .slice(0, input.limit)
    .map(firestoreVenue);
  if (local.length >= input.limit) return { items: local, externalResultsAvailable: false };

  let external: Venue[] = [];
  try {
    external = await googlePlaces(input.query, input.limit - local.length, input.latitude, input.longitude);
  } catch (error) {
    console.warn('Google Places search failed; returning Firestore matches.', error);
  }
  const localGoogleIds = new Set(localSnapshot.docs.flatMap((document) => {
    const id = document.get('googlePlaceId');
    return typeof id === 'string' ? [id] : [];
  }));
  const uniqueExternal = external.filter((venue) => !localGoogleIds.has(venue.id.replace(/^google:/, '')));
  return {
    items: [...local, ...uniqueExternal].slice(0, input.limit),
    externalResultsAvailable: uniqueExternal.length > 0,
  };
});

export const submitUserVenue = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(submitUserVenueInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);
  const venueRef = db.collection('venues').doc();
  await db.runTransaction(async (transaction) => {
    const user = await transaction.get(userRef);
    if (!user.exists || user.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    await enforceRateLimit(transaction, uid, 'submit-user-venue', 5, 24 * 60 * 60_000);
    const now = FieldValue.serverTimestamp();
    transaction.create(venueRef, {
      ...input,
      status: 'pending',
      source: 'user',
      submittedBy: uid,
      rating: 0,
      reviewCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  });
  return { id: venueRef.id, status: 'pending' as const };
});
