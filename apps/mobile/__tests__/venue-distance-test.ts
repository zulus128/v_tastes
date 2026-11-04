import {
  distanceBetweenKm,
  formatDistanceKm,
  isDistanceLabel,
  withDeviceDistance,
} from '../src/features/discover/venueDistance';

const istanbul = { latitude: 40.9905, longitude: 29.028 };
const paris = { latitude: 48.8656, longitude: 2.3314 };

it('measures real distances between coordinates', () => {
  expect(distanceBetweenKm(istanbul, paris)).toBeGreaterThan(2000);
  expect(distanceBetweenKm(istanbul, istanbul)).toBe(0);
});

it('replaces the stored distance with one computed from the device', () => {
  const venue = withDeviceDistance({ distanceKm: 1.1, ...paris }, istanbul);
  expect(venue.distanceKm).toBeGreaterThan(2000);
});

it('drops the stored distance when a position is unknown', () => {
  expect(
    withDeviceDistance({ distanceKm: 1.1, ...paris }, undefined),
  ).not.toHaveProperty('distanceKm');
  expect(
    withDeviceDistance({ distanceKm: 1.1, latitude: null }, istanbul),
  ).not.toHaveProperty('distanceKm');
});

it('formats and recognises distance labels', () => {
  expect(formatDistanceKm(0.44)).toBe('0.4 km');
  for (const label of ['1.1 km', '0,4 km', '900 m', '2 mi'])
    expect(isDistanceLabel(label)).toBe(true);
  for (const label of ['Healthy', '5 stars', 'Salads'])
    expect(isDistanceLabel(label)).toBe(false);
});
