import { LinearGradient } from 'expo-linear-gradient';
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
import patternDark from '../../../assets/onboarding/pattern-screen.png';
import patternLight from '../../../assets/figma-backgrounds/home-feed-pattern.png';
import { onboardingTheme as theme } from './theme';
import { useAppTheme } from '../../ui/ThemeProvider';
import { PatternBackgroundLift } from '../../ui/components';

export function PatternScreen({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { colors, isDark } = useAppTheme();
  // The dark asset is the exact Figma composite: #080808 plus white linework
  // at 4%. Keep it fully opaque; applying another opacity would double-fade
  // the pattern. The light asset uses transparent dark linework instead.
  return (
    <View style={[styles.screen, { backgroundColor: isDark ? colors.background : colors.canvas }, style]}>
      <ImageBackground
        imageStyle={{ opacity: isDark ? 1 : 0.06 }}
        resizeMode="cover"
        source={isDark ? patternDark : patternLight}
        style={styles.pattern}
      >
        {isDark ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Image resizeMode="cover" source={patternLight} style={styles.darkPatternBoost} />
          </View>
        ) : null}
        <PatternBackgroundLift />
        {children}
      </ImageBackground>
    </View>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel="Back"
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
    >
      <Image source={backIcon} style={[styles.backIcon, { tintColor: colors.text }]} />
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  icon,
  iconSize = 20,
  contentGap = 6,
  loading = false,
  disabled = false,
  onPress,
  style,
}: {
  label: string;
  icon?: ImageSourcePropType;
  iconSize?: number;
  contentGap?: number;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, isDark } = useAppTheme();
  // Figma stacks a white-to-pink gradient stroke on top of the button's base
  // flat #4C1816 stroke only in the decorated variant; the plain variant (and
  // every dark-theme instance) keeps the flat stroke with no gradient.
  return (
    <LinearGradient
      colors={isDark ? [colors.primaryBorder, colors.primaryBorder] : ['#FFFFFF', '#FED1D0']}
      end={{ x: 0.5, y: 1 }}
      start={{ x: 0.5, y: 0 }}
      style={[styles.primaryButtonRing, style]}
    >
      <Pressable
        accessibilityRole="button"
        disabled={disabled || loading}
        onPress={onPress}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: colors.primary },
          (disabled || loading) && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        {loading ? <ActivityIndicator color={colors.onPrimary} /> : <View style={[styles.primaryContent, { gap: contentGap }]}>{icon ? <Image source={icon} style={{ width: iconSize, height: iconSize }} /> : null}<Text style={[styles.primaryLabel, { color: colors.onPrimary }]}>{label}</Text></View>}
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  pattern: { flex: 1 },
  darkPatternBoost: {
    width: '100%',
    height: '100%',
    opacity: 0.025,
    tintColor: '#FFFFFF',
  },
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
  primaryButtonRing: {
    height: 54,
    borderRadius: theme.radius.button,
    padding: 5,
  },
  primaryButton: {
    flex: 1,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { fontSize: 14, fontWeight: '500', letterSpacing: 0.6 },
  primaryContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.82 },
});
