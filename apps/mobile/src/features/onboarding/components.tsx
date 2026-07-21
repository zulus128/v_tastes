import type { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import pattern from '../../../assets/onboarding/pattern.png';
import { onboardingTheme as theme } from './theme';

export function PatternScreen({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <View style={[styles.screen, style]}>
      <ImageBackground source={pattern} resizeMode="cover" imageStyle={styles.patternImage} style={styles.pattern}>
        {children}
      </ImageBackground>
    </View>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel="Back"
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
    >
      <Text style={styles.backIcon}>‹</Text>
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  loading = false,
  disabled = false,
  onPress,
  style,
}: {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={theme.colors.text} /> : <Text style={styles.primaryLabel}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  pattern: { flex: 1 },
  patternImage: { opacity: 1 },
  backButton: {
    position: 'absolute',
    zIndex: 2,
    top: 51,
    left: 6,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { color: theme.colors.text, fontSize: 39, lineHeight: 39, fontWeight: '200' },
  primaryButton: {
    height: 54,
    borderRadius: theme.radius.button,
    borderWidth: 5,
    borderColor: theme.colors.primaryBorder,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { color: theme.colors.text, fontSize: 14, fontWeight: '500', letterSpacing: 0.6 },
  disabled: { opacity: 0.65 },
  pressed: { opacity: 0.82 },
});
