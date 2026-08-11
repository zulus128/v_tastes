import { askTastesAiInputSchema, type TastesAiAnswer } from '@tastes/contracts';
import { onCall } from 'firebase-functions/v2/https';
import { requireUserId } from '../../shared/auth';
import { db } from '../../shared/firebase';
import { callableOptions } from '../../shared/options';
import { parseInput } from '../../shared/validation';

export const askTastesAi = onCall(callableOptions, async (request): Promise<TastesAiAnswer> => {
  const uid = requireUserId(request);
  const input = parseInput(askTastesAiInputSchema, request.data);
  const [venuesSnapshot, userDocument] = await Promise.all([
    db.collection('venues').where('status', '==', 'active').limit(50).get(),
    db.collection('users').doc(uid).get(),
  ]);
  const terms = input.prompt.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 2);
  const favoriteCuisines = Array.isArray(userDocument.get('favoriteCuisines'))
    ? (userDocument.get('favoriteCuisines') as unknown[]).filter((value): value is string => typeof value === 'string')
    : [];
  const ranked = venuesSnapshot.docs.map((document) => {
    const category = String(document.get('category') ?? 'Restaurant');
    const city = String(document.get('city') ?? input.location ?? 'nearby');
    const tags = Array.isArray(document.get('placeTags')) ? document.get('placeTags') as unknown[] : [];
    const haystack = [document.get('name'), category, city, ...tags].join(' ').toLocaleLowerCase();
    const promptScore = terms.reduce((score, term) => score + (haystack.includes(term) ? 5 : 0), 0);
    const preferenceScore = favoriteCuisines.some((cuisine) => haystack.includes(cuisine.toLocaleLowerCase())) ? 3 : 0;
    const rating = Number(document.get('rating') ?? 0);
    return { document, category, city, rating, score: promptScore + preferenceScore + rating };
  }).sort((a, b) => b.score - a.score || b.rating - a.rating).slice(0, 3);
  const places = ranked.map(({ document, category, city, rating }) => {
    const priceLevel = Math.min(4, Math.max(1, Number(document.get('priceLevel') ?? 2)));
    return {
      id: document.id,
      name: String(document.get('name') ?? 'Local restaurant'),
      description: `${category} in ${city}, rated ${rating.toFixed(1)} by the Tastes community.`,
      rating,
      price: '$'.repeat(priceLevel),
      cuisine: category,
    };
  });
  return {
    id: `recommendations-${Date.now()}`,
    text: places.length > 0
      ? `I found ${places.length} places using your preferences, ratings from the community, and your request.`
      : 'No active places match yet. Add a city or cuisine and try again.',
    followUps: ['Make it more casual', 'Only places open late', 'Best for a date'],
    places,
  };
});
