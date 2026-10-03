import { build } from 'esbuild';
import { writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

await build({ entryPoints: ['worker/next-pages.ts'], outfile: 'dist-next/_worker.js', bundle: true, format: 'esm', platform: 'neutral', target: 'es2022' });
await writeFile('dist-next/_routes.json', JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }));
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await writeFile('dist-next/release.json', JSON.stringify({ version: '100next', commit, builtAt: new Date().toISOString() }));
await writeFile('dist-next/_headers', '/release.json\n  Cache-Control: no-store\n');
const html = await readFile('dist-next/index.html', 'utf8');
await writeFile('dist-next/index.html', html.replace(/<title>.*?<\/title>/, '<title>100next — Simple Numbers. Big Reactions.</title>'));
console.log(`Built 100next (${commit.slice(0, 7)}) with a separate hosted room service.`);
