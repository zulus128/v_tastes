import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebase = vi.hoisted(() => ({
  app: { name: 'admin-test-app' },
  callable: vi.fn(),
  getApp: vi.fn(),
  getApps: vi.fn(),
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
  initializeApp: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  getApp: firebase.getApp,
  getApps: firebase.getApps,
  initializeApp: firebase.initializeApp,
}));

vi.mock('firebase/auth', () => ({ connectAuthEmulator: vi.fn(), getAuth: vi.fn() }));
vi.mock('firebase/storage', () => ({ getStorage: vi.fn() }));
vi.mock('firebase/functions', () => ({
  connectFunctionsEmulator: vi.fn(),
  getFunctions: firebase.getFunctions,
  httpsCallable: firebase.httpsCallable,
}));

import { callAdmin } from '../infrastructure/firebase';

describe('admin Firebase boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebase.getApps.mockReturnValue([]);
    firebase.initializeApp.mockReturnValue(firebase.app);
    firebase.getFunctions.mockReturnValue({ region: 'europe-west1' });
    firebase.httpsCallable.mockReturnValue(firebase.callable);
  });

  it('calls the named function in the backend region and unwraps its data', async () => {
    const input = { reportId: 'report-1' };
    firebase.callable.mockResolvedValue({ data: { dismissed: true } });

    await expect(callAdmin('dismissReport', input)).resolves.toEqual({ dismissed: true });
    expect(firebase.getFunctions).toHaveBeenCalledWith(firebase.app, 'europe-west1');
    expect(firebase.httpsCallable).toHaveBeenCalledWith(
      { region: 'europe-west1' },
      'dismissReport',
    );
    expect(firebase.callable).toHaveBeenCalledWith(input);
  });
});
