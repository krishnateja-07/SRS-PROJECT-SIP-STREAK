import { defineConfig } from '@playwright/test'

// E2E runs against the production build served by `vite preview`. WebGL uses SwiftShader so the 3D canvas works headless in CI.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM || undefined,
      args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
    },
  },
  webServer: [
    // local API (file-backed, throwaway data dir) so the app runs in shared mode exactly as in production
    { command: 'node server/dev.mjs', url: 'http://localhost:4000/api/health', reuseExistingServer: !process.env.CI, timeout: 30_000, env: { SIPSTREAK_DATA_DIR: '.data-e2e', LOG_LEVEL: 'silent' } },
    { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, timeout: 60_000 },
  ],
})
