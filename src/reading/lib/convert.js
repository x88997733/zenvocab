import * as OpenCC from 'opencc-js';

// 簡體 → 台灣繁體（含詞彙轉換，例如「软件」→「軟體」）
const converter = OpenCC.Converter({ from: 'cn', to: 'twp' });

export function toTraditional(text) {
  return converter(text);
}
