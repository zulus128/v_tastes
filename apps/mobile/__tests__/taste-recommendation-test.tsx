import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import type { TasteRecommendation } from '@tastes/contracts';
import { TasteRecommendationCard } from '../src/features/taste-match/TasteRecommendationCard';

jest.mock('../src/ui/ThemeProvider', () => ({
  useAppTheme: () => ({
    colors: {
      surface: '#161616',
      border: '#444',
      text: '#fff',
      textSecondary: '#aaa',
      primary: '#b82f29',
    },
  }),
}));
jest.mock('../src/infrastructure/storageImage', () => ({
  resolveStorageImageUrl: jest
    .fn()
    .mockResolvedValue('https://example.com/real-dish.jpg'),
}));

const card: TasteRecommendation = {
  id: 'offering',
  canonicalDishId: 'pesto',
  canonicalDishName: 'Pesto pasta',
  venue: {
    id: 'venue',
    name: 'Local Restaurant',
    city: 'Rome',
    status: 'active',
  },
  dishRating: 4.75,
  tier: 'taste_match',
  confidence: 'limited',
  supporterCount: 2,
  reviewerCount: 2,
  headline:
    'Sofia and 1 other person with similar dish ratings loved Pesto pasta at Local Restaurant.',
  connection: 'You and Sofia both rated Cacio e pepe highly.',
  reviewId: 'source-review',
};
function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        })
      }
    >
      {children}
    </QueryClientProvider>
  );
}
it('shows the real dish, evidence and separate review/place actions without a match percentage', async () => {
  const review = jest.fn(),
    place = jest.fn();
  await render(
    <TasteRecommendationCard
      card={card}
      onOpenReview={review}
      onOpenPlace={place}
    />,
    { wrapper: Providers },
  );
  expect(screen.getByText('Similar tastes')).toBeOnTheScreen();
  expect(screen.getByText(card.headline)).toBeOnTheScreen();
  expect(screen.queryByText(/%/)).toBeNull();
  expect(screen.getByLabelText('No dish photo')).toBeOnTheScreen();
  await fireEvent.press(
    screen.getByLabelText('See review of Pesto pasta at Local Restaurant'),
  );
  expect(review).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('link'));
  expect(place).toHaveBeenCalledTimes(1);
});
it('labels social fallbacks explicitly and allows dismissal', async () => {
  const dismiss = jest.fn();
  await render(
    <TasteRecommendationCard
      card={{ ...card, tier: 'social', confidence: 'not_personalized' }}
      onOpenReview={jest.fn()}
      onOpenPlace={jest.fn()}
      onDismiss={dismiss}
    />,
    { wrapper: Providers },
  );
  expect(screen.getByText('People you follow')).toBeOnTheScreen();
  expect(screen.queryByText('Similar tastes')).toBeNull();
  await fireEvent.press(
    screen.getByLabelText('Dismiss recommendation for Pesto pasta'),
  );
  expect(dismiss).toHaveBeenCalledTimes(1);
});
