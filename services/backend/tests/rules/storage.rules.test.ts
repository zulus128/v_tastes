import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let testEnvironment: RulesTestEnvironment;
const projectId = process.env.TEST_PROJECT_ID ?? 'demo-tastes';

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    storage: {
      host: '127.0.0.1',
      port: 9198,
      rules: readFileSync('services/backend/firebase/storage.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnvironment.clearStorage();
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe('Storage security rules', () => {
  it('allows an owner to upload a compact avatar and authenticated users to read it', async () => {
    const ownerStorage = testEnvironment.authenticatedContext('user-a').storage();
    const readerStorage = testEnvironment.authenticatedContext('user-b').storage();
    const path = 'profile-images/user-a/avatar.jpg';

    await assertSucceeds(
      ownerStorage.ref(path).put(new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' }),
    );
    await assertSucceeds(readerStorage.ref(path).getDownloadURL());
  });

  it('rejects oversized avatars and uploads to another user profile', async () => {
    const ownerStorage = testEnvironment.authenticatedContext('user-a').storage();
    const attackerStorage = testEnvironment.authenticatedContext('user-b').storage();
    const path = 'profile-images/user-a/avatar.jpg';

    await assertFails(
      ownerStorage.ref(path).put(new Uint8Array(750 * 1024), { contentType: 'image/jpeg' }),
    );
    await assertFails(
      attackerStorage.ref(path).put(new Uint8Array([1]), { contentType: 'image/jpeg' }),
    );
  });

  it('allows an owner to upload and authenticated users to read a dish image', async () => {
    const ownerStorage = testEnvironment.authenticatedContext('user-a').storage();
    const readerStorage = testEnvironment.authenticatedContext('user-b').storage();
    const path = 'review-images/user-a/review-command/dish-one';

    await assertSucceeds(
      ownerStorage.ref(path).put(new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' }),
    );
    await assertSucceeds(readerStorage.ref(path).getDownloadURL());
  });

  it('denies uploads to another user folder and anonymous reads', async () => {
    const attackerStorage = testEnvironment.authenticatedContext('user-b').storage();
    const anonymousStorage = testEnvironment.unauthenticatedContext().storage();
    const path = 'review-images/user-a/review-command/dish-one';

    await assertFails(
      attackerStorage.ref(path).put(new Uint8Array([1]), { contentType: 'image/jpeg' }),
    );
    await assertFails(anonymousStorage.ref(path).getDownloadURL());
  });

  it('denies non-image uploads', async () => {
    const ownerStorage = testEnvironment.authenticatedContext('user-a').storage();

    await assertFails(
      ownerStorage
        .ref('review-images/user-a/review-command/not-an-image')
        .put(new Uint8Array([1]), { contentType: 'text/plain' }),
    );
  });
});
