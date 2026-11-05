/// <reference types="jest" />

import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';
import type { PlaceReview } from '@tastes/contracts';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { ReviewCard } from '../src/features/place/PlaceScreen';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

jest.mock('@tastes/firebase-client', () => ({ apiErrorMessage: String }));
jest.mock('../src/features/favourites/FavouritesPane', () => ({
  SaveToFolderSheet: () => null,
}));
jest.mock('../src/features/favourites/api', () => ({
  useSavedVenue: () => ({ data: false }),
  useUnsaveVenue: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('../src/features/discover/api', () => ({}));
jest.mock('../src/session/SessionProvider', () => ({
  useTastesApi: () => ({}),
}));
jest.mock('../src/infrastructure/observability', () => ({
  captureException: jest.fn(),
}));

jest.mock('../src/ui/ThemeProvider', () => ({
  useAppTheme: () => ({
    colors: {
      primary: '#B82F29',
      text: '#111111',
    },
  }),
}));

jest.mock('../src/infrastructure/storageImage', () => ({
  resolveStorageImageUrl: jest.fn(),
}));

const review: PlaceReview = {
  id: 'review-without-photo',
  authorId: 'current-user',
  authorDisplayName: 'Current User',
  authorUsername: 'current.user',
  authorPhotoUrl: null,
  venueCity: 'Istanbul',
  cuisine: 'Turkish',
  rating: 4,
  text: 'A real review without a profile photo.',
  reactionCount: 0,
  commentCount: 0,
  createdAt: '2026-09-28T12:00:00.000Z',
  tag: null,
  dishNames: [],
  tags: [],
  dishReviews: [],
};

it('shows the default profile avatar when a venue review author has no photo', async () => {
  await render(
    <ReviewCard
      fallbackPhotoUrls={[]}
      item={review}
      onComments={jest.fn()}
      onOpenProfile={jest.fn()}
      onReact={jest.fn()}
      onShare={jest.fn()}
      reacted={false}
      reactingId={null}
      reviewIndex={0}
      styles={{} as never}
      venueName="Kadikoy Noodle House"
    />,
  );

  expect(screen.getByLabelText('Default profile avatar')).toBeOnTheScreen();
  expect(screen.queryByLabelText(/profile photo$/)).not.toBeOnTheScreen();
});

it('opens the review author profile from the venue review card', async () => {
  const onOpenProfile = jest.fn();
  await render(
    <ReviewCard
      fallbackPhotoUrls={[]}
      item={review}
      onComments={jest.fn()}
      onOpenProfile={onOpenProfile}
      onReact={jest.fn()}
      onShare={jest.fn()}
      reacted={false}
      reactingId={null}
      reviewIndex={0}
      styles={{} as never}
      venueName="Kadikoy Noodle House"
    />,
  );

  fireEvent.press(screen.getByLabelText('Open Current User profile'));
  expect(onOpenProfile).toHaveBeenCalledWith('current-user');
});

it('opens the shared dish list and dish review from a Place review', async () => {
  await render(
    <ReviewCard
      fallbackPhotoUrls={[]}
      item={{
        ...review,
        dishReviews: [{ id: 'dish-1', title: 'Pasta', rating: 4 }],
      }}
      onComments={jest.fn()}
      onOpenProfile={jest.fn()}
      onReact={jest.fn()}
      onShare={jest.fn()}
      reacted={false}
      reactingId={null}
      reviewIndex={0}
      styles={{} as never}
      venueName="Kadikoy Noodle House"
    />,
  );
  await fireEvent.press(screen.getByLabelText('Open dish reviews'));
  expect(
    within(screen.getByTestId('dish-review-sheet')).getByText('Dishes (1)'),
  ).toBeOnTheScreen();
  // The selected list item uses the same viewer as the photo carousel.
  await fireEvent.press(
    within(screen.getByTestId('dish-review-sheet')).getByLabelText(
      'Open dish review for Pasta',
    ),
  );
  expect(screen.getByText('Dish Review')).toBeOnTheScreen();
  expect(
    within(screen.getByTestId('dish-review-sheet')).getByLabelText(
      'No dish photo',
    ),
  ).toBeOnTheScreen();
});
