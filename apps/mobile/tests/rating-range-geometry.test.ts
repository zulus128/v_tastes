import { describe, expect, it } from 'vitest';
import {
  moveRatingThumb,
  nearestRatingThumb,
  ratingAtPosition,
  ratingPosition,
  RATING_RANGE_THUMB_SIZE,
} from '../src/features/discover/ratingRangeGeometry';

describe('rating range geometry', () => {
  const width = 370;

  it('keeps both endpoint handles fully inside the track bounds', () => {
    expect(ratingPosition(0, width)).toBe(RATING_RANGE_THUMB_SIZE / 2);
    expect(ratingPosition(5, width)).toBe(width - RATING_RANGE_THUMB_SIZE / 2);
  });

  it('maps drags to tenths and clamps beyond both ends', () => {
    expect(ratingAtPosition(-50, width)).toBe(0);
    expect(ratingAtPosition(ratingPosition(4.3, width), width)).toBe(4.3);
    expect(ratingAtPosition(width + 50, width)).toBe(5);
  });

  it('moves each selected thumb without crossing the other thumb', () => {
    expect(moveRatingThumb([2, 4], 'min', width, width)).toEqual([4, 4]);
    expect(moveRatingThumb([2, 4], 'max', 0, width)).toEqual([2, 2]);
  });

  it('selects the nearest thumb when a drag begins', () => {
    expect(nearestRatingThumb(ratingPosition(1, width), width, [1, 4])).toBe(
      'min',
    );
    expect(nearestRatingThumb(ratingPosition(4, width), width, [1, 4])).toBe(
      'max',
    );
  });
});
