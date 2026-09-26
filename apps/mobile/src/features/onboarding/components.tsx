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
import { SafeAreaView } from 'react-native-safe-area-context';
import backIcon from '../../../assets/onboarding/back.png';
import patternDark from '../../../assets/onboarding/pattern-screen.png';
import patternLight from '../../../assets/figma-backgrounds/home-feed-pattern.png';
import { onboardingTheme as theme } from './theme';
import { useAppTheme } from '../../ui/ThemeProvider';
import { PatternBackgroundLift } from '../../ui/components';
import {
  responsiveStyleSheet,
  responsiveValue,
  useResponsiveMetrics,
} from '../../ui/responsive';

export function PatternScreen({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { colors, isDark } = useAppTheme();
  // The dark asset is the exact Figma composite: #080808 plus white linework
  // at 4%. Keep it fully opaque; applying another opacity would double-fade
  // the pattern. The light asset uses transparent dark linework instead.
  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: isDark ? colors.background : colors.canvas },
        style,
      ]}
    >
      <ImageBackground
        imageStyle={{ opacity: isDark ? 1 : 0.06 }}
        resizeMode="cover"
        source={isDark ? patternDark : patternLight}
        style={styles.pattern}
      >
        {isDark ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Image
              resizeMode="cover"
              source={patternLight}
              style={styles.darkPatternBoost}
            />
          </View>
        ) : null}
        <PatternBackgroundLift />
        <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
          <View style={styles.screenContent}>{children}</View>
        </SafeAreaView>
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
      <Image
        source={backIcon}
        style={[styles.backIcon, { tintColor: colors.text }]}
      />
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
  const { colors } = useAppTheme();
  const { scale } = useResponsiveMetrics();
  return (
    <View
      style={[
        styles.primaryButtonGlow,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      testID="onboarding-primary-button-glow"
    >
      <Pressable
        accessibilityRole="button"
        disabled={disabled || loading}
        onPress={onPress}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && styles.pressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <View
            style={[
              styles.primaryContent,
              { gap: responsiveValue(contentGap, scale) },
            ]}
          >
            {icon ? (
              <Image
                source={icon}
                style={{
                  width: responsiveValue(iconSize, scale),
                  height: responsiveValue(iconSize, scale),
                }}
              />
            ) : null}
            <Text style={[styles.primaryLabel, { color: colors.onPrimary }]}>
              {label}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = responsiveStyleSheet({
  screen: { flex: 1 },
  pattern: { flex: 1 },
  safeArea: { flex: 1 },
  screenContent: { flex: 1 },
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
  primaryButtonGlow: {
    height: 54,
    borderRadius: theme.radius.button,
    shadowColor: '#E53845',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 13,
    elevation: 9,
  },
  primaryButton: {
    flex: 1,
    borderRadius: theme.radius.button,
    backgroundColor: '#E63946',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E53845',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 7,
  },
  primaryLabel: { fontSize: 14, fontWeight: '500', letterSpacing: 0.6 },
  primaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.82 },
});
