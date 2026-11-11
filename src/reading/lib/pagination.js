// 左右翻頁用的分頁：依字級、行距、可視寬高估算每頁容納的字數。
// 回傳 pages，每頁是 [{ para, start, end }]，表示第 para 段的 [start, end) 字元。
export function paginate(paragraphs, { fontSize, lineHeight, width, height, indent }) {
  const charsPerLine = Math.max(8, Math.floor(width / fontSize));
  const linesPerPage = Math.max(3, Math.floor(height / (fontSize * lineHeight)));
  const indentChars = indent ? 2 : 0;

  const pages = [];
  let cur = [];
  let used = 0;

  const flush = () => {
    if (cur.length) pages.push(cur);
    cur = [];
    used = 0;
  };

  paragraphs.forEach((text, para) => {
    let pos = 0;
    // 空段落也佔一行
    if (text.length === 0) {
      if (used + 1 > linesPerPage) flush();
      cur.push({ para, start: 0, end: 0 });
      used += 1;
      return;
    }
    while (pos < text.length) {
      const firstLineIndent = pos === 0 ? indentChars : 0;
      const remainingLines = linesPerPage - used;
      if (remainingLines <= 0) {
        flush();
        continue;
      }
      const remainingChars = text.length - pos;
      const linesNeeded = Math.ceil((firstLineIndent + remainingChars) / charsPerLine);
      if (linesNeeded <= remainingLines) {
        cur.push({ para, start: pos, end: text.length });
        used += linesNeeded;
        pos = text.length;
      } else {
        const takeChars = remainingLines * charsPerLine - firstLineIndent;
        const take = Math.max(1, takeChars);
        cur.push({ para, start: pos, end: pos + take });
        pos += take;
        flush();
      }
    }
  });
  flush();
  return pages.length ? pages : [[]];
}

// 找出某段落所在的第一頁
export function pageForParagraph(pages, para) {
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].some((c) => c.para === para)) return i;
  }
  // 段落在前面的頁已結束時，找最後一個開始位置不超過它的頁
  let found = 0;
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].length && pages[i][0].para <= para) found = i;
  }
  return found;
}
