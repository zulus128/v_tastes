import { describe, expect, it } from 'vitest';
import { countryFlagEmoji, resolveCityCountryCode } from '@tastes/contracts';

describe('profile city country', () => {
  it('keeps the geocoded country for cities outside the curated list', () => {
    expect(resolveCityCountryCode('Istanbul', 'tr')).toBe('TR');
    expect(countryFlagEmoji('TR')).toBe('🇹🇷');
  });
  it('uses Monaco for the founder-approved nearby-city aliases', () => {
    expect(resolveCityCountryCode('Menton', 'FR')).toBe('MC');
    expect(resolveCityCountryCode('Monaco', 'FR')).toBe('MC');
    expect(resolveCityCountryCode('Roquebrune-Cap-Martin', 'FR')).toBe('MC');
  });
  it('does not guess a country for an unknown manually selected city', () => {
    expect(resolveCityCountryCode('Unknown city')).toBeNull();
    expect(resolveCityCountryCode('Unknown city', 'not-a-code')).toBeNull();
    expect(countryFlagEmoji(null)).toBeNull();
    expect(countryFlagEmoji('Turkey')).toBeNull();
  });
});
