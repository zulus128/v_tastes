import { describe, expect, it } from 'vitest';
import {
  normalizeApiError,
  TastesApiError,
} from '../../packages/firebase-client/src';

describe('API error normalization', () => {
  it('turns authentication failures into a typed non-retryable error', () => {
    const error = normalizeApiError({
      code: 'functions/unauthenticated',
      message: 'Authentication is required.',
    });

    expect(error).toBeInstanceOf(TastesApiError);
    expect(error.code).toBe('unauthenticated');
    expect(error.retryable).toBe(false);
  });

  it('marks transient availability failures as retryable', () => {
    expect(normalizeApiError({ code: 'functions/unavailable' }).retryable).toBe(true);
  });
});
