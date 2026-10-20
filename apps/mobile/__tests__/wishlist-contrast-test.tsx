/// <reference types="jest" />

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SaveToFolderSheet } from '../src/features/favourites/FavouritesPane';

const mockFolderIds: string[] = [];
const mockLightColors = {
  background: '#F2EFEA',
  border: '#D8D4CE',
  canvas: '#F2EFEA',
  placeholder: '#777777',
  primary: '#B82F29',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  text: '#080808',
  textMuted: '#6E6E73',
};
const mockDarkColors = {
  ...mockLightColors,
  background: '#080808',
  canvas: '#161616',
  surface: '#161616',
  surfaceRaised: '#282828',
  text: '#FFFFFF',
};
let mockResolvedTheme: 'dark' | 'light' = 'light';

jest.mock('@tastes/firebase-client', () => ({ apiErrorMessage: String }));
jest.mock('../src/ui/ThemeProvider', () => ({
  useAppTheme: () => ({
    colors: mockResolvedTheme === 'light' ? mockLightColors : mockDarkColors,
    preference: 'system',
    resolvedTheme: mockResolvedTheme,
  }),
}));
jest.mock('../src/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({
    children,
    presentationStyle,
    transparent,
    visible,
  }: {
    children: ReactNode;
    presentationStyle?: string;
    transparent?: boolean;
    visible: boolean;
  }) => {
    const { View } = jest.requireActual('react-native');
    return visible ? (
      <View
        presentationStyle={presentationStyle}
        testID="wishlist-modal"
        transparent={transparent}
      >
        {children}
      </View>
    ) : null;
  },
}));
jest.mock('../src/features/favourites/api', () => ({
  useCreateFolder: () => ({ mutateAsync: jest.fn() }),
  useDeleteFolder: () => ({ mutate: jest.fn() }),
  useFavourites: () => ({ data: { folders: [], places: [] }, isSuccess: true }),
  useRenameFolder: () => ({ mutateAsync: jest.fn() }),
  useSaveVenue: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useSavedVenue: () => ({ folderIds: mockFolderIds }),
  useUnsaveVenue: () => ({ mutate: jest.fn() }),
}));

it('uses light-theme foreground colors for the Save to sheet', async () => {
  mockResolvedTheme = 'light';
  await render(
    <SaveToFolderSheet
      onClose={jest.fn()}
      place={{ name: 'Kadikoy Noodle House', venueId: 'venue-1' }}
      userId="user-1"
      visible
    />,
  );

  expect(
    StyleSheet.flatten(screen.getByText('Save to…').props.style).color,
  ).toBe('#080808');
  expect(StyleSheet.flatten(screen.getByText('×').props.style).color).toBe(
    '#080808',
  );
  expect(
    StyleSheet.flatten(screen.getByText('All places').props.style).color,
  ).toBe('#080808');
  expect(screen.getByTestId('wishlist-modal').props.transparent).toBe(true);
});

it('updates Save to sheet colors while the modal stays open', async () => {
  mockResolvedTheme = 'light';
  const sheet = await render(
    <SaveToFolderSheet
      onClose={jest.fn()}
      place={{ name: 'Kadikoy Noodle House', venueId: 'venue-1' }}
      userId="user-1"
      visible
    />,
  );

  expect(
    StyleSheet.flatten(screen.getByText('Save to…').props.style).color,
  ).toBe('#080808');

  mockResolvedTheme = 'dark';
  await sheet.rerender(
    <SaveToFolderSheet
      onClose={jest.fn()}
      place={{ name: 'Kadikoy Noodle House', venueId: 'venue-1' }}
      userId="user-1"
      visible
    />,
  );

  expect(
    StyleSheet.flatten(screen.getByText('Save to…').props.style).color,
  ).toBe('#FFFFFF');
  expect(StyleSheet.flatten(screen.getByText('×').props.style).color).toBe(
    '#FFFFFF',
  );
});
