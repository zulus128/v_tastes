import { describe, expect, it } from 'vitest';

import { selectSeedDishPhotoUrl } from '../../functions/src/scripts/seed-dish-photos';

describe('seed dish photos', () => {
  it('rotates through venue gallery photos', () => {
    const gallery = ['first.jpg', 'second.jpg'];

    expect(selectSeedDishPhotoUrl('cover.jpg', gallery, 0)).toBe('first.jpg');
    expect(selectSeedDishPhotoUrl('cover.jpg', gallery, 1)).toBe('second.jpg');
    expect(selectSeedDishPhotoUrl('cover.jpg', gallery, 2)).toBe('first.jpg');
  });

  it('falls back to the venue cover and ignores invalid gallery values', () => {
    expect(selectSeedDishPhotoUrl('cover.jpg', [null, ''], 0)).toBe(
      'cover.jpg',
    );
  });

  it('returns undefined when the venue has no usable media', () => {
    expect(selectSeedDishPhotoUrl(undefined, [], 0)).toBeUndefined();
  });
});
