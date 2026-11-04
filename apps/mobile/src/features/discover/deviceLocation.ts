import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import type { Coordinates } from './venueDistance';

const LOCATION_TIMEOUT_MS = 4_000;

async function readPosition(): Promise<Coordinates | undefined> {
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') return undefined;
  const position =
    (await Location.getLastKnownPositionAsync({
      maxAge: 120_000,
      requiredAccuracy: 1000,
    })) ??
    (await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }));
  return position
    ? {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }
    : undefined;
}

/**
 * Reads the device position when permission was already granted. It never shows
 * a permission prompt and resolves to undefined rather than failing, so callers
 * can fall back to the selected city.
 */
export async function readDeviceLocation(): Promise<Coordinates | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readPosition(),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), LOCATION_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function useDeviceLocation() {
  const [location, setLocation] = useState<Coordinates | undefined>();
  useEffect(() => {
    let active = true;
    void readDeviceLocation().then((next) => {
      if (active) setLocation(next);
    });
    return () => {
      active = false;
    };
  }, []);
  return location;
}
