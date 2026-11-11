import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Play, Pause, ExternalLink } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { fetchNews, newsDigest } from '../services/api.js';
import { todayKey } from '../reading/lib/store.js';
import { splitSentences, pickDefaultVoice } from '../reading/lib/speech.js';

// 每天一份快取：當天第一次打開時產生摘要，之後直接讀取
const cacheKey = () => `news:${todayKey()}`;

function HeadlineList({ title, items }) {
  if (!items?.length) return null;
  return (
    <section className="news-section">
      <h2>{title}</h2>
      <ul className="news-list">
        {items.map((it, i) => (
          <li key={`${it.link}-${i}`}>
            <a href={it.link} target="_blank" rel="noopener noreferrer">
              <span>{it.title}</span>
              <ExternalLink />
            </a>
            <small>{[it.source, it.pubDate && new Date(it.pubDate).toLocaleString('zh-TW', { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' })].filter(Boolean).join(' · ')}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function NewsPage({ toast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const runRef = useRef(0);

  async function load(force) {
    setLoading(true);
    setError('');
    try {
      if (!force) {
        const cached = await get(cacheKey());
        if (cached) {
          setData(cached);
          return;
        }
      }
      const [tw, world] = await Promise.all([fetchNews('tw'), fetchNews('world')]);
      const headlines = [...tw.items.slice(0, 10).map((x) => x.title), ...world.items.slice(0, 8).map((x) => x.title)].join('\n');
      let digest = '';
      try {
        digest = (await newsDigest(headlines)).text;
      } catch (e) {
        setError(`今日摘要產生失敗：${e.message || '未知錯誤'}（標題仍可閱讀）`);
      }
      const next = { tw: tw.items, world: world.items, digest };
      // 摘要失敗時不快取，下次打開會再試
      if (digest) await set(cacheKey(), next);
      setData(next);
    } catch (e) {
      setError(e.message || '新聞讀取失敗');
    } finally {
      setLoading(false);
    }
  }

  function stop() {
    runRef.current += 1;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    setPlaying(false);
  }

  function play() {
    if (!data?.digest || !('speechSynthesis' in window)) return;
    stop();
    const run = runRef.current;
    const voice = pickDefaultVoice(speechSynthesis.getVoices());
    const sents = splitSentences(data.digest);
    setPlaying(true);
    const speakAt = (i) => {
      if (run !== runRef.current) return;
      if (i >= sents.length) {
        setPlaying(false);
        return;
      }
      const u = new SpeechSynthesisUtterance(sents[i]);
      u.lang = 'zh-TW';
      if (voice) u.voice = voice;
      u.onend = () => speakAt(i + 1);
      u.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        setPlaying(false);
        toast?.(`朗讀失敗：${e.error}`, 'error');
      };
      speechSynthesis.speak(u);
    };
    speakAt(0);
  }

  useEffect(() => {
    load(false);
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="page">
      <header className="page-title">
        <span>DAILY NEWS</span>
        <h1>每日新聞</h1>
        <p>{todayKey()} · 每天更新，摘要可朗讀</p>
      </header>

      <div className="news-actions">
        <button className="news-primary" onClick={() => (playing ? stop() : play())} disabled={!data?.digest}>
          {playing ? <Pause /> : <Play />}
          {playing ? '暫停' : '朗讀今日摘要'}
        </button>
        <button
          className="news-ghost"
          disabled={loading}
          onClick={() => {
            stop();
            load(true);
          }}
        >
          <RefreshCw className={loading ? 'spin' : ''} />
          重新整理
        </button>
      </div>

      {loading && <p className="empty">載入中…</p>}
      {error && <p className="notice error">{error}</p>}

      {data?.digest && (
        <article className="news-digest">
          <h2>今日摘要</h2>
          {data.digest.split(/\n+/).filter(Boolean).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p className="news-note">摘要由 AI 依標題撰寫，可能不完整，請點下方連結看原文。</p>
        </article>
      )}

      <HeadlineList title="台灣頭條" items={data?.tw} />
      <HeadlineList title="國際新聞" items={data?.world} />
    </section>
  );
}
