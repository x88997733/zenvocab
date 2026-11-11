// TXT 沒有內建目錄，用常見的「第X章」「第X回」等標題規則自動找出章節
const CHAPTER_RE = /^第[一二三四五六七八九十百千萬零〇兩\d]+[章節回卷部篇集]\s*\S*/;
const SPECIAL_RE = /^(序|序章|楔子|引子|前言|後記|尾聲|番外|附錄)(\s|$|：|:)/;

export function detectChapters(paragraphs) {
  const toc = [];
  paragraphs.forEach((p, i) => {
    const t = p.trim();
    if (t.length > 40) return; // 章節標題通常很短
    if (CHAPTER_RE.test(t) || SPECIAL_RE.test(t)) toc.push({ title: t, index: i });
  });
  return toc;
}

// 目前所在的章節（最後一個開始位置不超過 index 的章節）
export function currentChapter(toc, index) {
  let found = null;
  for (const c of toc) {
    if (c.index <= index) found = c;
    else break;
  }
  return found;
}

// 看起來像標題的短段落（序、目錄、版權資訊、第X章…），顯示時要自成一段並加粗
const HEADING_RE = /^(序|序言|目錄|目录|前言|後記|版權資訊|版权信息|扉頁|扉页|封面|作者簡介|作者简介|謝辭|致謝|索引)\s*$|^第[一二三四五六七八九十百千萬零〇兩\d]+[章節回卷部篇集]/;
export function isHeadingText(text) {
  const t = text.trim();
  return t.length > 0 && t.length <= 30 && (HEADING_RE.test(t) || CHAPTER_RE.test(t) || SPECIAL_RE.test(t));
}

// 「第X章／節／回」開頭的章節標題：分頁時要從新的一頁開始
export function isChapterStart(text) {
  const t = (text || '').trim();
  return t.length > 0 && t.length <= 30 && CHAPTER_RE.test(t);
}
