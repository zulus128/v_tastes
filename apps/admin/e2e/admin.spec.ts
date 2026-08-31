import { expect, test, type Page } from '@playwright/test';

const password = 'E2e-password-123';

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('rejects an authenticated account without a staff role', async ({ page }) => {
  await signIn(page, 'member.e2e@tastes.test');

  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await expect(page.getByText('does not have an admin or moderator role')).toBeVisible();
});

test('signs an administrator in and loads backend overview data', async ({ page }) => {
  await signIn(page, 'admin.e2e@tastes.test');

  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('Total users')).toBeVisible();
  await expect(page.getByText('The moderation queue is clear')).toBeVisible();
});

test('opens the moderation queue through the real backend callable', async ({ page }) => {
  await signIn(page, 'admin.e2e@tastes.test');
  await page.getByRole('button', { name: 'Moderation' }).click();

  await expect(page.getByRole('heading', { name: 'Moderation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No pending reports' })).toBeVisible();
});
