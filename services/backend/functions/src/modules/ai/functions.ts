import { askTastesAiInputSchema, type TastesAiAnswer } from '@tastes/contracts';
import { onCall } from 'firebase-functions/v2/https';
import { requireUserId } from '../../shared/auth';
import { db } from '../../shared/firebase';
import { callableOptions } from '../../shared/options';
import { parseInput } from '../../shared/validation';

const intentTerms: Record<string, string[]> = {
  romantic: ['romantic', 'date', 'intimate', 'cozy', 'cosy'],
  casual: ['casual', 'quick', 'relaxed', 'easy'],
  late: ['late', 'night', 'midnight', 'open'],
  family: ['family', 'children', 'kids'],
  affordable: ['cheap', 'budget', 'affordable', 'value'],
};

function distanceKm(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function expandedTerms(prompt: string): string[] {
  const terms = prompt
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 2);
  const intents = Object.entries(intentTerms)
    .filter(([, synonyms]) =>
      synonyms.some((synonym) => terms.includes(synonym)),
    )
    .flatMap(([intent, synonyms]) => [intent, ...synonyms]);
  return [...new Set([...terms, ...intents])];
}

export const askTastesAi = onCall(
  callableOptions,
  async (request): Promise<TastesAiAnswer> => {
    const uid = requireUserId(request);
    const input = parseInput(askTastesAiInputSchema, request.data);
    const [venuesSnapshot, userDocument] = await Promise.all([
      db.collection('venues').where('status', '==', 'active').get(),
      db.collection('users').doc(uid).get(),
    ]);
    const terms = expandedTerms(
      [...(input.context ?? []), input.prompt].join(' '),
    );
    const favoriteCuisines = Array.isArray(userDocument.get('favoriteCuisines'))
      ? (userDocument.get('favoriteCuisines') as unknown[]).filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const origin =
      input.latitude !== undefined && input.longitude !== undefined
        ? { latitude: input.latitude, longitude: input.longitude }
        : null;
    const requestedLocation = (
      input.location?.trim() ||
      (!origin && typeof userDocument.get('city') === 'string'
        ? String(userDocument.get('city')).trim()
        : '')
    )?.toLocaleLowerCase();
    const ranked = venuesSnapshot.docs
      .map((document) => {
        const category = String(document.get('category') ?? 'Restaurant');
        const city = String(document.get('city') ?? 'Unknown city');
        const tags = Array.isArray(document.get('placeTags'))
          ? (document.get('placeTags') as unknown[])
          : [];
        const haystack = [document.get('name'), category, city, ...tags]
          .join(' ')
          .toLocaleLowerCase();
        const promptScore = terms.reduce(
          (score, term) => score + (haystack.includes(term) ? 4 : 0),
          0,
        );
        const preferenceScore = favoriteCuisines.some((cuisine) =>
          haystack.includes(cuisine.toLocaleLowerCase()),
        )
          ? 3
          : 0;
        const rating = Number(document.get('rating') ?? 0);
        const latitude: unknown = document.get('latitude');
        const longitude: unknown = document.get('longitude');
        const distance =
          origin &&
          typeof latitude === 'number' &&
          Number.isFinite(latitude) &&
          Math.abs(latitude) <= 90 &&
          typeof longitude === 'number' &&
          Number.isFinite(longitude) &&
          Math.abs(longitude) <= 180
            ? distanceKm(origin, { latitude, longitude })
            : null;
        const locationScore =
          requestedLocation &&
          city.toLocaleLowerCase().trim() === requestedLocation
            ? 12
            : 0;
        const proximityScore =
          distance === null ? 0 : Math.max(0, 12 - distance / 2);
        return {
          document,
          category,
          city,
          distance,
          rating,
          score:
            promptScore +
            preferenceScore +
            rating +
            locationScore +
            proximityScore,
        };
      })
      .filter((candidate) => {
        if (origin)
          return candidate.distance !== null && candidate.distance <= 50;
        if (requestedLocation)
          return (
            candidate.city.toLocaleLowerCase().trim() === requestedLocation
          );
        return true;
      })
      .sort((a, b) => b.score - a.score || b.rating - a.rating)
      .slice(0, 3);
    const places = ranked.map(
      ({ document, category, city, distance, rating }) => {
        const priceLevel = Math.min(
          4,
          Math.max(1, Number(document.get('priceLevel') ?? 2)),
        );
        return {
          id: document.id,
          name: String(document.get('name') ?? 'Local restaurant'),
          description: `${category} in ${city}, rated ${rating.toFixed(1)} by the Tastes community${distance === null ? '' : ` · ${distance.toFixed(1)} km away`}.`,
          rating,
          reviewCount: Math.max(
            0,
            Math.trunc(Number(document.get('reviewCount') ?? 0)),
          ),
          imageUrl:
            typeof document.get('imageUrl') === 'string'
              ? String(document.get('imageUrl'))
              : null,
          price: '$'.repeat(priceLevel),
          cuisine: category,
          distanceKm: distance === null ? null : Number(distance.toFixed(1)),
        };
      },
    );
    return {
      id: `recommendations-${Date.now()}`,
      text:
        places.length > 0
          ? `I found ${places.length} places using your taste profile, community ratings, and ${origin || requestedLocation ? 'your location' : 'your request'}.`
          : 'No active places match yet. Add a city or cuisine and try again.',
      followUps: [
        'Make it more casual',
        'Find family-friendly places',
        'Best for a date',
      ],
      places,
    };
  },
);
