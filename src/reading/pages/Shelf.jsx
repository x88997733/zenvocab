import React, { useEffect, useRef, useState } from 'react';
import { parseBook } from '../lib/parse.js';
import { toTraditional } from '../lib/convert.js';
import { loadBooks, saveBooks, saveText, loadStats, saveCover, loadCover, deleteBookData, saveChapters } from '../lib/store.js';
import { statusOf, formatDuration } from '../lib/progress.js';
import { compressImage } from '../../utils/image.js';
import { readBookCover, readToc } from '../../services/api.js';
import { lookupBook } from '../lib/bookinfo.js';

const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export default function Shelf({ books, onOpen, onChanged, onWriteNote, toast }) {
  const inputRef = useRef(null);
  const coverRef = useRef(null);
  const tocRef = useRef(null);
  const [phys, setPhys] = useState(null); // 實體書登錄表單：{ cover, title, author, isbn, description, toc, busy }
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
        if (parsed.toc?.length) await saveChapters(id, parsed.toc);
        current.push(meta);
        await saveBooks(current);
      } catch (err) {
        setError(`${file.name}：${err.message}`);
      }
    }
    setBusy('');
    onChanged();
  }

  // ---- 實體書登錄 ----
  function startPhysical() {
    setPhys({ cover: null, title: '', author: '', isbn: '', description: '', toc: '', busy: '' });
    setTimeout(() => coverRef.current?.click(), 0);
  }

  async function onCoverPicked(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setPhys((p) => ({ ...(p || {}), busy: '辨識封面中…' }));
    try {
      const img = await compressImage(f);
      const r = await readBookCover(img.data, img.mimeType);
      const info = await fetchBookInfo({ isbn: r.isbn, title: r.title, author: r.author });
      setPhys((p) => ({
        ...(p || {}),
        cover: img,
        title: info?.title || r.title || p?.title || '',
        author: info?.author || r.author || p?.author || '',
        isbn: r.isbn || p?.isbn || '',
        description: info?.description || p?.description || '',
        busy: '',
      }));
    } catch (err) {
      setPhys((p) => ({ ...(p || {}), busy: '' }));
      toast?.(err.message, 'error');
    }
  }

  async function fetchBookInfo(query) {
    try {
      const info = await lookupBook(query);
      if (!info) return null;
      return { title: toTraditional(info.title), author: toTraditional(info.author), description: toTraditional(info.description) };
    } catch {
      return null;
    }
  }

  async function onTocPicked(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setPhys((p) => ({ ...(p || {}), busy: '讀取目錄中…' }));
    try {
      const img = await compressImage(f);
      const r = await readToc(img.data, img.mimeType);
      setPhys((p) => ({ ...(p || {}), toc: toTraditional((r.text || '').trim()), busy: '' }));
    } catch (err) {
      setPhys((p) => ({ ...(p || {}), busy: '' }));
      toast?.(err.message, 'error');
    }
  }

  async function savePhysical() {
    if (!phys?.title.trim()) return toast?.('請填入書名', 'info');
    const current = await loadBooks();
    const id = crypto.randomUUID();
    if (phys.cover) {
      const blob = await (await fetch(phys.cover.preview)).blob();
      await saveCover(id, blob);
    }
    await saveText(id, []);
    current.push({
      id,
      title: phys.title.trim(),
      author: phys.author.trim(),
      isbn: phys.isbn.trim(),
      description: phys.description,
      toc: phys.toc,
      physical: true,
      index: 0,
      percent: 0,
      chars: 0,
      paragraphCount: 0,
      addedAt: Date.now(),
      hasCover: !!phys.cover,
      lastRead: null,
    });
    await saveBooks(current);
    setPhys(null);
    toast?.('已登錄實體書');
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
              <button onClick={startPhysical} disabled={!!busy || !!phys}>
                登錄實體書
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

      <input ref={coverRef} type="file" accept="image/*" capture="environment" hidden onChange={onCoverPicked} />
      <input ref={tocRef} type="file" accept="image/*" capture="environment" hidden onChange={onTocPicked} />

      {phys && (
        <section className="phys-form">
          <h2>登錄實體書</h2>
          {phys.cover ? <img className="phys-preview" src={phys.cover.preview} alt="封面" /> : <p className="meta">先拍封面，AI 會幫你填入書名與作者。</p>}
          <div className="note-actions">
            <button onClick={() => coverRef.current?.click()} disabled={!!phys.busy}>拍封面</button>
            <button onClick={() => tocRef.current?.click()} disabled={!!phys.busy}>拍目錄（選填）</button>
          </div>
          {phys.busy && <p className="notice">{phys.busy}</p>}
          <label className="field">書名
            <input value={phys.title} onChange={(e) => setPhys({ ...phys, title: e.target.value })} />
          </label>
          <label className="field">作者
            <input value={phys.author} onChange={(e) => setPhys({ ...phys, author: e.target.value })} />
          </label>
          <label className="field">ISBN（選填）
            <input value={phys.isbn} onChange={(e) => setPhys({ ...phys, isbn: e.target.value })} />
          </label>
          {phys.toc && <p className="meta">目錄：{phys.toc.split('\n').slice(0, 6).join('、')}{phys.toc.split('\n').length > 6 ? '…' : ''}</p>}
          <div className="note-actions">
            <button className="ghost" onClick={() => setPhys(null)}>取消</button>
            <button className="primary" onClick={savePhysical} disabled={!!phys.busy || !phys.title.trim()}>儲存</button>
          </div>
        </section>
      )}

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
                {book.physical ? (
                  <p className="meta">實體書</p>
                ) : (
                  <>
                    <p className="meta">
                      {status} · {book.percent}%
                    </p>
                    <div className="bar">
                      <div style={{ width: `${book.percent}%` }} />
                    </div>
                    <p className="meta">閱讀 {formatDuration(totals[book.id] || 0)}</p>
                  </>
                )}
                {!selecting && (
                  <div className="card-actions">
                    {!book.physical && <button onClick={() => onOpen(book.id)}>{book.percent > 0 ? '繼續' : '開始'}</button>}
                    <button onClick={() => onWriteNote(book)}>寫心得</button>
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
