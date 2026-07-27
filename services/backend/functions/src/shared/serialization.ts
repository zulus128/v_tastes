import type { Timestamp } from 'firebase-admin/firestore';

export function timestampToIso(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value) {
    return (value as Timestamp).toDate().toISOString();
  }
  if (typeof value === 'string') return value;
  return new Date(0).toISOString();
}
