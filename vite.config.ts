import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
  },
  // Explicitly define environment variables for Vercel deployment
  // This ensures VITE_* variables are properly embedded at build time
  define: {
    'import.meta.env.VITE_USE_PROXY': JSON.stringify(process.env.VITE_USE_PROXY),
    'import.meta.env.VITE_MODEL': JSON.stringify(process.env.VITE_MODEL),
    'import.meta.env.VITE_BASE_URL': JSON.stringify(process.env.VITE_BASE_URL),
  }
});
