import { defineConfig } from '@playwright/test';

const baseURL = process.env.UI_BASE_URL || 'https://erpnext.local';

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  retries: 0,
  use: {
    baseURL,
    headless: true,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
