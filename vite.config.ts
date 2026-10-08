import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';

const buildId=execFileSync('git',['rev-parse','--short=7','HEAD'],{encoding:'utf8'}).trim();

export default defineConfig(({ mode }) => ({
  base: ['cloudflare', '100next'].includes(mode) ? '/' : '/100game/',
  define:{'import.meta.env.VITE_BUILD_ID':JSON.stringify(buildId)},
  build: { outDir: mode === '100next' ? 'dist-next' : 'dist' },
}));
