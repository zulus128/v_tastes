import { describe, expect, it } from 'vitest';
import { selectAppleAppCheckProvider } from '../src/infrastructure/appCheckProvider';

describe('selectAppleAppCheckProvider', () => {
  it('uses the debug provider in development', () => {
    expect(selectAppleAppCheckProvider(true, '49')).toBe('debug');
  });

  it('keeps build 49 OTA-compatible without an App Attest entitlement', () => {
    expect(selectAppleAppCheckProvider(false, '49')).toBe('deviceCheck');
  });

  it('uses App Attest after the entitlement is included in build 50', () => {
    expect(selectAppleAppCheckProvider(false, '50')).toBe(
      'appAttestWithDeviceCheckFallback',
    );
  });

  it('defaults to App Attest for future builds with unknown build metadata', () => {
    expect(selectAppleAppCheckProvider(false, null)).toBe(
      'appAttestWithDeviceCheckFallback',
    );
  });
});
