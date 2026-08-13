import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';

const VENUES = ['Restaurant', 'Bar', 'Cafe'] as const;
const CUISINES = [
  'Italian 🇮🇹',
  'Japanese 🇯🇵',
  'Georgian 🇬🇪',
  'Thai 🇹🇭',
  'American 🇺🇸',
  'Russian 🇷🇺',
  'Korean 🇰🇷',
  'Indian 🇮🇳',
  'Mexican 🇲🇽',
  'Chinese 🇨🇳',
] as const;
const BUDGETS = ['$ 🍞', '$$ 🍝', '$$$ 🥂'] as const;
const COFFEE = ['Matcha 🍵', 'Coffee ☕', 'Vegan coffee 🥛'] as const;
const DEFAULT_LOCATION = '2972 Westheimer Rd. Santa Ana';

function encoded(prefix: string, value: string) {
  return `${prefix}:${value}`;
}

function initialValue(values: string[], prefix: string) {
  return values.find((value) => value.startsWith(`${prefix}:`))?.slice(prefix.length + 1);
}

function BackIcon() {
  return (
    <Svg fill="none" height={24} viewBox="0 0 24 24" width={24}>
      <Path d="M16 19 9 12l7-7" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg fill="none" height={18} viewBox="0 0 20 15" width={20}>
      <Path d="M19.55.44a1.5 1.5 0 0 1 0 2.12L8.307 13.804a1.6 1.6 0 0 1-2.263 0L.458 8.219A1.5 1.5 0 1 1 2.58 6.098l4.596 4.596L17.428.44a1.5 1.5 0 0 1 2.122 0Z" fill="#FFFFFF" />
    </Svg>
  );
}

export function DiscoverFiltersScreen({
  initialValues,
  onApply,
  onBack,
}: {
  initialValues: string[];
  onApply: (values: string[]) => void;
  onBack: () => void;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(colors, insets.top, insets.bottom),
    [colors, insets.bottom, insets.top],
  );
  const [venue, setVenue] = useState(initialValue(initialValues, 'Venue') ?? 'Cafe');
  const [rating, setRating] = useState<[number, number]>(() => {
    const stored = initialValue(initialValues, 'Rating')?.split('-').map(Number);
    return stored?.length === 2 && stored.every(Number.isFinite)
      ? [stored[0]!, stored[1]!]
      : [3, 4.5];
  });
  const [location, setLocation] = useState(initialValue(initialValues, 'Location') ?? DEFAULT_LOCATION);
  const [selected, setSelected] = useState(() => new Set(initialValues.filter((value) => !/^(Venue|Rating|Location):/.test(value))));
  const [trackWidth, setTrackWidth] = useState(340);

  function toggle(value: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function updateRating(event: GestureResponderEvent) {
    const next = Math.round(Math.max(1, Math.min(5, 1 + (event.nativeEvent.locationX / trackWidth) * 4)) * 2) / 2;
    setRating(([minimum, maximum]) => Math.abs(next - minimum) <= Math.abs(next - maximum)
      ? [Math.min(next, maximum - 0.5), maximum]
      : [minimum, Math.max(next, minimum + 0.5)]);
  }

  function clearAll() {
    setVenue('');
    setRating([1, 5]);
    setLocation('');
    setSelected(new Set());
  }

  function apply() {
    const values = [...selected];
    if (venue) values.push(encoded('Venue', venue));
    values.push(encoded('Rating', `${rating[0]}-${rating[1]}`));
    if (location) values.push(encoded('Location', location));
    onApply(values);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back" hitSlop={10} onPress={onBack} style={styles.backButton}>
          <BackIcon />
        </Pressable>
        <Text style={styles.title}>Filter</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Section title="Venue" styles={styles}>
          <View style={styles.segmented}>
            {VENUES.map((value) => {
              const active = venue === value;
              return (
                <Pressable key={value} onPress={() => setVenue(value)} style={[styles.segment, active && styles.segmentActive]}>
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{value}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <View style={styles.section}>
          <View style={styles.ratingHeading}>
            <Text style={styles.sectionTitle}>Rating</Text>
            <View style={styles.ratingTag}><Text style={styles.ratingTagText}>★ {rating[0].toFixed(1)} - {rating[1].toFixed(1)}</Text></View>
          </View>
          <View
            onLayout={(event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width)}
            onMoveShouldSetResponder={() => true}
            onResponderMove={updateRating}
            onResponderRelease={updateRating}
            onStartShouldSetResponder={() => true}
            style={styles.ratingTrackHitbox}
          >
            <View style={styles.ratingTrack} />
            <View style={[styles.ratingTrackActive, { left: `${((rating[0] - 1) / 4) * 100}%`, right: `${100 - ((rating[1] - 1) / 4) * 100}%` }]} />
            {[1, 2, 3, 4, 5].map((value) => <View key={value} style={[styles.ratingTick, { left: `${((value - 1) / 4) * 100}%` }]} />)}
            {rating.map((value, index) => (
              <View key={index} style={[styles.ratingThumb, { left: `${((value - 1) / 4) * 100}%` }]}>
                <Text style={styles.ratingStar}>★</Text>
              </View>
            ))}
          </View>
        </View>

        <Section title="Location" styles={styles}>
          <Pressable onPress={() => setLocation(location ? '' : DEFAULT_LOCATION)} style={styles.locationField}>
            <Text numberOfLines={1} style={styles.locationText}>{location || 'Choose location'}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </Section>

        <ChipSection choices={CUISINES} selected={selected} styles={styles} title="Kind of food" toggle={toggle} />
        <ChipSection choices={BUDGETS} selected={selected} styles={styles} title="Budget" toggle={toggle} />
        <ChipSection choices={COFFEE} selected={selected} styles={styles} title="Coffee taste" toggle={toggle} />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={clearAll} style={styles.clearButton}><Text style={styles.clearText}>Clear all</Text></Pressable>
        <Pressable onPress={apply} style={styles.applyButton}><CheckIcon /><Text style={styles.applyText}>Apply</Text></Pressable>
      </View>
    </View>
  );
}

function Section({ children, styles, title }: { children: React.ReactNode; styles: ReturnType<typeof createStyles>; title: string }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function ChipSection({
  choices,
  selected,
  styles,
  title,
  toggle,
}: {
  choices: readonly string[];
  selected: Set<string>;
  styles: ReturnType<typeof createStyles>;
  title: string;
  toggle: (value: string) => void;
}) {
  return (
    <Section styles={styles} title={title}>
      <View style={styles.choices}>
        {choices.map((value) => {
          const active = selected.has(value);
          return (
            <Pressable key={value} onPress={() => toggle(value)} style={[styles.choice, active && styles.choiceActive]}>
              <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{value}</Text>
            </Pressable>
          );
        })}
      </View>
    </Section>
  );
}

function createStyles(colors: ThemeColors, safeTop: number, safeBottom: number) {
  const accent = '#B82F29';
  const border = '#45474B';
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#161616' },
    header: { height: safeTop + 58, paddingTop: safeTop, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: '#080808', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
    backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerSpacer: { width: 44 },
    title: { flex: 1, color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.43, textAlign: 'center' },
    scrollContent: { paddingTop: 0, paddingBottom: 16 },
    section: { padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: border },
    sectionTitle: { color: '#FFFFFF', fontSize: 16, lineHeight: 20, fontWeight: '500', letterSpacing: -0.24 },
    segmented: { height: 40, padding: 4, flexDirection: 'row', borderRadius: 100, backgroundColor: 'rgba(223,223,233,0.12)' },
    segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 100 },
    segmentActive: { backgroundColor: '#D9DDE5' },
    segmentText: { color: '#C4CAD7', opacity: 0.5, fontSize: 13 },
    segmentTextActive: { color: '#161616', opacity: 1, fontWeight: '700' },
    ratingHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    ratingTag: { height: 28, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 100, backgroundColor: accent },
    ratingTagText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', letterSpacing: -0.23 },
    ratingTrackHitbox: { height: 42, marginHorizontal: 12, justifyContent: 'center' },
    ratingTrack: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: '#54211F' },
    ratingTrackActive: { position: 'absolute', height: 2, backgroundColor: '#F33B34' },
    ratingTick: { position: 'absolute', width: 10, height: 10, marginLeft: -5, borderWidth: 2, borderColor: '#54211F', borderRadius: 5, backgroundColor: '#161616' },
    ratingThumb: { position: 'absolute', width: 38, height: 38, marginLeft: -19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFFFFF', borderRadius: 19, backgroundColor: accent },
    ratingStar: { color: '#FFFFFF', fontSize: 15 },
    locationField: { height: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 22 },
    locationText: { flex: 1, color: '#FFFFFF', fontSize: 14, letterSpacing: -0.24 },
    chevron: { color: '#69707C', fontSize: 28, lineHeight: 28 },
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    choice: { paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 39, backgroundColor: '#161616' },
    choiceActive: { backgroundColor: accent },
    choiceText: { color: '#FFFFFF', opacity: 0.5, fontSize: 14 },
    choiceTextActive: { opacity: 1 },
    footer: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: Math.max(21, safeBottom), flexDirection: 'row', gap: 10, backgroundColor: '#080808' },
    clearButton: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: accent, borderRadius: 36, backgroundColor: '#161616' },
    clearText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500', letterSpacing: 0.6 },
    applyButton: { flex: 1, height: 40, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 36, backgroundColor: accent },
    applyText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500', letterSpacing: 0.6 },
  });
}
