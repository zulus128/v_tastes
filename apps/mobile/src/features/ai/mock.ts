export type AiPlace = {
  id: string;
  name: string;
  description: string;
  rating: number;
  price: string;
  cuisine: string;
};

export type AiAnswer = {
  id: string;
  text: string;
  followUps: string[];
  places: AiPlace[];
};

const places: AiPlace[] = [
  { id: 'morimoto', name: 'Wasabi by Morimoto', description: 'A polished Japanese room for sushi and a long dinner.', rating: 4.7, price: '$$$', cuisine: 'Japanese' },
  { id: 'gemini-750', name: 'Gemini750 Restaurant', description: 'Warm Italian plates with enough energy for a late group dinner.', rating: 4.4, price: '$$', cuisine: 'Italian' },
  { id: 'tacos-la-brea', name: 'Tacos La Brea', description: 'Casual tacos, birria and a friendly atmosphere.', rating: 4.6, price: '$', cuisine: 'Mexican' },
];

export async function mockAskTastesAi(prompt: string): Promise<AiAnswer> {
  await new Promise((resolve) => setTimeout(resolve, 850));
  const normalized = prompt.toLowerCase();
  if (normalized.includes('nothing') || normalized.includes('no results')) {
    return { id: `ai-${Date.now()}`, text: 'I could not find a confident match yet. Try widening the area or removing one preference.', places: [], followUps: ['Show anything nearby', 'Try a different cuisine'] };
  }
  return {
    id: `ai-${Date.now()}`,
    text: 'Based on your recent saves and highly rated Mediterranean places, these are the strongest matches. I kept the list short and varied the atmosphere.',
    places,
    followUps: ['Make it more casual', 'Only places open late', 'Best for a date'],
  };
}
