const cityCountries: Record<string, string> = {
  monaco: 'MC',
  menton: 'MC',
  'roquebrune-cap-martin': 'MC',
  'roquebrune cap martin': 'MC',
  london: 'GB',
  madrid: 'ES',
  paris: 'FR',
  nice: 'FR',
  cannes: 'FR',
  milan: 'IT',
  barcelona: 'ES',
  geneva: 'CH',
  dubai: 'AE',
  lisbon: 'PT',
};

/** Curated city mappings take precedence when nearby towns map to Monaco. */
export function resolveCityCountryCode(
  city: string,
  geocodedCountry?: string | null,
): string | null {
  const curated = cityCountries[city.trim().toLocaleLowerCase('en-US')];
  if (curated) return curated;
  const code = geocodedCountry?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
}

export function countryFlagEmoji(code?: string | null): string | null {
  if (!code || !/^[A-Z]{2}$/.test(code)) return null;
  return String.fromCodePoint(
    ...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  );
}
