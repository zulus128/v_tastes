import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Animated, Dimensions, Platform, StyleSheet } from 'react-native';
import { DiscoverScreen } from '../src/features/discover/DiscoverScreen';
import { responsiveSize } from '../src/ui/responsive';

const mockInsets = { top: 0, right: 47, bottom: 21, left: 47 };

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
}));
jest.mock('@tastes/firebase-client', () => ({ apiErrorMessage: String }));
jest.mock('../src/ui/ThemeProvider', () => ({
  useAppTheme: () => ({ colors: {}, isDark: true }),
}));
jest.mock('../src/session/SessionProvider', () => ({
  useTastesApi: () => ({}),
}));
jest.mock('../src/features/favourites/FavouritesPane', () => ({
  FavouritesPane: () => null,
  SaveToFolderSheet: () => null,
}));
jest.mock('../src/features/favourites/api', () => ({
  useFavourites: () => ({ data: { places: [] } }),
}));
jest.mock('react-native-maps', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: () => <View testID="discover-map" />, Marker: View };
});
jest.mock('../src/features/discover/api', () => ({
  useDiscoverFeed: () => ({
    data: {
      trending: [], newSpots: [], forYou: [], hiddenGems: [], popularReviews: [],
      mostReviewed: Array.from({ length: 5 }, (_, index) => ({
        id: `venue-${index}`, name: `Place ${index}`, city: 'Istanbul',
      })),
    },
  }),
  useToggleFollow: () => ({}),
  useDiscoverVenues: () => ({ data: { pages: [] } }),
  useVenueSearch: () => ({ data: { items: [] } }),
  useDiscoverPeople: () => ({ data: { people: [] } }),
}));

const props = {
  appliedFilters: [], userId: 'user', onOpenAI: jest.fn(), onOpenFilters: jest.fn(),
  onOpenComments: jest.fn(), onOpenPlace: jest.fn(), onOpenProfile: jest.fn(),
};

describe('Discover responsive content', () => {
  const initialWindow = Dimensions.get('window');
  const initialScreen = Dimensions.get('screen');

  afterEach(async () => {
    await act(() => Dimensions.set({ window: initialWindow, screen: initialScreen }));
    mockInsets.top = 0;
    jest.restoreAllMocks();
  });

  function resize(width: number, height: number) {
    const dimensions = { width, height, scale: 2, fontScale: 1 };
    Dimensions.set({ window: dimensions, screen: dimensions });
  }

  it('fits wrapped cards inside landscape safe insets, including the final row', async () => {
    resize(667, 375);
    await render(<DiscoverScreen {...props} />);

    const card = screen.getByText('Place 0').parent!.parent!;
    const row = card.parent!;
    const cardStyle = StyleSheet.flatten(card.props.style);
    const rowStyle = StyleSheet.flatten(row.props.style);
    const lastCardStyle = StyleSheet.flatten(screen.getByText('Place 4').parent!.parent!.props.style);
    const contentWidth = 667 - mockInsets.left - mockInsets.right;
    const columns = Math.floor((contentWidth - 2 * rowStyle.paddingHorizontal + rowStyle.gap) / (cardStyle.width + rowStyle.gap));

    expect(columns).toBeGreaterThan(1);
    expect(columns * cardStyle.width + (columns - 1) * rowStyle.gap + 2 * rowStyle.paddingHorizontal).toBeCloseTo(contentWidth);
    expect(lastCardStyle.width).toBe(cardStyle.width);
  });

  it.each([[667, 375], [1024, 600]])('keeps the map beside its list at %ix%i', async (width, height) => {
    resize(width, height);
    jest.spyOn(Animated, 'timing').mockImplementation((value, config) => ({
      start: (callback) => {
        (value as Animated.Value).setValue(config.toValue as number);
        callback?.({ finished: true });
      },
      stop: jest.fn(), reset: jest.fn(),
    }));
    await render(<DiscoverScreen {...props} />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Places' }));
    const mapContainer = screen.getByTestId('discover-map').parent!;
    await act(() => fireEvent(mapContainer, 'layout', { nativeEvent: { layout: { width, height: height - 70 } } }));

    const controlsStyle = StyleSheet.flatten(screen.getByLabelText('Zoom in').parent!.props.style);
    const sheetStyle = StyleSheet.flatten(screen.getByLabelText('Expand place list').parent!.props.style);
    const contentWidth = width - mockInsets.left - mockInsets.right;
    const sheetHeight = typeof sheetStyle.height === 'number' ? sheetStyle.height : sheetStyle.height.__getValue();

    expect(sheetStyle.right).toBeCloseTo(contentWidth * 0.48);
    expect(controlsStyle.flexDirection).toBe('row');
    expect(controlsStyle.top).toBeCloseTo(responsiveSize(12) + responsiveSize(52) + responsiveSize(18));
    expect(controlsStyle.top + responsiveSize(48)).toBeLessThan(height - 70);
    expect(4 * responsiveSize(48) + 3 * responsiveSize(6) + responsiveSize(16)).toBeLessThan(sheetStyle.right);
    expect(height - 70 - sheetHeight).toBeGreaterThanOrEqual(responsiveSize(12) + responsiveSize(52));
  });

  it('updates list bounds when only the safe header height changes', async () => {
    resize(667, 375);
    jest.spyOn(Animated, 'timing').mockImplementation((value, config) => ({
      start: (callback) => {
        (value as Animated.Value).setValue(config.toValue as number);
        callback?.({ finished: true });
      },
      stop: jest.fn(), reset: jest.fn(),
    }));
    const view = await render(<DiscoverScreen {...props} />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Places' }));
    await fireEvent(screen.getByTestId('discover-map').parent!, 'layout', { nativeEvent: { layout: { width: 667, height: 305 } } });

    mockInsets.top = 42;
    await view.rerender(<DiscoverScreen {...props} />);

    const sheetStyle = StyleSheet.flatten(screen.getByLabelText('Expand place list').parent!.props.style);
    const sheetHeight = typeof sheetStyle.height === 'number' ? sheetStyle.height : sheetStyle.height.__getValue();
    expect(305 - sheetHeight).toBeGreaterThanOrEqual(42 + responsiveSize(52));
  });

  it('keeps portrait layout when the Android keyboard shortens the window', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    resize(800, 1200);
    await render(<DiscoverScreen {...props} />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Places' }));

    await act(() => Dimensions.set({
      window: { width: 800, height: 350, scale: 2, fontScale: 1 },
      screen: { width: 800, height: 1200, scale: 2, fontScale: 1 },
    }));

    const headerStyle = StyleSheet.flatten(screen.getByRole('tab', { name: 'Places' }).parent!.parent!.props.style);
    const sheetStyle = StyleSheet.flatten(screen.getByLabelText('Expand place list').parent!.props.style);
    expect(headerStyle.paddingTop).toBe(responsiveSize(54));
    expect(sheetStyle.right).toBe(0);
  });
});
