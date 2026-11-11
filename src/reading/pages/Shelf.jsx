import React, { useEffect, useRef, useState } from 'react';
import { parseBook } from '../lib/parse.js';
import { toTraditional } from '../lib/convert.js';
import { loadBooks, saveBooks, saveText, loadStats } from '../lib/store.js';
import { statusOf, formatDuration } from '../lib/progress.js';

const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export default function Shelf({ books, onOpen, onChanged }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [totals, setTotals] = useState({});

  useEffect(() => {
    loadStats().then((stats) => {
      const t = {};
      for (const day of Object.values(stats)) {
        for (const [id, sec] of Object.entries(day)) t[id] = (t[id] || 0) + sec;
      }
      setTotals(t);
    });
  }, [books]);

  async function handleFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setError('');
    const current = await loadBooks();
    for (const file of files) {
      try {
        setBusy(`匯入中：${file.name}`);
        const parsed = await parseBook(file);
        const paragraphs = parsed.paragraphs.map(toTraditional);
        const id = crypto.randomUUID();
        const meta = {
          id,
          title: toTraditional(parsed.title),
          author: parsed.author ? toTraditional(parsed.author) : '',
          index: 0,
          percent: 0,
          chars: paragraphs.reduce((n, p) => n + p.length, 0),
          paragraphCount: paragraphs.length,
          addedAt: Date.now(),
          lastRead: null,
        };
        await saveText(id, paragraphs);
        current.push(meta);
        await saveBooks(current);
      } catch (err) {
        setError(`${file.name}：${err.message}`);
      }
    }
    setBusy('');
    onChanged();
  }

  async function removeBook(book) {
    if (!confirm(`確定要刪除《${book.title}》嗎？`)) return;
    const current = (await loadBooks()).filter((b) => b.id !== book.id);
    await saveBooks(current);
    onChanged();
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>書櫃</h1>
        <button className="primary" onClick={() => inputRef.current?.click()} disabled={!!busy}>
          匯入書籍
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.epub,.pdf"
          multiple
          hidden
          onChange={handleFiles}
        />
      </header>

      {busy && <p className="notice">{busy}</p>}
      {error && <p className="notice error">{error}</p>}

      {books.length === 0 && !busy && (
        <p className="empty">還沒有書。按「匯入書籍」，可以選 TXT、EPUB 或 PDF。</p>
      )}

      <div className="shelf-grid">
        {books.map((book) => {
          const status = statusOf(book.percent);
          return (
            <article key={book.id} className="book-card">
              <button className="cover" style={{ background: `hsl(${hue(book.title)} 45% 42%)` }} onClick={() => onOpen(book.id)}>
                <span>{book.title.slice(0, 6)}</span>
              </button>
              <div className="book-info">
                <h2 title={book.title}>{book.title}</h2>
                <p className="meta">
                  {status} · {book.percent}%
                </p>
                <div className="bar">
                  <div style={{ width: `${book.percent}%` }} />
                </div>
                <p className="meta">閱讀 {formatDuration(totals[book.id] || 0)}</p>
                <div className="card-actions">
                  <button onClick={() => onOpen(book.id)}>{book.percent > 0 ? '繼續' : '開始'}</button>
                  <button className="ghost" onClick={() => removeBook(book)}>
                    刪除
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
