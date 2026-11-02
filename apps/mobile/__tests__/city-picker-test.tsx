/// <reference types="jest" />

import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  canonicalCityName,
  CityPicker,
  cityMatchesSearch,
} from '../src/features/onboarding/CityPicker';
import { ThemeProvider } from '../src/ui/ThemeProvider';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual(
    '@react-native-async-storage/async-storage/jest/async-storage-mock',
  ),
);

describe('CityPicker', () => {
  it('shows the four founder-selected cities in a pinned section', async () => {
    await render(<CityPicker onSelect={jest.fn()} />, {
      wrapper: ThemeProvider,
    });

    expect(screen.getByText('Pinned')).toBeTruthy();
    expect(screen.getByText('More cities')).toBeTruthy();
    expect(screen.getByText('Monaco')).toBeTruthy();
    expect(screen.getByText('London')).toBeTruthy();
    expect(screen.getByText('Madrid')).toBeTruthy();
    expect(screen.getByText('Paris')).toBeTruthy();
  });

  it('selects Monaco when Menton is searched', async () => {
    const onSelect = jest.fn();
    await render(<CityPicker onSelect={onSelect} />, {
      wrapper: ThemeProvider,
    });

    fireEvent.changeText(screen.getByPlaceholderText('Search'), 'Menton');
    expect(screen.getByText('Monaco')).toBeTruthy();
    expect(screen.queryByTestId('use-custom-city')).toBeNull();

    fireEvent.press(screen.getByText('Monaco'));
    expect(onSelect).toHaveBeenCalledWith('Monaco', expect.anything());
  });

  it.each(['Menton', 'Roquebrune-Cap-Martin', 'Roquebrune Cap Martin'])(
    'maps the %s alias to Monaco',
    (alias) => {
      expect(cityMatchesSearch('Monaco', alias)).toBe(true);
      expect(canonicalCityName(alias)).toBe('Monaco');
    },
  );
});
