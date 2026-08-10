import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = '@tastes/theme-preference';

const shared = {
  primary: '#B82F29',
  primaryPressed: '#AD3324',
  primaryBorder: '#4C1816',
  danger: '#FF3B30',
  onPrimary: '#FFFFFF',
} as const;

export const colorThemes = {
  dark: {
    ...shared,
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
  },
  light: {
    ...shared,
    brandGradientStart: '#F5D6CF',
    brandGradientEnd: '#FED1D0',
    background: '#F6F6F6',
    canvas: '#F2EFEA',
    surface: '#FFFFFF',
    surfaceRaised: '#F6F6F6',
    surfaceMuted: '#F6F6F6',
    border: '#E4E4E4',
    hairline: '#E4E4E4',
    text: '#000000',
    textSecondary: '#677083',
    textMuted: 'rgba(56,64,80,0.58)',
    placeholder: 'rgba(56,64,80,0.40)',
    switchTrack: '#E4E4E4',
    switchThumb: '#FFFFFF',
    skeleton: '#E4E4E4',
    skeletonMuted: '#ECEAE6',
    discoverSkeleton: '#E4E4E4',
  },
} as const;

export type ThemeColors = typeof colorThemes.dark | typeof colorThemes.light;

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [hydrated, setHydrated] = useState(false);
  // Before a stored preference loads (or on a first launch where none exists
  // yet), follow the system appearance rather than assuming dark.
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (isThemePreference(stored)) setPreferenceState(stored);
      })
      .finally(() => setHydrated(true));
  }, []);

  const setPreference = useCallback(async (next: ThemePreference) => {
    setPreferenceState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The live selection still applies; persistence can recover on the next change.
    }
  }, []);

  const resolvedTheme: ResolvedTheme =
    preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;
  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: colorThemes[resolvedTheme],
      isDark: resolvedTheme === 'dark',
      preference,
      resolvedTheme,
      setPreference,
    }),
    [preference, resolvedTheme, setPreference],
  );

  if (!hydrated) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider');
  return value;
}
