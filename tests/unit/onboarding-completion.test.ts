import { describe, expect, it } from 'vitest';
import { buildCompletionInput } from '../../apps/mobile/src/features/onboarding/completion-input';

describe('post-signup onboarding completion', () => {
  it('omits optional Firebase callable fields when every optional step is skipped', () => {
    const input = buildCompletionInput({
      appearance: 'system',
      dish: null,
      invitedContactCount: 0,
      place: null,
    });

    expect(input).toEqual({ invitedContactCount: 0, appearance: 'system' });
    expect(Object.values(input)).not.toContain(undefined);
  });

  it('includes selected optional values', () => {
    expect(buildCompletionInput({
      appearance: 'dark',
      dish: 'Sushi',
      invitedContactCount: 2,
      place: 'venue-1',
    })).toEqual({
      invitedContactCount: 2,
      appearance: 'dark',
      favoriteDish: 'Sushi',
      favoriteVenueId: 'venue-1',
    });
  });
});
