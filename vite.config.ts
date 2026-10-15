import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const buildId=execFileSync('git',['rev-parse','--short=7','HEAD'],{encoding:'utf8'}).trim();
const appVersion=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8')).version;

export default defineConfig(({ mode }) => ({
  base: ['cloudflare', '100next'].includes(mode) ? '/' : '/100game/',
  define:{'import.meta.env.VITE_BUILD_ID':JSON.stringify(buildId),'import.meta.env.VITE_APP_VERSION':JSON.stringify(appVersion)},
  build: { outDir: mode === '100next' ? 'dist-next' : 'dist' },
}));
