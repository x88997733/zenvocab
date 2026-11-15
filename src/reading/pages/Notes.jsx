import React, { useEffect, useState } from 'react';
import { loadNotes, deleteNote } from '../lib/notes.js';

const fmt = (t) => new Date(t).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });

// 所有讀書心得列表：可開啟編輯或刪除
export default function Notes({ onEdit }) {
  const [notes, setNotes] = useState([]);
  const [open, setOpen] = useState(null);

  const refresh = () => loadNotes().then(setNotes);
  useEffect(() => {
    refresh();
  }, []);

  async function remove(n) {
    if (!confirm(`確定要刪除《${n.bookTitle}》的心得嗎？`)) return;
    await deleteNote(n.id);
    refresh();
  }

  if (notes.length === 0) return <p className="empty">還沒有心得。讀完書後，在書櫃按「寫心得」就能開始。</p>;

  return (
    <section>
      {notes.map((n) => (
        <article key={n.id} className="note-item">
          <button className="note-head" onClick={() => setOpen(open === n.id ? null : n.id)}>
            <strong>《{n.bookTitle}》</strong>
            <span className="meta">
              {n.bookAuthor ? `${n.bookAuthor} · ` : ''}更新 {fmt(n.updatedAt)}
            </span>
          </button>
          {open === n.id && (
            <div className="note-open">
              <pre className="note-pre">{n.text}</pre>
              <div className="note-actions">
                <button className="ghost" onClick={() => remove(n)}>刪除</button>
                <button onClick={() => onEdit(n)}>編輯</button>
              </div>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
