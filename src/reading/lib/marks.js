// 把段落文字切成片段，標出劃線與目前朗讀的句子
// segments: [{ text, mark: 'hl' | 'sent' | null, color, id }]
export function buildSegments(text, highlights = [], activeSentence = null) {
  const ranges = [];
  for (const h of highlights) {
    if (!h.text) continue;
    let from = 0;
    while (true) {
      const at = text.indexOf(h.text, from);
      if (at < 0) break;
      ranges.push({ start: at, end: at + h.text.length, mark: 'hl', color: h.color, id: h.id });
      from = at + h.text.length;
    }
  }
  if (activeSentence) {
    const at = text.indexOf(activeSentence);
    if (at >= 0) ranges.push({ start: at, end: at + activeSentence.length, mark: 'sent' });
  }
  if (ranges.length === 0) return [{ text, mark: null }];

  // 找出所有邊界點，逐段決定樣式（句子高亮優先於劃線顏色之外的疊加）
  const points = new Set([0, text.length]);
  ranges.forEach((r) => {
    points.add(r.start);
    points.add(r.end);
  });
  const sorted = [...points].sort((a, b) => a - b);
  const segs = [];
  for (let k = 0; k < sorted.length - 1; k++) {
    const s = sorted[k];
    const e = sorted[k + 1];
    if (e <= s) continue;
    const covering = ranges.filter((r) => r.start <= s && r.end >= e);
    const hl = covering.find((r) => r.mark === 'hl');
    const sent = covering.find((r) => r.mark === 'sent');
    segs.push({
      text: text.slice(s, e),
      mark: hl ? 'hl' : sent ? 'sent' : null,
      color: hl?.color,
      id: hl?.id,
      sentence: !!sent,
    });
  }
  return segs;
}
