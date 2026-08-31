import { defineConfig, devices } from '@playwright/test';

const projectId = 'demo-tastes-e2e';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3001',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `NEXT_PUBLIC_FIREBASE_PROJECT_ID=${projectId} NEXT_PUBLIC_FIREBASE_API_KEY=fake-api-key NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9101 NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_HOST=127.0.0.1:5002 pnpm build && pnpm start`,
    url: 'http://127.0.0.1:3001',
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
