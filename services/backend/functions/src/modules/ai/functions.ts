import { askTastesAiInputSchema, type TastesAiAnswer } from '@tastes/contracts';
import { onCall } from 'firebase-functions/v2/https';
import { requireUserId } from '../../shared/auth';
import { callableOptions } from '../../shared/options';
import { parseInput } from '../../shared/validation';

const mockPlaces = [
  { id: 'morimoto', name: 'Wasabi by Morimoto', description: 'Lorem ipsum dolor sit amet, Japanese dining and a polished room.', rating: 4.7, price: '$$$', cuisine: 'Japanese' },
  { id: 'gemini-750', name: 'Gemini750 Restaurant', description: 'Lorem ipsum dolor sit amet, lively Italian plates for dinner with friends.', rating: 4.4, price: '$$', cuisine: 'Italian' },
  { id: 'tacos-la-brea', name: 'Tacos La Brea', description: 'Lorem ipsum dolor sit amet, casual tacos and a friendly atmosphere.', rating: 4.6, price: '$', cuisine: 'Mexican' },
];

/**
 * Temporary deterministic contract for the finished AI frontend. Replace the
 * body with the recommendation service without changing the callable shape.
 */
export const askTastesAi = onCall(callableOptions, async (request): Promise<TastesAiAnswer> => {
  requireUserId(request);
  const input = parseInput(askTastesAiInputSchema, request.data);
  const noResults = /nothing|no results/i.test(input.prompt);
  return {
    id: `mock-ai-${Date.now()}`,
    text: noResults
      ? 'Lorem ipsum dolor sit amet. Try widening the area or removing one preference.'
      : 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. These places match your recent saves and ratings.',
    followUps: noResults ? ['Show anything nearby', 'Try a different cuisine'] : ['Make it more casual', 'Only places open late', 'Best for a date'],
    places: noResults ? [] : mockPlaces,
  };
});
