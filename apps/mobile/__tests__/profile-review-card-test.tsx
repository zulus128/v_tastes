/// <reference types="jest" />

import type { FeedItem } from '@tastes/contracts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ProfileDraftCard } from '../src/features/profile/ProfileDraftCard';
import { ProfileReviewCard } from '../src/features/profile/ProfileReviewCard';
import type { ProfileData } from '../src/features/profile/api';
import { ThemeProvider } from '../src/ui/ThemeProvider';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../src/infrastructure/firebase', () => ({ storage: {} }));
jest.mock('../src/infrastructure/observability', () => ({ captureException: jest.fn() }));
jest.mock('../src/infrastructure/storageImage', () => ({
  resolveStorageImageUrl: jest.fn(async () => 'https://example.com/dish.jpg'),
}));

const profile: ProfileData = {
  bio: '',
  city: 'Madrid',
  displayName: 'Jane Cooper',
  favoriteCuisines: ['Japanese'],
  favoriteDish: null,
  favoriteVenueId: null,
  followerCount: 0,
  followingCount: 0,
  photoPath: null,
  photoUrl: 'https://example.com/jane.jpg',
  reviewCount: 1,
  username: 'nickname2321',
  xp: 0,
};

const item = {
  id: 'review-1',
  authorId: 'jane',
  authorDisplayName: 'Jane Cooper',
  venueId: 'venue-1',
  venueName: 'Wasabi by Morimoto',
  venueCity: 'Madrid',
  cuisine: 'Japanese',
  rating: 3.5,
  text: 'One answer is that Truth pertains to the possibility that an event will occur. If true, it must occur and if false, it cannot occur.',
  tags: ['date-night'],
  dishReviews: [
    {
      id: 'dish-1',
      photoPath: 'review-images/jane/review-1/dish-1',
      photoUrl: 'https://example.com/steak.jpg',
      rating: 4.5,
      title: 'Medium Rare Steak',
    },
    {
      id: 'dish-2',
      photoPath: 'review-images/jane/review-1/dish-2',
      photoUrl: 'https://example.com/salmon.jpg',
      rating: 4.3,
      title: 'Grilled Salmon with Vegetables',
    },
  ],
  status: 'published',
  commentCount: 5,
  reactionCount: 12,
  createdAt: '2024-12-05T12:00:00.000Z',
} as FeedItem;

function Providers({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe('profile review card', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('renders the Figma card hierarchy and every engagement action', async () => {
    const onComments = jest.fn();
    const onReact = jest.fn();
    const onShare = jest.fn();

    await render(
      <ProfileReviewCard
        item={item}
        onComments={onComments}
        onMore={jest.fn()}
        onReact={onReact}
        onShare={onShare}
        profile={profile}
      />,
      { wrapper: Providers },
    );

    expect(await screen.findByText('Jane Cooper')).toBeOnTheScreen();
    expect(screen.getByText('@nickname2321')).toBeOnTheScreen();
    expect(screen.getByText('Wasabi by Morimoto')).toBeOnTheScreen();
    expect(screen.getByLabelText('3.5 out of 5 stars')).toBeOnTheScreen();
    expect(screen.getByText('Madrid')).toBeOnTheScreen();
    expect(screen.getByText('Date night')).toBeOnTheScreen();
    expect(screen.getByText('Japanese')).toBeOnTheScreen();
    expect(screen.getByText('Dishes (2)')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-review-dishes')).toContainElement(
      screen.getByText('Medium Rare Steak'),
    );
    expect(screen.getByText('4.5')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Like review'));
    await fireEvent.press(screen.getByLabelText('Open comments'));
    await fireEvent.press(screen.getByLabelText('Share review'));
    expect(onReact).toHaveBeenCalledTimes(1);
    expect(onComments).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it('expands long review text from the two-line Figma preview', async () => {
    await render(
      <ProfileReviewCard
        item={item}
        onComments={jest.fn()}
        onMore={jest.fn()}
        onReact={jest.fn()}
        onShare={jest.fn()}
        profile={profile}
      />,
      { wrapper: Providers },
    );

    expect(await screen.findByText('See more')).toBeOnTheScreen();
    const reviewText = screen.getByText(item.text);
    expect(reviewText.props.numberOfLines).toBe(2);

    await fireEvent.press(reviewText.parent!);
    expect(screen.queryByText('See more')).not.toBeOnTheScreen();
    expect(screen.getByText(item.text).props.numberOfLines).toBeUndefined();
  });

  it('uses the Draft badge instead of a city in the draft variant', async () => {
    const onContinue = jest.fn();

    await render(
      <ProfileDraftCard
        draft={{
          dishes: [{ id: 'dish-1', photoUri: 'https://example.com/dish.jpg', rating: 4.5, title: 'Medium Rare Steak' }],
          rating: 3.5,
          savedAt: '2024-12-05T12:00:00.000Z',
          text: 'A saved review draft.',
          venueName: 'Wasabi by Morimoto',
        }}
        onContinue={onContinue}
        profile={profile}
      />,
      { wrapper: Providers },
    );

    expect(await screen.findByText('Draft')).toBeOnTheScreen();
    expect(screen.queryByText('Madrid')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('3.5 out of 5 stars')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(/Continue editing/));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
