import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';
import flagFrance from '../../../assets/onboarding/flag-france.png';
import flagItaly from '../../../assets/onboarding/flag-italy.png';
import flagMonaco from '../../../assets/onboarding/flag-monaco.png';
import flagPortugal from '../../../assets/onboarding/flag-portugal.png';
import flagSpain from '../../../assets/onboarding/flag-spain.png';
import flagSwitzerland from '../../../assets/onboarding/flag-switzerland.png';
import flagUae from '../../../assets/onboarding/flag-uae.png';
import flagUk from '../../../assets/onboarding/flag-uk.png';
import { useAppTheme, type ThemeColors } from '../../ui/ThemeProvider';
import { responsiveSize, responsiveStyleSheet } from '../../ui/responsive';

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

export function CityPicker({
  initialSearch = '',
  onCustomSelect,
  onSelect,
  topPadding = 126,
}: {
  initialSearch?: string;
  onCustomSelect?: (name: string) => void;
  onSelect: (name: string, flag: ImageSourcePropType) => void;
  topPadding?: number;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [search, setSearch] = useState(initialSearch);
  const normalizedSearch = search.trim();
  const filtered = cities.filter((item) =>
    item[1].toLowerCase().includes(normalizedSearch.toLowerCase()),
  );
  const canUseCustomCity =
    Boolean(onCustomSelect) &&
    normalizedSearch.length >= 2 &&
    !cities.some(
      (item) => item[1].toLowerCase() === normalizedSearch.toLowerCase(),
    );

  useEffect(() => setSearch(initialSearch), [initialSearch]);

  return (
    <View style={[styles.listPage, { paddingTop: responsiveSize(topPadding) }]}>
      <Text style={styles.listTitle}>Select city</Text>
      <TextInput
        autoFocus
        onChangeText={setSearch}
        placeholder="Search"
        placeholderTextColor={colors.placeholder}
        style={styles.search}
        value={search}
      />
      <ScrollView keyboardShouldPersistTaps="handled">
        {canUseCustomCity ? (
          <Pressable
            accessibilityLabel={`Use ${normalizedSearch} as city`}
            accessibilityRole="button"
            onPress={() => onCustomSelect?.(normalizedSearch)}
            style={[styles.cityRow, styles.customCityRow]}
            testID="use-custom-city"
          >
            <Text style={styles.customCityAction}>Use this city</Text>
            <Text numberOfLines={1} style={styles.cityName}>
              {normalizedSearch}
            </Text>
          </Pressable>
        ) : null}
        {filtered.map(([flag, name]) => (
          <Pressable
            key={name}
            onPress={() => onSelect(name, flag)}
            style={styles.cityRow}
          >
            <Image source={flag} style={styles.cityFlag} />
            <Text style={styles.cityName}>{name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return responsiveStyleSheet({
    listPage: { flex: 1, paddingHorizontal: 16, paddingBottom: 90 },
    listTitle: {
      marginBottom: 14,
      color: colors.text,
      fontSize: 23,
      lineHeight: 28,
      fontWeight: '700',
    },
    search: {
      height: 44,
      paddingHorizontal: 14,
      borderRadius: 10,
      color: colors.text,
      fontSize: 14,
      backgroundColor: colors.surfaceRaised,
    },
    cityRow: {
      height: 49,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
      flexDirection: 'row',
      alignItems: 'center',
    },
    cityFlag: { width: 20, height: 20, marginRight: 14 },
    cityName: { flex: 1, color: colors.text, fontSize: 15 },
    customCityRow: { gap: 10 },
    customCityAction: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    cityCountry: { color: colors.textMuted, fontSize: 13 },
  });
}
