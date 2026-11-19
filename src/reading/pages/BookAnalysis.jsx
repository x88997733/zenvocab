import React, { useEffect, useState } from 'react';
import { analyzeBook } from '../../services/api.js';
import { bookContext } from '../lib/bookinfo.js';
import { loadAnalysis, saveAnalysis } from '../lib/store.js';

// 書籍解析：AI 依書籍資料整理內容含義，第一次產生後保存，之後可重新產生
export default function BookAnalysis({ book, onClose, toast }) {
  const [text, setText] = useState('');
  const [updated, setUpdated] = useState(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const ctx = await bookContext(book);
      const r = await analyzeBook({ title: book.title, author: book.author, word: ctx });
      const data = { text: r.text.trim(), at: Date.now() };
      await saveAnalysis(book.id, data);
      setText(data.text);
      setUpdated(data.at);
    } catch (err) {
      toast?.(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadAnalysis(book.id).then((cached) => {
      if (cached) {
        setText(cached.text);
        setUpdated(cached.at);
      } else {
        generate();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  return (
    <div className="ob-backdrop" onClick={onClose}>
      <div className="analysis-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="analysis-head">
          <strong>書籍解析</strong>
          <button className="ghost" onClick={onClose}>關閉</button>
        </header>
        <h2 className="analysis-title">《{book.title}》</h2>
        {busy && <p className="notice">AI 正在整理這本書的內容…</p>}
        {!busy && text && <pre className="analysis-body">{text}</pre>}
        {!busy && !text && <p className="empty">還沒有解析內容。</p>}
        <footer className="analysis-foot">
          <span className="meta">
            {updated ? `產生於 ${new Date(updated).toLocaleDateString('zh-TW')} · ` : ''}由 AI 依書籍資料整理，僅供參考
          </span>
          <button onClick={generate} disabled={busy}>重新產生</button>
        </footer>
      </div>
    </div>
  );
}
