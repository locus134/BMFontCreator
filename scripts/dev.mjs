import { spawn } from 'node:child_process';
import { context } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import electron from 'electron';

await mkdir('dist/renderer', { recursive: true });
await cp('src/renderer/index.html', 'dist/renderer/index.html');
await cp('sample', 'dist/sample', { recursive: true });
const common = { bundle: true, sourcemap: true };
const contexts = await Promise.all([
  context({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main.cjs', platform: 'node', format: 'cjs', external: ['electron', 'sharp'] }),
  context({ ...common, entryPoints: ['src/main/preload.ts'], outfile: 'dist/preload.cjs', platform: 'node', format: 'cjs', external: ['electron'] }),
  context({ ...common, entryPoints: ['src/renderer/index.tsx'], outdir: 'dist/renderer', platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' } }),
]);
await Promise.all(contexts.map(c => c.watch()));
await Promise.all(contexts.map(c => c.rebuild()));
const app = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, BMFONT_DEV: '1' } });
app.on('exit', async code => { await Promise.all(contexts.map(c => c.dispose())); process.exit(code ?? 0); });
process.on('SIGINT', () => app.kill());
