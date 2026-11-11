import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Play, Pause, ExternalLink, Volume2, Star, Zap } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { fetchNews, newsDigest, newsBrief } from '../services/api.js';
import { todayKey } from '../reading/lib/store.js';
import { splitSentences, pickDefaultVoice } from '../reading/lib/speech.js';

const CATS = [
  ['top', '即時'],
  ['nation', '國內'],
  ['business', '經濟'],
  ['technology', '科技'],
  ['entertainment', '娛樂'],
  ['sports', '體育'],
  ['world', '國際'],
  ['english', 'English'],
  ['saved', '收藏'],
];

// 每天一份快取：當天第一次需要時才向伺服器與 AI 要資料
const kDigest = () => `news:${todayKey()}:digest`;
const kBrief = () => `news:${todayKey()}:brief`;
const kList = (c) => `news:${todayKey()}:list:${c}`;

const SAVED_KEY = 'news_saved';
const loadSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
  } catch {
    return [];
  }
};
const isZh = (t) => /[一-鿿]/.test(t);
const fmtTime = (d) => (d ? new Date(d).toLocaleString('zh-TW', { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' }) : '');

export default function NewsPage({ toast }) {
  const [cat, setCat] = useState('top');
  const [list, setList] = useState([]);
  const [digest, setDigest] = useState('');
  const [brief, setBrief] = useState('');
  const [saved, setSaved] = useState(loadSaved);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState(null);
  const runRef = useRef(0);
  const wantRef = useRef('top');

  function stop() {
    runRef.current += 1;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    setSpeaking(null);
  }

  // 朗讀一段文字（依句號切成小段，中英文自動換語言）
  function speak(text, tag) {
    if (!text || !('speechSynthesis' in window)) return;
    stop();
    const run = runRef.current;
    const voice = pickDefaultVoice(speechSynthesis.getVoices());
    const sents = splitSentences(text);
    setSpeaking(tag);
    const speakAt = (i) => {
      if (run !== runRef.current) return;
      if (i >= sents.length) {
        setSpeaking(null);
        return;
      }
      const u = new SpeechSynthesisUtterance(sents[i]);
      const zh = isZh(sents[i]);
      u.lang = zh ? 'zh-TW' : 'en-US';
      if (zh && voice) u.voice = voice;
      u.onend = () => speakAt(i + 1);
      u.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        setSpeaking(null);
        toast?.(`朗讀失敗：${e.error}`, 'error');
      };
      speechSynthesis.speak(u);
    };
    speakAt(0);
  }

  async function loadList(c, force) {
    if (c === 'saved') return;
    setLoading(true);
    setError('');
    try {
      if (!force) {
        const cached = await get(kList(c));
        if (cached) {
          if (wantRef.current === c) setList(cached);
          return;
        }
      }
      const d = await fetchNews(c);
      await set(kList(c), d.items);
      if (wantRef.current === c) setList(d.items);
    } catch (e) {
      if (wantRef.current === c) {
        setError(e.message || '新聞讀取失敗');
        setList([]);
      }
    } finally {
      if (wantRef.current === c) setLoading(false);
    }
  }

  // 取得幾個主要分類的標題，供晨報與懶人包使用
  async function headlinesForAI() {
    const parts = [];
    for (const c of ['top', 'nation', 'world']) {
      let items = await get(kList(c));
      if (!items) {
        const d = await fetchNews(c);
        items = d.items;
        await set(kList(c), items);
      }
      parts.push(...items.slice(0, 8).map((x) => x.title));
    }
    return parts.join('\n');
  }

  async function loadDigest() {
    const cached = await get(kDigest());
    if (cached) {
      setDigest(cached);
      return;
    }
    try {
      const text = (await newsDigest(await headlinesForAI())).text;
      await set(kDigest(), text);
      setDigest(text);
    } catch (e) {
      setError(`今日晨報產生失敗：${e.message || '未知錯誤'}（標題仍可閱讀）`);
    }
  }

  async function makeBrief() {
    setError('');
    const cached = await get(kBrief());
    if (cached) {
      setBrief(cached);
      return cached;
    }
    try {
      const text = (await newsBrief(await headlinesForAI())).text;
      await set(kBrief(), text);
      setBrief(text);
      return text;
    } catch (e) {
      setError(`懶人包產生失敗：${e.message || '未知錯誤'}`);
      return '';
    }
  }

  function toggleSave(item) {
    const exists = saved.some((x) => x.link === item.link);
    const next = exists ? saved.filter((x) => x.link !== item.link) : [...saved, item];
    setSaved(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    toast?.(exists ? '已取消收藏' : '已收藏', exists ? 'info' : 'success');
  }

  function chooseCat(c) {
    stop();
    setCat(c);
    wantRef.current = c;
    setError('');
    if (c !== 'saved') loadList(c, false);
  }

  useEffect(() => {
    loadList('top', false);
    loadDigest();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = cat === 'saved' ? saved : list;

  return (
    <section className="page">
      <header className="page-title">
        <span>DAILY NEWS</span>
        <h1>每日新聞</h1>
        <p>{todayKey()} · 每天更新，可朗讀</p>
      </header>

      <div className="news-tabs">
        {CATS.map(([id, label]) => (
          <button key={id} className={cat === id ? 'active' : ''} onClick={() => chooseCat(id)}>
            {label}
          </button>
        ))}
      </div>

      {cat === 'top' && (
        <div className="news-cards">
          <div className="news-card">
            <div className="news-card-head">
              <strong>今日晨報</strong>
              <button
                className="news-chip"
                disabled={!digest}
                onClick={() => (speaking === 'digest' ? stop() : speak(digest, 'digest'))}
              >
                {speaking === 'digest' ? <Pause /> : <Play />}
                {speaking === 'digest' ? '暫停' : '朗讀'}
              </button>
            </div>
            {digest ? (
              digest.split(/\n+/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)
            ) : (
              <p className="meta">產生中…</p>
            )}
            <p className="news-note">摘要由 AI 依標題撰寫，可能不完整，請點新聞看原文。</p>
          </div>

          <div className="news-card">
            <div className="news-card-head">
              <strong>
                <Zap /> 懶人包（約一分鐘）
              </strong>
              <button
                className="news-chip"
                onClick={async () => {
                  const text = brief || (await makeBrief());
                  if (text) speak(text, 'brief');
                }}
              >
                {speaking === 'brief' ? <Pause /> : <Play />}
                {speaking === 'brief' ? '暫停' : brief ? '朗讀' : '生成並朗讀'}
              </button>
            </div>
            {brief ? <p>{brief}</p> : <p className="meta">出門前按一下，快速聽完今天的重點。</p>}
          </div>
        </div>
      )}

      <div className="news-actions-row">
        <button className="news-ghost" disabled={loading || cat === 'saved'} onClick={() => loadList(cat, true)}>
          <RefreshCw className={loading ? 'spin' : ''} />
          重新整理
        </button>
      </div>

      {loading && <p className="empty">載入中…</p>}
      {error && <p className="notice error">{error}</p>}
      {cat === 'saved' && items.length === 0 && <p className="empty">還沒有收藏的新聞。</p>}

      <ul className="news-list">
        {items.map((it, i) => {
          const isSaved = saved.some((x) => x.link === it.link);
          const tag = `item-${i}`;
          return (
            <li key={`${it.link}-${i}`}>
              <a href={it.link} target="_blank" rel="noopener noreferrer">
                <span>{it.title}</span>
                <ExternalLink />
              </a>
              <div className="news-item-foot">
                <small>{[it.source, fmtTime(it.pubDate)].filter(Boolean).join(' · ')}</small>
                <span className="news-item-btns">
                  <button onClick={() => (speaking === tag ? stop() : speak(it.title, tag))} aria-label="朗讀">
                    {speaking === tag ? <Pause /> : <Volume2 />}
                  </button>
                  <button className={isSaved ? 'on' : ''} onClick={() => toggleSave(it)} aria-label="收藏">
                    <Star />
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
