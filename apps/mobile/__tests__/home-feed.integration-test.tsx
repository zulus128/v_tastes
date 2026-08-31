/// <reference types="jest" />

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import {
  HomeFeedEmptyState,
  HomeFeedOfflineState,
} from '../src/features/home/HomeFeedStates';
import { ThemeProvider } from '../src/ui/ThemeProvider';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function AppProviders({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe('home feed states', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('guides an empty friends feed to discovery', async () => {
    const onAction = jest.fn();
    await render(<HomeFeedEmptyState scope="friends" onAction={onAction} />, {
      wrapper: AppProviders,
    });

    expect(await screen.findByText('Your feed is quiet')).toBeOnTheScreen();
    expect(screen.getByText(/Follow friends to see their reviews/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Find friends' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('uses the selected city in the local empty state', async () => {
    await render(<HomeFeedEmptyState scope="local" city=" Istanbul " onAction={jest.fn()} />, {
      wrapper: AppProviders,
    });

    expect(await screen.findByText('No posts in your city yet')).toBeOnTheScreen();
    expect(screen.getByText(/first to review a place in Istanbul/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Browse restaurants' })).toBeOnTheScreen();
  });

  it('lets the user retry after an offline failure', async () => {
    const onRetry = jest.fn();
    await render(<HomeFeedOfflineState onRetry={onRetry} />, { wrapper: AppProviders });

    expect(await screen.findByText('No connection')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
