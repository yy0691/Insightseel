import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Debug: Log environment variables during build
console.log('Build-time environment variables:');
console.log('VITE_USE_PROXY:', process.env.VITE_USE_PROXY);
console.log('VITE_MODEL:', process.env.VITE_MODEL);
console.log('VITE_BASE_URL:', process.env.VITE_BASE_URL);

export default defineConfig({
  server: {
    port: 5000,
    host: '0.0.0.0',
    strictPort: true, // Don't try other ports if 5000 is busy
    allowedHosts: true as const,
    hmr: {
      clientPort: 5000,
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@assets': path.resolve(__dirname, 'attached_assets'),
    }
  }
});
