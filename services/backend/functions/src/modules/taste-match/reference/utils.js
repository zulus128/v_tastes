'use strict';

const DAY = 86_400_000;
const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const round = (n, places = 4) => Number(n.toFixed(places));
const compareIds = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const keyOf = (...parts) => JSON.stringify(parts);

function assert(condition, message) {
  if (!condition) throw new TypeError(message);
}

function nonempty(value, label, max = 200) {
  assert(
    typeof value === 'string' && value.trim().length > 0 && value.length <= max,
    label + ' must be a nonempty string of at most ' + max + ' characters',
  );
  return value.trim();
}

function numeric(value, label, min, max) {
  assert(
    typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max,
    label + ' must be a finite number from ' + min + ' to ' + max,
  );
  return value;
}

function timestamp(value, label = 'ratedAt') {
  if (typeof value === 'string') {
    const parts =
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(
        value,
      );
    assert(
      parts,
      label + ' must be epoch milliseconds or an ISO timestamp with a timezone',
    );
    const [year, month, day, hour, minute, second] = parts
      .slice(1, 7)
      .map(Number);
    assert(
      year >= 1970 &&
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= new Date(Date.UTC(year, month, 0)).getUTCDate() &&
        hour < 24 &&
        minute < 60 &&
        second < 60,
      label + ' has an invalid calendar date or time',
    );
  } else
    assert(
      typeof value === 'number',
      label + ' must be epoch milliseconds or an ISO timestamp with a timezone',
    );
  const ms = typeof value === 'number' ? value : Date.parse(value);
  numeric(ms, label, 0, 8.64e15);
  assert(
    Number.isSafeInteger(ms),
    label + ' must have whole millisecond precision',
  );
  return ms;
}

function location(value, label = 'location') {
  assert(value && typeof value === 'object', label + ' is required');
  return {
    lat: numeric(value.lat, label + '.lat', -90, 90),
    lng: numeric(value.lng, label + '.lng', -180, 180),
  };
}

function haversine(a, b) {
  const r = Math.PI / 180;
  const q = clamp(
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
      Math.cos(a.lat * r) *
        Math.cos(b.lat * r) *
        Math.sin(((b.lng - a.lng) * r) / 2) ** 2,
  );
  return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function fold(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function decay(ratedAt, now, halfLifeDays) {
  return Math.exp(
    (-Math.LN2 * Math.max(0, now - ratedAt)) / (halfLifeDays * DAY),
  );
}

function indexAdd(index, key, value) {
  if (!index.has(key)) index.set(key, new Set());
  index.get(key).add(value);
}

module.exports = {
  DAY,
  clamp,
  round,
  compareIds,
  keyOf,
  assert,
  nonempty,
  numeric,
  timestamp,
  location,
  haversine,
  fold,
  decay,
  indexAdd,
};
