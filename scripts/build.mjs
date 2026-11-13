import { build } from 'esbuild';
import { mkdir, cp, rm } from 'node:fs/promises';
import sharp from 'sharp';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/renderer', { recursive: true });
await build({ entryPoints: ['src/main/main.ts'], outfile: 'dist/main.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['electron', 'sharp'], sourcemap: true });
await build({ entryPoints: ['src/main/preload.ts'], outfile: 'dist/preload.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['electron'] });
await build({ entryPoints: ['src/renderer/index.tsx'], outdir: 'dist/renderer', bundle: true, platform: 'browser', target: 'chrome142', minify: true, sourcemap: true, define: { 'process.env.NODE_ENV': '"production"' } });
await cp('src/renderer/index.html', 'dist/renderer/index.html');
await cp('sample', 'dist/sample', { recursive: true });
await mkdir('build', { recursive: true });
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="72" y="72" width="880" height="880" rx="198" fill="#2e353b"/><path d="M310 244h226c129 0 190 62 190 151 0 55-24 95-69 117 60 24 91 69 91 134 0 95-69 156-201 156H310V244zm112 98v127h105c56 0 85-23 85-65 0-40-29-62-85-62H422zm0 222v139h117c61 0 93-24 93-70 0-45-32-69-93-69H422z" fill="#fafbf7"/><rect x="735" y="736" width="128" height="128" rx="18" fill="#a2c2fc"/><rect x="216" y="216" width="30" height="30" fill="#7897bd"/></svg>`;
await sharp(Buffer.from(icon)).png().toFile('build/icon.png');
console.log('Built desktop app, renderer, and sample assets.');
