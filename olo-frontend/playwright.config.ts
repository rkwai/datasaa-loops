import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests-e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://app.local',
    headless: true,
  },
})
