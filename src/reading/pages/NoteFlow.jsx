import React, { useEffect, useState } from 'react';
import { askReflection, draftReflection } from '../../services/api.js';
import { bookContext } from '../lib/bookinfo.js';
import { addNote, updateNote } from '../lib/notes.js';

const MAX_QUESTIONS = 3;

// 讀完後的心得對話：先問感想，AI 依書的內容追問重點與想法，最後整理成心得
export default function NoteFlow({ book, existing, onDone, toast }) {
  const [stage, setStage] = useState(existing ? 'draft' : 'impression');
  const [history, setHistory] = useState(existing?.history || []); // [{ role: 'ai'|'me', text }]
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState('');
  const [draft, setDraft] = useState(existing?.text || '');

  useEffect(() => {
    bookContext(book).then(setContext).catch(() => setContext(''));
  }, [book]);

  const asked = history.filter((h) => h.role === 'ai').length;
  const lastAi = [...history].reverse().find((h) => h.role === 'ai');

  async function ask(nextHistory) {
    setBusy(true);
    try {
      const r = await askReflection({ title: book.title, author: book.author, word: context, history: nextHistory });
      setHistory([...nextHistory, { role: 'ai', text: r.text.trim() }]);
      setStage('asking');
    } catch (err) {
      toast?.(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function startWithImpression() {
    if (!answer.trim()) return toast?.('先寫一句你的感想吧', 'info');
    const next = [{ role: 'me', text: answer.trim() }];
    setAnswer('');
    ask(next);
  }

  async function sendAnswer() {
    if (!answer.trim()) return;
    const next = [...history, { role: 'me', text: answer.trim() }];
    setAnswer('');
    setHistory(next);
    if (asked >= MAX_QUESTIONS) return draftNote(next);
    ask(next);
  }

  async function draftNote(from = history) {
    setBusy(true);
    try {
      const r = await draftReflection({ title: book.title, author: book.author, word: context, history: from });
      setDraft(r.text.trim());
      setHistory(from);
      setStage('draft');
    } catch (err) {
      toast?.(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft.trim()) return toast?.('心得內容是空的', 'info');
    if (existing) {
      await updateNote(existing.id, { text: draft.trim(), history });
      toast?.('心得已更新');
    } else {
      await addNote({ bookId: book.id, bookTitle: book.title, bookAuthor: book.author || '', text: draft.trim(), history });
      toast?.('心得已儲存');
    }
    onDone();
  }

  return (
    <section className="page note-flow">
      <header className="page-header">
        <button className="ghost" onClick={onDone}>← 返回</button>
        <h1 className="note-title">《{book.title}》</h1>
        <span />
      </header>

      {stage === 'impression' && (
        <div className="note-card">
          <p>讀完這本書，你的整體感想是什麼？一句話就好。</p>
          <textarea rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="例如：比我想像中實用，尤其是第二章的方法" />
          <button className="primary" onClick={startWithImpression} disabled={busy}>
            {busy ? 'AI 思考中…' : '開始'}
          </button>
        </div>
      )}

      {stage === 'asking' && lastAi && (
        <div className="note-card">
          <p className="meta">第 {asked} / {MAX_QUESTIONS} 題</p>
          <p className="note-question">{lastAi.text}</p>
          <textarea rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="寫下你的想法" />
          <div className="note-actions">
            <button onClick={() => draftNote()} disabled={busy}>直接整理心得</button>
            <button className="primary" onClick={sendAnswer} disabled={busy || !answer.trim()}>
              {busy ? 'AI 思考中…' : asked >= MAX_QUESTIONS ? '送出並整理' : '送出回答'}
            </button>
          </div>
        </div>
      )}

      {stage === 'draft' && (
        <div className="note-card">
          <p className="meta">心得草稿，可以直接修改後再儲存</p>
          <textarea className="note-body" rows={14} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="note-actions">
            <button onClick={() => setStage(existing ? 'draft' : 'impression')} disabled={busy}>
              {existing ? '取消' : '重新開始'}
            </button>
            <button className="primary" onClick={save} disabled={busy || !draft.trim()}>
              儲存心得
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
