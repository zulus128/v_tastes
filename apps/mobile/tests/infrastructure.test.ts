import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdempotencyKey } from '../src/infrastructure/idempotency';
import { formatDisplayDate } from '../src/infrastructure/date';
import {
  consumePendingDeepLink,
  rememberPendingDeepLink,
} from '../src/navigation/pendingDeepLink';

describe('mobile infrastructure boundaries', () => {
  beforeEach(() => {
    consumePendingDeepLink();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('consumes a pending deep link only once', () => {
    rememberPendingDeepLink('tastes://place/demo-cafe');

    expect(consumePendingDeepLink()).toBe('tastes://place/demo-cafe');
    expect(consumePendingDeepLink()).toBeNull();
  });

  it('keeps only the latest deep link while authentication is pending', () => {
    rememberPendingDeepLink('tastes://place/old');
    rememberPendingDeepLink('tastes://place/latest');

    expect(consumePendingDeepLink()).toBe('tastes://place/latest');
  });

  it('creates a scoped idempotency key with time and entropy', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const key = createIdempotencyKey('review');

    expect(key).toBe(`review:${(1_700_000_000_000).toString(36)}:${(0.5).toString(36).slice(2)}`);
  });

  it('formats display dates independently of the device locale', () => {
    expect(formatDisplayDate('2026-08-15T12:00:00.000Z')).toBe('Aug 15, 2026');
  });
});
