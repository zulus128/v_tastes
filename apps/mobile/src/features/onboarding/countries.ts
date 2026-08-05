import isoCountries from 'i18n-iso-countries';
import englishLocale from 'i18n-iso-countries/langs/en.json';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js/min';

export interface Country {
  code: CountryCode;
  name: string;
  flag: string;
  callingCode: string;
}

isoCountries.registerLocale(englishLocale);

const phoneRegionNames: Partial<Record<CountryCode, string>> = {
  AC: 'Ascension Island',
  TA: 'Tristan da Cunha',
};

function flagFor(code: CountryCode): string {
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)));
}

export const countries: Country[] = getCountries()
  .map((code) => ({
    code,
    name: phoneRegionNames[code] ?? isoCountries.getName(code, 'en') ?? code,
    flag: flagFor(code),
    callingCode: `+${getCountryCallingCode(code)}`,
  }))
  .sort((first, second) => first.name.localeCompare(second.name, 'en'));

export const defaultCountry: Country = countries.find((country) => country.code === 'MC') ?? {
  code: 'MC',
  name: 'Monaco',
  flag: '🇲🇨',
  callingCode: '+377',
};
