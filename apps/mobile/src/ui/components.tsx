import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { theme } from './theme';
import { useAppTheme } from './ThemeProvider';
import pattern from '../../assets/onboarding/pattern-screen.png';
import homeFeedPattern from '../../assets/figma-backgrounds/home-feed-pattern.png';

export function Screen({
  background = 'default',
  children,
  style,
}: PropsWithChildren<{ background?: 'default' | 'homeFeed'; style?: ViewStyle }>) {
  const { colors, isDark } = useAppTheme();
  if (background === 'homeFeed') {
    // homeFeedPattern is dark linework on a transparent field, drawn to read
    // against a light canvas — it has no contrast against the dark canvas, so
    // it only renders in light mode.
    return (
      <View style={[styles.screen, { backgroundColor: colors.canvas }, style]}>
        {!isDark ? <Image
          resizeMode="stretch"
          source={homeFeedPattern}
          style={styles.homeFeedPattern}
        /> : null}
        {children}
      </View>
    );
  }

  return (
    <ImageBackground
      imageStyle={{ opacity: isDark ? 1 : 0.08 }}
      source={pattern}
      resizeMode="stretch"
      style={[styles.screen, { backgroundColor: colors.canvas }, style]}
    >
      <PatternBackgroundLift />
      {children}
    </ImageBackground>
  );
}

/** Keeps every dark patterned surface at the same sampled #161616 base. */
export function PatternBackgroundLift() {
  const { isDark } = useAppTheme();
  return isDark ? <View pointerEvents="none" style={styles.patternBackgroundLift} /> : null;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={[styles.muted, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.center}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.muted, { color: colors.textMuted }]}>{body}</Text>
      {action}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      title="Could not load this screen"
      body={message}
      action={<PrimaryButton label="Try again" onPress={onRetry} />}
    />
  );
}

export function ListFooter({ loading }: { loading: boolean }) {
  const { colors } = useAppTheme();
  return loading
    ? <View style={styles.footer}><ActivityIndicator color={colors.primary} /></View>
    : <View style={styles.footer} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  homeFeedPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    aspectRatio: 402 / 874,
    // Faint texture, not a bold layer — matches the ~4-8% opacity Figma uses
    // for this same linework elsewhere.
    opacity: 0.06,
  },
  patternBackgroundLift: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255,255,255,0.057)',
  },
  center: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  title: { fontSize: 21, fontWeight: '700', textAlign: 'center' },
  muted: { fontSize: 15, lineHeight: 20, textAlign: 'center' },
  button: { minHeight: 44, paddingHorizontal: 24, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.pill },
  buttonText: { fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  footer: { height: 64, alignItems: 'center', justifyContent: 'center' },
});
