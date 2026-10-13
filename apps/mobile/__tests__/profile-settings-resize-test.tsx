import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Animated, Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProfileSettingsSheet } from '../src/features/profile/ProfileSettingsSheet';
import { ThemeProvider } from '../src/ui/ThemeProvider';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual(
    '@react-native-async-storage/async-storage/jest/async-storage-mock',
  ),
);
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/infrastructure/firebase', () => ({ storage: {} }));
jest.mock('../src/infrastructure/observability', () => ({
  captureException: jest.fn(),
}));
jest.mock('@tastes/firebase-client', () => ({
  apiErrorMessage: (error: Error) => error.message,
}));
jest.mock('firebase/storage', () => ({
  ref: jest.fn(),
  uploadBytes: jest.fn(),
  deleteObject: jest.fn(),
}));
const mockUpdateProfileSettings = jest.fn();

jest.mock('../src/session/SessionProvider', () => {
  const api = {
    getProfileExtras: async () => ({
      data: { notificationPreferences: { categories: {} } },
    }),
    updateProfileSettings: mockUpdateProfileSettings,
  };
  return { useIsVisualAudit: () => true, useTastesApi: () => api };
});
jest.mock('../src/features/profile/api', () => ({
  useProfile: () => ({
    profile: {
      bio: 'Initial bio',
      city: 'London',
      displayName: 'Test User',
      username: 'tester',
    },
  }),
}));
jest.mock('../src/ui/SideSlideScreen', () => ({
  ...jest.requireActual('../src/ui/SideSlideScreen'),
  SideSlideScreen: ({
    children,
    visible,
  }: PropsWithChildren<{ visible: boolean }>) => (visible ? children : null),
}));

const originalWindow = Dimensions.get('window');

function resize(width: number) {
  Dimensions.set({ window: { ...originalWindow, width, height: 600 } });
}

function Providers({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockUpdateProfileSettings.mockReset();
  mockUpdateProfileSettings.mockResolvedValue({ data: {} });
  resize(600);
});

afterEach(async () => {
  await act(() => Dimensions.set({ window: originalWindow }));
  jest.restoreAllMocks();
});

it('keeps account actions inside the scroll area above the fixed footer', async () => {
  await render(
    <ProfileSettingsSheet
      fallbackName="Test User"
      onClose={jest.fn()}
      onLogout={jest.fn()}
      userId="tester"
      visible
    />,
    { wrapper: Providers },
  );

  const scroll = screen.getByTestId('profile-settings-scroll');
  const footerStyle = StyleSheet.flatten(
    screen.getByTestId('profile-settings-footer').props.style,
  );

  expect(scroll).toContainElement(
    screen.getByTestId('profile-settings-account-actions'),
  );
  expect(footerStyle.position).not.toBe('absolute');
  expect(footerStyle.flexShrink).toBe(0);
});

it('opens the Bio editor and accepts the full 80-character value', async () => {
  await render(
    <ProfileSettingsSheet
      fallbackName="Test User"
      onClose={jest.fn()}
      onLogout={jest.fn()}
      userId="tester"
      visible
    />,
    { wrapper: Providers },
  );

  await fireEvent.press(screen.getByLabelText('Edit Bio'));
  const input = screen.getByTestId('profile-bio-input');
  const bio = 'A'.repeat(80);
  await fireEvent.changeText(input, bio);

  expect(input.props.multiline).toBe(true);
  expect(input.props.maxLength).toBe(80);
  expect(input.props.textAlignVertical).toBe('top');
  expect(screen.getByText('80/80')).toBeTruthy();
  expect(screen.getByTestId('profile-editor-keyboard-avoider')).toBeTruthy();
  expect(screen.getByLabelText('Save Bio')).toBeTruthy();
});

it('offers to save a city typed outside the suggested city list', async () => {
  await render(
    <ProfileSettingsSheet
      fallbackName="Test User"
      onClose={jest.fn()}
      onLogout={jest.fn()}
      userId="tester"
      visible
    />,
    { wrapper: Providers },
  );

  await fireEvent.press(screen.getByLabelText('Edit City'));
  await fireEvent.changeText(screen.getByPlaceholderText('Search'), 'Istanbul');

  expect(screen.getByLabelText('Use Istanbul as city')).toBeTruthy();
  expect(screen.getByText('Use this city')).toBeTruthy();
});

it('applies an appearance change after the settings pane closes', async () => {
  const animations: Array<{
    finish?: (result: { finished: boolean }) => void;
  }> = [];
  jest.spyOn(Animated, 'timing').mockImplementation(() => {
    const animation: (typeof animations)[number] = {};
    animations.push(animation);
    return {
      start: (finish) => {
        animation.finish = finish;
      },
      stop: jest.fn(),
      reset: jest.fn(),
    };
  });

  await render(
    <ProfileSettingsSheet
      fallbackName="Test User"
      onClose={jest.fn()}
      onLogout={jest.fn()}
      userId="tester"
      visible
    />,
    { wrapper: Providers },
  );

  await fireEvent.press(screen.getAllByText('Appearance')[0]);
  await fireEvent.press(screen.getByText('Light'));

  expect(await AsyncStorage.getItem('@tastes/theme-preference')).toBeNull();

  await act(() => animations[1].finish?.({ finished: true }));

  expect(await AsyncStorage.getItem('@tastes/theme-preference')).toBe('light');
});

it.each([
  ['Appearance', 'appearance-settings-pane', 1],
  ['Notifications', 'notification-settings-pane', 0],
] as const)(
  'keeps %s aligned while closed, open, and closing across a resize',
  async (label, paneId, backIndex) => {
    const animations: Array<{
      value: Animated.Value;
      finish?: (result: { finished: boolean }) => void;
    }> = [];
    const timing = jest
      .spyOn(Animated, 'timing')
      .mockImplementation((value) => {
        const animation: (typeof animations)[number] = {
          value: value as Animated.Value,
        };
        animations.push(animation);
        return {
          start: (finish) => {
            animation.finish = finish;
          },
          stop: jest.fn(),
          reset: jest.fn(),
        };
      });

    await render(
      <ProfileSettingsSheet
        fallbackName="Test User"
        onClose={jest.fn()}
        onLogout={jest.fn()}
        userId="tester"
        visible
      />,
      { wrapper: Providers },
    );
    const pane = () => screen.getByTestId(paneId);
    expect(pane()).toHaveStyle({ transform: [{ translateX: 600 }] });
    await act(() => resize(900));
    expect(pane()).toHaveStyle({ transform: [{ translateX: 900 }] });
    expect(timing).not.toHaveBeenCalled();

    await fireEvent.press(screen.getAllByText(label)[0]);
    await act(() => animations[0].value.setValue(0));
    await act(() => resize(700));
    expect(pane()).toHaveStyle({ transform: [{ translateX: 0 }] });
    expect(timing).toHaveBeenCalledTimes(1);

    await fireEvent.press(
      screen.getAllByLabelText('Back to settings')[backIndex],
    );
    await act(() => animations[1].value.setValue(0.5));
    await act(() => resize(1000));
    expect(pane()).toHaveStyle({ transform: [{ translateX: 500 }] });
    expect(timing).toHaveBeenCalledTimes(2);
    await act(() => animations[1].finish?.({ finished: false }));
    expect(pane()).toHaveStyle({ transform: [{ translateX: 1000 }] });
    expect(pane().props.pointerEvents).toBe('none');
  },
);
