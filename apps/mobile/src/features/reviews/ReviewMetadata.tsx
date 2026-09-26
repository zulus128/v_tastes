import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { responsiveStyleSheet } from '../../ui/responsive';

const moodLabels: Record<string, string> = {
  casual: 'Casual',
  'date-night': 'Date night',
  birthday: 'Birthday',
  children: 'With children',
  'quick-bites': 'Quick bites',
  fancy: 'Fancy',
  'night-out': 'Night out',
};

export function ReviewCityBadge({ city }: { city?: string | null }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!city) return null;
  return (
    <View style={styles.cityBadge}>
      <Text numberOfLines={1} style={styles.cityText}>
        {city}
      </Text>
    </View>
  );
}

export function ReviewMetaRow({
  cuisine,
  mood,
}: {
  cuisine?: string | null;
  mood?: string | null;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const values = [mood ? (moodLabels[mood] ?? mood) : null, cuisine].filter(
    (value): value is string => Boolean(value),
  );
  if (values.length === 0) return null;
  return (
    <View style={styles.row}>
      {values.map((value) => (
        <View key={value} style={styles.pill}>
          <Text numberOfLines={1} style={styles.pillText}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  responsiveStyleSheet({
    cityBadge: {
      maxWidth: 112,
      height: 24,
      paddingHorizontal: 9,
      borderRadius: 12,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cityText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pill: {
      maxWidth: 132,
      height: 24,
      paddingHorizontal: 9,
      borderRadius: 12,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillText: { color: colors.text, fontSize: 11 },
  });
