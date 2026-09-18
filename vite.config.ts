import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({ base: mode === 'cloudflare' ? '/' : '/100game/' }));
