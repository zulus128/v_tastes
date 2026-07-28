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

export function PatternScreen({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { colors, isDark } = useAppTheme();
  // patternDark bakes light linework onto an opaque dark fill, so fading its
  // opacity over a light canvas only produces a flat grey wash. patternLight
  // is the same icon set as dark linework on a transparent field instead.
  return (
    <View style={[styles.screen, { backgroundColor: colors.canvas }, style]}>
      <ImageBackground
        imageStyle={{ opacity: isDark ? 1 : 0.06 }}
        resizeMode="cover"
        source={isDark ? patternDark : patternLight}
        style={styles.pattern}
      >
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
        {loading ? <ActivityIndicator color={colors.onPrimary} /> : <View style={styles.primaryContent}>{icon ? <Image source={icon} style={styles.primaryIcon} /> : null}<Text style={[styles.primaryLabel, { color: colors.onPrimary }]}>{label}</Text></View>}
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
  primaryContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryIcon: { width: 20, height: 20 },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.82 },
});
