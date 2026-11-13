import type { FontAtlas, FontProject, PackedGlyph } from './types';

export interface TextLayout {
  items: { glyph: PackedGlyph; x: number; y: number }[];
  missing: string[];
  width: number;
  height: number;
  originX: number;
  originY: number;
  baselines: number[];
}

export function layoutText(text: string, project: FontProject, atlas: FontAtlas): TextLayout {
  const lookup = new Map(atlas.glyphs.map(g => [g.id, g]));
  const pairs = new Map(project.kernings.map(k => [`${k.first}:${k.second}`, k.amount]));
  const items: TextLayout['items'] = [], missing = new Set<string>();
  const baselines = [project.settings.base];
  let penX = 0, penY = 0, previous: number | undefined, minX = 0, minY = 0, maxX = 1, maxY = project.settings.lineHeight;
  for (const character of Array.from(text.replace(/\r\n?/g, '\n'))) {
    if (character === '\n') { penX = 0; penY += project.settings.lineHeight; previous = undefined; maxY = Math.max(maxY, penY + project.settings.lineHeight); baselines.push(penY + project.settings.base); continue; }
    const id = character.codePointAt(0)!, g = lookup.get(id);
    if (!g) { missing.add(character); penX += Math.max(1, project.settings.lineHeight / 2); previous = undefined; maxX = Math.max(maxX, penX); continue; }
    if (previous !== undefined) penX += pairs.get(`${previous}:${id}`) ?? 0;
    const x = penX + g.xoffset, y = penY + g.yoffset;
    items.push({ glyph: g, x, y });
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + g.width); maxY = Math.max(maxY, y + g.height);
    penX += g.xadvance; previous = id; maxX = Math.max(maxX, penX);
  }
  for (const item of items) { item.x -= minX; item.y -= minY; }
  return { items, missing: [...missing], width: Math.ceil(maxX - minX), height: Math.ceil(maxY - minY), originX: -minX, originY: -minY, baselines: baselines.map(y => y - minY) };
}
