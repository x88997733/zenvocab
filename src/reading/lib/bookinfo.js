import { loadText, loadChapters } from './store.js';

// 給 AI 的書籍背景資料：電子書取目錄加幾段均勻取樣的內文；實體書用書目資料與目錄照片
const MAX_CONTEXT = 4000;

export async function ebookContext(book) {
  const paragraphs = await loadText(book.id);
  const toc = (await loadChapters(book.id)) || [];
  const parts = [];
  if (toc.length) parts.push('目錄：' + toc.map((c) => c.title).join('、'));
  const step = Math.max(1, Math.floor(paragraphs.length / 10));
  let excerpt = '';
  for (let i = 0; i < paragraphs.length && excerpt.length < MAX_CONTEXT; i += step) {
    excerpt += paragraphs[i].slice(0, 300) + '\n';
  }
  if (excerpt) parts.push('內文節錄：\n' + excerpt);
  return parts.join('\n\n').slice(0, MAX_CONTEXT);
}

export function physicalContext(book) {
  const parts = [];
  if (book.description) parts.push('簡介：' + book.description);
  if (book.toc) parts.push('目錄：\n' + book.toc);
  if (!parts.length) parts.push('（沒有取得簡介或目錄，請依讀者的回答提問）');
  return parts.join('\n\n').slice(0, MAX_CONTEXT);
}

export function bookContext(book) {
  return book.physical ? Promise.resolve(physicalContext(book)) : ebookContext(book);
}

// 用 ISBN 或書名、作者查書目資料（Google Books 公開 API）
export async function lookupBook({ isbn, title, author }) {
  const q = isbn ? `isbn:${isbn}` : [title && `intitle:${title}`, author && `inauthor:${author}`].filter(Boolean).join(' ');
  if (!q) return null;
  const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1`);
  if (!r.ok) return null;
  const data = await r.json();
  const info = data.items?.[0]?.volumeInfo;
  if (!info) return null;
  return {
    title: info.title || '',
    author: (info.authors || []).join('、'),
    description: (info.description || '').replace(/<[^>]+>/g, '').slice(0, 1500),
  };
}
