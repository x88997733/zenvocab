// 把一段金句畫成圖片卡片（Canvas），回傳 PNG Blob
export async function makeQuoteCard(text, bookTitle) {
  const W = 1080;
  const PAD = 90;
  const FONT_SIZE = 52;
  const LINE = FONT_SIZE * 1.7;
  const FONT = '"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif';

  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `${FONT_SIZE}px ${FONT}`;

  // 逐字換行（中文不需要空白斷行）
  const maxWidth = W - PAD * 2;
  const lines = [];
  let cur = '';
  for (const ch of text) {
    const next = cur + ch;
    if (measure.measureText(next).width > maxWidth && cur) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);

  const quoteH = lines.length * LINE;
  const H = Math.max(720, PAD * 2 + quoteH + 260);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f5efe3';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(PAD, PAD, 12, quoteH + 20);

  ctx.fillStyle = '#2b2a27';
  ctx.font = `${FONT_SIZE}px ${FONT}`;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, PAD + 40, PAD + i * LINE));

  ctx.fillStyle = '#8a7a66';
  ctx.font = `40px ${FONT}`;
  ctx.fillText(`—— 《${bookTitle}》`, PAD + 40, H - PAD - 60);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('無法產生圖片'))), 'image/png')
  );
}
