/// <reference types="jest" />

import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
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
