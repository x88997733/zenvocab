import React, { useEffect, useRef, useState } from 'react';
import { parseBook } from '../lib/parse.js';
import { toTraditional } from '../lib/convert.js';
import { loadBooks, saveBooks, saveText, loadStats, saveCover, loadCover, deleteBookData } from '../lib/store.js';
import { statusOf, formatDuration } from '../lib/progress.js';

const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export default function Shelf({ books, onOpen, onChanged }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [totals, setTotals] = useState({});
  const [covers, setCovers] = useState({});
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  // 載入封面（Blob → object URL），換書或卸載時釋放
  useEffect(() => {
    let cancelled = false;
    const urls = [];
    (async () => {
      const next = {};
      for (const b of books) {
        if (!b.hasCover) continue;
        const blob = await loadCover(b.id);
        if (blob) {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          next[b.id] = url;
        }
      }
      if (!cancelled) setCovers(next);
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [books]);

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
          hasCover: !!parsed.cover,
          lastRead: null,
        };
        await saveText(id, paragraphs);
        if (parsed.cover) await saveCover(id, parsed.cover);
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
    await deleteBookData(book.id);
    onChanged();
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  const allSelected = books.length > 0 && selected.size === books.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(books.map((b) => b.id)));
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`確定要刪除所選的 ${ids.length} 本書嗎？此動作無法復原。`)) return;
    const remaining = (await loadBooks()).filter((b) => !selected.has(b.id));
    await saveBooks(remaining);
    for (const id of ids) await deleteBookData(id);
    exitSelecting();
    onChanged();
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>書櫃</h1>
        <div className="header-actions">
          {selecting ? (
            <>
              <button onClick={toggleAll}>{allSelected ? '取消全選' : '全選'}</button>
              <button className="danger" onClick={deleteSelected} disabled={selected.size === 0}>
                刪除（{selected.size}）
              </button>
              <button onClick={exitSelecting}>完成</button>
            </>
          ) : (
            <>
              <button onClick={() => setSelecting(true)} disabled={books.length === 0}>
                選取
              </button>
              <button className="primary" onClick={() => inputRef.current?.click()} disabled={!!busy}>
                匯入書籍
              </button>
            </>
          )}
        </div>
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
          const isSelected = selected.has(book.id);
          return (
            <article
              key={book.id}
              className={`book-card${selecting && isSelected ? ' is-selected' : ''}`}
              onClick={selecting ? () => toggleSelect(book.id) : undefined}
            >
              <button
                className={covers[book.id] ? 'cover has-img' : 'cover'}
                style={covers[book.id] ? undefined : { background: `hsl(${hue(book.title)} 45% 42%)` }}
                onClick={selecting ? undefined : () => onOpen(book.id)}
              >
                {covers[book.id] ? <img src={covers[book.id]} alt="" /> : <span>{book.title.slice(0, 6)}</span>}
                {selecting && <span className={`check${isSelected ? ' on' : ''}`}>{isSelected ? '✓' : ''}</span>}
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
                {!selecting && (
                  <div className="card-actions">
                    <button onClick={() => onOpen(book.id)}>{book.percent > 0 ? '繼續' : '開始'}</button>
                    <button className="ghost" onClick={() => removeBook(book)}>
                      刪除
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
