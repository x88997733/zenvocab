// 依實際排版高度分頁：fits(items) 由畫面端量測「這些片段排進一頁」是否放得下。
// items 是 [{ para, start, end }]，表示第 para 段的 [start, end) 字元。
export function paginateMeasured(paragraphs, fits) {
  const pages = [];
  let cur = [];
  const flush = () => {
    if (cur.length) pages.push(cur);
    cur = [];
  };

  paragraphs.forEach((text, para) => {
    const len = text.length;
    if (len === 0) {
      const item = { para, start: 0, end: 0 };
      if (!fits([...cur, item])) flush();
      cur.push(item);
      return;
    }

    let pos = 0;
    while (pos < len) {
      const tail = { para, start: pos, end: len };
      if (fits([...cur, tail])) {
        cur.push(tail);
        pos = len;
        break;
      }
      // 二分搜尋：目前這一頁最多能放到哪個字（end 為開區間）
      let lo = pos;
      let hi = len - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi + 1) / 2);
        if (fits([...cur, { para, start: pos, end: mid }])) lo = mid;
        else hi = mid - 1;
      }
      if (lo > pos) {
        cur.push({ para, start: pos, end: lo });
        pos = lo;
      } else if (cur.length === 0) {
        // 連一個字都放不下（極端情況），強制放一個字避免無限迴圈
        cur.push({ para, start: pos, end: pos + 1 });
        pos += 1;
      }
      flush();
    }
  });

  flush();
  return pages.length ? pages : [[]];
}

export function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
