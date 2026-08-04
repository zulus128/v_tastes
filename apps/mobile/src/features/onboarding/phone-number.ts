import type { Country } from './countries';

export function toE164PhoneNumber(country: Country, input: string): string | null {
  const nationalNumber = input.replace(/\D/g, '');

  if (!country.nationalNumberLengths.includes(nationalNumber.length)) return null;

  const phoneNumber = `${country.callingCode}${nationalNumber}`;
  return /^\+[1-9]\d{7,14}$/.test(phoneNumber) ? phoneNumber : null;
}
