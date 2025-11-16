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
    port: process.env.PORT ? parseInt(process.env.PORT) : 5000,
    host: '0.0.0.0',
    strictPort: false, // 允许 Vercel 使用不同端口
    // @ts-ignore
    allowedHosts: process.env.TEMPO === "true" ? true : true,
    hmr: process.env.TEMPO === "true" ? false : {
      // 不指定 clientPort，让 Vite 自动使用当前服务器端口
      // 这样无论是 3000 (vercel dev) 还是 5000 (vite dev) 都能正常工作
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