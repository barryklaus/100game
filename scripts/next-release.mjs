import { execFileSync } from 'node:child_process';

export function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' });
}

export function guardNextRelease() {
  const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
  if (branch !== '100next') throw new Error('100next publishing requires the 100next branch. The stable build is protected.');
  const changes = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' }).trim();
  if (changes) throw new Error('Commit the changes before publishing, so the live release matches GitHub.');
}

export function deployNext() {
  // The stable wrangler.jsonc is deliberately never used here.
  run('pnpm', ['exec', 'wrangler', 'deploy', '--config', 'wrangler.next-rooms.jsonc']);
  run('pnpm', ['exec', 'wrangler', 'pages', 'deploy', '../../dist-next', '--cwd', 'hosting/next', '--project-name', '100next', '--branch', '100next']);
  run('node', ['scripts/verify-next-live.mjs']);
}
