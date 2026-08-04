import { describe, expect, it } from 'vitest';
import { verificationFailureState } from '../../apps/mobile/src/features/onboarding/otp-errors';

describe('OTP error presentation', () => {
  it('only labels an explicit provider rejection as an incorrect code', () => {
    expect(verificationFailureState('incorrect-code')).toBe('incorrect');
    expect(verificationFailureState('verification-in-progress')).toBe('failure');
    expect(verificationFailureState(undefined)).toBe('failure');
  });

  it('preserves expired and locked states', () => {
    expect(verificationFailureState('code-expired')).toBe('expired');
    expect(verificationFailureState('max-attempts-reached')).toBe('locked');
  });
});
