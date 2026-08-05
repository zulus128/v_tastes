import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email || (role !== 'admin' && role !== 'moderator')) {
    throw new Error('Usage: pnpm admin:set-role <email> <admin|moderator>');
  }

  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? 'tastes-934e6';
  if (getApps().length === 0) initializeApp({ projectId });

  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, { ...user.customClaims, role });
  console.info(`Assigned ${role} role to ${email} (${user.uid}) in ${projectId}.`);
}

void main();
