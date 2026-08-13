import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ImageSourcePropType } from 'react-native';
import flagFrance from '../../../assets/onboarding/flag-france.png';
import flagItaly from '../../../assets/onboarding/flag-italy.png';
import flagMonaco from '../../../assets/onboarding/flag-monaco.png';
import flagPortugal from '../../../assets/onboarding/flag-portugal.png';
import flagSpain from '../../../assets/onboarding/flag-spain.png';
import flagSwitzerland from '../../../assets/onboarding/flag-switzerland.png';
import flagUae from '../../../assets/onboarding/flag-uae.png';
import flagUk from '../../../assets/onboarding/flag-uk.png';
import { useAppTheme, type ThemeColors } from '../../ui/ThemeProvider';

export const cities = [
  [flagMonaco, 'Monaco', 'Monaco'],
  [flagUk, 'London', 'United Kingdom'],
  [flagFrance, 'Paris', 'France'],
  [flagFrance, 'Nice', 'France'],
  [flagFrance, 'Cannes', 'France'],
  [flagItaly, 'Milan', 'Italy'],
  [flagSpain, 'Barcelona', 'Spain'],
  [flagSwitzerland, 'Geneva', 'Switzerland'],
  [flagUae, 'Dubai', 'UAE'],
  [flagPortugal, 'Lisbon', 'Portugal'],
] as const;

export const countryFlags: Record<string, ImageSourcePropType> = {
  AE: flagUae,
  CH: flagSwitzerland,
  ES: flagSpain,
  FR: flagFrance,
  GB: flagUk,
  IT: flagItaly,
  MC: flagMonaco,
  PT: flagPortugal,
};

export function cityFlag(name: string): ImageSourcePropType | undefined {
  return cities.find((item) => item[1] === name)?.[0];
}

export function CityPicker({ onSelect, topPadding = 126 }: { onSelect: (name: string, flag: ImageSourcePropType) => void; topPadding?: number }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [search, setSearch] = useState('');
  const filtered = cities.filter((item) => item[1].toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <View style={[styles.listPage, { paddingTop: topPadding }]}>
      <Text style={styles.listTitle}>Select city</Text>
      <TextInput autoFocus onChangeText={setSearch} placeholder="Search" placeholderTextColor={colors.placeholder} style={styles.search} value={search} />
      <ScrollView keyboardShouldPersistTaps="handled">
        {filtered.map(([flag, name, country]) => (
          <Pressable key={name} onPress={() => onSelect(name, flag)} style={styles.cityRow}>
            <Image source={flag} style={styles.cityFlag} />
            <Text style={styles.cityName}>{name}</Text>
            <Text style={styles.cityCountry}>{country}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    listPage: { flex: 1, paddingHorizontal: 16, paddingBottom: 90 },
    listTitle: { marginBottom: 14, color: colors.text, fontSize: 23, lineHeight: 28, fontWeight: '700' },
    search: { height: 44, paddingHorizontal: 14, borderRadius: 10, color: colors.text, fontSize: 14, backgroundColor: colors.surfaceRaised },
    cityRow: { height: 49, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline, flexDirection: 'row', alignItems: 'center' },
    cityFlag: { width: 20, height: 20, marginRight: 14 },
    cityName: { flex: 1, color: colors.text, fontSize: 15 },
    cityCountry: { color: colors.textMuted, fontSize: 13 },
  });
}
