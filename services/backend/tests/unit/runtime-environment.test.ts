import { describe, expect, it } from 'vitest';

import {
  isFirebaseEmulator,
  isRelaxedTestEnvironment,
} from '../../functions/src/shared/runtime-environment';

describe('runtime environment', () => {
  it('relaxes checks in the Firebase emulator', () => {
    const environment = { FUNCTIONS_EMULATOR: 'true' };

    expect(isFirebaseEmulator(environment)).toBe(true);
    expect(isRelaxedTestEnvironment(environment)).toBe(true);
  });

  it('relaxes checks in the temporary Firebase test contour', () => {
    expect(isRelaxedTestEnvironment({ GCLOUD_PROJECT: 'tastes-934e6' })).toBe(true);
    expect(isRelaxedTestEnvironment({
      FIREBASE_CONFIG: JSON.stringify({ projectId: 'tastes-934e6' }),
    })).toBe(true);
  });

  it('keeps checks enabled for any other deployed project', () => {
    expect(isRelaxedTestEnvironment({ GCLOUD_PROJECT: 'tastes-production' })).toBe(false);
    expect(isRelaxedTestEnvironment({})).toBe(false);
  });
});
