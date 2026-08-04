import { describe, expect, it } from 'vitest';
import { countries } from '../../apps/mobile/src/features/onboarding/countries';
import { toE164PhoneNumber } from '../../apps/mobile/src/features/onboarding/phone-number';

function country(code: string) {
  const match = countries.find((item) => item.code === code);
  if (!match) throw new Error(`Missing country ${code}`);
  return match;
}

describe('phone number validation', () => {
  it('includes every phone-number region from the international metadata', () => {
    expect(countries.length).toBeGreaterThanOrEqual(240);
    expect(country('TR').callingCode).toBe('+90');
    expect(country('IN').callingCode).toBe('+91');
    expect(country('BR').callingCode).toBe('+55');
    expect(country('JP').callingCode).toBe('+81');
  });

  it('rejects a Monaco number with too few national digits', () => {
    expect(toE164PhoneNumber(country('MC'), '54548')).toBeNull();
  });

  it('normalizes a valid Monaco number to E.164', () => {
    expect(toE164PhoneNumber(country('MC'), '545 44444')).toBe('+37754544444');
  });

  it('uses the selected country numbering length', () => {
    expect(toE164PhoneNumber(country('US'), '(415) 555-2671')).toBe('+14155552671');
    expect(toE164PhoneNumber(country('FR'), '12345678')).toBeNull();
  });

  it('normalizes a national trunk prefix', () => {
    expect(toE164PhoneNumber(country('FR'), '06 12 34 56 78')).toBe('+33612345678');
  });
});
