import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let testEnvironment: RulesTestEnvironment;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: 'demo-tastes',
    firestore: {
      rules: readFileSync('firebase/firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'venues', 'active'), { name: 'Active', city: 'Istanbul', status: 'active' });
    await setDoc(doc(db, 'venues', 'hidden'), { name: 'Hidden', city: 'Istanbul', status: 'hidden' });
    await setDoc(doc(db, 'reviews', 'published'), {
      authorId: 'user-a',
      status: 'published',
      createdAt: new Date(),
    });
  });
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe('Firestore security rules', () => {
  it('denies anonymous venue reads', async () => {
    const db = testEnvironment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'venues', 'active')));
  });

  it('allows authenticated users to read active venues', async () => {
    const db = testEnvironment.authenticatedContext('user-a').firestore();
    await assertSucceeds(getDoc(doc(db, 'venues', 'active')));
  });

  it('denies hidden venues to ordinary users', async () => {
    const db = testEnvironment.authenticatedContext('user-a').firestore();
    await assertFails(getDoc(doc(db, 'venues', 'hidden')));
  });

  it('allows published review reads but denies direct writes', async () => {
    const db = testEnvironment.authenticatedContext('user-a').firestore();
    await assertSucceeds(getDoc(doc(db, 'reviews', 'published')));
    await assertFails(setDoc(doc(db, 'reviews', 'new'), { authorId: 'user-a', status: 'published' }));
  });
});
