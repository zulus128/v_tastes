export function buildGalleryPhotos(
  photoUrls: string[],
  advertisedCount: number,
): string[] {
  const usablePhotos = photoUrls.filter((url) => url.trim().length > 0);
  if (usablePhotos.length === 0) return [];

  const normalizedCount = Number.isFinite(advertisedCount)
    ? Math.max(0, Math.floor(advertisedCount))
    : 0;
  const galleryCount = Math.max(usablePhotos.length, normalizedCount);

  return Array.from(
    { length: galleryCount },
    (_, index) => usablePhotos[index % usablePhotos.length]!,
  );
}
