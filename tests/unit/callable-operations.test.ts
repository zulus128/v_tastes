import { describe, expect, it } from 'vitest';
import { callableOperationNames } from '../../packages/firebase-client/src';
import * as backendExports from '../../services/backend/functions/src';

const nonCallableExports = new Set([
  'pushMessageNotification',
  'resetMonthlyXp',
]);

describe('callable operation registry', () => {
  it('matches the callable functions exported by the backend', () => {
    const backendCallableNames = Object.keys(backendExports)
      .filter((name) => !nonCallableExports.has(name))
      .sort();

    expect(backendCallableNames).toEqual([...callableOperationNames].sort());
  });
});
