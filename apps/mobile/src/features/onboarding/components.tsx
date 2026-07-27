import type { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ImageSourcePropType,
  type ViewStyle,
} from 'react-native';
import backIcon from '../../../assets/onboarding/back.png';
import pattern from '../../../assets/onboarding/pattern-screen.png';
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
      <Image source={backIcon} style={styles.backIcon} />
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  icon,
  loading = false,
  disabled = false,
  onPress,
  style,
}: {
  label: string;
  icon?: ImageSourcePropType;
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
      {loading ? <ActivityIndicator color={theme.colors.text} /> : <View style={styles.primaryContent}>{icon ? <Image source={icon} style={styles.primaryIcon} /> : null}<Text style={styles.primaryLabel}>{label}</Text></View>}
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
  backIcon: { width: 24, height: 24 },
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
  primaryContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryIcon: { width: 20, height: 20 },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.82 },
});
