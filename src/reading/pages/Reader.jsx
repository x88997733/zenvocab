import React, { useEffect, useRef, useState } from 'react';
import { loadBooks, saveBooks, loadText, addReadingSeconds } from '../lib/store.js';
import { offsetsOf, percentAt, statusOf } from '../lib/progress.js';
import { splitSentences, pickDefaultVoice } from '../lib/speech.js';

const IDLE_LIMIT_MS = 2 * 60 * 1000; // 超過 2 分鐘沒有操作，就不計入閱讀時間

export default function Reader({ book, onBack, onProgress }) {
  const [paragraphs, setParagraphs] = useState(null);
  const [index, setIndex] = useState(book.index || 0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURI] = useState('');

  const indexRef = useRef(index);
  const playingRef = useRef(false);
  const runIdRef = useRef(0);
  const utterancesRef = useRef([]);
  const offsetsRef = useRef([0]);
  const rateRef = useRef(1);
  const voiceRef = useRef(null);

  // ---------- 載入全文與語音 ----------
  useEffect(() => {
    loadText(book.id).then((paras) => {
      setParagraphs(paras);
      offsetsRef.current = offsetsOf(paras);
    });
  }, [book.id]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const load = () => {
      const list = speechSynthesis.getVoices();
      setVoices(list);
      const fallback = pickDefaultVoice(list);
      if (!voiceRef.current && fallback) {
        voiceRef.current = fallback;
        setVoiceURI(fallback.voiceURI);
      }
    };
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', load);
      stopSpeaking();
    };
  }, []);

  // 開啟時捲到上次的位置
  useEffect(() => {
    if (!paragraphs) return;
    document.getElementById(`p-${index}`)?.scrollIntoView({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paragraphs]);

  // ---------- 進度儲存 ----------
  function saveProgress(i) {
    const percent = percentAt(offsetsRef.current, i);
    loadBooks().then((all) => {
      const next = all.map((b) =>
        b.id === book.id ? { ...b, index: i, percent: Math.max(percent, b.percent || 0), lastRead: Date.now() } : b
      );
      return saveBooks(next);
    }).then(onProgress);
  }

  function goTo(i, { scroll = false } = {}) {
    if (!paragraphs) return;
    const clamped = Math.max(0, Math.min(paragraphs.length - 1, i));
    indexRef.current = clamped;
    setIndex(clamped);
    saveProgress(clamped);
    if (scroll) document.getElementById(`p-${clamped}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // ---------- 朗讀 ----------
  function stopSpeaking() {
    runIdRef.current += 1;
    utterancesRef.current = [];
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    playingRef.current = false;
    setPlaying(false);
  }

  function speakFrom(i, run) {
    if (run !== runIdRef.current) return;
    if (i >= paragraphs.length) {
      stopSpeaking();
      return;
    }
    indexRef.current = i;
    setIndex(i);
    saveProgress(i);
    document.getElementById(`p-${i}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });

    const voice = voiceRef.current;
    const sentences = splitSentences(paragraphs[i]);
    const next = () => {
      if (run === runIdRef.current && indexRef.current === i) speakFrom(i + 1, run);
    };
    sentences.forEach((text, k) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice?.lang || 'zh-TW';
      if (voice) u.voice = voice;
      u.rate = rateRef.current;
      if (k === sentences.length - 1) {
        u.onend = next;
        u.onerror = (e) => {
          if (e.error !== 'interrupted' && e.error !== 'canceled') next();
        };
      }
      utterancesRef.current.push(u); // 保留參照，避免瀏覽器回收
      speechSynthesis.speak(u);
    });
  }

  function play() {
    if (!paragraphs || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const run = ++runIdRef.current;
    utterancesRef.current = [];
    playingRef.current = true;
    setPlaying(true);
    speakFrom(indexRef.current, run);
  }

  function pause() {
    stopSpeaking();
  }

  function togglePlay() {
    if (playingRef.current) pause();
    else play();
  }

  // 改速度、換語音時，若正在朗讀就從目前段落重新開始
  function restartIfPlaying() {
    if (playingRef.current) play();
  }

  // ---------- 閱讀時間統計 ----------
  useEffect(() => {
    let lastActivity = Date.now();
    let pending = 0;
    const bump = () => {
      lastActivity = Date.now();
    };
    const events = ['scroll', 'pointerdown', 'keydown', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const flush = () => {
      if (pending > 0) {
        addReadingSeconds(book.id, pending);
        pending = 0;
      }
    };
    const tick = setInterval(() => {
      const visible = document.visibilityState === 'visible';
      const active = visible && (playingRef.current || Date.now() - lastActivity < IDLE_LIMIT_MS);
      if (active) pending += 1;
      if (pending >= 10) flush();
    }, 1000);
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(tick);
      flush();
      events.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [book.id]);

  // ---------- 畫面 ----------
  const percent = paragraphs ? percentAt(offsetsRef.current, index) : book.percent;
  const sortedVoices = [...voices].sort((a, b) => Number(/zh/i.test(b.lang)) - Number(/zh/i.test(a.lang)));

  function handleBack() {
    stopSpeaking();
    onBack();
  }

  return (
    <section className="reader">
      <header className="reader-header">
        <button className="ghost" onClick={handleBack}>
          ← 書櫃
        </button>
        <div className="reader-title">
          <strong>{book.title}</strong>
          <span className="meta">
            {statusOf(percent)} · {percent}%
          </span>
        </div>
      </header>

      <div className="progress-line">
        <div style={{ width: `${percent}%` }} />
      </div>

      <div className="reader-body">
        {!paragraphs && <p className="empty">載入中…</p>}
        {paragraphs?.map((p, i) => (
          <p
            key={i}
            id={`p-${i}`}
            className={i === index ? 'para current' : 'para'}
            onClick={() => {
              goTo(i);
              if (playingRef.current) play();
            }}
          >
            {p}
          </p>
        ))}
      </div>

      <footer className="player">
        <input
          type="range"
          min="0"
          max={Math.max(0, (paragraphs?.length || 1) - 1)}
          value={index}
          onChange={(e) => {
            const i = Number(e.target.value);
            goTo(i);
            restartIfPlaying();
          }}
        />
        <div className="player-buttons">
          <button onClick={() => { goTo(index - 1, { scroll: true }); restartIfPlaying(); }}>上一段</button>
          <button className="primary" onClick={togglePlay} disabled={!paragraphs}>
            {playing ? '暫停' : '朗讀'}
          </button>
          <button onClick={() => { goTo(index + 1, { scroll: true }); restartIfPlaying(); }}>下一段</button>
        </div>
        <div className="player-settings">
          <label>
            速度
            <select
              value={rate}
              onChange={(e) => {
                const r = Number(e.target.value);
                rateRef.current = r;
                setRate(r);
                restartIfPlaying();
              }}
            >
              {[0.75, 1, 1.25, 1.5, 2].map((r) => (
                <option key={r} value={r}>
                  {r}x
                </option>
              ))}
            </select>
          </label>
          <label>
            語音
            <select
              value={voiceURI}
              onChange={(e) => {
                const v = voices.find((x) => x.voiceURI === e.target.value) || null;
                voiceRef.current = v;
                setVoiceURI(e.target.value);
                restartIfPlaying();
              }}
            >
              {sortedVoices.length === 0 && <option value="">沒有可用語音</option>}
              {sortedVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
        </div>
      </footer>
    </section>
  );
}
