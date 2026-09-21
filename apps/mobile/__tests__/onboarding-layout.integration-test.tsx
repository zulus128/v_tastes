/// <reference types="jest" />

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OnboardingFlow } from '../src/features/onboarding/OnboardingFlow';
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
jest.mock('firebase/auth', () => ({}));
const mockCheckUsernameAvailability = jest.fn();
const mockTastesApi = { checkUsernameAvailability: mockCheckUsernameAvailability };
jest.mock('../src/session/SessionProvider', () => ({
  useTastesApi: () => mockTastesApi,
}));
jest.mock('../src/infrastructure/pushNotifications', () => ({ syncPushNotifications: jest.fn() }));
jest.mock('expo-auth-session/providers/google', () => ({ useIdTokenAuthRequest: () => [null, null, jest.fn()] }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));

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
    mockCheckUsernameAvailability.mockReset();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await act(async () => Dimensions.set({ window: originalWindow, screen: originalScreen }));
  });

  it('fits the phone field above the action when a landscape keyboard shrinks the scroll viewport', async () => {
    resize(667, 375);
    await render(<OnboardingFlow initialScreen="phone" visualAudit />, { wrapper: Providers });
    const scroll = screen.getByTestId('onboarding-phone-scroll');
    const content = screen.getByTestId('onboarding-phone-content');
    const measure = (height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 667, height } } });

    await fireEvent(content, 'layout', measure(104));
    await fireEvent(scroll, 'layout', measure(313));
    const normalTop = StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop;
    expect(normalTop).toBeGreaterThan(100);

    // KAV resizes its children on iOS without changing useWindowDimensions.
    await fireEvent(scroll, 'layout', measure(159));
    const compressed = StyleSheet.flatten(scroll.props.contentContainerStyle);
    expect(compressed.paddingTop + 104 + compressed.paddingBottom).toBeLessThanOrEqual(159);
    expect(scroll).toContainElement(screen.getByPlaceholderText('Phone number'));
    expect(scroll).not.toContainElement(screen.getByRole('button', { name: 'Continue' }));

    await fireEvent(scroll, 'layout', measure(313));
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop).toBe(normalTop);
    expect(StyleSheet.flatten(screen.getByTestId('onboarding-phone-row').props.style)).toMatchObject({
      backgroundColor: '#FFFFFF',
    });
  });

  it('removes surplus space above OTP cells while retaining scrolling for the remaining content', async () => {
    resize(667, 375);
    await render(<OnboardingFlow initialScreen="otp" visualAudit />, { wrapper: Providers });
    const scroll = screen.getByTestId('onboarding-otp-scroll');
    await fireEvent(screen.getByTestId('onboarding-otp-content'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 637, height: 190 } },
    });
    await fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 667, height: 159 } } });

    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop).toBeLessThan(10);
    expect(scroll).toContainElement(screen.getByText('Resend code'));
    expect(scroll).not.toContainElement(screen.getByRole('button', { name: 'Continue' }));
  });

  it('shows the Figma active and filled states while entering an OTP', async () => {
    resize(402, 874);
    await render(<OnboardingFlow initialScreen="otp" visualAudit />, { wrapper: Providers });
    const input = screen.getByDisplayValue('');
    const button = screen.getByRole('button', { name: 'Continue' });
    const glow = StyleSheet.flatten(screen.getByTestId('onboarding-primary-button-glow').props.style);

    expect(StyleSheet.flatten(button.props.style)).toMatchObject({ backgroundColor: '#E63946' });
    expect(glow).toMatchObject({
      shadowColor: '#E53845',
      shadowOpacity: 0.55,
      shadowRadius: 13,
    });

    await fireEvent(input, 'focus');
    expect(StyleSheet.flatten(screen.getByTestId('onboarding-otp-cell-0').props.style)).toMatchObject({
      borderColor: '#E63946',
      borderWidth: 2,
    });

    await fireEvent.changeText(input, '13');
    expect(StyleSheet.flatten(screen.getByTestId('onboarding-otp-cell-0').props.style)).toMatchObject({
      backgroundColor: '#FFFFFF',
      borderColor: '#000000',
    });
    expect(StyleSheet.flatten(screen.getByTestId('onboarding-otp-cell-2').props.style)).toMatchObject({
      borderColor: '#E63946',
      borderWidth: 2,
    });
    expect(StyleSheet.flatten(screen.getByTestId('onboarding-otp-cell-3').props.style)).toMatchObject({
      backgroundColor: '#FFFFFF',
      borderColor: '#E4E4E4',
    });
  });

  it('validates usernames inline before checking availability', async () => {
    resize(402, 874);
    jest.useFakeTimers();
    mockCheckUsernameAvailability
      .mockResolvedValueOnce({ data: { available: true } })
      .mockResolvedValueOnce({ data: { available: false } });
    await render(<PostSignupOnboardingFlow initialScreen="profile" onAuthenticationRequired={jest.fn()} onComplete={jest.fn()} />, { wrapper: Providers });

    const username = screen.getByPlaceholderText('@yourname');
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toBeDisabled();

    await fireEvent.changeText(username, 'bad name');
    expect(screen.getByText('✗ Use letters, numbers, dots, or underscores only')).toBeOnTheScreen();
    expect(mockCheckUsernameAvailability).not.toHaveBeenCalled();
    expect(button).toBeDisabled();

    await fireEvent.changeText(username, 'alex.morgan');
    expect(screen.getByText('Checking…')).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });
    expect(mockCheckUsernameAvailability).toHaveBeenCalledWith({ username: 'alex.morgan' });
    expect(screen.getByText('✓ This name is available')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();

    await fireEvent.changeText(username, 'already.taken');
    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });
    expect(screen.getByText('✗ That name is taken')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('renders the profile typography and bio controls from the client note', async () => {
    resize(402, 874);
    await render(<PostSignupOnboardingFlow initialScreen="profile" onAuthenticationRequired={jest.fn()} onComplete={jest.fn()} visualAudit />, { wrapper: Providers });

    expect(StyleSheet.flatten(screen.getByText('Create your profile').props.style)).toMatchObject({
      fontSize: 24,
      lineHeight: 29,
      marginTop: 60,
    });
    expect(StyleSheet.flatten(screen.getByText('This is how friends find you.').props.style)).toMatchObject({
      fontSize: 15,
      lineHeight: 18,
      marginTop: 7,
    });
    expect(screen.getByPlaceholderText('What do you always order?').props.maxLength).toBe(80);
    await fireEvent.press(screen.getByText('Natural wine person'));
    expect(screen.getByDisplayValue('Natural wine person')).toBeOnTheScreen();
    expect(screen.getByText('19/80')).toBeOnTheScreen();
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
      expect(await screen.findByText('Find your people')).toBeOnTheScreen();
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
