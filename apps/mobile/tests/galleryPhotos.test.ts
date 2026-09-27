import { describe, expect, it } from 'vitest';
import { buildGalleryPhotos } from '../src/features/place/galleryPhotos';

describe('buildGalleryPhotos', () => {
  it('fills the gallery to the advertised photo count', () => {
    const result = buildGalleryPhotos(['one', 'two', 'three'], 24);

    expect(result).toHaveLength(24);
    expect(result.slice(0, 6)).toEqual([
      'one',
      'two',
      'three',
      'one',
      'two',
      'three',
    ]);
  });

  it('never hides available photos when the advertised count is stale', () => {
    expect(buildGalleryPhotos(['one', 'two', 'three'], 2)).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('drops empty URLs and handles an empty gallery', () => {
    expect(buildGalleryPhotos(['', 'one', '  '], 3)).toEqual([
      'one',
      'one',
      'one',
    ]);
    expect(buildGalleryPhotos(['', '  '], 24)).toEqual([]);
  });
});
