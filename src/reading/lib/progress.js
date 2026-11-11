// 段落字數的累積位置：offsets[i] = 第 i 段之前的總字數
export function offsetsOf(paragraphs) {
  const offsets = [0];
  for (const p of paragraphs) offsets.push(offsets[offsets.length - 1] + p.length);
  return offsets;
}

// 讀完第 index 段後的進度（%）
export function percentAt(offsets, index) {
  const total = offsets[offsets.length - 1];
  if (!total) return 0;
  return Math.min(100, Math.round((offsets[index + 1] / total) * 1000) / 10);
}

export function statusOf(percent) {
  if (percent >= 100) return '已讀完';
  if (percent > 0) return '閱讀中';
  return '未讀';
}

export function formatDuration(seconds) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} 小時 ${m} 分`;
  if (m > 0) return `${m} 分`;
  return `${s} 秒`;
}
