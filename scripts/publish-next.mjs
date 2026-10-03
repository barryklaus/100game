import { guardNextRelease, deployNext, run } from './next-release.mjs';
guardNextRelease();
run('pnpm', ['test']);
run('pnpm', ['test:next']);
run('pnpm', ['build:next']);
run('git', ['push', '-u', 'origin', '100next']);
deployNext();
