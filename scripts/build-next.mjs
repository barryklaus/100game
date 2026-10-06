import { build } from 'esbuild';
import { writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

await build({ entryPoints: ['worker/next-pages.ts'], outfile: 'dist-next/_worker.js', bundle: true, format: 'esm', platform: 'neutral', target: 'es2022' });
await build({ entryPoints: ['src/ui/CardDeckGallery.ts'], outfile: 'dist-next/card-redesign/deck.js', bundle: true, format: 'iife', minify: true, target: 'es2022' });
await build({ entryPoints: ['src/ui/CardHoloPreview.ts'], outfile: 'dist-next/card-redesign/hologram.js', bundle: true, format: 'iife', minify: true, target: 'es2022' });
await writeFile('dist-next/_routes.json', JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }));
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await writeFile('dist-next/release.json', JSON.stringify({ version: '100next', commit, builtAt: new Date().toISOString() }));
await writeFile('dist-next/_headers', '/release.json\n  Cache-Control: no-store\n');
const html = await readFile('dist-next/index.html', 'utf8');
await writeFile('dist-next/index.html', html.replace(/<title>.*?<\/title>/, '<title>100next — We were friends before this.</title>')
  .replace(/<meta name="description" content="[^"]*"\s*\/>/, '<meta name="description" content="We were friends before this. Make it someone else’s problem. A card game for 2–8 players." />'));
console.log(`Built 100next (${commit.slice(0, 7)}) with a separate hosted room service.`);
