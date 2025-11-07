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
    allowedHosts: true as const,
    hmr: {
      clientPort: 5000,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
