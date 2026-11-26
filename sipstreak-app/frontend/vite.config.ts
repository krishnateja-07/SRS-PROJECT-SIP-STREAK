import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:4000' } },
  preview: { proxy: { '/api': 'http://localhost:4000' } },
  build: { chunkSizeWarningLimit: 2000 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      // The logic modules and the API. React state (store.tsx) and routing hooks are exercised in the browser, not here.
      include: ['src/lib/calc.ts', 'src/lib/remote.ts', 'src/lib/seed.ts', 'api/**'],
      reporter: ['text', 'lcov'],
      thresholds: { statements: 85, lines: 85, functions: 85, branches: 75 },
    },
  },
})
