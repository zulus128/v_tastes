import { describe, expect, it } from 'vitest';
import {
  compareDocumentIdsDesc,
  cursorDate,
  decodeCursor,
  encodeCursor,
} from '../../services/backend/functions/src/shared/pagination';

describe('opaque pagination cursors', () => {
  it('round-trips stable sort values and positions', () => {
    const cursor = encodeCursor({
      id: 'document-20',
      value: '2026-07-27T12:00:00.000Z',
      position: 20,
    });

    expect(decodeCursor(cursor)).toEqual({
      id: 'document-20',
      value: '2026-07-27T12:00:00.000Z',
      position: 20,
    });
  });

  it('rejects malformed client cursors', () => {
    expect(() => decodeCursor('not-a-valid-cursor')).toThrow();
    expect(() => cursorDate('not-a-date')).toThrow();
  });

  it('uses UTF-8 byte ordering for Firestore document ID tie-breaks', () => {
    const ids = ['z', 'é', '😀', 'a'];
    expect([...ids].sort(compareDocumentIdsDesc)).toEqual(
      [...ids].sort((left, right) => Buffer.compare(Buffer.from(right), Buffer.from(left))),
    );
  });
});
