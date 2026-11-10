import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the real stack: the built static site, the Express API on an embedded
 * MongoDB, and the built admin app. Headless Chromium renders WebGL with SwiftShader (software),
 * so frame rates here say nothing about real phones.
 */
const webgl = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    launchOptions: { args: webgl },
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: { args: webgl } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { args: webgl } } },
  ],
  webServer: [
    {
      command: 'npm run dev:memory -w @lattice/api',
      url: 'http://localhost:4000/v1/health',
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: 'node apps/web/scripts/serve.mjs apps/web/out 3000',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
    },
    {
      command: 'npm run preview -w @lattice/admin',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
    },
  ],
});
