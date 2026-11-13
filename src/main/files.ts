import { readFile, writeFile, stat, lstat, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createProject, type FontProject, type Glyph, type ImportResult } from '../core/types';
import { parseBMFont, serializeBMFont } from '../core/bmfont';
import { packFont } from '../core/packing';
import { isCodePoint } from '../core/mapping';
import { MAX_FILE_BYTES, MAX_GLYPHS, MAX_PIXELS, MAX_PROJECT_BYTES, integer } from '../core/validation';
import { decodeGlyph, pngBytes, renderAtlas } from './images';

async function boundedRead(file: string, limit: number): Promise<Buffer> {
  const meta = await stat(file);
  if (!meta.isFile() || meta.size > limit) throw new Error(`${path.basename(file)} 文件过大或不是普通文件。`);
  const bytes = await readFile(file);
  if (bytes.length > limit) throw new Error('文件超过大小限制。');
  return bytes;
}

export async function importDirectory(dir: string): Promise<ImportResult> {
  const entries = (await readdir(dir, { withFileTypes: true })).filter(e => e.isFile() && /\.(png|jpe?g|webp)$/i.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  if (entries.length > MAX_GLYPHS) throw new Error(`目录包含超过 ${MAX_GLYPHS} 张图片，请拆分目录。`);
  const glyphs: Glyph[] = [], warnings: string[] = [];
  let pixels = 0;
  for (const entry of entries) {
    try {
      const glyph = await decodeGlyph(await boundedRead(path.join(dir, entry.name), MAX_FILE_BYTES), entry.name);
      pixels += glyph.width * glyph.height;
      if (pixels > MAX_PIXELS) throw new Error('所有图片的总像素超过 6400 万，请拆分目录。');
      glyphs.push(glyph);
    } catch (error) {
      if (pixels > MAX_PIXELS) throw error;
      warnings.push(`${entry.name}：${error instanceof Error ? error.message : '图片读取失败'}`);
    }
  }
  if (!glyphs.length) throw new Error(`目录中没有可读取的 PNG、JPG 或 WebP 字符图片。${warnings[0] ?? ''}`);
  const project = createProject(path.basename(dir).normalize('NFC').replace(/["\r\n]/g, '').slice(0, 100) || 'Untitled', glyphs);
  for (const g of glyphs) g.yoffset = project.settings.lineHeight - g.height;
  project.previewText = glyphs.filter(g => g.codePoint !== null).map(g => String.fromCodePoint(g.codePoint!)).join('');
  return { project, warnings };
}

export async function importBMFont(file: string): Promise<ImportResult> {
  const fnt = parseBMFont((await boundedRead(file, 4 * 1024 * 1024)).toString('utf8'));
  if (fnt.chars.length > MAX_GLYPHS) throw new Error(`最多支持 ${MAX_GLYPHS} 个字符。`);
  const page = fnt.pages[0].file;
  if (path.basename(page) !== page || /[\\/\x00]/.test(page) || page === '.' || page === '..') throw new Error('BMFont 的图集必须与描述文件位于同一目录，且只能使用文件名。');
  const bytes = await boundedRead(path.join(path.dirname(file), page), MAX_FILE_BYTES);
  const image = sharp(bytes, { limitInputPixels: MAX_PIXELS });
  const meta = await image.metadata();
  if (meta.width !== fnt.width || meta.height !== fnt.height) throw new Error('PNG 图集的真实尺寸与 BMFont 描述不一致。');
  const glyphs: Glyph[] = [];
  let pixels = 0;
  for (const c of fnt.chars) {
    pixels += c.width * c.height;
    if (pixels > MAX_PIXELS) throw new Error('字体的总字符像素超过限制。');
    const fileName = `U+${c.id.toString(16).toUpperCase().padStart(4, '0')}.png`;
    const g: Glyph = c.width && c.height ? await decodeGlyph(await image.clone().extract({ left: c.x, top: c.y, width: c.width, height: c.height }).png().toBuffer(), fileName)
      : { key: randomUUID(), fileName, image: '', width: 0, height: 0, trim: { x: 0, y: 0, width: 0, height: 0 }, codePoint: c.id, xoffset: 0, yoffset: 0, xadvance: c.xadvance, included: true };
    Object.assign(g, { codePoint: c.id, xoffset: c.xoffset, yoffset: c.yoffset, xadvance: c.xadvance }); glyphs.push(g);
  }
  const project = createProject(path.basename(file, path.extname(file)).slice(0, 100), glyphs);
  Object.assign(project.settings, { lineHeight: fnt.lineHeight, base: fnt.base, fontSize: fnt.fontSize });
  project.kernings = fnt.kernings;
  project.previewText = glyphs.map(g => String.fromCodePoint(g.codePoint!)).join('');
  return { project, warnings: [] };
}

export async function hydrateProject(input: unknown): Promise<FontProject> {
  if (!input || typeof input !== 'object') throw new Error('无效的字体工程。');
  const p = input as FontProject;
  if (p.version !== 1 || typeof p.name !== 'string' || p.name.length > 100 || typeof p.previewText !== 'string' || p.previewText.length > 10000
    || !p.settings || !Array.isArray(p.glyphs) || p.glyphs.length > MAX_GLYPHS || !Array.isArray(p.kernings) || p.kernings.length > 50000) throw new Error('工程结构无效或超出支持范围。');
  const s = p.settings;
  if (!integer(s.lineHeight, 1) || !integer(s.base, 0) || !integer(s.fontSize, 1) || !integer(s.letterSpacing, -1024, 1024) || !integer(s.padding, 0, 32)
    || ![64, 128, 256, 512, 1024, 2048, 4096, 8192].includes(s.maxSize) || typeof s.trim !== 'boolean' || typeof s.powerOfTwo !== 'boolean' || !['text', 'xml'].includes(s.format)) throw new Error('工程的字体或图集参数无效。');
  const keys = new Set<string>(); let pixels = 0;
  const glyphs: Glyph[] = [];
  for (const g of p.glyphs) {
    if (!g || typeof g.key !== 'string' || !g.key || g.key.length > 128 || keys.has(g.key)) throw new Error('工程中存在无效或重复的字符标识。');
    keys.add(g.key);
    if (typeof g.fileName !== 'string' || g.fileName.length > 512 || typeof g.image !== 'string' || typeof g.included !== 'boolean'
      || !(g.codePoint === null || isCodePoint(g.codePoint)) || ![g.xoffset, g.yoffset, g.xadvance].every(v => integer(v))) throw new Error('工程中存在无效字符参数。');
    let decoded: Pick<Glyph, 'width' | 'height' | 'trim'>;
    let normalizedImage = g.image;
    if (!g.image && g.width === 0 && g.height === 0) decoded = { width: 0, height: 0, trim: { x: 0, y: 0, width: 0, height: 0 } };
    else { const normalized = await decodeGlyph(pngBytes(g.image), g.fileName); decoded = normalized; normalizedImage = normalized.image; }
    pixels += decoded.width * decoded.height;
    if (pixels > MAX_PIXELS) throw new Error('工程图片的总像素超过限制。');
    glyphs.push({ key: g.key, fileName: g.fileName, codePoint: g.codePoint, image: normalizedImage,
      width: decoded.width, height: decoded.height, trim: decoded.trim, included: g.included, xoffset: g.xoffset, yoffset: g.yoffset, xadvance: g.xadvance });
  }
  const kernings = p.kernings.map(k => {
    if (!k || !isCodePoint(k.first) || !isCodePoint(k.second) || !integer(k.amount)) throw new Error('工程中存在无效字偶间距。');
    return { first: k.first, second: k.second, amount: k.amount };
  });
  return { version: 1, name: p.name, settings: { fontSize: s.fontSize, lineHeight: s.lineHeight, base: s.base, letterSpacing: s.letterSpacing, padding: s.padding, maxSize: s.maxSize, powerOfTwo: s.powerOfTwo, trim: s.trim, format: s.format }, glyphs, kernings, previewText: p.previewText };
}

export async function readProject(file: string): Promise<ImportResult> {
  const bytes = await boundedRead(file, MAX_PROJECT_BYTES);
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('无法解析字体工程，请选择有效的 .bmfont 文件。'); }
  return { project: await hydrateProject(parsed), warnings: [], path: file };
}

export async function saveProject(project: FontProject, file: string): Promise<void> {
  const verified = await hydrateProject(project), data = JSON.stringify(verified);
  if (Buffer.byteLength(data) > MAX_PROJECT_BYTES) throw new Error('工程超过 128 MB，无法保存。');
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, data, { flag: 'wx' }); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}

export async function exists(file: string) {
  try { await stat(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

export function exportPaths(file: string) {
  const stem = file.replace(/\.(fnt|xml)$/i, '');
  if (/[<>:"\\|?*\x00-\x1f]/.test(path.basename(stem))) throw new Error('导出文件名不能包含双引号、换行或 < > : \\ | ? *，请使用跨平台兼容的名称。');
  return { descriptor: `${stem}.fnt`, png: `${stem}.png` };
}

export async function exportFontFiles(project: FontProject, file: string, overwrite = false): Promise<void> {
  const p = await hydrateProject(project), atlas = packFont(p);
  const paths = exportPaths(file), destinations = [paths.png, paths.descriptor];
  for (const destination of destinations) if (await exists(destination)) {
    const meta = await lstat(destination);
    if (!meta.isFile()) throw new Error(`${path.basename(destination)} 不是普通文件，不能覆盖目录或符号链接。`);
  }
  if (!overwrite && (await Promise.all(destinations.map(exists))).some(Boolean)) throw new Error('导出文件已存在，需要确认覆盖。');
  const image = await renderAtlas(p, atlas);
  const descriptor = serializeBMFont(p, atlas, path.basename(paths.png), p.settings.format);
  const id = randomUUID(), staged = destinations.map(f => `${f}.${id}.tmp`), backups = destinations.map(f => `${f}.${id}.bak`);
  const backedUp: number[] = [], committed: number[] = [];
  try {
    await writeFile(staged[0], image, { flag: 'wx' }); await writeFile(staged[1], descriptor, { flag: 'wx' });
    for (const [i, destination] of destinations.entries()) if (await exists(destination)) {
      if (!overwrite) throw new Error('导出文件已存在，需要确认覆盖。');
      await rename(destination, backups[i]); backedUp.push(i);
    }
    for (const [i, destination] of destinations.entries()) { await rename(staged[i], destination); committed.push(i); }
  } catch (error) {
    for (const i of committed) await rm(destinations[i], { force: true });
    for (const i of backedUp) await rename(backups[i], destinations[i]);
    throw error;
  } finally { await Promise.all(staged.map(f => rm(f, { force: true }))); }
  await Promise.all(backedUp.map(i => rm(backups[i], { force: true })));
}
