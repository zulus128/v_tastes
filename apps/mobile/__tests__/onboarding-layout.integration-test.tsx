/// <reference types="jest" />

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  OnboardingFlow,
  type OnboardingScreen,
} from '../src/features/onboarding/OnboardingFlow';
import {
  PostSignupOnboardingFlow,
  type PostSignupScreen,
} from '../src/features/onboarding/PostSignupOnboardingFlow';
import { ThemeProvider } from '../src/ui/ThemeProvider';
import authPattern from '../assets/onboarding/pattern.png';
import patternDark from '../assets/onboarding/pattern-screen.png';
import readyCardLightCenter from '../assets/onboarding/ready-card-light-center.png';
import patternLight from '../assets/figma-backgrounds/home-feed-pattern.png';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual(
    '@react-native-async-storage/async-storage/jest/async-storage-mock',
  ),
);
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/infrastructure/firebase', () => ({
  auth: { currentUser: null },
  storage: {},
}));
jest.mock('@tastes/firebase-client', () => ({
  apiErrorMessage: (error: Error) => error.message,
}));
jest.mock('firebase/storage', () => ({
  ref: jest.fn(),
  uploadBytes: jest.fn(),
}));
jest.mock('firebase/auth', () => ({}));
const mockCheckUsernameAvailability = jest.fn();
const mockTastesApi = {
  checkUsernameAvailability: mockCheckUsernameAvailability,
};
jest.mock('../src/session/SessionProvider', () => ({
  useTastesApi: () => mockTastesApi,
}));
jest.mock('../src/infrastructure/pushNotifications', () => ({
  syncPushNotifications: jest.fn(),
}));
jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: () => [null, null, jest.fn()],
}));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));

function Providers({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
  );
}

const originalWindow = Dimensions.get('window');
const originalScreen = Dimensions.get('screen');

const onboardingPatternCases = [
  ['onboarding', 'entry', 'entry'],
  ['onboarding', 'consent', 'consent'],
  ['onboarding', 'phone', 'shared'],
  ['onboarding', 'country', 'shared'],
  ['onboarding', 'otp', 'shared'],
  ['postSignup', 'profile', 'shared'],
  ['postSignup', 'city', 'shared'],
  ['postSignup', 'birthday', 'shared'],
  ['postSignup', 'dish', 'shared'],
  ['postSignup', 'location', 'shared'],
  ['postSignup', 'locationDenied', 'shared'],
  ['postSignup', 'place', 'shared'],
  ['postSignup', 'style', 'shared'],
  ['postSignup', 'contactsPermission', 'shared'],
  ['postSignup', 'invite', 'shared'],
  ['postSignup', 'contacts', 'shared'],
  ['postSignup', 'notifications', 'shared'],
  ['postSignup', 'ready', 'ready'],
] as const;

const themedOnboardingPatternCases = (['light', 'dark'] as const).flatMap(
  (theme) =>
    onboardingPatternCases.map(
      ([group, initialScreen, patternKind]) =>
        [theme, group, initialScreen, patternKind] as const,
    ),
);

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
    await act(async () =>
      Dimensions.set({ window: originalWindow, screen: originalScreen }),
    );
  });

  it.each(themedOnboardingPatternCases)(
    'keeps the onboarding pattern on %s %s/%s',
    async (theme, group, initialScreen, patternKind) => {
      resize(402, 874);
      await AsyncStorage.setItem('@tastes/theme-preference', theme);

      if (group === 'onboarding') {
        await render(
          <OnboardingFlow
            initialScreen={initialScreen as OnboardingScreen}
            visualAudit
          />,
          { wrapper: Providers },
        );
      } else {
        await render(
          <PostSignupOnboardingFlow
            initialScreen={initialScreen as PostSignupScreen}
            onAuthenticationRequired={jest.fn()}
            onComplete={jest.fn()}
            visualAudit
          />,
          { wrapper: Providers },
        );
      }

      const testID =
        patternKind === 'entry'
          ? 'onboarding-entry-pattern'
          : patternKind === 'consent'
            ? 'onboarding-consent-pattern-0'
            : patternKind === 'ready'
              ? 'onboarding-ready-pattern'
              : 'onboarding-pattern-background';
      const pattern = screen.getByTestId(testID);
      const expectedSource =
        patternKind === 'entry' || patternKind === 'consent'
          ? authPattern
          : patternKind === 'ready' || theme === 'light'
            ? patternLight
            : patternDark;

      expect(pattern.props.source).toBe(expectedSource);
      if (patternKind === 'ready') {
        expect(StyleSheet.flatten(pattern.props.style).opacity).toBeGreaterThan(
          0,
        );
      }
    },
  );

  it('fits the phone field above the action when a landscape keyboard shrinks the scroll viewport', async () => {
    resize(667, 375);
    await render(<OnboardingFlow initialScreen="phone" visualAudit />, {
      wrapper: Providers,
    });
    const scroll = screen.getByTestId('onboarding-phone-scroll');
    const content = screen.getByTestId('onboarding-phone-content');
    const measure = (height: number) => ({
      nativeEvent: { layout: { x: 0, y: 0, width: 667, height } },
    });

    await fireEvent(content, 'layout', measure(104));
    await fireEvent(scroll, 'layout', measure(313));
    const normalTop = StyleSheet.flatten(
      scroll.props.contentContainerStyle,
    ).paddingTop;
    expect(normalTop).toBeGreaterThan(100);

    // KAV resizes its children on iOS without changing useWindowDimensions.
    await fireEvent(scroll, 'layout', measure(159));
    const compressed = StyleSheet.flatten(scroll.props.contentContainerStyle);
    expect(
      compressed.paddingTop + 104 + compressed.paddingBottom,
    ).toBeLessThanOrEqual(159);
    expect(scroll).toContainElement(
      screen.getByPlaceholderText('Phone number'),
    );
    expect(scroll).not.toContainElement(
      screen.getByRole('button', { name: 'Continue' }),
    );

    await fireEvent(scroll, 'layout', measure(313));
    expect(
      StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop,
    ).toBe(normalTop);
    expect(
      StyleSheet.flatten(
        screen.getByTestId('onboarding-phone-row').props.style,
      ),
    ).toMatchObject({
      backgroundColor: '#FFFFFF',
      borderColor: '#E4E4E4',
      borderWidth: 1,
    });

    await fireEvent(screen.getByPlaceholderText('Phone number'), 'focus');
    expect(
      StyleSheet.flatten(
        screen.getByTestId('onboarding-phone-row').props.style,
      ),
    ).toMatchObject({
      borderColor: '#E63946',
      borderWidth: 2,
    });
  });

  it('removes surplus space above OTP cells while retaining scrolling for the remaining content', async () => {
    resize(667, 375);
    await render(<OnboardingFlow initialScreen="otp" visualAudit />, {
      wrapper: Providers,
    });
    const scroll = screen.getByTestId('onboarding-otp-scroll');
    await fireEvent(screen.getByTestId('onboarding-otp-content'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 637, height: 190 } },
    });
    await fireEvent(scroll, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 667, height: 159 } },
    });

    expect(
      StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop,
    ).toBeLessThan(10);
    expect(scroll).toContainElement(screen.getByText('Resend code'));
    expect(scroll).not.toContainElement(
      screen.getByRole('button', { name: 'Continue' }),
    );
  });

  it('shows the Figma active and filled states while entering an OTP', async () => {
    resize(402, 874);
    await render(<OnboardingFlow initialScreen="otp" visualAudit />, {
      wrapper: Providers,
    });
    const input = screen.getByDisplayValue('');
    const button = screen.getByRole('button', { name: 'Continue' });
    const glow = StyleSheet.flatten(
      screen.getByTestId('onboarding-primary-button-glow').props.style,
    );

    expect(StyleSheet.flatten(button.props.style)).toMatchObject({
      backgroundColor: '#E63946',
    });
    expect(glow).toMatchObject({
      shadowColor: '#E53845',
      shadowOpacity: 0.55,
      shadowRadius: 13,
    });

    await fireEvent(input, 'focus');
    expect(
      StyleSheet.flatten(
        screen.getByTestId('onboarding-otp-cell-0').props.style,
      ),
    ).toMatchObject({
      borderColor: '#E63946',
      borderWidth: 2,
    });

    await fireEvent.changeText(input, '13');
    expect(
      StyleSheet.flatten(
        screen.getByTestId('onboarding-otp-cell-0').props.style,
      ),
    ).toMatchObject({
      backgroundColor: '#FFFFFF',
      borderColor: '#000000',
      borderWidth: 1,
    });
    expect(
      StyleSheet.flatten(
        screen.getByTestId('onboarding-otp-cell-2').props.style,
      ),
    ).toMatchObject({
      borderColor: '#E63946',
      borderWidth: 2,
    });
    expect(
      StyleSheet.flatten(
        screen.getByTestId('onboarding-otp-cell-3').props.style,
      ),
    ).toMatchObject({
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
    await render(
      <PostSignupOnboardingFlow
        initialScreen="profile"
        onAuthenticationRequired={jest.fn()}
        onComplete={jest.fn()}
      />,
      { wrapper: Providers },
    );

    const username = screen.getByPlaceholderText('@yourname');
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toBeDisabled();

    await fireEvent.changeText(username, 'bad name');
    expect(
      screen.getByText('✗ Use letters, numbers, dots, or underscores only'),
    ).toBeOnTheScreen();
    expect(mockCheckUsernameAvailability).not.toHaveBeenCalled();
    expect(button).toBeDisabled();

    await fireEvent.changeText(username, 'alex.morgan');
    expect(screen.getByText('Checking…')).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });
    expect(mockCheckUsernameAvailability).toHaveBeenCalledWith({
      username: 'alex.morgan',
    });
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
    await render(
      <PostSignupOnboardingFlow
        initialScreen="profile"
        onAuthenticationRequired={jest.fn()}
        onComplete={jest.fn()}
        visualAudit
      />,
      { wrapper: Providers },
    );

    expect(
      StyleSheet.flatten(screen.getByText('Create your profile').props.style),
    ).toMatchObject({
      fontSize: 24,
      lineHeight: 29,
      marginTop: 60,
    });
    expect(
      StyleSheet.flatten(
        screen.getByText('This is how friends find you.').props.style,
      ),
    ).toMatchObject({
      fontSize: 15,
      lineHeight: 18,
      marginTop: 7,
    });
    expect(
      screen.getByPlaceholderText('What do you always order?').props.maxLength,
    ).toBe(80);
    await fireEvent.press(screen.getByText('Natural wine person'));
    expect(screen.getByDisplayValue('Natural wine person')).toBeOnTheScreen();
    expect(screen.getByText('19/80')).toBeOnTheScreen();
  });

  it('keeps the place search container 16pt below the subtitle on iPhone 16 Pro Max', async () => {
    resize(440, 956);
    await render(
      <PostSignupOnboardingFlow
        initialScreen="place"
        onAuthenticationRequired={jest.fn()}
        onComplete={jest.fn()}
        visualAudit
      />,
      { wrapper: Providers },
    );

    const placeCard = StyleSheet.flatten(
      screen.getByTestId('onboarding-place-card').props.style,
    );
    expect(placeCard.top).toBeCloseTo(205.5, 1);

    const outline = StyleSheet.flatten(
      screen.getByTestId('onboarding-place-card-outline').props.style,
    );
    expect(outline.borderTopLeftRadius).toBeCloseTo(26.5, 1);
    expect(outline.borderTopRightRadius).toBeCloseTo(26.5, 1);
    expect(outline.borderLeftWidth).toBeGreaterThan(0);
    expect(outline.borderRightWidth).toBeGreaterThan(0);

    const firstPlaceCopy = screen.getByTestId('onboarding-place-copy-gemini');
    expect(
      within(firstPlaceCopy).getByTestId('onboarding-place-tags-gemini'),
    ).toBeOnTheScreen();
  });

  it.each([
    ['profile', 'onboarding-profile-fields-card'],
    ['contactsPermission', 'onboarding-people-teaser'],
    ['notifications', 'onboarding-notification-card-now'],
  ] as const)(
    'uses a light surface for the %s card',
    async (initialScreen, testID) => {
      resize(402, 874);
      await render(
        <PostSignupOnboardingFlow
          initialScreen={initialScreen}
          onAuthenticationRequired={jest.fn()}
          onComplete={jest.fn()}
          visualAudit
        />,
        { wrapper: Providers },
      );

      expect(
        StyleSheet.flatten(screen.getByTestId(testID).props.style),
      ).toMatchObject({
        backgroundColor: '#FFFFFF',
        borderColor: '#E4E4E4',
      });
    },
  );

  it('matches the dark Figma contacts-permission card', async () => {
    resize(402, 874);
    await AsyncStorage.setItem('@tastes/theme-preference', 'dark');
    await render(
      <PostSignupOnboardingFlow
        initialScreen="contactsPermission"
        onAuthenticationRequired={jest.fn()}
        onComplete={jest.fn()}
        visualAudit
      />,
      { wrapper: Providers },
    );

    expect(
      StyleSheet.flatten(
        screen.getByTestId('onboarding-people-teaser').props.style,
      ),
    ).toMatchObject({
      backgroundColor: '#1A1A1A',
      borderColor: '#2A2A2A',
      borderRadius: 18,
      borderWidth: 1,
      height: 272,
      marginTop: 42,
    });
    expect(
      StyleSheet.flatten(
        screen.getByText('Your feed is only as good as who you follow.').props
          .style,
      ),
    ).toMatchObject({
      color: 'rgba(255,255,255,0.5)',
      fontSize: 15,
      lineHeight: 18,
    });
  });

  it('uses readable completion copy in the light theme', async () => {
    resize(402, 874);
    await render(
      <PostSignupOnboardingFlow
        initialScreen="ready"
        onAuthenticationRequired={jest.fn()}
        onComplete={jest.fn()}
        visualAudit
      />,
      { wrapper: Providers },
    );
    expect(
      StyleSheet.flatten(screen.getByText('You’re ready!').props.style),
    ).toMatchObject({ color: '#000000' });
    expect(
      StyleSheet.flatten(
        screen.getByText(
          'Write your first 3 reviews to unlock personalized recommendations',
        ).props.style,
      ),
    ).toMatchObject({ color: '#677083' });
  });

  it('shows an error border on all OTP cells after an incorrect code', async () => {
    resize(402, 874);
    await render(<OnboardingFlow initialScreen="otp" visualAudit />, {
      wrapper: Providers,
    });
    const input = screen.getByDisplayValue('');
    await fireEvent.changeText(input, '1331');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText('Incorrect code. Try again.'),
    ).toBeOnTheScreen();
    for (const index of [0, 1, 2, 3]) {
      expect(
        StyleSheet.flatten(
          screen.getByTestId(`onboarding-otp-cell-${index}`).props.style,
        ),
      ).toMatchObject({ borderWidth: 2 });
    }
  });

  it('renders the birthday reference layout with labelled five-row columns', async () => {
    resize(402, 874);
    await render(
      <PostSignupOnboardingFlow
        initialScreen="birthday"
        onAuthenticationRequired={jest.fn()}
        onComplete={jest.fn()}
        visualAudit
      />,
      { wrapper: Providers },
    );

    expect(screen.queryByText('🎂')).toBeNull();
    for (const label of ['DAY', 'MONTH', 'YEAR']) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
    for (const value of ['13', '14', '15', '16', '17']) {
      expect(screen.getByText(value)).toBeOnTheScreen();
    }
    for (const month of ['February', 'March', 'April', 'May', 'June']) {
      expect(screen.getByText(month)).toBeOnTheScreen();
    }
  });

  it.each([
    ['country', 'Your phone number'],
    ['phone', 'Discover the best places!'],
    ['otp', 'Your phone number'],
  ] as const)(
    'navigates back from the directly opened %s sign-in screen',
    async (initialScreen, expectedTitle) => {
      await render(
        <OnboardingFlow initialScreen={initialScreen} visualAudit />,
        { wrapper: Providers },
      );
      await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
      expect(await screen.findByText(expectedTitle)).toBeOnTheScreen();
    },
  );

  it.each([
    ['city', 'Create your profile'],
    ['birthday', 'Create your profile'],
    ['dish', 'When is your birthday?'],
    ['location', 'Your favourite dish!'],
    ['locationDenied', 'See what’s good near you'],
    ['place', 'See what’s good near you'],
    ['style', 'Choose your favourite place'],
    ['contactsPermission', 'Pick your look'],
    ['contacts', 'Find your people'],
    ['invite', 'Find your people'],
    ['notifications', 'Invite your friends'],
  ] as const)(
    'navigates back from the directly opened %s post-signup screen',
    async (initialScreen, expectedTitle) => {
      await render(
        <PostSignupOnboardingFlow
          initialScreen={initialScreen}
          onAuthenticationRequired={jest.fn()}
          onComplete={jest.fn()}
          visualAudit
        />,
        { wrapper: Providers },
      );
      await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
      expect(await screen.findByText(expectedTitle)).toBeOnTheScreen();
    },
  );

  it.each([
    [393, 852],
    [667, 375],
    [800, 500],
    [600, 600],
    [1024, 600],
  ])(
    'keeps appearance choices scrollable above Continue at %sx%s',
    async (width, height) => {
      resize(width, height);
      await render(
        <PostSignupOnboardingFlow
          initialScreen="style"
          onAuthenticationRequired={jest.fn()}
          onComplete={jest.fn()}
          visualAudit
        />,
        { wrapper: Providers },
      );

      const choices = screen.getByTestId('onboarding-appearance-scroll');
      const viewport = screen.getByTestId('onboarding-appearance-viewport');
      const bounds = StyleSheet.flatten(viewport.props.style);
      expect(bounds.top).toBeGreaterThan(0);
      expect(bounds.bottom).toBeGreaterThan(0);
      expect(height - bounds.top - bounds.bottom).toBeGreaterThan(0);
      expect(choices).not.toContainElement(
        screen.getByRole('button', { name: 'Continue' }),
      );

      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      expect(await screen.findByText('Find your people')).toBeOnTheScreen();
    },
  );

  it('keeps the match-device switch at the Figma size and toggles it', async () => {
    resize(402, 874);
    await render(
      <PostSignupOnboardingFlow
        initialScreen="style"
        onAuthenticationRequired={jest.fn()}
        onComplete={jest.fn()}
        visualAudit
      />,
      { wrapper: Providers },
    );

    const appearanceSwitch = screen.getByRole('switch', {
      name: 'Match my device',
    });
    expect(StyleSheet.flatten(appearanceSwitch.props.style)).toMatchObject({
      width: 51,
      height: 28,
      padding: 2,
      borderRadius: 14,
    });
    expect(appearanceSwitch.props.accessibilityState).toEqual({
      checked: true,
    });

    await fireEvent.press(appearanceSwitch);
    expect(
      screen.getByRole('switch', { name: 'Match my device' }).props
        .accessibilityState,
    ).toEqual({ checked: false });
  });

  it('keeps permission and invitation content in a separate scroll area from the action', async () => {
    resize(667, 375);
    await render(
      <PostSignupOnboardingFlow
        initialScreen="contactsPermission"
        onAuthenticationRequired={jest.fn()}
        onComplete={jest.fn()}
        visualAudit
      />,
      { wrapper: Providers },
    );

    const permissionBody = screen.getByTestId('onboarding-permission-scroll');
    expect(
      StyleSheet.flatten(permissionBody.props.style).bottom,
    ).toBeGreaterThan(0);
    expect(permissionBody).not.toContainElement(
      screen.getByRole('button', { name: 'Allow Contacts' }),
    );
    expect(screen.getByLabelText('Step 6 of 7')).toBeOnTheScreen();
    expect(screen.getByText('People you know')).toBeOnTheScreen();
    expect(
      screen.getByText('3 of your contacts are on Tastes'),
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId('onboarding-people-teaser-list', {
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId('onboarding-people-teaser-row-0', {
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Skip'));

    const invitations = screen.getByTestId('onboarding-invite-scroll');
    expect(StyleSheet.flatten(invitations.props.style).bottom).toBeGreaterThan(
      0,
    );
    expect(invitations).not.toContainElement(
      screen.getByRole('button', { name: 'Continue' }),
    );
    expect(screen.getByLabelText('Step 6 of 7')).toBeOnTheScreen();
    expect(screen.queryByText('1 of 3 friends invited')).not.toBeOnTheScreen();
    expect(screen.getByText('Invite from your contacts')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Stay in the loop')).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 7 of 7')).toBeOnTheScreen();
    expect(screen.getByText('Amara rated Sabor ★ 4.9')).toBeOnTheScreen();
    expect(screen.getByText('Marco started following you')).toBeOnTheScreen();
    expect(
      screen.getByText('Change these anytime in Settings.'),
    ).toBeOnTheScreen();
  });

  it('resizes the ready illustration without squeezing out the completion action', async () => {
    resize(800, 500);
    const onComplete = jest.fn().mockResolvedValue(undefined);
    await render(
      <PostSignupOnboardingFlow
        initialScreen="ready"
        onAuthenticationRequired={jest.fn()}
        onComplete={onComplete}
        visualAudit
      />,
      { wrapper: Providers },
    );

    const collage = screen.getByTestId('onboarding-ready-collage');
    expect(
      screen.getByTestId('onboarding-ready-card-center').props.source,
    ).toBe(readyCardLightCenter);
    expect(StyleSheet.flatten(collage.props.style).width).toBeLessThan(400);
    await act(async () => resize(600, 600));
    const scroll = screen.getByTestId('onboarding-ready-scroll');
    expect(scroll).toContainElement(
      screen.getByRole('button', { name: 'Start rating' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Start rating' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
