/// <reference types="jest" />

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PostSignupOnboardingFlow } from '../src/features/onboarding/PostSignupOnboardingFlow';
import { ThemeProvider } from '../src/ui/ThemeProvider';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/infrastructure/firebase', () => ({ auth: { currentUser: null }, storage: {} }));
jest.mock('@tastes/firebase-client', () => ({ apiErrorMessage: (error: Error) => error.message }));
jest.mock('firebase/storage', () => ({ ref: jest.fn(), uploadBytes: jest.fn() }));
jest.mock('../src/session/SessionProvider', () => ({ useTastesApi: () => ({}) }));
jest.mock('../src/infrastructure/pushNotifications', () => ({ syncPushNotifications: jest.fn() }));

function Providers({ children }: PropsWithChildren) {
  return <SafeAreaProvider><ThemeProvider>{children}</ThemeProvider></SafeAreaProvider>;
}

const originalWindow = Dimensions.get('window');
const originalScreen = Dimensions.get('screen');

function resize(width: number, height: number) {
  const dimensions = { width, height, scale: 2, fontScale: 1 };
  Dimensions.set({ window: dimensions, screen: dimensions });
}

describe('onboarding in resizable windows', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(async () => {
    await act(async () => Dimensions.set({ window: originalWindow, screen: originalScreen }));
  });

  it.each([[393, 852], [667, 375], [800, 500], [600, 600], [1024, 600]])(
    'keeps appearance choices scrollable above Continue at %sx%s',
    async (width, height) => {
      resize(width, height);
      await render(<PostSignupOnboardingFlow initialScreen="style" onAuthenticationRequired={jest.fn()} onComplete={jest.fn()} visualAudit />, { wrapper: Providers });

      const choices = screen.getByTestId('onboarding-appearance-scroll');
      const viewport = screen.getByTestId('onboarding-appearance-viewport');
      const bounds = StyleSheet.flatten(viewport.props.style);
      expect(bounds.top).toBeGreaterThan(0);
      expect(bounds.bottom).toBeGreaterThan(0);
      expect(height - bounds.top - bounds.bottom).toBeGreaterThan(0);
      expect(choices).not.toContainElement(screen.getByRole('button', { name: 'Continue' }));

      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      expect(await screen.findByText('Find your friends')).toBeOnTheScreen();
    },
  );

  it('keeps permission and invitation content in a separate scroll area from the action', async () => {
    resize(667, 375);
    await render(<PostSignupOnboardingFlow initialScreen="contactsPermission" onAuthenticationRequired={jest.fn()} onComplete={jest.fn()} visualAudit />, { wrapper: Providers });

    const permissionBody = screen.getByTestId('onboarding-permission-scroll');
    expect(StyleSheet.flatten(permissionBody.props.style).bottom).toBeGreaterThan(0);
    expect(permissionBody).not.toContainElement(screen.getByRole('button', { name: 'Allow Contacts' }));
    await fireEvent.press(screen.getByText('Skip'));

    const invitations = screen.getByTestId('onboarding-invite-scroll');
    expect(StyleSheet.flatten(invitations.props.style).bottom).toBeGreaterThan(0);
    expect(invitations).not.toContainElement(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Invite from your contacts')).toBeOnTheScreen();
  });

  it('resizes the ready illustration without squeezing out the completion action', async () => {
    resize(800, 500);
    const onComplete = jest.fn().mockResolvedValue(undefined);
    await render(<PostSignupOnboardingFlow initialScreen="ready" onAuthenticationRequired={jest.fn()} onComplete={onComplete} visualAudit />, { wrapper: Providers });

    expect(StyleSheet.flatten(screen.getByTestId('onboarding-ready-collage').props.style).width).toBeLessThan(400);
    await act(async () => resize(600, 600));
    const scroll = screen.getByTestId('onboarding-ready-scroll');
    expect(scroll).toContainElement(screen.getByRole('button', { name: 'Start rating' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Start rating' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
