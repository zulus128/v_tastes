import { describe, expect, it } from 'vitest';
import { authenticatedPhase } from '../../apps/mobile/src/session/model';

describe('session gate', () => {
  it('keeps authenticated users in onboarding until the server marks it complete', () => {
    expect(authenticatedPhase(false)).toBe('onboarding');
    expect(authenticatedPhase(true)).toBe('authenticated');
  });
});
