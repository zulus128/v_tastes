import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen } from '@testing-library/react-native';
import { createRef, memo } from 'react';
import { Animated, Dimensions, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ResponsiveModal } from '../src/ui/ResponsiveModal';
import { SideSlideScreen, type SideSlideScreenHandle } from '../src/ui/SideSlideScreen';
import { ThemeProvider, useAppTheme } from '../src/ui/ThemeProvider';
import { responsiveSize, responsiveStyleSheet, useResponsiveMetrics } from '../src/ui/responsive';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const originalWindow = Dimensions.get('window');
const originalScreen = Dimensions.get('screen');
const metrics = { frame: { x: 0, y: 0, width: 1024, height: 600 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function resize(width: number, height: number) {
  Dimensions.set({ window: { ...originalWindow, width, height } });
}

const sampleStyles = responsiveStyleSheet({ box: { height: 100 } });
const MemoizedScreen = memo(function MemoizedScreen() {
  useAppTheme();
  return <View testID="scaled-box" style={sampleStyles.box}><Text testID="icon-size">{responsiveSize(24)}</Text></View>;
});

function WindowMetrics() {
  const { width, height } = useResponsiveMetrics();
  return <Text testID="metrics">{width}x{height}</Text>;
}

function Providers({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider initialMetrics={metrics}><ThemeProvider>{children}</ThemeProvider></SafeAreaProvider>;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resize(1024, 600);
});

afterEach(async () => {
  await act(() => Dimensions.set({ window: originalWindow, screen: originalScreen }));
  jest.restoreAllMocks();
});

it('rerenders memoized themed screens and icon props when only the window resizes', async () => {
  await render(<MemoizedScreen />, { wrapper: Providers });
  expect(await screen.findByTestId('scaled-box')).toHaveStyle({ height: responsiveSize(100) });
  const before = screen.getByTestId('icon-size').props.children;
  await act(() => resize(1024, 900));
  expect(screen.getByTestId('scaled-box')).toHaveStyle({ height: responsiveSize(100) });
  expect(screen.getByTestId('icon-size').props.children).toBe(responsiveSize(24));
  expect(screen.getByTestId('icon-size').props.children).not.toBe(before);
});

it('reports the current window dimensions, even when the physical screen is larger', async () => {
  await render(<WindowMetrics />);
  expect(screen.getByTestId('metrics').props.children.join('')).toBe('1024x600');
  await act(() => resize(700, 500));
  expect(screen.getByTestId('metrics').props.children.join('')).toBe('700x500');
});

it('allows modals to rotate and lets the native presentation determine their bounds', async () => {
  await render(<ResponsiveModal testID="native-modal" visible><Text>Modal content</Text></ResponsiveModal>, { wrapper: Providers });
  const modal = screen.getByTestId('native-modal');
  expect(modal.props.supportedOrientations).toEqual(['portrait', 'portrait-upside-down', 'landscape']);
  expect(await screen.findByText('Modal content')).toBeOnTheScreen();
});

it('can inset full-screen modal content on every safe-area edge', async () => {
  await render(<ResponsiveModal insetContent visible><Text>Inset content</Text></ResponsiveModal>, { wrapper: Providers });

  const content = await screen.findByText('Inset content');
  expect(content.parent?.props.edges).toEqual({ top: 'additive', right: 'additive', bottom: 'additive', left: 'additive' });
});

it('does not restart an open side sheet on resize and closes using normalized progress', async () => {
  const timing = jest.spyOn(Animated, 'timing');
  const onRequestClose = jest.fn();
  const ref = createRef<SideSlideScreenHandle>();
  await render(<SideSlideScreen ref={ref} onRequestClose={onRequestClose} visible><Text>Sheet</Text></SideSlideScreen>, { wrapper: Providers });
  await screen.findByText('Sheet');
  expect(timing).toHaveBeenCalledTimes(1);
  await act(() => resize(1200, 700));
  expect(timing).toHaveBeenCalledTimes(1);
  await act(() => ref.current?.close());
  expect(timing.mock.calls.at(-1)?.[1].toValue).toBe(1);
});
