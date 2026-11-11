// 閱讀設定：全域預設值，可被「僅應用到當前書籍」的設定覆蓋
export const DEFAULT_SETTINGS = {
  fontSize: 19,        // 字級 14–28
  margin: 20,          // 左右邊距 px 8–44
  lineHeight: 1.9,     // 行距 1.4–2.6
  indent: true,        // 首行縮進
  font: 'sans',        // sans | serif | round
  theme: 'cream',      // white | cream | green | dark
  brightness: 0,       // 0–60，黑色遮罩的透明度
  pageMode: 'scroll',  // scroll | paged
  rate: 1,             // 朗讀速度
  voiceURI: '',        // 朗讀語音
};

const KEY = 'rd_settings';

export function loadGlobalSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveGlobalSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 儲存空間不足時忽略
  }
}

// 合併：全域 → 書籍覆蓋
export function effectiveSettings(global, bookOverride) {
  return { ...global, ...(bookOverride || {}) };
}

export const THEMES = {
  white: { bg: '#ffffff', ink: '#222222', label: '白' },
  cream: { bg: '#f6f1e7', ink: '#2b2a27', label: '米黃' },
  green: { bg: '#cfe9d2', ink: '#1f2d1f', label: '護眼綠' },
  dark: { bg: '#000000', ink: '#bdbdbd', label: '夜間' },
};

export const FONTS = {
  sans: { label: '黑體', stack: '"PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif' },
  serif: { label: '宋體', stack: '"Songti TC","Noto Serif TC","MingLiU",serif' },
  round: { label: '圓體', stack: '"Yuanti TC","PingFang TC",system-ui,sans-serif' },
};
