import { describe, expect, it, vi } from 'vitest';
import { runSessionBootstrap } from '../src/session/session-bootstrap';

const expired = { code: 'functions/unauthenticated', message: 'Expired' };

describe('session bootstrap retry', () => {
  it('retries an unauthenticated startup after credentials refresh', async () => {
    const order: string[] = [];
    const operation = vi
      .fn()
      .mockImplementationOnce(async () => {
        order.push('expired');
        throw expired;
      })
      .mockImplementationOnce(async () => {
        order.push('loaded');
        return 'account';
      });
    const refresh = vi.fn(async () => {
      order.push('refresh');
    });
    await expect(runSessionBootstrap(operation, refresh)).resolves.toBe(
      'account',
    );
    expect(order).toEqual(['expired', 'refresh', 'loaded']);
  });

  it('does not retry unrelated failures', async () => {
    const failure = new Error('Offline');
    const operation = vi.fn().mockRejectedValue(failure);
    const refresh = vi.fn();
    await expect(runSessionBootstrap(operation, refresh)).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not loop when refreshed credentials are still rejected', async () => {
    const operation = vi.fn().mockRejectedValue(expired);
    const refresh = vi.fn().mockResolvedValue(undefined);
    await expect(runSessionBootstrap(operation, refresh)).rejects.toBe(expired);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('surfaces refresh failure without another request', async () => {
    const failure = new Error('Refresh unavailable');
    const operation = vi.fn().mockRejectedValue(expired);
    const refresh = vi.fn().mockRejectedValue(failure);
    await expect(runSessionBootstrap(operation, refresh)).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
