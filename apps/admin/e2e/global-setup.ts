import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const projectId = 'demo-tastes-e2e';
const password = 'E2e-password-123';

async function waitForAuthEmulator() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      await fetch('http://127.0.0.1:9101');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('Firebase Auth Emulator did not become ready.');
}

async function replaceUser(email: string, role?: 'admin') {
  const auth = getAuth();
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.deleteUser(existing.uid);
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
  }

  const user = await auth.createUser({ email, password, emailVerified: true });
  if (role) await auth.setCustomUserClaims(user.uid, { role });
}

export default async function globalSetup() {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9101';
  await waitForAuthEmulator();
  if (getApps().length === 0) initializeApp({ projectId });

  await replaceUser('admin.e2e@tastes.test', 'admin');
  await replaceUser('member.e2e@tastes.test');
}
