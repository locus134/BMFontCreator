import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createProject, type FontProject, type Glyph, type FontSettings, type ImportResult, type OperationResult } from '../core/types';
import { characterFromInput, codePointLabel, displayCharacter } from '../core/mapping';
import { packFont } from '../core/packing';
import { validateProject } from '../core/validation';
import { FontCanvas } from './FontCanvas';

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    folder: <><path d="M3 7V5a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v12H3Z"/><path d="M3 9h18"/></>,
    open: <><path d="M3 8V5h6l2 2h9v3M3 19l3-9h16l-3 9Z"/></>,
    save: <><path d="M4 3h13l4 4v14H3V3Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/></>,
    export: <><path d="M12 15V3m-5 5 5-5 5 5M4 14v7h16v-7"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    text: <><path d="M3 6h12M9 6v14M17 11h5M19.5 11v9"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    undo: <><path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14"/></>,
    redo: <><path d="m16 4 5 5-5 5m5-5H11a7 7 0 0 0 0 14"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.grid}</svg>;
}

function NumberField({ label, value, onChange, hint, min, max }: { label: string; value: number; onChange(value: number): void; hint?: string; min?: number; max?: number }) {
  const [draft, setDraft] = useState(String(value)); const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(String(value)); }, [value]);
  return <label className="number-field"><span>{label}</span><div className="number-input"><input aria-label={label} type="number" step="1" min={min} max={max} value={draft}
    onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setDraft(String(value)); }}
    onChange={event => { setDraft(event.target.value); if (event.target.value !== '' && Number.isInteger(Number(event.target.value))) onChange(Number(event.target.value)); }}/><span>px</span></div>{hint && <small>{hint}</small>}</label>;
}

function MappingField({ glyph, change }: { glyph: Glyph; change(value: number | null): void }) {
  const [draft, setDraft] = useState(glyph.codePoint === null ? '' : String.fromCodePoint(glyph.codePoint));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(glyph.codePoint === null ? '' : String.fromCodePoint(glyph.codePoint)); }, [glyph.codePoint]);
  const parsed = characterFromInput(draft);
  return <label className="field"><span>映射字符 <small>{codePointLabel(glyph.codePoint)}</small></span>
    <input aria-label="映射字符" value={draft} placeholder="例如 A 或 U+0041" maxLength={16} onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; }} onChange={e => { setDraft(e.target.value); change(characterFromInput(e.target.value)); }} />
    <small className={parsed === null ? 'input-error' : ''}>{draft && parsed === null ? '请输入单个字符或有效的 Unicode 编码' : '支持单字符、U+XXXX、char_十进制'}</small>
  </label>;
}

interface History { project: FontProject; past: FontProject[]; future: FontProject[]; saved: FontProject }

export function App() {
  const [history, setHistory] = useState<History>(() => { const p = createProject(); return { project: p, saved: p, past: [], future: [] }; });
  const project = history.project, dirty = project !== history.saved;
  const [selectedKey, setSelectedKey] = useState(''), [query, setQuery] = useState('');
  const [view, setView] = useState<'atlas' | 'text'>('atlas'), [zoom, setZoom] = useState(0), [background, setBackground] = useState('checker');
  const [guides, setGuides] = useState(false), [pending, setPending] = useState('');
  const [notice, setNotice] = useState<{ text: string; error?: boolean; details?: string[] } | null>(null);
  const [projectFile, setProjectFile] = useState('');
  const selected = project.glyphs.find(g => g.key === selectedKey) ?? project.glyphs[0];
  const issues = useMemo(() => validateProject(project), [project]);
  const packed = useMemo(() => { try { return { atlas: packFont(project), error: '' }; } catch (e) { return { atlas: null, error: (e as Error).message }; } }, [project]);
  const visible = project.glyphs.filter(g => `${g.fileName} ${displayCharacter(g.codePoint)} ${codePointLabel(g.codePoint)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const included = project.glyphs.filter(g => g.included).length;
  const update = useCallback((change: (p: FontProject) => FontProject) => setHistory(h => ({ ...h, project: change(h.project), past: [...h.past.slice(-49), h.project], future: [] })), []);
  const updateGlyph = (key: string, fields: Partial<Glyph>) => update(p => ({ ...p, glyphs: p.glyphs.map(g => g.key === key ? { ...g, ...fields } : g) }));
  const updateSetting = <K extends keyof FontSettings>(key: K, value: FontSettings[K]) => update(p => ({ ...p, settings: { ...p.settings, [key]: value } }));
  const undo = useCallback(() => setHistory(h => h.past.length ? { ...h, project: h.past[h.past.length - 1], past: h.past.slice(0, -1), future: [h.project, ...h.future] } : h), []);
  const redo = useCallback(() => setHistory(h => h.future.length ? { ...h, project: h.future[0], past: [...h.past, h.project], future: h.future.slice(1) } : h), []);
  useEffect(() => { window.desktop.setDirty(dirty); }, [dirty, project]);
  useEffect(() => { document.title = `${dirty ? '● ' : ''}${project.name} — BMFont Creator`; }, [dirty, project.name]);

  const action = useCallback(async (name: string) => {
    if (pending) return;
    if (name === 'undo') return undo(); if (name === 'redo') return redo();
    if (name === 'exportFont' && !packed.atlas) { setNotice({ text: packed.error, error: true }); return; }
    setPending(name); setNotice(null);
    try {
      if (name === 'saveProject' || name === 'saveAs') {
        const result = await window.desktop.saveProject(project, name === 'saveAs');
        if (result.error) throw new Error(result.error);
        if (result.value) { setHistory(h => ({ ...h, saved: project })); setProjectFile(result.value); setNotice({ text: '工程已保存，字符图片已内嵌。' }); }
      } else if (name === 'exportFont') {
        const result = await window.desktop.exportFont(project);
        if (result.error) throw new Error(result.error);
        if (result.value) setNotice({ text: `已导出 ${result.value.split(/[\\/]/).pop()} 和 PNG 图集。` });
      } else {
        const methods: Record<string, () => Promise<OperationResult<ImportResult>>> = { importDirectory: window.desktop.importDirectory, importFont: window.desktop.importFont, openProject: window.desktop.openProject, loadSample: window.desktop.loadSample };
        if (!methods[name]) return;
        const result = await methods[name]();
        if (result.error) throw new Error(result.error);
        if (result.value) {
          const { project: p, warnings, path } = result.value;
          setHistory({ project: p, saved: name === 'openProject' ? p : createProject(), past: [], future: [] });
          setSelectedKey(p.glyphs[0]?.key ?? ''); setQuery(''); setView('atlas'); setZoom(0); setProjectFile(path ?? '');
          setNotice({ text: `已载入 ${p.glyphs.length} 个字符${warnings.length ? `，${warnings.length} 个文件未能导入` : ''}。`, details: warnings });
        }
      }
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : '操作失败，请重试。', error: true }); }
    finally { setPending(''); }
  }, [pending, project, packed, undo, redo]);
  useEffect(() => window.desktop.onAction(name => void action(name)), [action]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA'].includes(target.tagName) && !pending) { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    };
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  }, [pending, undo, redo]);

  function addSpace() {
    const existing = project.glyphs.find(g => g.codePoint === 32);
    if (existing) { setSelectedKey(existing.key); return; }
    const key = crypto.randomUUID();
    update(p => ({ ...p, glyphs: [...p.glyphs, { key, fileName: 'space（空白字符）', codePoint: 32, width: 0, height: 0, trim: { x: 0, y: 0, width: 0, height: 0 }, image: '', xoffset: 0, yoffset: 0, xadvance: Math.round(p.settings.lineHeight / 2), included: true }] }));
    setSelectedKey(key);
  }

  return <div className="app">
    <header className="titlebar">
      <div className="brand"><span className="brand-mark"><span>B</span><i/></span><strong>BMFont<span>Creator</span></strong></div>
      <div className="document-title"><span className={`document-dot ${dirty ? 'dirty' : ''}`}/><span>{project.glyphs.length ? project.name : '新建字体'}</span><small>{dirty ? '未保存' : projectFile ? '已保存' : '本地工程'}</small></div>
      <div className="top-actions">
        <button onClick={() => void action('importDirectory')} disabled={!!pending} title="导入图片目录 ⌘I"><Icon name="folder"/>导入目录</button>
        <button onClick={() => void action('openProject')} disabled={!!pending} title="打开工程 ⌘O"><Icon name="open"/>打开</button>
        <button onClick={() => void action('saveProject')} disabled={!!pending || !project.glyphs.length} title="保存工程 ⌘S"><Icon name="save"/>保存</button>
        <span className="toolbar-divider"/>
        <button className="primary" onClick={() => void action('exportFont')} disabled={!!pending || !packed.atlas} title="导出 .fnt + .png ⌘E"><Icon name="export"/>导出字体</button>
      </div>
    </header>
    <main className="workspace" inert={pending ? true : undefined}>
      <aside className="library">
        <div className="panel-heading"><h2>字符资源</h2><span className="count">{project.glyphs.length}</span></div>
        <label className="search"><Icon name="search" size={15}/><input aria-label="搜索字符" placeholder="搜索字符或文件名" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button className="clear" aria-label="清除搜索" onClick={() => setQuery('')}>×</button>}</label>
        <div className="library-tools"><span>{included} 个参与导出</span><button className="text-button" onClick={() => void action('importFont')}>导入 .fnt</button></div>
        <div className="glyph-list">
          {visible.map(g => <button key={g.key} className={`glyph-row ${selected?.key === g.key ? 'selected' : ''} ${!g.included ? 'excluded' : ''}`} onClick={() => setSelectedKey(g.key)} aria-pressed={selected?.key === g.key} title={g.fileName}>
            <span className="glyph-thumbnail">{g.image ? <img src={g.image} alt=""/> : <span>␣</span>}</span>
            <span className="glyph-info"><strong>{displayCharacter(g.codePoint)}<small>{codePointLabel(g.codePoint)}</small></strong><span>{g.fileName}</span></span>
            <span className={`glyph-state ${g.codePoint === null || issues.some(i => i.key === g.key && i.level === 'error') ? 'invalid' : ''}`}>{!g.included ? '−' : g.codePoint === null ? '!' : <Icon name="check" size={13}/>}</span>
          </button>)}
          {!visible.length && <div className="library-empty">{project.glyphs.length ? '没有匹配的字符' : <><Icon name="image" size={28}/><span>字符图片会显示在这里</span></>}</div>}
        </div>
        <div className="library-bottom"><button className="full-button" onClick={addSpace} disabled={!project.glyphs.length}><Icon name="plus" size={15}/>添加空格字符</button><p>PNG · JPG · WebP<br/>文件名即字符，也支持 Unicode 编码</p></div>
      </aside>

      <section className="editor">
        <div className="editor-heading"><div><span className="eyebrow">BITMAP FONT WORKSPACE</span><h1>{project.glyphs.length ? project.name : '把字符图片，变成字体。'}</h1></div>
          <div className="history-actions"><button aria-label="撤销" title="撤销" disabled={!history.past.length} onClick={undo}><Icon name="undo" size={17}/></button><button aria-label="重做" title="重做" disabled={!history.future.length} onClick={redo}><Icon name="redo" size={17}/></button></div>
        </div>
        <div className="preview-toolbar"><div className="tabs" role="tablist" aria-label="预览模式"><button role="tab" aria-selected={view === 'atlas'} className={view === 'atlas' ? 'active' : ''} onClick={() => setView('atlas')}><Icon name="grid" size={15}/>图集</button><button role="tab" aria-selected={view === 'text'} className={view === 'text' ? 'active' : ''} onClick={() => setView('text')}><Icon name="text" size={16}/>文字预览</button></div>
          <div className="canvas-controls"><label className="guides"><input type="checkbox" checked={guides} onChange={e => setGuides(e.target.checked)}/>辅助线</label><select aria-label="画布背景" value={background} onChange={e => setBackground(e.target.value)}><option value="checker">棋盘格</option><option value="dark">深色</option><option value="light">浅色</option></select><select aria-label="缩放" value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value={0}>适应画布</option><option value={0.25}>25%</option><option value={0.5}>50%</option><option value={1}>100%</option><option value={2}>200%</option><option value={4}>400%</option></select></div>
        </div>
        <div className="preview-area">
          {!project.glyphs.length ? <div className="welcome"><div className="welcome-art"><span>A</span><i>+</i><span>字</span><div>0 1 2 3 4 5</div></div><span className="eyebrow">FROM IMAGES TO TYPE</span><h2>每一张图片，<br/>都有自己的位置。</h2><p>导入字符图片目录，调整排版，<br/>导出可直接用于游戏的位图字体。</p><button className="primary" onClick={() => void action('importDirectory')}><Icon name="folder"/>选择图片目录<Icon name="arrow" size={16}/></button><button className="sample-button" onClick={() => void action('loadSample')}>先看看 sample 示例 <span>↗</span></button></div>
            : packed.atlas ? <FontCanvas project={project} atlas={packed.atlas} selected={selected?.key ?? ''} view={view} zoom={zoom} background={background} guides={guides} onSelect={setSelectedKey}/>
            : <div className="packing-error"><Icon name="grid" size={32}/><h3>调整后即可生成图集</h3><p>{packed.error}</p><small>在左侧选择字符，在右侧修正映射或参数。</small></div>}
        </div>
        {view === 'text' && project.glyphs.length > 0 && <div className="preview-input"><label htmlFor="preview-text">预览文字<span>按 Enter 换行</span></label><textarea id="preview-text" aria-label="预览文字" value={project.previewText} maxLength={2000} onChange={e => update(p => ({ ...p, previewText: e.target.value }))} placeholder="输入需要预览的字符…" spellCheck={false}/></div>}
        {project.glyphs.length > 0 && issues.length > 0 && <details className={`validation ${issues.some(i => i.level === 'error') ? 'has-errors' : ''}`}><summary>{issues.some(i => i.level === 'error') ? '需要修正' : '排版提示'}<span>{issues.length} 项</span><span className="validation-first">{issues[0].message}</span></summary><ul>{issues.map((i, n) => <li key={n}><button onClick={() => i.key && setSelectedKey(i.key)}>{i.message}</button></li>)}</ul></details>}
        <div className="editor-meta"><span><i className="status-dot"/>{packed.atlas ? '图集已就绪' : project.glyphs.length ? '等待修正' : '准备就绪'}</span><span>{packed.atlas ? `${packed.atlas.glyphs.length} 个字符 · ${Math.round(packed.atlas.occupancy * 100)}% 像素占用` : '单页图集 · RGBA 透明纹理'}</span><span>不旋转 · 保留原始像素</span></div>
      </section>

      <aside className="inspector">
        <div className="inspector-scroll">
          <section className="inspector-section"><div className="section-label"><h2>字符属性</h2><span>GLYPH</span></div>
            {selected ? <><div className="selected-glyph"><div>{selected.image ? <img src={selected.image} alt={displayCharacter(selected.codePoint)}/> : '␣'}</div><span><strong>{displayCharacter(selected.codePoint)}</strong><small>{selected.width} × {selected.height} px</small><small>{selected.fileName}</small></span></div>
              <MappingField key={selected.key} glyph={selected} change={codePoint => updateGlyph(selected.key, { codePoint })}/>
              <div className="fields-row"><NumberField key={`${selected.key}-x`} label="X 偏移" value={selected.xoffset} onChange={xoffset => updateGlyph(selected.key, { xoffset })}/><NumberField key={`${selected.key}-y`} label="Y 偏移" value={selected.yoffset} onChange={yoffset => updateGlyph(selected.key, { yoffset })}/></div>
              <NumberField key={`${selected.key}-advance`} label="前进量" value={selected.xadvance} onChange={xadvance => updateGlyph(selected.key, { xadvance })} hint="绘制后，光标向右移动的距离"/>
              <label className="check-row"><input type="checkbox" checked={selected.included} onChange={e => updateGlyph(selected.key, { included: e.target.checked })}/>参与字体导出</label>
            </> : <div className="inspector-placeholder"><Icon name="text" size={25}/><p>选择一个字符<br/>查看映射与排版参数</p></div>}
          </section>
          <section className="inspector-section"><div className="section-label"><h2>字体设置</h2><span>FONT</span></div>
            <label className="field"><span>字体名称</span><input aria-label="字体名称" value={project.name} maxLength={100} onChange={e => update(p => ({ ...p, name: e.target.value }))}/></label>
            <div className="fields-row"><NumberField label="行高" value={project.settings.lineHeight} onChange={v => updateSetting('lineHeight', v)} min={1}/><NumberField label="基线" value={project.settings.base} onChange={v => updateSetting('base', v)} min={0}/></div>
            <div className="fields-row"><NumberField label="字号" value={project.settings.fontSize} onChange={v => updateSetting('fontSize', v)} min={1}/><NumberField label="字间距" value={project.settings.letterSpacing} onChange={v => updateSetting('letterSpacing', v)}/></div>
            <p className="field-note">字号为字体元数据，不缩放原始图片。</p>
          </section>
          <section className="inspector-section"><div className="section-label"><h2>图集与导出</h2><span>ATLAS</span></div>
            <div className="fields-row"><NumberField label="四周留白" value={project.settings.padding} onChange={v => updateSetting('padding', v)} min={0} max={32}/><label className="field"><span>图集上限</span><select aria-label="图集上限" value={project.settings.maxSize} onChange={e => updateSetting('maxSize', Number(e.target.value))}>{[64, 128, 256, 512, 1024, 2048, 4096, 8192].map(n => <option key={n} value={n}>{n} px</option>)}</select></label></div>
            <label className="check-row"><input type="checkbox" checked={project.settings.powerOfTwo} onChange={e => updateSetting('powerOfTwo', e.target.checked)}/>图集尺寸为 2 的幂</label>
            <label className="check-row"><input type="checkbox" checked={project.settings.trim} onChange={e => updateSetting('trim', e.target.checked)}/>裁切透明边缘</label>
            <label className="field format-field"><span>描述文件格式</span><select aria-label="描述文件格式" value={project.settings.format} onChange={e => updateSetting('format', e.target.value as 'text' | 'xml')}><option value="text">BMFont Text · Cocos2d-x</option><option value="xml">BMFont XML · 其他引擎</option></select></label>
            <div className="export-note"><span>.fnt</span><Icon name="plus" size={12}/><span>.png</span><p>{project.settings.format === 'text' ? 'Cocos2d-x 可通过 createWithBMFont 加载。' : 'XML 也使用 .fnt 扩展名；请确认引擎支持。'}</p></div>
          </section>
        </div>
      </aside>
    </main>
    <footer className={`app-footer ${notice?.error ? 'error' : ''}`} role="status" aria-live="polite"><span>{pending ? '正在处理文件，请稍候…' : notice?.text ?? '所有处理均在本机完成。'}{notice?.details?.length ? <details><summary>查看详情</summary><ul>{notice.details.map((s, i) => <li key={i}>{s}</li>)}</ul></details> : null}</span><span>BMFont Creator <b>1.0</b></span></footer>
  </div>;
}
