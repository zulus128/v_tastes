import { useMemo } from 'react';
import { Text, View } from 'react-native';
import BirthdayTagIcon from '../../../assets/create-review/tag-birthday.svg';
import NightTagIcon from '../../../assets/create-review/tag-night.svg';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { responsiveSize, responsiveStyleSheet } from '../../ui/responsive';

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
  return <View style={styles.cityBadge}><Text numberOfLines={1} style={styles.cityText}>{city}</Text></View>;
}

export function ReviewMetaRow({ cuisine, mood }: { cuisine?: string | null; mood?: string | null }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const moodLabel = mood ? moodLabels[mood] ?? mood : null;
  const MoodIcon = mood === 'birthday'
    ? BirthdayTagIcon
    : mood === 'date-night' || mood === 'night-out'
      ? NightTagIcon
      : null;
  if (!moodLabel && !cuisine) return null;
  return <View style={styles.row}>
    {moodLabel ? <View style={styles.moodPill}>
      {MoodIcon ? <MoodIcon color={colors.text} height={responsiveSize(12)} width={responsiveSize(12)} /> : null}
      <Text numberOfLines={1} style={styles.pillText}>{moodLabel}</Text>
    </View> : null}
    {cuisine ? <View style={styles.cuisinePill}><Text numberOfLines={1} style={styles.cuisineText}>{cuisine}</Text></View> : null}
  </View>;
}

const createStyles = (colors: ThemeColors) => responsiveStyleSheet({
  cityBadge: { maxWidth: 112, height: 24, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cityText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  moodPill: { maxWidth: 132, height: 24, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  cuisinePill: { maxWidth: 132, height: 24, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pillText: { color: colors.text, fontSize: 12 },
  cuisineText: { color: colors.textSecondary, fontSize: 12 },
});
