import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // In production the admin app is served from https://<domain>/console/ (see deploy/nginx).
  base: process.env.ADMIN_BASE ?? '/',
  server: { port: 5173, strictPort: true },
  build: { sourcemap: false, outDir: 'dist' },
  test: { include: ['src/**/*.test.ts'] },
} as never);
