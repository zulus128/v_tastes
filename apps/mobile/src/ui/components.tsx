import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { theme } from './theme';
import pattern from '../../assets/onboarding/pattern-screen.png';

export function Screen({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return (
    <ImageBackground source={pattern} resizeMode="repeat" style={[styles.screen, style]}>
      {children}
    </ImageBackground>
  );
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
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={theme.colors.primary} size="large" />
      <Text style={styles.muted}>{label}</Text>
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
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.muted}>{body}</Text>
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
  return loading
    ? <View style={styles.footer}><ActivityIndicator color={theme.colors.primary} /></View>
    : <View style={styles.footer} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.surface },
  center: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  title: { color: theme.colors.text, fontSize: 21, fontWeight: '700', textAlign: 'center' },
  muted: { color: theme.colors.textMuted, fontSize: 15, lineHeight: 20, textAlign: 'center' },
  button: { minHeight: 44, paddingHorizontal: 24, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.pill, backgroundColor: theme.colors.primary },
  buttonText: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  footer: { height: 64, alignItems: 'center', justifyContent: 'center' },
});
