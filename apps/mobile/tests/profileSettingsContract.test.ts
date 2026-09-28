import { updateProfileSettingsInputSchema } from '@tastes/contracts';
import { describe, expect, it } from 'vitest';

describe('profile settings contract', () => {
  it('accepts setting and clearing the profile bio', () => {
    expect(
      updateProfileSettingsInputSchema.parse({ bio: 'Natural wine person' }),
    ).toEqual({ bio: 'Natural wine person' });
    expect(updateProfileSettingsInputSchema.parse({ bio: '' })).toEqual({
      bio: '',
    });
  });
});
