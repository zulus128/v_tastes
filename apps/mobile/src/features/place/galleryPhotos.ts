export function buildGalleryPhotos(
  photoUrls: string[],
  advertisedCount: number,
): string[] {
  void advertisedCount;
  return [...new Set(photoUrls.map((url) => url.trim()).filter(Boolean))];
}
