import { describe, expect, it } from 'vitest';
import { selectSeedDishPhotoUrl } from '../../functions/src/scripts/seed-dish-photos';

describe('seed dish photos', () => {
  it('never presents a venue gallery or cover as a dish photo', () => {
    expect(
      selectSeedDishPhotoUrl('cover.jpg', ['interior.jpg'], 0),
    ).toBeUndefined();
    expect(selectSeedDishPhotoUrl('cover.jpg', [], 1)).toBeUndefined();
    expect(selectSeedDishPhotoUrl(undefined, [], 0)).toBeUndefined();
  });
});
