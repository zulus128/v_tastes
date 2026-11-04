export type Coordinates = { latitude: number; longitude: number };

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function distanceBetweenKm(from: Coordinates, to: Coordinates) {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * A venue's distance only means something relative to this device. The value
 * stored on venue documents is seed/CMS data, so it is always replaced: computed
 * when both positions are known and absent otherwise.
 */
export function withDeviceDistance<
  T extends {
    distanceKm?: number | null;
    latitude?: number | null;
    longitude?: number | null;
  },
>(
  venue: T,
  location: Coordinates | null | undefined,
): Omit<T, 'distanceKm'> & { distanceKm?: number } {
  const copy = { ...venue };
  delete copy.distanceKm;
  const rest: Omit<T, 'distanceKm'> = copy;
  if (!location || venue.latitude == null || venue.longitude == null)
    return rest;
  return {
    ...rest,
    distanceKm: distanceBetweenKm(location, {
      latitude: venue.latitude,
      longitude: venue.longitude,
    }),
  };
}

export function formatDistanceKm(km: number) {
  return `${km.toFixed(1)} km`;
}

/** Venue tags can embed a fixed distance such as "1.1 km" from seed data. */
export function isDistanceLabel(value: string) {
  return /^\d+(?:[.,]\d+)?\s*(?:km|mi|m)$/i.test(value.trim());
}
