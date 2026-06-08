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
  plugins: [
    react(),
    // 自定义插件：跳过 HTML 文件的导入分析
    {
      name: 'skip-html-import-analysis',
      enforce: 'pre',
      transform(code: string, id: string) {
        if (id.endsWith('.html')) {
          return { code, map: null };
        }
      },
    },
    // Dev-only plugin: serve api/* Vercel handlers locally via ssrLoadModule
    // so `pnpm run dev` works without needing the vercel CLI.
    {
      name: 'api-dev-server',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use('/api', async (req, res, next) => {
          const urlPath = (req.url ?? '').split('?')[0];
          try {
            const mod = await server.ssrLoadModule(`/api${urlPath}.ts`);
            const handler = mod.default;
            if (typeof handler !== 'function') { next(); return; }

            // Parse JSON body for POST requests
            await new Promise<void>((resolve) => {
              if (req.method !== 'POST') { resolve(); return; }
              let raw = '';
              req.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
              req.on('end', () => {
                try { (req as any).body = JSON.parse(raw); } catch { (req as any).body = {}; }
                resolve();
              });
            });

            // Minimal Vercel-compatible response adapter
            const vRes: any = Object.assign(res, {
              status(code: number) { res.statusCode = code; return vRes; },
              json(data: unknown) {
                if (!res.headersSent) {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                }
                return vRes;
              },
              send(data: unknown) {
                if (!res.headersSent) res.end(String(data));
                return vRes;
              },
            });

            await handler(req, vRes);
          } catch (err) {
            console.error('[api-dev]', err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'API handler error (dev)' }));
            }
          }
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@assets': path.resolve(__dirname, 'attached_assets'),
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['framer-motion', 'lucide-react', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities', 'marked'],
          'ffmpeg': ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
          'ai-client': ['@google/genai', '@anthropic-ai/sdk'],
          'supabase': ['@supabase/supabase-js'],
        }
      }
    },
    chunkSizeWarningLimit: 1000,
  },
  // 配置 HTML 处理，避免解析 importmap 时出错
  html: {},
});