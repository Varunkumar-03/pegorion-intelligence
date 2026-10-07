import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 60000, expect: { timeout: 15000 }, workers: 1,
  outputDir: 'test-results', use: { baseURL: 'http://127.0.0.1:3100', headless: true, trace: 'retain-on-failure' },
  webServer: { command: 'npm run build && npm run start -- --hostname 127.0.0.1 --port 3100', url: 'http://127.0.0.1:3100', timeout: 240000,
    env: { OPENAI_API_KEY: '', TOWER_DATA_URL: '', TOWER_DATA_TOKEN: '' }, reuseExistingServer: false },
});
