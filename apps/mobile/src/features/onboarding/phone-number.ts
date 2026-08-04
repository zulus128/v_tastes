import type { Country } from './countries';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export function toE164PhoneNumber(country: Country, input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const phoneNumber = parsePhoneNumberFromString(value, country.code);
  return phoneNumber?.isPossible() ? phoneNumber.number : null;
}
