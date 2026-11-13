import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { importBMFont, exportFontFiles } from '../src/main/files';

vi.mock('node:fs/promises', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, rename: vi.fn(original.rename) };
});
let directory = '';
afterEach(async () => { vi.mocked(rename).mockRestore(); if (directory) await rm(directory, { recursive: true, force: true }); });

it('restores both original files if committing the descriptor fails after PNG replacement', async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'bmfont-rollback-'));
  const { project } = await importBMFont(path.resolve('sample/bonusGold.fnt'));
  const target = path.join(directory, 'gold.fnt'), png = path.join(directory, 'gold.png');
  await writeFile(target, 'original descriptor'); await writeFile(png, 'original pixels');
  const original = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  vi.mocked(rename).mockImplementation(async (from, to) => {
    if (String(from).endsWith('.tmp') && to === target) throw new Error('Injected descriptor commit failure');
    return original.rename(from, to);
  });
  await expect(exportFontFiles(project, target, true)).rejects.toThrow('Injected descriptor commit failure');
  expect(await readFile(target, 'utf8')).toBe('original descriptor');
  expect(await readFile(png, 'utf8')).toBe('original pixels');
  expect((await readdir(directory)).sort()).toEqual(['gold.fnt', 'gold.png']);
});
