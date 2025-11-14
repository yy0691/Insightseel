import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, readFileSync, writeFileSync, renameSync } from 'fs';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

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
        'bilibili-sidebar': path.resolve(__dirname, 'plugin/injected/video-sidebar.tsx'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].[hash].js',
        dir: 'dist/plugin',
        format: 'es',
      },
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },
  plugins: [
    react(),
    {
      name: 'copy-manifest',
      writeBundle() {
        // Move popup.html from plugin/ subdirectory to root
        const popupHtmlSrc = path.resolve(__dirname, 'dist/plugin/plugin/popup.html');
        const popupHtmlDest = path.resolve(__dirname, 'dist/plugin/popup.html');
        
        if (existsSync(popupHtmlSrc)) {
          // Read the HTML file and update script paths
          let htmlContent = readFileSync(popupHtmlSrc, 'utf-8');
          // Replace absolute paths with relative paths for Chrome extension
          // Fix script path: /popup.js -> popup.js
          htmlContent = htmlContent.replace(/src="\/popup\.js"/g, 'src="popup.js"');
          // Fix CSS path: /assets/... -> assets/...
          htmlContent = htmlContent.replace(/href="\/assets\//g, 'href="assets/');
          // Write the updated HTML to the correct location
          writeFileSync(popupHtmlDest, htmlContent, 'utf-8');
          
          // Remove the plugin subdirectory if it's empty
          try {
            const pluginDir = path.resolve(__dirname, 'dist/plugin/plugin');
            const files = readdirSync(pluginDir);
            if (files.length === 0) {
              // Directory is empty, but we can't remove it easily, so just leave it
            }
          } catch (e) {
            // Ignore errors
          }
        }
        
        // Copy manifest.json to dist
        const manifestSrc = path.resolve(__dirname, 'plugin/manifest.json');
        const manifestDest = path.resolve(__dirname, 'dist/plugin/manifest.json');
        copyFileSync(manifestSrc, manifestDest);
        
        // Create styles directory if it doesn't exist
        const stylesDir = path.resolve(__dirname, 'dist/plugin/styles');
        if (!existsSync(stylesDir)) {
          mkdirSync(stylesDir, { recursive: true });
        }
        
        // Copy styles
        const cssSrc = path.resolve(__dirname, 'plugin/styles/popup.css');
        const cssDest = path.resolve(__dirname, 'dist/plugin/styles/popup.css');
        copyFileSync(cssSrc, cssDest);
        
        // Copy assets directory
        const assetsSrc = path.resolve(__dirname, 'plugin/assets');
        const assetsDest = path.resolve(__dirname, 'dist/plugin/assets');
        
        if (existsSync(assetsSrc)) {
          // Create assets directory if it doesn't exist
          if (!existsSync(assetsDest)) {
            mkdirSync(assetsDest, { recursive: true });
          }
          
          // Copy all files in assets directory
          const files = readdirSync(assetsSrc);
          for (const file of files) {
            const srcPath = path.join(assetsSrc, file);
            const destPath = path.join(assetsDest, file);
            const stat = statSync(srcPath);
            if (stat.isFile()) {
              copyFileSync(srcPath, destPath);
            }
          }
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
