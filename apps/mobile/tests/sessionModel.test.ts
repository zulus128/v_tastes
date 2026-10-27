import { describe, expect, it } from 'vitest';
import { shouldClearSessionAfterTokenRefresh } from '../src/session/model';

describe('shouldClearSessionAfterTokenRefresh', () => {
  it.each([
    'auth/invalid-user-token',
    'auth/user-disabled',
    'auth/user-token-expired',
  ])('clears a session for terminal Firebase error %s', (code) => {
    expect(shouldClearSessionAfterTokenRefresh({ code })).toBe(true);
  });

  it.each([
    'auth/network-request-failed',
    'appCheck/token-error',
    'functions/unauthenticated',
    'auth/internal-error',
  ])('preserves a session for recoverable error %s', (code) => {
    expect(shouldClearSessionAfterTokenRefresh({ code })).toBe(false);
  });

  it('preserves a session when an untyped transport error is thrown', () => {
    expect(shouldClearSessionAfterTokenRefresh(new Error('offline'))).toBe(
      false,
    );
  });
});
