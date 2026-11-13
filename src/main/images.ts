import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import type { FontAtlas, FontProject, Glyph, Rect } from '../core/types';
import { characterFromFilename } from '../core/mapping';
import { MAX_FILE_BYTES } from '../core/validation';

export function pngBytes(image: string): Buffer {
  const prefix = 'data:image/png;base64,';
  if (!image.startsWith(prefix) || image.length > MAX_FILE_BYTES * 1.4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.slice(prefix.length))) throw new Error('工程中的图片数据无效或过大。');
  const bytes = Buffer.from(image.slice(prefix.length), 'base64');
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('工程中的图片不是有效的 PNG。');
  return bytes;
}

export async function decodeGlyph(bytes: Buffer, fileName: string): Promise<Glyph> {
  if (bytes.length > MAX_FILE_BYTES) throw new Error('单张图片不能超过 32 MB。');
  const { data, info } = await sharp(bytes, { limitInputPixels: 16 * 1024 * 1024, failOn: 'error' }).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  if (width > 8192 || height > 8192) throw new Error('图片边长不能超过 8192 像素。');
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 0) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  const trim: Rect = right < 0 ? { x: 0, y: 0, width: 0, height: 0 } : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  const png = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { key: randomUUID(), fileName, codePoint: characterFromFilename(fileName), image: `data:image/png;base64,${png.toString('base64')}`,
    width, height, trim, xoffset: 0, yoffset: 0, xadvance: width, included: true };
}

export async function renderAtlas(p: FontProject, atlas: FontAtlas): Promise<Buffer> {
  const output = Buffer.alloc(atlas.width * atlas.height * 4);
  const sources = new Map(p.glyphs.map(g => [g.key, g]));
  for (const g of atlas.glyphs) {
    if (!g.width || !g.height) continue;
    const data = await sharp(pngBytes(sources.get(g.key)!.image), { limitInputPixels: 16 * 1024 * 1024 })
      .extract({ left: g.sourceX, top: g.sourceY, width: g.width, height: g.height }).ensureAlpha().raw().toBuffer();
    for (let y = 0; y < g.height; y++) data.copy(output, ((g.y + y) * atlas.width + g.x) * 4, y * g.width * 4, (y + 1) * g.width * 4);
  }
  return sharp(output, { raw: { width: atlas.width, height: atlas.height, channels: 4 } }).png().toBuffer();
}
