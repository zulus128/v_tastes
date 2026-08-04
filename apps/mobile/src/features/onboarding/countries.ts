import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js/min';

export interface Country {
  code: CountryCode;
  name: string;
  flag: string;
  callingCode: string;
}

const englishRegionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function flagFor(code: CountryCode): string {
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)));
}

export const countries: Country[] = getCountries()
  .map((code) => ({
    code,
    name: englishRegionNames.of(code) ?? code,
    flag: flagFor(code),
    callingCode: `+${getCountryCallingCode(code)}`,
  }))
  .sort((first, second) => first.name.localeCompare(second.name, 'en'));

export const defaultCountry = countries.find((country) => country.code === 'MC') ?? countries[0];
