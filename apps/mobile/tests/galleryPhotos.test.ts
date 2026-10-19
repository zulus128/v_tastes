import { describe, expect, it } from 'vitest';
import { buildGalleryPhotos } from '../src/features/place/galleryPhotos';

describe('buildGalleryPhotos', () => {
  it('returns only real unique photos instead of fabricating gallery entries', () => {
    const result = buildGalleryPhotos(['one', 'two', 'three'], 24);
    expect(result).toEqual(['one', 'two', 'three']);
  });

  it('never hides available photos when the advertised count is stale', () => {
    expect(buildGalleryPhotos(['one', 'two', 'three'], 2)).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('drops empty and duplicate URLs and handles an empty gallery', () => {
    expect(buildGalleryPhotos(['', 'one', ' one ', '  '], 3)).toEqual(['one']);
    expect(buildGalleryPhotos(['', '  '], 24)).toEqual([]);
  });
});
