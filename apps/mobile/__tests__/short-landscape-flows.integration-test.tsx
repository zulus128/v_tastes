/// <reference types="jest" />

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityInviteModal } from '../src/features/activities/ActivityInviteModal';
import { MonthlyRecapFlow } from '../src/features/recap/MonthlyRecapFlow';
import { ThemeProvider } from '../src/ui/ThemeProvider';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/infrastructure/firebase', () => ({ firestore: {} }));
jest.mock('../src/session/SessionProvider', () => ({
  useTastesApi: () => ({ respondToActivityInvitation: jest.fn() }),
}));
jest.mock('@tastes/firebase-client', () => ({ apiErrorMessage: (error: Error) => error.message }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((...segments: string[]) => segments.join('/')),
  getDoc: jest.fn(async () => ({ data: () => undefined })),
  onSnapshot: jest.fn((_reference, onNext: (snapshot: { data: () => object; exists: () => boolean }) => void) => {
    onNext({
      exists: () => true,
      data: () => ({
        invitationStatuses: { current: 'pending' },
        organizerId: 'organizer',
        participantIds: ['organizer', 'current'],
        startsAt: { toDate: () => new Date('2026-09-10T18:00:00Z') },
        venueId: 'venue',
        venueName: 'Gemini',
      }),
    });
    return jest.fn();
  }),
}));

const originalWindow = Dimensions.get('window');
const originalScreen = Dimensions.get('screen');

function resize(width: number, height: number) {
  const dimensions = { width, height, scale: 2, fontScale: 1 };
  Dimensions.set({ window: dimensions, screen: dimensions });
}

function Providers({ children }: PropsWithChildren) {
  return <SafeAreaProvider><ThemeProvider>{children}</ThemeProvider></SafeAreaProvider>;
}

function NotchedLandscapeProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 667, height: 375 },
        insets: { top: 0, right: 21, bottom: 21, left: 59 },
      }}
    >
      <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
  );
}

describe('fixed-coordinate flows in short landscape windows', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resize(667, 375);
  });

  afterEach(async () => {
    await act(async () => Dimensions.set({ window: originalWindow, screen: originalScreen }));
  });

  it('caps the activity invitation and keeps both actions in a scroll view', async () => {
    await render(
      <ActivityInviteModal activityId="activity" onClose={jest.fn()} userId="current" visible />,
      { wrapper: Providers },
    );

    expect(await screen.findByText('Take part')).toBeOnTheScreen();
    const scroll = screen.getByTestId('activity-invite-scroll');
    const sheetStyle = StyleSheet.flatten(scroll.parent?.props.style);
    expect(sheetStyle.maxHeight).toBe('100%');
    expect(sheetStyle.minHeight).toBe(0);
    expect(scroll).toContainElement(screen.getByText('Skip'));
    expect(scroll).toContainElement(screen.getByText('Take part'));
  });

  it('uses a scrollable design canvas when recap controls extend below the viewport', async () => {
    await render(<MonthlyRecapFlow initialStep="ratingGuess" onClose={jest.fn()} />, { wrapper: Providers });

    const scroll = screen.getByTestId('monthly-recap-scroll');
    expect(scroll.props.scrollEnabled).toBe(true);
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).height).toBeGreaterThan(375);
  });

  it('keeps recap controls between landscape safe-area edges', async () => {
    await render(<MonthlyRecapFlow initialStep="ratingGuess" onClose={jest.fn()} />, {
      wrapper: NotchedLandscapeProviders,
    });

    expect(screen.getByTestId('monthly-recap-safe-content')).toHaveStyle({ left: 59, right: 21 });
  });

  it('does not add recap scrolling when the design canvas fits', async () => {
    resize(402, 874);
    await render(<MonthlyRecapFlow initialStep="ratingGuess" onClose={jest.fn()} />, { wrapper: Providers });

    const scroll = screen.getByTestId('monthly-recap-scroll');
    expect(scroll.props.scrollEnabled).toBe(false);
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).height).toBe(874);
  });
});
