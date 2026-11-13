import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { characterFromFilename, characterFromInput } from '../src/core/mapping';
import { createProject, type Glyph } from '../src/core/types';
import { packFont } from '../src/core/packing';
import { parseBMFont, serializeBMFont } from '../src/core/bmfont';
import { layoutText } from '../src/core/layout';
import { validateProject } from '../src/core/validation';

function glyph(character: string, width = 20, height = 30): Glyph {
  return { key: character, fileName: `${character}.png`, codePoint: character.codePointAt(0)!,
    image: '', width, height, trim: { x: 2, y: 3, width: width - 4, height: height - 6 },
    xoffset: 0, yoffset: 0, xadvance: width, included: true };
}

describe('filename mapping', () => {
  it.each([['0.png', 48], ['9.PNG', 57], ['中.png', 20013], ['😀.png', 128512],
    ['U+4E2D.png', 20013], ['uni0030.webp', 48], ['0x2B.jpg', 43], ['char_65.png', 65],
    ['space.png', 32], ['slash.png', 47], ['colon.png', 58], ['e\u0301.png', 233]])('%s → %i', (name, id) => {
    expect(characterFromFilename(name)).toBe(id);
  });
  it.each(['10.png', 'image.png', 'U+D800.png', 'U+110000.png', 'char_9999999.png'])('keeps ambiguous/invalid %s unmapped', name => {
    expect(characterFromFilename(name)).toBeNull();
  });
  it('uses the same explicit syntax in manual editing', () => {
    expect(characterFromInput('U+0030')).toBe(48);
    expect(characterFromInput(' ')).toBe(32);
    expect(characterFromInput('ab')).toBeNull();
  });
});

describe('packing and validation', () => {
  it('packs deterministically without overlaps, clipping, or rotation', () => {
    const p = createProject('test', Array.from('0123456789', (c, i) => glyph(c, 13 + i, 25 + i)));
    const a = packFont(p);
    expect(packFont(p)).toEqual(a);
    expect(packFont({ ...p, glyphs: [...p.glyphs].reverse() })).toEqual(a);
    expect(a.width & (a.width - 1)).toBe(0);
    for (const r of a.glyphs) {
      expect(r.x).toBeGreaterThanOrEqual(p.settings.padding);
      expect(r.x + r.width).toBeLessThanOrEqual(a.width);
      expect(r.y + r.height).toBeLessThanOrEqual(a.height);
      for (const s of a.glyphs.filter(s => s.key !== r.key)) {
        expect(r.x + r.width <= s.x || s.x + s.width <= r.x || r.y + r.height <= s.y || s.y + s.height <= r.y).toBe(true);
      }
    }
  });
  it('preserves advance and compensates alpha trimming in offsets', () => {
    const p = createProject('test', [glyph('A')]);
    p.settings.trim = true;
    p.glyphs[0].xoffset = -1;
    p.glyphs[0].yoffset = 4;
    expect(packFont(p).glyphs[0]).toMatchObject({ width: 16, height: 24, xoffset: 1, yoffset: 7, xadvance: 20, sourceX: 2, sourceY: 3 });
  });
  it('uses character order to break equal-size ties across fresh imports', () => {
    const p = createProject('test', Array.from('0123456789', c => glyph(c)));
    const first = packFont(p).glyphs.map(({ key, ...g }) => g);
    const second = packFont({ ...p, glyphs: p.glyphs.map((g, i) => ({ ...g, key: `different-${9 - i}` })) }).glyphs.map(({ key, ...g }) => g);
    expect(second).toEqual(first);
  });
  it('retains advance for fully transparent and synthetic space glyphs', () => {
    const g = glyph(' ');
    g.trim = { x: 0, y: 0, width: 0, height: 0 };
    const p = createProject('space', [g]); p.settings.trim = true;
    expect(packFont(p).glyphs[0]).toMatchObject({ width: 0, height: 0, xadvance: 20 });
  });
  it('blocks overflow instead of emitting an incomplete font', () => {
    const p = createProject('test', [glyph('A', 70, 70)]); p.settings.maxSize = 64;
    expect(() => packFont(p)).toThrow(/图集/);
  });
  it('blocks duplicate and unmapped characters while allowing exclusions', () => {
    const p = createProject('test', [glyph('A'), { ...glyph('B'), codePoint: 65 }, { ...glyph('C'), codePoint: null }]);
    expect(validateProject(p).filter(x => x.level === 'error')).toHaveLength(2);
    p.glyphs[1].included = false; p.glyphs[2].included = false;
    expect(validateProject(p).filter(x => x.level === 'error')).toHaveLength(0);
  });
  it('validates metrics and atlas limits before packing', () => {
    const p = createProject('test', [glyph('A')]); p.settings.lineHeight = 0;
    expect(() => packFont(p)).toThrow(/行高/);
    p.settings.lineHeight = 30; p.glyphs[0].xadvance = NaN;
    expect(() => packFont(p)).toThrow(/整数/);
  });
  it('crops non-power-of-two atlases with padding intact', () => {
    const p = createProject('test', [glyph('A', 17, 23)]); p.settings.powerOfTwo = false;
    const a = packFont(p);
    expect(a.width).toBe(21); expect(a.height).toBe(27);
  });
});

describe('BMFont descriptors and preview', () => {
  it('reads supplied sample without normalizing its unconventional metrics', async () => {
    const f = parseBMFont(await readFile('sample/bonusGold.fnt', 'utf8'));
    expect(f).toMatchObject({ name: 'Arial', fontSize: 32, lineHeight: 32, base: 26, width: 520, height: 250 });
    expect(f.chars).toHaveLength(13);
    expect(f.chars.find(c => c.id === 48)).toMatchObject({ x: 148, y: 0, width: 73, height: 90, xadvance: 73 });
  });
  it('exports canonical text with matching PNG and round-trips metrics', () => {
    const p = createProject('Score', [glyph('0'), glyph('+')]);
    const a = packFont(p); const text = serializeBMFont(p, a, 'Score.png', 'text');
    expect(text.startsWith('info face="Score"')).toBe(true);
    expect(text.endsWith('\n')).toBe(true);
    expect(parseBMFont(text).chars).toHaveLength(2);
    expect(parseBMFont(text).pages).toEqual([{ id: 0, file: 'Score.png' }]);
  });
  it('escapes XML metadata', () => {
    const p = createProject('A & B', [glyph('A')]);
    expect(serializeBMFont(p, packFont(p), 'A&B.png', 'xml')).toContain('face="A &amp; B"');
    expect(serializeBMFont(p, packFont(p), 'A&B.png', 'xml')).toContain('file="A&amp;B.png"');
  });
  it.each(['garbage', 'common lineHeight=0', 'info face="bad"\ncommon lineHeight=32 base=26 scaleW=64 scaleH=64 pages=2\n'])('rejects invalid/multipage input', value => {
    expect(() => parseBMFont(value)).toThrow();
  });
  it('rejects channel-packed fonts instead of treating channel masks as full-color images', async () => {
    const text = (await readFile('sample/bonusGold.fnt', 'utf8')).replace('packed=0', 'packed=1');
    expect(() => parseBMFont(text)).toThrow(/通道/);
  });
  it('uses real offsets, newlines, spacing, kerning and missing-character advances', () => {
    const p = createProject('test', [glyph('A'), glyph('B')]);
    p.settings.lineHeight = 40; p.settings.letterSpacing = 2;
    p.glyphs[0].xoffset = -3; p.kernings = [{ first: 65, second: 66, amount: -2 }];
    const l = layoutText('AB\nAZ', p, packFont(p));
    expect(l.items.map(i => [i.x, i.y])).toEqual([[0, 0], [23, 0], [0, 40]]);
    expect(l.missing).toEqual(['Z']);
    expect(l.height).toBeGreaterThanOrEqual(80);
  });
});
