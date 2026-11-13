import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { importDirectory, importBMFont, readProject, saveProject, exportFontFiles, hydrateProject } from '../src/main/files';
import { decodeGlyph } from '../src/main/images';
import { packFont } from '../src/core/packing';
import { parseBMFont } from '../src/core/bmfont';

const dirs: string[] = [];
async function directory() { const d = await mkdtemp(path.join(tmpdir(), 'bmfont-test-')); dirs.push(d); return d; }
async function image(file: string, color = '#ff9933') {
  await sharp({ create: { width: 12, height: 18, channels: 4, background: color } }).png().toFile(file);
}
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });

describe('real image import and export', () => {
  it('imports images by filenames and reports invalid/unrelated files', async () => {
    const d = await directory(); await image(path.join(d, '0.png')); await image(path.join(d, 'U+002B.png'));
    await writeFile(path.join(d, 'broken.png'), 'bad'); await writeFile(path.join(d, 'notes.txt'), 'ignore');
    await mkdir(path.join(d, 'sub')); await image(path.join(d, 'sub', 'X.png'));
    const result = await importDirectory(d);
    expect(result.project.glyphs.map(g => g.codePoint).sort()).toEqual([43, 48]);
    expect(result.warnings.some(w => w.includes('broken.png'))).toBe(true);
    expect(result.project.glyphs[0].image).toMatch(/^data:image\/png;base64,/);
  });
  it('loads sample glyphs and exports exact source pixels with canonical metrics', async () => {
    const { project: p } = await importBMFont(path.resolve('sample/bonusGold.fnt'));
    expect(p.glyphs).toHaveLength(13); expect(p.settings.lineHeight).toBe(32);
    const d = await directory(); const file = path.join(d, 'gold.fnt');
    await exportFontFiles(p, file);
    const parsed = parseBMFont(await readFile(file, 'utf8'));
    expect(parsed.pages[0].file).toBe('gold.png');
    expect(parsed.chars.map(g => g.id)).toEqual([43, 45, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 120]);
    const g = parsed.chars.find(g => g.id === 48)!;
    const out = await sharp(path.join(d, 'gold.png')).extract({ left: g.x, top: g.y, width: g.width, height: g.height }).raw().toBuffer();
    const source = await sharp('sample/bonusGold.png').extract({ left: 148, top: 0, width: 73, height: 90 }).raw().toBuffer();
    expect(out.equals(source)).toBe(true);
  });
  it('saves portable projects with edited metrics and embedded images', async () => {
    const { project: p } = await importBMFont(path.resolve('sample/bonusGold.fnt'));
    p.glyphs[0].xoffset = -7; p.glyphs[0].included = false; p.previewText = '+100';
    const file = path.join(await directory(), 'portable.bmfont'); await saveProject(p, file);
    const loaded = (await readProject(file)).project;
    expect(loaded).toEqual(p); expect(packFont(loaded).glyphs).toHaveLength(12);
  });
  it('refuses overwrites until explicitly requested', async () => {
    const { project: p } = await importBMFont(path.resolve('sample/bonusGold.fnt'));
    const d = await directory(); const file = path.join(d, 'gold.fnt');
    await writeFile(file, 'original');
    await expect(exportFontFiles(p, file)).rejects.toThrow(/已存在/);
    expect(await readFile(file, 'utf8')).toBe('original');
    await exportFontFiles(p, file, true); expect(parseBMFont(await readFile(file, 'utf8')).chars).toHaveLength(13);
  });
  it('does not move directories when an export name collides with a folder', async () => {
    const { project: p } = await importBMFont(path.resolve('sample/bonusGold.fnt'));
    const d = await directory(); await mkdir(path.join(d, 'gold.png')); await writeFile(path.join(d, 'gold.png', 'keep.txt'), 'keep');
    await expect(exportFontFiles(p, path.join(d, 'gold.fnt'), true)).rejects.toThrow(/普通文件/);
    expect(await readFile(path.join(d, 'gold.png', 'keep.txt'), 'utf8')).toBe('keep');
  });
  it('rejects chosen export filenames that would break quoted BMFont page records', async () => {
    const { project: p } = await importBMFont(path.resolve('sample/bonusGold.fnt'));
    const d = await directory();
    await expect(exportFontFiles(p, path.join(d, 'bad"name.fnt'))).rejects.toThrow(/文件名/);
    await expect(exportFontFiles(p, path.join(d, 'bad\nname.fnt'))).rejects.toThrow(/文件名/);
  });
  it('normalizes embedded PNG orientation along with its metrics', async () => {
    const { project: p } = await importBMFont(path.resolve('sample/bonusGold.fnt'));
    const png = await sharp({ create: { width: 2, height: 3, channels: 4, background: '#ff0000' } }).withMetadata({ orientation: 6 }).png().toBuffer();
    p.glyphs = [p.glyphs[0]]; p.glyphs[0].image = `data:image/png;base64,${png.toString('base64')}`;
    const normalized = await hydrateProject(p);
    const meta = await sharp(Buffer.from(normalized.glyphs[0].image.split(',')[1], 'base64')).metadata();
    expect([meta.width, meta.height]).toEqual([3, 2]);
    await expect(exportFontFiles(normalized, path.join(await directory(), 'oriented.fnt'))).resolves.toBeUndefined();
  });
  it('does not silently remap ambiguous names and rejects an empty directory', async () => {
    const d = await directory(); await expect(importDirectory(d)).rejects.toThrow(/图片/);
    await image(path.join(d, '10.png'));
    expect((await importDirectory(d)).project.glyphs[0].codePoint).toBeNull();
  });
  it('rejects corrupt projects and page traversal', async () => {
    const d = await directory(); const project = path.join(d, 'bad.bmfont');
    await writeFile(project, '{"version":1,"glyphs":null}'); await expect(readProject(project)).rejects.toThrow();
    const fnt = (await readFile('sample/bonusGold.fnt', 'utf8')).replace('bonusGold.png', '../bonusGold.png');
    const f = path.join(d, 'bad.fnt'); await writeFile(f, fnt); await expect(importBMFont(f)).rejects.toThrow(/同一目录/);
  });
  it('rejects duplicate source keys and invalid data URLs', async () => {
    const { project: p } = await importBMFont(path.resolve('sample/bonusGold.fnt'));
    const file = path.join(await directory(), 'bad.bmfont'); p.glyphs[1].key = p.glyphs[0].key;
    await writeFile(file, JSON.stringify(p)); await expect(readProject(file)).rejects.toThrow(/重复/);
    p.glyphs[1].key = 'fixed'; p.glyphs[0].image = 'file:///etc/passwd';
    await writeFile(file, JSON.stringify(p)); await expect(readProject(file)).rejects.toThrow(/图片/);
  });
  it('detects alpha bounds without clipping low-opacity pixels', async () => {
    const bytes = Buffer.alloc(4 * 6 * 4); bytes[(2 * 4 + 1) * 4 + 3] = 1;
    const png = await sharp(bytes, { raw: { width: 4, height: 6, channels: 4 } }).png().toBuffer();
    const g = await decodeGlyph(png, 'A.png');
    expect(g.trim).toEqual({ x: 1, y: 2, width: 1, height: 1 });
  });
});
