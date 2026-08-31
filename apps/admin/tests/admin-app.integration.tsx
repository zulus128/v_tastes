import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { name: 'admin-auth' },
  authUser: null as null | {
    email: string;
    getIdTokenResult: () => Promise<{ claims: { role?: string } }>;
  },
  callAdmin: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_auth, callback) => {
    void callback(mocks.authUser);
    return () => undefined;
  }),
  signInWithEmailAndPassword: mocks.signIn,
  signOut: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  deleteObject: vi.fn(),
  getDownloadURL: vi.fn(),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
}));

vi.mock('../infrastructure/firebase', () => ({
  callAdmin: mocks.callAdmin,
  getFirebaseAuth: () => mocks.auth,
  getFirebaseStorage: vi.fn(),
}));

import { AdminApp } from '../components/AdminApp';

const overview = {
  totalUsers: 12,
  totalReviews: 34,
  pendingReports: 2,
  activeVenues: 8,
  newUsers: { last24Hours: 1, last7Days: 3, last30Days: 7 },
  newReviews: { last24Hours: 2, last7Days: 5, last30Days: 11 },
  analytics: { connected: false, propertyId: '', dau: 0, mau: 0, error: null },
  reviewCities: [],
};

describe('AdminApp authentication boundary', () => {
  beforeEach(() => {
    mocks.authUser = null;
    mocks.callAdmin.mockReset();
    mocks.signIn.mockReset();
  });

  afterEach(() => cleanup());

  it('submits staff credentials from the login screen', async () => {
    mocks.signIn.mockResolvedValue({ user: { uid: 'admin-1' } });
    render(<AdminApp />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@tastes.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret-password' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);

    await waitFor(() => {
      expect(mocks.signIn).toHaveBeenCalledWith(
        mocks.auth,
        'admin@tastes.com',
        'secret-password',
      );
    });
  });

  it('shows a normalized Firebase error after a rejected login', async () => {
    mocks.signIn.mockRejectedValue(new Error('Firebase: Invalid credentials.'));
    render(<AdminApp />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'staff@tastes.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);

    expect(await screen.findByText('Invalid credentials.')).toBeDefined();
  });

  it('loads the overview for an authenticated administrator', async () => {
    mocks.authUser = {
      email: 'admin@tastes.com',
      getIdTokenResult: async () => ({ claims: { role: 'admin' } }),
    };
    mocks.callAdmin.mockResolvedValue(overview);

    render(<AdminApp />);

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeDefined();
    await waitFor(() => expect(mocks.callAdmin).toHaveBeenCalledWith('getAdminOverview', {}));
    expect(await screen.findByText('12')).toBeDefined();
  });
});
