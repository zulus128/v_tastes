import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';

const groups = [
  [
    'Kind of food',
    [
      'Italian 🇮🇹',
      'Japanese 🇯🇵',
      'Georgian 🇬🇪',
      'Thai 🇹🇭',
      'American 🇺🇸',
      'Indian 🇮🇳',
      'Mexican 🇲🇽',
      'Chinese 🇨🇳',
    ],
  ],
  ['Dietary preferences', ['Vegetarian 🥦', 'Vegan 🌱', 'Gluten free']],
  ['Occasion', ['Date night', 'With friends', 'Quick bite', 'Open late']],
  ['Price', ['$', '$$', '$$$', '$$$$']],
] as const;

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
  const [selected, setSelected] = useState(new Set(initialValues));
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.headerButton}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Filter</Text>
        <Pressable onPress={() => setSelected(new Set())} style={styles.headerButton}>
          <Text style={styles.reset}>Reset</Text>
        </Pressable>
      </View>
      <ScrollView>
        {groups.map(([title, choices]) => (
          <View key={title} style={styles.group}>
            <Text style={styles.groupTitle}>{title}</Text>
            <View style={styles.choices}>
              {choices.map((value) => {
                const active = selected.has(value);
                return (
                  <Pressable
                    key={value}
                    onPress={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (active) next.delete(value);
                        else next.add(value);
                        return next;
                      })
                    }
                    style={[styles.choice, active && styles.choiceActive]}
                  >
                    <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                      {value}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      <Pressable onPress={() => onApply([...selected])} style={styles.apply}>
        <Text style={styles.applyText}>Show places</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors, safeTop: number, safeBottom: number) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    header: {
      height: safeTop + 60,
      paddingTop: safeTop,
      paddingHorizontal: 6,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    headerButton: {
      width: 64,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    back: {
      color: colors.text,
      fontSize: 38,
      lineHeight: 40,
      fontWeight: '300',
    },
    title: {
      flex: 1,
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'center',
    },
    reset: { color: colors.primary, fontSize: 13 },
    group: {
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    groupTitle: { color: colors.text, fontSize: 16, fontWeight: '500' },
    choices: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    choice: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 20,
      backgroundColor: colors.surface,
    },
    choiceActive: { backgroundColor: colors.primary },
    choiceText: { color: colors.text, opacity: 0.52, fontSize: 14 },
    choiceTextActive: { color: '#FFFFFF', opacity: 1 },
    apply: {
      height: 52,
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: Math.max(16, safeBottom),
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    applyText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  });
}
