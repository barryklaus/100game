import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: ['cloudflare', '100next'].includes(mode) ? '/' : '/100game/',
  build: { outDir: mode === '100next' ? 'dist-next' : 'dist' },
}));
