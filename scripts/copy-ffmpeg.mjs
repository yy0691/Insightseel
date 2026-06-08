/**
 * Copy @ffmpeg/core ESM files into public/ffmpeg/ so they can be served
 * from the same origin (no CORS issues, no CDN reliability concerns).
 *
 * Runs automatically via the `postinstall` hook after `pnpm install`.
 * Set VITE_FFMPEG_BASE_URL=/ffmpeg (or leave unset — the code uses this path as default).
 */
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const srcDir = resolve(root, 'node_modules/@ffmpeg/core/dist/esm');
const destDir = resolve(root, 'public/ffmpeg');

const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

if (!existsSync(srcDir)) {
  console.warn('[copy-ffmpeg] @ffmpeg/core not found in node_modules — skipping.');
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });

for (const file of files) {
  const src = resolve(srcDir, file);
  const dest = resolve(destDir, file);
  copyFileSync(src, dest);
  console.log(`[copy-ffmpeg] Copied ${file} → public/ffmpeg/`);
}

console.log('[copy-ffmpeg] Done. Set VITE_FFMPEG_BASE_URL=/ffmpeg in your .env');
