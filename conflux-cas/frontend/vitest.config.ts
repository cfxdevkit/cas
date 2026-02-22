import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // No test files are required; the suite is intentionally sparse in Sprint 1
    passWithNoTests: true,
  },
});
