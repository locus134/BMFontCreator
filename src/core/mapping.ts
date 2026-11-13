const aliases: Record<string, number> = {
  space: 32, plus: 43, minus: 45, hyphen: 45, times: 215, multiply: 215,
  slash: 47, backslash: 92, colon: 58, semicolon: 59, question: 63,
  asterisk: 42, star: 42, quote: 34, apostrophe: 39, less: 60, greater: 62,
  pipe: 124, dot: 46, period: 46, comma: 44, equal: 61, percent: 37,
};

export function isCodePoint(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 32 && value <= 0x10ffff
    && !(value >= 0xd800 && value <= 0xdfff) && !(value >= 0x7f && value <= 0x9f);
}

export function characterFromInput(input: string): number | null {
  const value = input.normalize('NFC');
  const chars = Array.from(value);
  if (chars.length === 1) {
    const id = value.codePointAt(0);
    return isCodePoint(id) ? id : null;
  }
  const hex = /^(?:U\+|uni|0x)([0-9a-f]{2,6})$/i.exec(value);
  const decimal = /^char_(\d{1,7})$/i.exec(value);
  const id = hex ? Number.parseInt(hex[1], 16) : decimal ? Number.parseInt(decimal[1], 10) : aliases[value.toLowerCase()];
  return isCodePoint(id) ? id : null;
}

export function characterFromFilename(name: string): number | null {
  return characterFromInput(name.replace(/\.[^.]+$/, ''));
}

export function codePointLabel(id: number | null): string {
  return id === null ? '未映射' : `U+${id.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function displayCharacter(id: number | null): string {
  return id === null ? '?' : id === 32 ? '空格' : String.fromCodePoint(id);
}
