// @ts-check
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    // The legal pages are generated (with placeholders when legal/owner.json is missing), then the server starts.
    command: 'node scripts/legal.js && npm start',
    url: 'http://localhost:8080',
    env: {
      NODE_ENV: 'development',
      LEAKCHECK_DATA_DIR: 'tests/fixtures/data',
      LEAKCHECK_REFRESH: '0',
      LEAKCHECK_DEV_CLIENT_IP4: '81.2.69.142',
      LEAKCHECK_DEV_CLIENT_IP6: '2001:480:10::1',
    },
  },
});
