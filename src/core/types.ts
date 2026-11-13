export interface Rect { x: number; y: number; width: number; height: number }
export interface Glyph {
  key: string;
  fileName: string;
  codePoint: number | null;
  image: string;
  width: number;
  height: number;
  trim: Rect;
  xoffset: number;
  yoffset: number;
  xadvance: number;
  included: boolean;
}
export interface FontSettings {
  fontSize: number;
  lineHeight: number;
  base: number;
  letterSpacing: number;
  padding: number;
  maxSize: number;
  powerOfTwo: boolean;
  trim: boolean;
  format: 'text' | 'xml';
}
export interface Kerning { first: number; second: number; amount: number }
export interface FontProject {
  version: 1;
  name: string;
  settings: FontSettings;
  glyphs: Glyph[];
  kernings: Kerning[];
  previewText: string;
}
export interface PackedGlyph extends Rect {
  key: string;
  id: number;
  sourceX: number;
  sourceY: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
}
export interface FontAtlas { width: number; height: number; glyphs: PackedGlyph[]; occupancy: number }
export interface ImportResult { project: FontProject; warnings: string[]; path?: string }
export interface OperationResult<T> { value?: T; error?: string; canceled?: boolean }
export interface DesktopAPI {
  importDirectory(): Promise<OperationResult<ImportResult>>;
  importFont(): Promise<OperationResult<ImportResult>>;
  openProject(): Promise<OperationResult<ImportResult>>;
  loadSample(): Promise<OperationResult<ImportResult>>;
  saveProject(project: FontProject, saveAs?: boolean): Promise<OperationResult<string>>;
  exportFont(project: FontProject): Promise<OperationResult<string>>;
  setDirty(dirty: boolean): void;
  onAction(callback: (action: string) => void): () => void;
}

export function createProject(name = 'Untitled', glyphs: Glyph[] = []): FontProject {
  const height = Math.max(32, ...glyphs.map(g => g.height));
  return {
    version: 1, name, glyphs, kernings: [], previewText: '0123456789\n+1,250  x2',
    settings: { fontSize: height, lineHeight: height, base: height, letterSpacing: 0,
      padding: 2, maxSize: 2048, powerOfTwo: true, trim: false, format: 'text' },
  };
}
