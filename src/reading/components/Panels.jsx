import React, { useMemo, useState } from 'react';
import { THEMES, FONTS } from '../lib/settings.js';

const TABS = [
  ['toc', '目錄'],
  ['bookmarks', '書籤'],
  ['highlights', '劃線'],
  ['search', '搜本書'],
];

export function TocPanel({
  tab,
  setTab,
  chapters,
  currentChapter,
  index,
  paragraphs,
  bookmarks,
  highlights,
  onGo,
  onRemoveBookmark,
  onRemoveHighlight,
  onEditNote,
  onClose,
}) {
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    if (!paragraphs || !q.trim()) return [];
    const needle = q.trim().toLowerCase();
    const out = [];
    for (let i = 0; i < paragraphs.length && out.length < 100; i++) {
      const at = paragraphs[i].toLowerCase().indexOf(needle);
      if (at >= 0) {
        const t = paragraphs[i];
        out.push({ para: i, snippet: t.slice(Math.max(0, at - 18), at + needle.length + 30) });
      }
    }
    return out;
  }, [paragraphs, q]);

  return (
    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
      <div className="sheet-tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'toc' && (
        <ul className="sheet-list">
          {chapters.length === 0 && <li className="empty">這本書沒有偵測到目錄。</li>}
          {chapters.map((c, k) => (
            <li key={`${c.index}-${k}`}>
              <button
                className={`row-btn${currentChapter && currentChapter.index === c.index ? ' current' : ''}`}
                onClick={() => onGo(c.index)}
              >
                <span>{c.title}</span>
                <small>{c.index + 1}</small>
              </button>
            </li>
          ))}
        </ul>
      )}

      {tab === 'bookmarks' && (
        <ul className="sheet-list">
          {bookmarks.length === 0 && <li className="empty">還沒有書籤。在閱讀時按「書籤」即可加入。</li>}
          {bookmarks.map((b) => (
            <li key={b.para} className="row">
              <button className="row-btn" onClick={() => onGo(b.para)}>
                <span>{(paragraphs?.[b.para] || b.label || '').slice(0, 40)}</span>
                <small>{b.para + 1}</small>
              </button>
              <button className="ghost" onClick={() => onRemoveBookmark(b.para)}>
                刪除
              </button>
            </li>
          ))}
        </ul>
      )}

      {tab === 'highlights' && (
        <ul className="sheet-list">
          {highlights.length === 0 && <li className="empty">還沒有劃線。閱讀時選取文字即可劃線。</li>}
          {highlights.map((h) => (
            <li key={h.id} className="row wrap">
              <button className="row-btn" onClick={() => onGo(h.para)}>
                <span className={`hl-chip hl-${h.color}`}>{h.text.slice(0, 60)}</span>
              </button>
              {h.note && <p className="note">{h.note}</p>}
              <div className="row-actions">
                <button onClick={() => onEditNote(h)}>筆記</button>
                <button className="ghost" onClick={() => onRemoveHighlight(h.id)}>
                  刪除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === 'search' && (
        <div className="search-box">
          <input
            type="search"
            placeholder="輸入要搜尋的字或詞"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="sheet-list">
            {q.trim() && results.length === 0 && <li className="empty">找不到結果。</li>}
            {results.map((r) => (
              <li key={r.para}>
                <button className="row-btn" onClick={() => onGo(r.para)}>
                  <span>…{r.snippet}…</span>
                  <small>{r.para + 1}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="sheet-foot">
        <button onClick={onClose}>關閉</button>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format }) {
  return (
    <label className="set-row">
      <span>
        {label} <b>{format ? format(value) : value}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function SettingsPanel({ s, onlyBook, onToggleOnlyBook, onChange, voices, onClose }) {
  const sortedVoices = [...voices].sort((a, b) => Number(/zh/i.test(b.lang)) - Number(/zh/i.test(a.lang)));
  return (
    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
      <div className="set-head">
        <strong>閱讀設定</strong>
        <label className="toggle">
          <span>僅應用到當前書籍</span>
          <input type="checkbox" checked={onlyBook} onChange={(e) => onToggleOnlyBook(e.target.checked)} />
        </label>
      </div>
      {onlyBook && <p className="meta hint">開啟時，修改只會影響這本書；關閉時會改回全域設定。</p>}

      <Slider label="字體大小" value={s.fontSize} min={14} max={28} step={1} onChange={(v) => onChange('fontSize', v)} />
      <Slider label="左右邊距" value={s.margin} min={8} max={44} step={1} onChange={(v) => onChange('margin', v)} />
      <Slider
        label="行距"
        value={s.lineHeight}
        min={1.4}
        max={2.6}
        step={0.1}
        format={(v) => v.toFixed(1)}
        onChange={(v) => onChange('lineHeight', v)}
      />
      <div className="set-row inline">
        <span>首行縮進</span>
        <input type="checkbox" checked={s.indent} onChange={(e) => onChange('indent', e.target.checked)} />
      </div>

      <div className="set-row">
        <span>字體樣式</span>
        <div className="chips">
          {Object.entries(FONTS).map(([k, f]) => (
            <button key={k} className={s.font === k ? 'chip on' : 'chip'} onClick={() => onChange('font', k)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="set-row">
        <span>翻頁方式</span>
        <div className="chips">
          <button className={s.pageMode === 'scroll' ? 'chip on' : 'chip'} onClick={() => onChange('pageMode', 'scroll')}>
            上下捲動
          </button>
          <button className={s.pageMode === 'paged' ? 'chip on' : 'chip'} onClick={() => onChange('pageMode', 'paged')}>
            左右翻頁
          </button>
        </div>
      </div>

      <div className="set-row">
        <span>顏色</span>
        <div className="chips">
          {Object.entries(THEMES).map(([k, t]) => (
            <button
              key={k}
              className={`swatch${s.theme === k ? ' on' : ''}`}
              style={{ background: t.bg, color: t.ink }}
              onClick={() => onChange('theme', k)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Slider label="亮度（遮罩）" value={s.brightness} min={0} max={60} step={5} onChange={(v) => onChange('brightness', v)} />

      <div className="set-row">
        <span>朗讀速度</span>
        <div className="chips">
          {[0.75, 1, 1.25, 1.5, 2].map((r) => (
            <button key={r} className={s.rate === r ? 'chip on' : 'chip'} onClick={() => onChange('rate', r)}>
              {r}x
            </button>
          ))}
        </div>
      </div>

      <div className="set-row">
        <span>朗讀語音</span>
        <select value={s.voiceURI} onChange={(e) => onChange('voiceURI', e.target.value)}>
          <option value="">自動（優先中文）</option>
          {sortedVoices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
      </div>

      <div className="sheet-foot">
        <button onClick={onClose}>完成</button>
      </div>
    </div>
  );
}

export function WordSheet({ sheet, onAdd, onClose, onPick }) {
  const titles = { word: '查單字', ai: 'AI 解釋', chapter: '本章', summary: '本章重點', questions: '讀後思考題' };
  const aiText = ['ai', 'summary', 'questions'].includes(sheet.mode);
  const r = sheet.result;
  return (
    <div className="rd-modal" onClick={onClose}>
      <section className="rd-modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>{titles[sheet.mode] || 'AI 解釋'}</h3>
        <p className="quote">{sheet.text}</p>
        {sheet.loading && <p className="meta">查詢中…</p>}
        {sheet.error && <p className="notice error">{sheet.error}</p>}
        {!sheet.loading && r && sheet.mode === 'word' && (
          <div className="word-result">
            <h4>
              {r.word} <small>{r.phonetic}</small>
            </h4>
            <p className="meta">
              {r.partOfSpeech} · {r.level}
            </p>
            <p>{r.translation}</p>
            <p className="meta">{r.definition}</p>
            {r.example && (
              <p className="example">
                {r.example}
                <br />
                <small>{r.exampleTranslation}</small>
              </p>
            )}
          </div>
        )}
        {!sheet.loading && r && aiText && <p className="ai-text">{r.text}</p>}
        {sheet.mode === 'chapter' && (
          <div className="rd-modal-actions">
            <button className="primary" onClick={() => onPick('summary')}>本章重點</button>
            <button onClick={() => onPick('questions')}>讀後思考題</button>
          </div>
        )}
        <div className="rd-modal-actions">
          {!sheet.loading && r && sheet.mode === 'word' && <button className="primary" onClick={onAdd}>加入單字庫</button>}
          <button onClick={onClose}>關閉</button>
        </div>
      </section>
    </div>
  );
}
