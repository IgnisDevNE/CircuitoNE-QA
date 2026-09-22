import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: process.env.QA_TEST_DIR || './tests/e2e',
  forbidOnly: true,
  retries: 0,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:5182',
    locale: 'pt-BR',
    timezoneId: 'America/Fortaleza',
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
  ],
})
