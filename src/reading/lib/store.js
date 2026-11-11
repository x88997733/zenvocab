import { get, set, del } from 'idb-keyval';

// 書櫃清單（不含全文）
export const loadBooks = () => get('books').then((v) => v ?? []);
export const saveBooks = (books) => set('books', books);

// 每本書的全文段落（轉成繁體後存入）
export const loadText = (id) => get(`text:${id}`).then((v) => v ?? []);
export const saveText = (id, paragraphs) => set(`text:${id}`, paragraphs);

// 閱讀時間：{ "2026-11-11": { bookId: seconds } }
export const loadStats = () => get('stats').then((v) => v ?? {});

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 寫入佇列：避免同時寫入時互相覆蓋
let queue = Promise.resolve();
export function addReadingSeconds(bookId, seconds) {
  if (seconds <= 0) return Promise.resolve();
  queue = queue.then(async () => {
    const stats = await loadStats();
    const day = todayKey();
    stats[day] = stats[day] || {};
    stats[day][bookId] = (stats[day][bookId] || 0) + seconds;
    await set('stats', stats);
  });
  return queue;
}

// 封面圖（Blob）
export const saveCover = (id, blob) => set(`cover:${id}`, blob);
export const loadCover = (id) => get(`cover:${id}`);

// 刪除書時清掉全文與封面
export async function deleteBookData(id) {
  await del(`text:${id}`);
  await del(`cover:${id}`);
  await del(`chapters:${id}`);
  await del(`anno:${id}`);
}

// 目錄（章節）
export const loadChapters = (id) => get(`chapters:${id}`).then((v) => v ?? null);
export const saveChapters = (id, toc) => set(`chapters:${id}`, toc);

// 書籤、劃線、閱讀設定（每本書）：{ bookmarks: [], highlights: [], settings: {} }
export const loadAnno = (id) => get(`anno:${id}`).then((v) => v ?? { bookmarks: [], highlights: [], settings: null });
export const saveAnno = (id, anno) => set(`anno:${id}`, anno);
