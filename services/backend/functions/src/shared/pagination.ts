import { HttpsError } from 'firebase-functions/v2/https';

export interface CursorPayload {
  id: string;
  value: string | number;
  position?: number;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | null | undefined): CursorPayload | null {
  if (!cursor) return null;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<CursorPayload>;
    if (
      typeof parsed.id !== 'string'
      || parsed.id.length === 0
      || (typeof parsed.value !== 'string' && typeof parsed.value !== 'number')
    ) {
      throw new Error('Invalid cursor payload.');
    }
    if (parsed.position !== undefined && (!Number.isInteger(parsed.position) || parsed.position < 0)) {
      throw new Error('Invalid cursor position.');
    }
    return {
      id: parsed.id,
      value: parsed.value,
      ...(parsed.position !== undefined ? { position: parsed.position } : {}),
    };
  } catch {
    throw new HttpsError('invalid-argument', 'The pagination cursor is invalid.');
  }
}

export function cursorDate(value: string | number): Date {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'The pagination cursor is invalid.');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpsError('invalid-argument', 'The pagination cursor is invalid.');
  }
  return date;
}
