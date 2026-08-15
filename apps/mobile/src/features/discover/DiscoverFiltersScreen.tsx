import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';

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
const DIETARY_PREFERENCES = ['Vegetarian 🥦'] as const;
const BUDGETS = ['$ 🍞', '$$ 🍝', '$$$ 🥂'] as const;
const COFFEE = ['Matcha 🍵', 'Coffee ☕', 'Vegan coffee 🥛'] as const;
const DISTANCES = ['1 km', '3 km', '5 km', 'Any'] as const;

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
  const [selected, setSelected] = useState(() => new Set(
    initialValues.filter((value) => !/^(OpenNow|Distance):/.test(value)),
  ));
  const [openNow, setOpenNow] = useState(initialValue(initialValues, 'OpenNow') === 'true');
  const [maxDistance, setMaxDistance] = useState(initialValue(initialValues, 'Distance') ?? 'Any');

  function toggle(value: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function clearAll() {
    setSelected(new Set());
    setOpenNow(false);
    setMaxDistance('Any');
  }

  function apply() {
    const values = [...selected];
    if (openNow) values.push(encoded('OpenNow', 'true'));
    if (maxDistance !== 'Any') values.push(encoded('Distance', maxDistance));
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
        <ChipSection choices={CUISINES} selected={selected} styles={styles} title="Kind of food" toggle={toggle} />
        <ChipSection choices={DIETARY_PREFERENCES} selected={selected} styles={styles} title="Dietary preferences" toggle={toggle} />
        <ChipSection choices={BUDGETS} selected={selected} styles={styles} title="Budget" toggle={toggle} />
        <ChipSection choices={COFFEE} selected={selected} styles={styles} title="Coffee taste" toggle={toggle} />

        <View style={styles.openNowRow}>
          <Text style={styles.openNowLabel}>Open now</Text>
          <Pressable
            accessibilityLabel="Open now"
            accessibilityRole="switch"
            accessibilityState={{ checked: openNow }}
            onPress={() => setOpenNow((value) => !value)}
            style={[styles.switchTrack, openNow && styles.switchTrackActive]}
          >
            <View style={[styles.switchThumb, openNow && styles.switchThumbActive]} />
          </Pressable>
        </View>

        <View style={styles.distanceSection}>
          <Text style={styles.sectionTitle}>Max distance</Text>
          <View style={styles.distanceChoices}>
            {DISTANCES.map((value) => {
              const active = maxDistance === value;
              return (
                <Pressable key={value} onPress={() => setMaxDistance(value)} style={[styles.distanceChoice, active && styles.distanceChoiceActive]}>
                  <Text style={[styles.distanceText, active && styles.distanceTextActive]}>{value}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={clearAll} style={styles.clearButton}><Text style={styles.clearText}>Clear all</Text></Pressable>
        <Pressable onPress={apply} style={styles.applyButton}><CheckIcon /><Text style={styles.applyText}>Apply</Text></Pressable>
      </View>
    </View>
  );
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
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
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
    </View>
  );
}

function createStyles(_colors: ThemeColors, safeTop: number, safeBottom: number) {
  const accent = '#B82F29';
  const border = '#45474B';
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#161616' },
    header: { height: safeTop + 58, paddingTop: safeTop, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: '#080808', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
    backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerSpacer: { width: 44 },
    title: { flex: 1, color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.43, textAlign: 'center' },
    scrollContent: { paddingBottom: 16 },
    section: { padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: border },
    sectionTitle: { color: '#FFFFFF', fontSize: 16, lineHeight: 20, fontWeight: '500', letterSpacing: -0.24 },
    choices: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10 },
    choice: { paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 39, backgroundColor: '#161616' },
    choiceActive: { backgroundColor: accent },
    choiceText: { color: '#FFFFFF', opacity: 0.5, fontSize: 14 },
    choiceTextActive: { opacity: 1 },
    openNowRow: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    openNowLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    switchTrack: { width: 46, height: 28, padding: 2, justifyContent: 'center', borderRadius: 14, backgroundColor: '#5A5B60' },
    switchTrackActive: { backgroundColor: accent },
    switchThumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF' },
    switchThumbActive: { alignSelf: 'flex-end' },
    distanceSection: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14, gap: 12 },
    distanceChoices: { flexDirection: 'row', gap: 8 },
    distanceChoice: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: '#262629' },
    distanceChoiceActive: { backgroundColor: accent },
    distanceText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '500' },
    distanceTextActive: { color: '#FFFFFF' },
    footer: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: Math.max(21, safeBottom), flexDirection: 'row', gap: 10, backgroundColor: '#080808' },
    clearButton: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: accent, borderRadius: 36, backgroundColor: '#161616' },
    clearText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500', letterSpacing: 0.6 },
    applyButton: { flex: 1, height: 40, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 36, backgroundColor: accent },
    applyText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500', letterSpacing: 0.6 },
  });
}
