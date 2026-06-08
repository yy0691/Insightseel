import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@assets': path.resolve(__dirname, 'attached_assets'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    // The plugin popup test stub references components that are not yet exported
    // and depends on @testing-library/react which is not installed. It is tracked
    // as a follow-up item in @docs/QA_MANUAL_CHECKLIST.md.
    exclude: ['node_modules/**', 'dist/**', 'plugin/**'],
  },
});
