import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { NewActivityScreen } from '../src/features/activities/NewActivityScreen';
import { responsiveSize } from '../src/ui/responsive';

jest.mock('@tastes/firebase-client', () => ({ apiErrorMessage: String }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaProvider: View,
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 21, left: 0 }),
  };
});

let mockIsDark = true;

const mockDarkColors = {
  primary: '#B82F29',
  primaryPressed: '#AD3324',
  primaryBorder: '#4C1816',
  danger: '#FF3B30',
  onPrimary: '#FFFFFF',
  brandGradientStart: '#560E0B',
  brandGradientEnd: '#4C1816',
  background: '#080808',
  canvas: '#161616',
  surface: '#161616',
  surfaceRaised: '#282828',
  surfaceMuted: '#222222',
  border: '#45474B',
  hairline: 'rgba(255,255,255,0.08)',
  text: '#FFFFFF',
  textSecondary: '#AAB2C5',
  textMuted: 'rgba(255,255,255,0.58)',
  placeholder: 'rgba(255,255,255,0.40)',
  switchTrack: '#222222',
  switchThumb: '#D9DDE5',
  skeleton: '#2E2E2E',
  skeletonMuted: '#242424',
  discoverSkeleton: '#262626',
};

const mockLightColors = {
  ...mockDarkColors,
  background: '#FFFFFF',
  canvas: '#F2EFEA',
  surface: '#FFFFFF',
  surfaceRaised: '#F1F1F1',
  surfaceMuted: '#F6F6F6',
  border: '#D9D9D9',
  hairline: 'rgba(0,0,0,0.08)',
  text: '#111111',
  textSecondary: '#697386',
  textMuted: 'rgba(0,0,0,0.58)',
  placeholder: 'rgba(0,0,0,0.40)',
};

jest.mock('../src/ui/ThemeProvider', () => ({
  useAppTheme: () => ({
    colors: mockIsDark ? mockDarkColors : mockLightColors,
    isDark: mockIsDark,
  }),
}));

const mockListActivityCandidates = jest.fn(() =>
  Promise.resolve({
    data: [
      {
        userId: 'piah',
        displayName: 'Piah P',
        username: 'piah679',
      },
    ],
  }),
);
const mockApi = { listActivityCandidates: mockListActivityCandidates };

jest.mock('../src/session/SessionProvider', () => ({
  useTastesApi: () => mockApi,
}));

jest.mock('../src/features/discover/api', () => ({
  useDiscoverVenues: () => ({ data: { pages: [{ items: [] }] } }),
}));

jest.mock('../src/features/favourites/api', () => ({
  useFavourites: () => ({ data: { places: [] } }),
}));

jest.mock('../src/infrastructure/firebase', () => ({ firestore: {} }));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));

describe('New activity member selector', () => {
  const initialWindow = Dimensions.get('window');
  const initialScreen = Dimensions.get('screen');

  beforeEach(() => {
    mockIsDark = true;
    mockListActivityCandidates.mockClear();
    const landscape = { width: 667, height: 375, scale: 2, fontScale: 1 };
    Dimensions.set({ window: landscape, screen: landscape });
  });

  afterEach(async () => {
    await act(() =>
      Dimensions.set({ window: initialWindow, screen: initialScreen }),
    );
  });

  it('keeps the member search field at full height in landscape', async () => {
    await render(
      <NewActivityScreen
        onBack={jest.fn()}
        onCreated={jest.fn()}
        userId="organizer"
      />,
    );

    await waitFor(() => expect(mockListActivityCandidates).toHaveBeenCalled());
    const selectMembers = await screen.findByLabelText('Select members');
    await waitFor(() =>
      expect(selectMembers.props.accessibilityState?.disabled).toBe(false),
    );
    await act(() => fireEvent.press(selectMembers));

    const search = await screen.findByTestId('activity-member-search');
    const style = StyleSheet.flatten(search.props.style);

    expect(style.height).toBe(responsiveSize(39));
    expect(style.flex).toBe(0);
    expect(style.flexShrink).toBe(0);
    expect(screen.getByPlaceholderText('Search friends')).toBeOnTheScreen();
    expect(screen.getByText('Piah P')).toBeOnTheScreen();
  });

  it('uses the Figma light surfaces and activity accent', async () => {
    mockIsDark = false;

    await render(
      <NewActivityScreen
        onBack={jest.fn()}
        onCreated={jest.fn()}
        userId="organizer"
      />,
    );

    await waitFor(() => expect(mockListActivityCandidates).toHaveBeenCalled());

    expect(
      StyleSheet.flatten(screen.getByTestId('new-activity-screen').props.style)
        .backgroundColor,
    ).toBe('#F2EFEA');
    expect(
      StyleSheet.flatten(
        screen.getByTestId('new-activity-navigation').props.style,
      ).backgroundColor,
    ).toBe('#FFFFFF');
    expect(
      StyleSheet.flatten(
        screen.getByTestId('new-activity-calendar').props.style,
      ).backgroundColor,
    ).toBe('#FFFFFF');

    const submitStyle = StyleSheet.flatten(
      screen.getByTestId('new-activity-submit').props.style,
    );
    expect(submitStyle.backgroundColor).toBe('#F23B4C');
    expect(submitStyle.borderColor).toBe('#FBD0D3');
  });
});
