import type { FontProject, FontAtlas, Kerning } from './types';
import { integer } from './validation';
import { isCodePoint } from './mapping';

export interface BMChar { id: number; x: number; y: number; width: number; height: number; xoffset: number; yoffset: number; xadvance: number; page: number; chnl: number }
export interface BMFont { name: string; fontSize: number; lineHeight: number; base: number; width: number; height: number; pages: { id: number; file: string }[]; chars: BMChar[]; kernings: Kerning[] }

function attributes(line: string): Record<string, string> {
  return Object.fromEntries([...line.matchAll(/(\w+)=(?:"([^"]*)"|([^\s]+))/g)].map(m => [m[1], m[2] ?? m[3]]));
}

export function parseBMFont(source: string): BMFont {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim());
  const info = attributes(lines.find(l => l.startsWith('info ')) ?? '');
  const common = attributes(lines.find(l => l.startsWith('common ')) ?? '');
  const result: BMFont = { name: info.face ?? '', fontSize: Number(info.size), lineHeight: Number(common.lineHeight), base: Number(common.base), width: Number(common.scaleW), height: Number(common.scaleH), pages: [], chars: [], kernings: [] };
  if (!result.name || !integer(result.fontSize, 1) || !integer(result.lineHeight, 1) || !integer(result.base, 0) || !integer(result.width, 1, 8192) || !integer(result.height, 1, 8192)) throw new Error('不是有效的 BMFont 文本文件，或字体/图集尺寸超出支持范围。');
  if (Number(common.pages) !== 1) throw new Error('Cocos2d-x 模式仅支持单页 BMFont。');
  if (Number(common.packed ?? 0) !== 0) throw new Error('暂不支持通道打包的 BMFont，请使用完整 RGBA 图集。');
  const ids = new Set<number>();
  for (const line of lines) {
    const a = attributes(line);
    if (line.startsWith('page ')) result.pages.push({ id: Number(a.id), file: a.file });
    if (line.startsWith('char ')) {
      const char = Object.fromEntries(['id', 'x', 'y', 'width', 'height', 'xoffset', 'yoffset', 'xadvance', 'page', 'chnl'].map(k => [k, Number(a[k])])) as unknown as BMChar;
      if (!isCodePoint(char.id) || ids.has(char.id) || char.page !== 0 || ![char.x, char.y, char.width, char.height].every(v => integer(v, 0, 8192))
        || ![char.xoffset, char.yoffset, char.xadvance].every(v => integer(v)) || !integer(char.chnl, 0, 15)
        || char.x + char.width > result.width || char.y + char.height > result.height) throw new Error('BMFont 字符定义无效、重复或超出图集。');
      ids.add(char.id); result.chars.push(char);
    }
    if (line.startsWith('kerning ')) {
      const k = { first: Number(a.first), second: Number(a.second), amount: Number(a.amount) };
      if (!isCodePoint(k.first) || !isCodePoint(k.second) || !integer(k.amount)) throw new Error('BMFont 字偶间距定义无效。');
      result.kernings.push(k);
    }
  }
  if (result.pages.length !== 1 || result.pages[0].id !== 0 || !result.pages[0].file || result.chars.length === 0) throw new Error('BMFont 缺少单页图集或字符。');
  const count = Number(attributes(lines.find(l => l.startsWith('chars ')) ?? '').count);
  if (count !== result.chars.length) throw new Error('BMFont 声明的字符数量与实际定义不一致。');
  return result;
}

const xmlEscape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));

export function serializeBMFont(p: FontProject, atlas: FontAtlas, pageName: string, format: 'text' | 'xml'): string {
  const ids = new Set(atlas.glyphs.map(g => g.id));
  const kernings = p.kernings.filter(k => ids.has(k.first) && ids.has(k.second));
  const tags: [string, Record<string, string | number>][] = [
    ['info', { face: p.name, size: p.settings.fontSize, bold: 0, italic: 0, charset: '', unicode: 1, stretchH: 100, smooth: 1, aa: 1, padding: '0,0,0,0', spacing: `${p.settings.padding * 2},${p.settings.padding * 2}`, outline: 0 }],
    ['common', { lineHeight: p.settings.lineHeight, base: p.settings.base, scaleW: atlas.width, scaleH: atlas.height, pages: 1, packed: 0, alphaChnl: 0, redChnl: 0, greenChnl: 0, blueChnl: 0 }],
    ['page', { id: 0, file: pageName }],
    ...atlas.glyphs.map(g => ['char', { id: g.id, x: g.x, y: g.y, width: g.width, height: g.height, xoffset: g.xoffset, yoffset: g.yoffset, xadvance: g.xadvance, page: 0, chnl: 15 }] as [string, Record<string, number>]),
    ...kernings.map(k => ['kerning', { ...k }] as [string, Record<string, number>]),
  ];
  if (format === 'text') {
    const lines = tags.map(([tag, attrs]) => `${tag} ${Object.entries(attrs).map(([k, v]) => `${k}=${typeof v === 'string' ? `"${v}"` : v}`).join(' ')}`);
    lines.splice(3, 0, `chars count=${atlas.glyphs.length}`);
    lines.splice(4 + atlas.glyphs.length, 0, `kernings count=${kernings.length}`);
    return lines.join('\n') + '\n';
  }
  const tag = ([name, attrs]: [string, Record<string, string | number>]) => `<${name} ${Object.entries(attrs).map(([k, v]) => `${k}="${xmlEscape(String(v))}"`).join(' ')} />`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<font>\n  ${tag(tags[0])}\n  ${tag(tags[1])}\n  <pages>\n    ${tag(tags[2])}\n  </pages>\n  <chars count="${atlas.glyphs.length}">\n${tags.filter(t => t[0] === 'char').map(t => `    ${tag(t)}`).join('\n')}\n  </chars>\n  <kernings count="${kernings.length}">\n${tags.filter(t => t[0] === 'kerning').map(t => `    ${tag(t)}`).join('\n')}\n  </kernings>\n</font>\n`;
}
