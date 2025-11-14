import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

export default defineConfig({
  build: {
    outDir: 'dist/plugin',
    emptyOutDir: true,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'plugin/popup.html'),
        content: path.resolve(__dirname, 'plugin/content/index.ts'),
        background: path.resolve(__dirname, 'plugin/background/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].[hash].js',
        dir: 'dist/plugin',
        format: 'es',
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'copy-manifest',
      writeBundle() {
        // Copy manifest.json to dist
        execSync('cp plugin/manifest.json dist/plugin/manifest.json');
        // Copy styles
        execSync('mkdir -p dist/plugin/styles');
        execSync('cp plugin/styles/popup.css dist/plugin/styles/popup.css');
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
