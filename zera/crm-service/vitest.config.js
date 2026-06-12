import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    exclude: ['**/node_modules/**', '**/dist/**', 'frontend/**'],
    env: {
      DATABASE_URL: 'postgresql://zera:zera@localhost:5432/zera_db',
      REDIS_URL: 'redis://localhost:6379',
    },
  },
});
