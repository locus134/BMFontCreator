import { useEffect, useMemo, useRef, useState } from 'react';
import type { FontAtlas, FontProject } from '../core/types';
import { layoutText } from '../core/layout';

interface Props {
  project: FontProject; atlas: FontAtlas; selected: string; view: 'atlas' | 'text';
  zoom: number; background: string; guides: boolean; onSelect(key: string): void;
}

export function FontCanvas({ project, atlas, selected, view, zoom, background, guides, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null), hostRef = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<string, HTMLImageElement>());
  const [hostSize, setHostSize] = useState({ width: 600, height: 500 });
  const text = useMemo(() => layoutText(project.previewText, project, atlas), [project, atlas]);
  const margin = view === 'text' ? 32 : 0;
  const requestedWidth = view === 'atlas' ? atlas.width : text.width + margin * 2;
  const requestedHeight = view === 'atlas' ? atlas.height : text.height + margin * 2;
  const width = Math.min(8192, requestedWidth), height = Math.min(Math.floor(16777216 / width), 8192, requestedHeight);
  const scale = zoom || Math.max(0.001, Math.min(1, (hostSize.width - 104) / width, (hostSize.height - 104) / height));
  useEffect(() => {
    const host = hostRef.current!;
    const observer = new ResizeObserver(([entry]) => setHostSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(host); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let canceled = false;
    if (canvasRef.current) canvasRef.current.dataset.ready = 'false';
    const activeKeys = new Set(project.glyphs.map(g => g.key));
    for (const key of cache.current.keys()) if (!activeKeys.has(key)) cache.current.delete(key);
    async function draw() {
      await Promise.all(project.glyphs.filter(g => g.image).map(async g => {
        if (cache.current.get(g.key)?.src === g.image) return;
        const image = new Image(); image.src = g.image;
        await image.decode(); cache.current.set(g.key, image);
      }));
      if (canceled) return;
      const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!;
      canvas.width = width; canvas.height = height;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = background === 'light' ? '#f8fafc' : '#24282d'; ctx.fillRect(0, 0, width, height);
      if (background === 'checker') {
        const tile = document.createElement('canvas'); tile.width = 24; tile.height = 24;
        const tc = tile.getContext('2d')!; tc.fillStyle = '#292d32'; tc.fillRect(0, 0, 24, 24);
        tc.fillStyle = '#24282d'; tc.fillRect(0, 0, 12, 12); tc.fillRect(12, 12, 12, 12);
        ctx.fillStyle = ctx.createPattern(tile, 'repeat')!; ctx.fillRect(0, 0, width, height);
      }
      const items = view === 'atlas' ? atlas.glyphs.map(g => ({ glyph: g, x: g.x, y: g.y })) : text.items;
      for (const item of items) {
        const { glyph: g } = item, image = cache.current.get(g.key);
        if (image && g.width && g.height) ctx.drawImage(image, g.sourceX, g.sourceY, g.width, g.height, item.x + margin, item.y + margin, g.width, g.height);
      }
      if (guides && view === 'text') {
        ctx.save(); ctx.strokeStyle = '#61b8b5'; ctx.globalAlpha = 0.6; ctx.lineWidth = 1 / scale; ctx.setLineDash([5 / scale, 5 / scale]);
        for (const baseline of text.baselines) { ctx.beginPath(); ctx.moveTo(0, baseline + margin); ctx.lineTo(width, baseline + margin); ctx.stroke(); }
        ctx.restore();
      }
      for (const item of items) if (guides || item.glyph.key === selected) {
        const active = item.glyph.key === selected;
        ctx.strokeStyle = active ? '#87ccff' : '#b5c2d052'; ctx.lineWidth = (active ? 2 : 1) / scale;
        ctx.strokeRect(item.x + margin, item.y + margin, Math.max(1, item.glyph.width), Math.max(1, item.glyph.height));
      }
      canvas.dataset.ready = 'true';
    }
    void draw().catch(error => console.error('Canvas drawing failed', error));
    return () => { canceled = true; };
  }, [project, atlas, view, selected, scale, background, guides, width, height, margin, text]);
  return <div className={`canvas-host ${background}`} ref={hostRef}>
    <div className="canvas-scroller"><div className="canvas-positioner">
      <canvas ref={canvasRef} aria-label={view === 'atlas' ? '字体图集' : '位图文字预览'} style={{ width: width * scale, height: height * scale }}
        onClick={event => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const x = (event.clientX - bounds.left) / scale - margin, y = (event.clientY - bounds.top) / scale - margin;
          const found = view === 'atlas' ? atlas.glyphs.find(g => x >= g.x && x <= g.x + g.width && y >= g.y && y <= g.y + g.height)
            : text.items.find(i => x >= i.x && x <= i.x + i.glyph.width && y >= i.y && y <= i.y + i.glyph.height)?.glyph;
          if (found) onSelect(found.key);
        }} />
    </div></div>
    <div className="canvas-caption">{view === 'atlas' ? `${atlas.width} × ${atlas.height} px` : '原始像素 · 实际字符排版'}<span>{Math.round(scale * 100)}%</span></div>
    {view === 'text' && text.missing.length > 0 && <div className="canvas-warning" role="status">缺少字符：{text.missing.map(c => c === ' ' ? '空格' : c).join('、')}，这些字符未绘制</div>}
    {(requestedWidth > width || requestedHeight > height) && <div className="canvas-warning">预览尺寸过大，仅显示部分区域；导出数据保持完整。</div>}
  </div>;
}
