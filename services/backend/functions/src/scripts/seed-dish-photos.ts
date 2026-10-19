export function selectSeedDishPhotoUrl(
  imageUrl: unknown,
  photoUrls: unknown,
  index: number,
): string | undefined {
  const gallery = Array.isArray(photoUrls)
    ? photoUrls.filter(
        (url): url is string => typeof url === 'string' && url.length > 0,
      )
    : [];
  return (
    (gallery.length > 0 ? gallery[index % gallery.length] : undefined) ??
    (typeof imageUrl === 'string' && imageUrl.length > 0 ? imageUrl : undefined)
  );
}
