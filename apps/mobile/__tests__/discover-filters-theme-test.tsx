/// <reference types="jest" />

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard, StyleSheet } from 'react-native';
import { DiscoverFiltersScreen } from '../src/features/discover/DiscoverFiltersScreen';

const mockLightColors = {
  background: '#F6F6F6',
  border: '#E4E4E4',
  canvas: '#F2EFEA',
  hairline: '#E4E4E4',
  surfaceRaised: '#F6F6F6',
  switchThumb: '#FFFFFF',
  switchTrack: '#E4E4E4',
  text: '#000000',
  textMuted: 'rgba(56,64,80,0.58)',
};
const mockDarkColors = {
  ...mockLightColors,
  background: '#080808',
  border: '#45474B',
  canvas: '#161616',
  hairline: 'rgba(255,255,255,0.08)',
  surfaceRaised: '#282828',
  switchThumb: '#D9DDE5',
  switchTrack: '#222222',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.58)',
};
let mockResolvedTheme: 'dark' | 'light' = 'light';

jest.mock('../src/ui/ThemeProvider', () => ({
  useAppTheme: () => ({
    colors: mockResolvedTheme === 'light' ? mockLightColors : mockDarkColors,
  }),
}));
jest.mock('../src/session/SessionProvider', () => ({
  useAuthenticatedUserId: () => 'test-user',
}));
jest.mock('../src/features/discover/api', () => ({
  useDiscoverVenues: () => ({ data: { pages: [{ items: [] }] } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

it('uses the active theme on the filters screen', async () => {
  mockResolvedTheme = 'light';
  const view = await render(
    <DiscoverFiltersScreen
      initialValues={[]}
      onApply={jest.fn()}
      onBack={jest.fn()}
    />,
  );

  expect(StyleSheet.flatten(screen.getByText('Filter').props.style).color).toBe(
    '#000000',
  );
  expect(
    StyleSheet.flatten(screen.getByText('Kind of food').props.style).color,
  ).toBe('#000000');

  mockResolvedTheme = 'dark';
  await view.rerender(
    <DiscoverFiltersScreen
      initialValues={[]}
      onApply={jest.fn()}
      onBack={jest.fn()}
    />,
  );

  expect(StyleSheet.flatten(screen.getByText('Filter').props.style).color).toBe(
    '#FFFFFF',
  );
});

it('counts only saved places when filtering the wishlist', async () => {
  await render(
    <DiscoverFiltersScreen
      initialValues={['$$ 🍝']}
      onApply={jest.fn()}
      onBack={jest.fn()}
      previewPlaces={[{ priceLevel: 2 }, { priceLevel: 3 }]}
      scope="saved"
    />,
  );

  expect(screen.getByText('Filter saved places')).toBeTruthy();
  expect(screen.getByText('Show 1 place')).toBeTruthy();
});

it('does not promise a place count when filtering reviews', async () => {
  await render(
    <DiscoverFiltersScreen
      initialValues={[]}
      onApply={jest.fn()}
      onBack={jest.fn()}
      scope="reviews"
    />,
  );

  expect(screen.getByText('Filter reviews')).toBeTruthy();
  expect(screen.getByText('Show reviews')).toBeTruthy();
});

it('dismisses an existing keyboard when the filter screen opens', async () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(jest.fn());

  await render(
    <DiscoverFiltersScreen
      initialValues={[]}
      onApply={jest.fn()}
      onBack={jest.fn()}
    />,
  );

  expect(dismiss).toHaveBeenCalledTimes(1);
  dismiss.mockRestore();
});

it('does not render or reapply the retired Vegetarian filter', async () => {
  const onApply = jest.fn();

  await render(
    <DiscoverFiltersScreen
      initialValues={['Vegetarian 🥦']}
      onApply={onApply}
      onBack={jest.fn()}
    />,
  );

  expect(screen.queryByText('Dietary preferences')).toBeNull();
  expect(screen.queryByText('Vegetarian 🥦')).toBeNull();

  fireEvent.press(screen.getByText(/Show/));
  expect(onApply).toHaveBeenCalledWith([]);
});
