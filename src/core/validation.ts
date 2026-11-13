import { isCodePoint, codePointLabel } from './mapping';
import type { FontProject } from './types';

export interface ValidationIssue { level: 'error' | 'warning'; message: string; key?: string }
export const MAX_GLYPHS = 2048;
export const MAX_PIXELS = 64 * 1024 * 1024;
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 128 * 1024 * 1024;
export const integer = (v: unknown, min = -32768, max = 32767): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

export function validateProject(p: FontProject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (message: string, key?: string) => issues.push({ level: 'error', message, key });
  if (!p.name.trim() || p.name.length > 100 || /["\r\n\x00-\x1f]/.test(p.name)) error('字体名称需为 1–100 个字符，不能包含双引号或换行。');
  if (!integer(p.settings.lineHeight, 1)) error('行高必须为 1–32767 的整数。');
  if (!integer(p.settings.base, 0)) error('基线必须为 0–32767 的整数。');
  if (!integer(p.settings.fontSize, 1)) error('字号必须为 1–32767 的整数。');
  if (!integer(p.settings.letterSpacing, -1024, 1024)) error('字间距必须为 -1024–1024 的整数。');
  if (!integer(p.settings.padding, 0, 32)) error('图集留白必须为 0–32 的整数。');
  if (![64, 128, 256, 512, 1024, 2048, 4096, 8192].includes(p.settings.maxSize)) error('图集上限必须为 64–8192 的 2 次幂。');
  if (p.glyphs.length > MAX_GLYPHS) error(`最多支持 ${MAX_GLYPHS} 个字符。`);
  const included = p.glyphs.filter(g => g.included);
  if (!included.length) error('请先导入至少一个字符。');
  const ids = new Set<number>();
  for (const g of included) {
    if (!isCodePoint(g.codePoint)) error(`${g.fileName} 尚未映射到有效字符。`, g.key);
    else if (ids.has(g.codePoint)) error(`${g.fileName} 与其他图片重复映射到 ${codePointLabel(g.codePoint)}。`, g.key);
    else ids.add(g.codePoint);
    if (![g.xoffset, g.yoffset, g.xadvance].every(v => integer(v))) error(`${g.fileName} 的偏移和前进量必须为 -32768–32767 的整数。`, g.key);
    if (g.codePoint !== null && g.codePoint > 0xffff) issues.push({ level: 'warning', message: `${codePointLabel(g.codePoint)} 超出 BMP，请确认引擎版本支持。`, key: g.key });
  }
  if (included.some(g => g.yoffset + g.height > p.settings.lineHeight)) issues.push({ level: 'warning', message: '部分字符超出行高，多行文字可能重叠。' });
  return issues;
}
