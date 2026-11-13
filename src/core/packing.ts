import type { FontProject, FontAtlas, PackedGlyph, Rect } from './types';
import { validateProject } from './validation';

interface Box { key: string; id: number; width: number; height: number }

function contains(a: Rect, b: Rect) {
  return a.x <= b.x && a.y <= b.y && a.x + a.width >= b.x + b.width && a.y + a.height >= b.y + b.height;
}

function fit(boxes: Box[], width: number, height: number): Map<string, Rect> | null {
  let free: Rect[] = [{ x: 0, y: 0, width, height }];
  const placed = new Map<string, Rect>();
  for (const box of boxes) {
    let best: Rect | undefined;
    let score = Infinity;
    let longSide = Infinity;
    for (const r of free) {
      if (box.width > r.width || box.height > r.height) continue;
      const short = Math.min(r.width - box.width, r.height - box.height);
      const long = Math.max(r.width - box.width, r.height - box.height);
      if (short < score || (short === score && long < longSide)) { best = r; score = short; longSide = long; }
    }
    if (!best) return null;
    const used = { x: best.x, y: best.y, width: box.width, height: box.height };
    placed.set(box.key, used);
    const next: Rect[] = [];
    for (const r of free) {
      const right = r.x + r.width, bottom = r.y + r.height;
      const ur = used.x + used.width, ub = used.y + used.height;
      if (used.x >= right || ur <= r.x || used.y >= bottom || ub <= r.y) { next.push(r); continue; }
      if (used.x > r.x) next.push({ x: r.x, y: r.y, width: used.x - r.x, height: r.height });
      if (ur < right) next.push({ x: ur, y: r.y, width: right - ur, height: r.height });
      if (used.y > r.y) next.push({ x: r.x, y: r.y, width: r.width, height: used.y - r.y });
      if (ub < bottom) next.push({ x: r.x, y: ub, width: r.width, height: bottom - ub });
    }
    free = next.filter((r, i) => !next.some((s, j) => i !== j && contains(s, r) && (!contains(r, s) || j < i)));
  }
  return placed;
}

export function packFont(project: FontProject): FontAtlas {
  const errors = validateProject(project).filter(x => x.level === 'error');
  if (errors.length) throw new Error(errors.map(x => x.message).join('\n'));
  const { padding, trim, maxSize, powerOfTwo, letterSpacing } = project.settings;
  const glyphs: PackedGlyph[] = project.glyphs.filter(g => g.included).map(g => {
    const rect = trim ? g.trim : { x: 0, y: 0, width: g.width, height: g.height };
    return { key: g.key, id: g.codePoint!, x: 0, y: 0, width: rect.width, height: rect.height,
      sourceX: rect.x, sourceY: rect.y, xoffset: g.xoffset + rect.x, yoffset: g.yoffset + rect.y, xadvance: g.xadvance + letterSpacing };
  }).sort((a, b) => a.id - b.id);
  if (glyphs.some(g => g.xadvance < -32768 || g.xadvance > 32767 || g.xoffset > 32767 || g.yoffset > 32767)) throw new Error('裁切或字间距调整后的字符参数超出整数范围。');
  const boxes = glyphs.filter(g => g.width && g.height).map(g => ({ key: g.key, id: g.id, width: g.width + padding * 2, height: g.height + padding * 2 }))
    .sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height) || b.width * b.height - a.width * a.height || a.id - b.id);
  const area = boxes.reduce((n, b) => n + b.width * b.height, 0);
  const candidates: { width: number; height: number }[] = [];
  for (let width = 32; width <= maxSize; width *= 2) {
    for (let height = 32; height <= maxSize; height *= 2) {
      if (width * height >= area && boxes.every(b => b.width <= width && b.height <= height)) candidates.push({ width, height });
    }
  }
  candidates.sort((a, b) => a.width * a.height - b.width * b.height || Math.abs(a.width - a.height) - Math.abs(b.width - b.height) || b.width - a.width);
  for (const candidate of candidates) {
    const locations = fit(boxes, candidate.width, candidate.height);
    if (!locations) continue;
    for (const g of glyphs) { const r = locations.get(g.key); if (r) { g.x = r.x + padding; g.y = r.y + padding; } }
    const width = powerOfTwo ? candidate.width : Math.max(1, ...glyphs.filter(g => g.width).map(g => g.x + g.width + padding));
    const height = powerOfTwo ? candidate.height : Math.max(1, ...glyphs.filter(g => g.height).map(g => g.y + g.height + padding));
    return { width, height, glyphs, occupancy: glyphs.reduce((n, g) => n + g.width * g.height, 0) / (width * height) };
  }
  throw new Error(`字符无法装入 ${maxSize} × ${maxSize} 的单页图集。请提高图集上限、减少留白或排除部分字符。`);
}
