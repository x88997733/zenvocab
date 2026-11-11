import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadBooks, saveBooks, loadText, addReadingSeconds, loadChapters, loadAnno, saveAnno } from '../lib/store.js';
import { offsetsOf, percentAt, statusOf } from '../lib/progress.js';
import { splitSentences, pickDefaultVoice } from '../lib/speech.js';
import { loadGlobalSettings, saveGlobalSettings, effectiveSettings, THEMES, FONTS } from '../lib/settings.js';
import { pageForParagraph, pageForPos } from '../lib/pagination.js';
import { paginateMeasured, escapeHtml } from '../lib/measure.js';
import { buildSegments } from '../lib/marks.js';
import { detectChapters, currentChapter, isHeadingText, isChapterStart } from '../lib/chapters.js';
import { lookupWord, explainText, summarizeChapter, chapterQuestions } from '../../services/api.js';
import { makeQuoteCard } from '../lib/card.js';
import { TocPanel, SettingsPanel, WordSheet } from '../components/Panels.jsx';

const IDLE_LIMIT_MS = 2 * 60 * 1000; // 超過 2 分鐘沒有操作，就不計入閱讀時間
const COLORS = { yellow: '#f6e27a', green: '#b7e4b0', pink: '#f5b7c4' };

export default function Reader({ book, onBack, onProgress, addEntries, toast }) {
  const [paragraphs, setParagraphs] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [anno, setAnnoState] = useState({ bookmarks: [], highlights: [], settings: null, onlyBook: false });
  const [gs, setGs] = useState(loadGlobalSettings);
  const [index, setIndex] = useState(book.index || 0);
  const [pageIdx, setPageIdx] = useState(0);
  const pageIdxRef = useRef(0);
  pageIdxRef.current = pageIdx;
  // 上方標題列與下方播放列預設隱藏，點畫面中間才叫出來
  const [chrome, setChrome] = useState(false);
  // 睡眠定時：到時間自動停止朗讀（時間戳，毫秒）
  const [sleepEnd, setSleepEnd] = useState(null);
  const [, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [activeSent, setActiveSent] = useState(null);
  const [voices, setVoices] = useState([]);
  const [panel, setPanel] = useState(null); // null | 'toc' | 'settings'
  const [tab, setTab] = useState('toc');
  const [selection, setSelection] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const s = effectiveSettings(gs, anno.settings);
  const paged = s.pageMode === 'paged';

  const rootRef = useRef(null);
  const pageAreaRef = useRef(null);
  const annoRef = useRef(anno);
  const indexRef = useRef(index);
  const playingRef = useRef(false);
  const runIdRef = useRef(0);
  const utterancesRef = useRef([]);
  const offsetsRef = useRef([0]);
  const touchXRef = useRef(null);
  // 分頁模式下目前頁首的位置（段落 + 段內起始字元），重新分頁時用來還原位置
  const anchorRef = useRef({ para: index, start: 0 });
  const paragraphsRef = useRef(null);
  paragraphsRef.current = paragraphs;

  // 標題段落（序、目錄、第X章…）：自成一段、加粗，不縮排
  const isHeading = (i) => !!paragraphs && isHeadingText(paragraphs[i] || '');

  // 分頁結果：用畫面上的隱藏區實際量測排版高度來切頁（不再用字數估算）
  const [pages, setPages] = useState(null);
  const measureRef = useRef(null);
  useEffect(() => {
    const area = pageAreaRef.current;
    const measurer = measureRef.current;
    if (!paragraphs || !paged || !area || !measurer) {
      setPages(null);
      return;
    }
    const cap = area.clientHeight;
    const fits = (items) => {
      measurer.innerHTML = items
        .map((c) => {
          const text = paragraphs[c.para].slice(c.start, c.end);
          const heading = c.start === 0 && isHeadingText(paragraphs[c.para]);
          const indent = s.indent && c.start === 0 && !heading ? '2em' : '0';
          return `<p class="para${heading ? ' heading' : ''}" style="text-indent:${indent}">${text ? escapeHtml(text) : '&nbsp;'}</p>`;
        })
        .join('');
      return measurer.offsetHeight <= cap;
    };
    setPages(paginateMeasured(paragraphs, fits, (i) => isChapterStart(paragraphs[i])));
    measurer.innerHTML = '';
  }, [paragraphs, paged, size.w, size.h, s.fontSize, s.lineHeight, s.margin, s.indent, s.font]);

  // 給朗讀流程用的最新值（避免閉包拿到舊資料）
  const latest = useRef({});
  latest.current = { s, pages, voices };

  // ---------- 載入全文、目錄、標註 ----------
  useEffect(() => {
    let alive = true;
    Promise.all([loadText(book.id), loadChapters(book.id), loadAnno(book.id)]).then(([paras, chs, a]) => {
      if (!alive) return;
      setParagraphs(paras);
      offsetsRef.current = offsetsOf(paras);
      setChapters(chs && chs.length ? chs : detectChapters(paras));
      const merged = { bookmarks: [], highlights: [], settings: null, onlyBook: false, ...a };
      annoRef.current = merged;
      setAnnoState(merged);
    });
    return () => {
      alive = false;
    };
  }, [book.id]);

  // 開啟時捲到上次的位置
  useEffect(() => {
    if (!paragraphs || paged) return;
    document.getElementById(`p-${indexRef.current}`)?.scrollIntoView({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paragraphs]);

  // 分頁模式：依目前段落決定所在頁；字體等變動後也保持在同一段
  useEffect(() => {
    if (paged && pages) setPageIdx(pageForPos(pages, anchorRef.current));
  }, [paged, pages]);

  // 可視區域大小（分頁用）
  useEffect(() => {
    const el = pageAreaRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [paged]);

  // 語音清單
  useEffect(() => {
    if (!('speechSynthesis' in window)) return undefined;
    const load = () => {
      const list = speechSynthesis.getVoices();
      setVoices(list);
      if (!gs.voiceURI) {
        const fallback = pickDefaultVoice(list);
        if (fallback && !anno.settings?.voiceURI) {
          // 只在使用者還沒選過語音時自動套用預設
          setGs((g) => {
            const n = { ...g, voiceURI: fallback.voiceURI };
            saveGlobalSettings(n);
            return n;
          });
        }
      }
    };
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', load);
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 進度儲存
  function saveProgress(i) {
    const percent = paragraphsRef.current ? percentAt(offsetsRef.current, i) : 0;
    loadBooks()
      .then((all) =>
        saveBooks(
          all.map((b) =>
            b.id === book.id ? { ...b, index: i, percent: Math.max(percent, b.percent || 0), lastRead: Date.now() } : b
          )
        )
      )
      .then(onProgress);
  }

  function saveAnnoState(next) {
    annoRef.current = next;
    setAnnoState(next);
    saveAnno(book.id, next);
  }

  function goTo(i, { scroll = false, keepPage = false } = {}) {
    if (!paragraphsRef.current) return;
    const clamped = Math.max(0, Math.min(paragraphsRef.current.length - 1, i));
    indexRef.current = clamped;
    setIndex(clamped);
    if (paged && latest.current.pages && !keepPage) {
      setPageIdx(pageForParagraph(latest.current.pages, clamped));
      anchorRef.current = { para: clamped, start: 0 };
    }
    saveProgress(clamped);
    if (scroll && !paged) document.getElementById(`p-${clamped}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function turnPage(delta) {
    const pg = latest.current.pages;
    if (!pg) return;
    const next = Math.max(0, Math.min(pg.length - 1, pageIdx + delta));
    if (next === pageIdx) {
      toast?.(delta > 0 ? '已經是最後一頁' : '已經是第一頁', 'info');
      return;
    }
    const first = pg[next][0];
    pageIdxRef.current = next;
    setPageIdx(next);
    if (first) {
      anchorRef.current = { para: first.para, start: first.start };
      indexRef.current = first.para;
      setIndex(first.para);
      saveProgress(first.para);
    }
    if (playingRef.current) play();
  }

  // 睡眠定時：每秒檢查一次，到時間就停止朗讀
  useEffect(() => {
    if (!sleepEnd) return undefined;
    const t = setInterval(() => {
      if (Date.now() >= sleepEnd) {
        setSleepEnd(null);
        stopSpeaking();
        toast?.('睡眠定時時間到，已停止朗讀', 'info');
      } else {
        setTick((x) => x + 1);
      }
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepEnd]);

  function setSleep(minutes) {
    setSleepEnd(minutes ? Date.now() + minutes * 60 * 1000 : null);
    toast?.(minutes ? `${minutes} 分鐘後自動停止朗讀` : '已取消睡眠定時', 'info');
  }

  // 朗讀時保持螢幕開啟（支援的瀏覽器）；切回頁面時重新申請
  const wakeRef = useRef(null);
  useEffect(() => {
    async function hold() {
      if (!('wakeLock' in navigator)) return;
      try {
        wakeRef.current = await navigator.wakeLock.request('screen');
      } catch {
        // 裝置不允許或省電模式，就算了
      }
    }
    function release() {
      const lock = wakeRef.current;
      wakeRef.current = null;
      lock?.release().catch(() => {});
    }
    if (playing) hold();
    else release();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && playingRef.current) hold();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [playing]);

  // ---------- 朗讀 ----------
  function stopSpeaking() {
    runIdRef.current += 1;
    utterancesRef.current = [];
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    playingRef.current = false;
    setPlaying(false);
    setActiveSent(null);
  }

  function speakFrom(i, run) {
    if (run !== runIdRef.current) return;
    const paras = paragraphsRef.current;
    if (!paras || i >= paras.length) {
      stopSpeaking();
      return;
    }
    const L = latest.current;
    indexRef.current = i;
    setIndex(i);
    saveProgress(i);
    if (L.s.pageMode === 'paged' && L.pages) {
      // 目前這一頁已經有這段文字時就不換頁（避免朗讀時被拉回前一頁）
      const cur = L.pages[pageIdxRef.current];
      if (!cur || !cur.some((c) => c.para === i)) {
        const target = pageForParagraph(L.pages, i);
        pageIdxRef.current = target;
        setPageIdx(target);
      }
      const first = L.pages[pageIdxRef.current]?.[0];
      if (first) anchorRef.current = { para: first.para, start: first.start };
    }
    else document.getElementById(`p-${i}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });

    const voice = L.voices.find((v) => v.voiceURI === L.s.voiceURI) || pickDefaultVoice(L.voices);
    const sentences = splitSentences(paras[i]);
    const next = () => {
      if (run === runIdRef.current && indexRef.current === i) speakFrom(i + 1, run);
    };
    sentences.forEach((text, k) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice?.lang || 'zh-TW';
      if (voice) u.voice = voice;
      u.rate = L.s.rate;
      u.onstart = () => {
        if (run === runIdRef.current) setActiveSent({ para: i, text });
      };
      if (k === sentences.length - 1) u.onend = next;
      // 出錯時立刻停止並顯示原因，避免段落一直被跳過
      u.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        if (run !== runIdRef.current) return;
        stopSpeaking();
        setSpeechError(`朗讀失敗（${e.error || '未知原因'}）。請確認靜音開關與音量，或換一個語音再試。`);
      };
      utterancesRef.current.push(u); // 保留參照，避免瀏覽器回收
      speechSynthesis.speak(u);
    });
  }

  function play() {
    if (!paragraphsRef.current) return;
    if (!('speechSynthesis' in window)) {
      setSpeechError('這個瀏覽器不支援朗讀功能。');
      return;
    }
    setSpeechError('');
    speechSynthesis.cancel();
    if (speechSynthesis.paused) speechSynthesis.resume(); // 有些瀏覽器會卡在暫停狀態
    const run = ++runIdRef.current;
    utterancesRef.current = [];
    playingRef.current = true;
    setPlaying(true);
    speakFrom(indexRef.current, run);
  }

  function togglePlay() {
    if (playingRef.current) stopSpeaking();
    else play();
  }

  // 改速度或語音時，若正在朗讀就從目前段落重新開始
  useEffect(() => {
    if (playingRef.current) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.rate, s.voiceURI]);

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

  // ---------- 選取文字（劃線、查單字、AI 解釋）----------
  useEffect(() => {
    let timer;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const sel = window.getSelection();
        const root = rootRef.current;
        if (!sel || sel.isCollapsed || !root) {
          setSelection(null);
          return;
        }
        const text = sel.toString().trim();
        const anchor = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
        const pEl = anchor?.closest?.('[data-para]');
        if (!text || !pEl || !root.contains(pEl) || text.length > 300) {
          setSelection(null);
          return;
        }
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        setSelection({
          text,
          para: Number(pEl.dataset.para),
          rect: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
        });
      }, 350);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', onChange);
    };
  }, []);

  function clearSelection() {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  function addHighlight(color) {
    if (!selection) return;
    const a = annoRef.current;
    saveAnnoState({
      ...a,
      highlights: [...a.highlights, { id: crypto.randomUUID(), para: selection.para, text: selection.text, color, note: '', at: Date.now() }],
    });
    clearSelection();
    toast?.('已劃線');
  }

  async function openLookup(mode) {
    if (!selection) return;
    const text = selection.text;
    clearSelection();
    setSheet({ mode, text, loading: true });
    try {
      const result = mode === 'word' ? await lookupWord(text) : await explainText(text);
      setSheet({ mode, text, loading: false, result });
    } catch (e) {
      setSheet({ mode, text, loading: false, error: e.message || '查詢失敗' });
    }
  }

  // 把選取的文字做成金句卡片（可分享或下載）
  async function makeCard() {
    if (!selection) return;
    const text = selection.text;
    clearSelection();
    try {
      const blob = await makeQuoteCard(text, book.title);
      const file = new File([blob], 'quote.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: book.title }).catch(() => {});
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'quote.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast?.('已產生卡片圖片');
    } catch (e) {
      toast?.(e.message || '產生卡片失敗', 'error');
    }
  }

  // 本章內容（章節範圍；沒有目錄時從目前位置開始）
  function chapterInfo() {
    const ch = currentChapter(chapters, curPara);
    const start = ch ? ch.index : curPara;
    const nextCh = chapters.find((c) => c.index > start);
    const end = nextCh ? nextCh.index : paragraphs?.length || 0;
    const text = (paragraphs || []).slice(start, end).join('\n').slice(0, 12000);
    return { title: ch ? ch.title : book.title, text };
  }

  function openChapter() {
    setSheet({ mode: 'chapter', text: chapterInfo().title });
  }

  async function runChapterAI(kind) {
    const { title, text } = chapterInfo();
    setSheet({ mode: kind, text: title, loading: true });
    try {
      const fn = kind === 'summary' ? summarizeChapter : chapterQuestions;
      const result = await fn(text);
      setSheet({ mode: kind, text: title, loading: false, result });
    } catch (e) {
      setSheet({ mode: kind, text: title, loading: false, error: e.message || '產生失敗' });
    }
  }

  function toggleNight() {
    changeSetting('theme', s.theme === 'dark' ? 'cream' : 'dark');
  }

  function addToVocab() {
    if (!sheet?.result) return;
    addEntries?.([sheet.result]);
    toast?.('已加入單字庫');
  }

  // ---------- 書籤、筆記、設定 ----------
  const curPara = paged && pages && pages[pageIdx]?.[0] ? pages[pageIdx][0].para : index;
  const isBookmarked = anno.bookmarks.some((b) => b.para === curPara);

  function toggleBookmark() {
    const a = annoRef.current;
    const exists = a.bookmarks.find((b) => b.para === curPara);
    if (exists) {
      saveAnnoState({ ...a, bookmarks: a.bookmarks.filter((b) => b !== exists) });
      toast?.('已移除書籤', 'info');
    } else {
      saveAnnoState({
        ...a,
        bookmarks: [...a.bookmarks, { para: curPara, label: (paragraphs?.[curPara] || '').slice(0, 30), at: Date.now() }],
      });
      toast?.('已加入書籤');
    }
  }

  function editNote(h) {
    const note = window.prompt('筆記', h.note || '');
    if (note === null) return;
    const a = annoRef.current;
    saveAnnoState({ ...a, highlights: a.highlights.map((x) => (x.id === h.id ? { ...x, note } : x)) });
  }

  function changeSetting(key, value) {
    const a = annoRef.current;
    if (a.onlyBook) {
      saveAnnoState({ ...a, settings: { ...(a.settings || {}), [key]: value } });
    } else {
      setGs((g) => {
        const n = { ...g, [key]: value };
        saveGlobalSettings(n);
        return n;
      });
    }
  }

  function toggleOnlyBook(on) {
    const a = annoRef.current;
    if (on) saveAnnoState({ ...a, onlyBook: true, settings: { ...s } });
    else saveAnnoState({ ...a, onlyBook: false, settings: null });
  }

  // ---------- 翻頁手勢 ----------
  function onPageClick(e) {
    if (suppressIfPressed()) return;
    if (!window.getSelection()?.isCollapsed) return;
    const rect = pageAreaRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (x < 0.3) turnPage(-1);
    else if (x > 0.7) turnPage(1);
    else setChrome((c) => !c);
  }

  // 長按段落：從這一段開始朗讀（移動手指就取消）
  const pressRef = useRef({ timer: null, fired: false, x: 0, y: 0 });
  function pressStart(e) {
    const el = e.target.closest?.('[data-para]');
    if (!el) return;
    const para = Number(el.dataset.para);
    const t = e.touches[0];
    const p = pressRef.current;
    clearTimeout(p.timer);
    p.fired = false;
    p.x = t.clientX;
    p.y = t.clientY;
    p.timer = setTimeout(() => {
      p.timer = null;
      p.fired = true;
      window.getSelection()?.removeAllRanges();
      setSelection(null);
      goTo(para);
      play();
    }, 600);
  }
  function pressMove(e) {
    const p = pressRef.current;
    if (!p.timer) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - p.x) > 10 || Math.abs(t.clientY - p.y) > 10) {
      clearTimeout(p.timer);
      p.timer = null;
    }
  }
  function pressEnd() {
    const p = pressRef.current;
    if (p.timer) {
      clearTimeout(p.timer);
      p.timer = null;
    }
  }
  function suppressIfPressed() {
    if (pressRef.current.fired) {
      pressRef.current.fired = false;
      return true;
    }
    return false;
  }

  function onTouchStart(e) {
    touchXRef.current = e.touches[0].clientX;
  }

  function onTouchEnd(e) {
    if (touchXRef.current == null) return;
    const dx = e.changedTouches[0].clientX - touchXRef.current;
    touchXRef.current = null;
    if (Math.abs(dx) > 50 && window.getSelection()?.isCollapsed) turnPage(dx < 0 ? 1 : -1);
  }

  // ---------- 畫面 ----------
  const percent = paragraphs ? percentAt(offsetsRef.current, paged && pages ? (pages[pageIdx]?.[0]?.para ?? index) : index) : book.percent;
  const chapter = currentChapter(chapters, curPara);

  function renderSegs(text, para) {
    const hls = anno.highlights.filter((h) => h.para === para);
    const active = activeSent && activeSent.para === para ? activeSent.text : null;
    return buildSegments(text, hls, active).map((seg, k) => {
      if (seg.mark === 'hl') return <mark key={k} className={`hl-${seg.color || 'yellow'}`}>{seg.text}</mark>;
      if (seg.mark === 'sent' || seg.sentence) return <span key={k} className="sent">{seg.text}</span>;
      return <React.Fragment key={k}>{seg.text}</React.Fragment>;
    });
  }

  function handleBack() {
    stopSpeaking();
    onBack();
  }

  const showChrome = chrome || !!speechError;

  const cssVars = {
    '--rd-font': FONTS[s.font].stack,
    '--rd-size': `${s.fontSize}px`,
    '--rd-lh': s.lineHeight,
    '--rd-bg': THEMES[s.theme].bg,
    '--rd-ink': THEMES[s.theme].ink,
    '--rd-margin': `${s.margin}px`,
    '--rd-sheet': s.theme === 'dark' ? '#1c1c1e' : '#fffdf8',
    '--rd-sheet-ink': s.theme === 'dark' ? '#e6e6e6' : '#2b2a27',
  };

  // 用 portal 掛到 body，避免被 App 的版面（sticky 標題列、底部導覽列、transform）擋住或改變定位
  return createPortal(
    <div className="rd-root">
    <section className={`reader${showChrome ? '' : ' no-chrome'}`} ref={rootRef} style={cssVars} onClick={(e) => e.target === e.currentTarget && setSelection(null)}>
      {showChrome && <header className="reader-header">
        <button className="ghost" onClick={handleBack}>
          ← 書櫃
        </button>
        <div className="reader-title">
          <strong>{book.title}</strong>
          <span className="meta">
            {chapter ? `${chapter.title} · ` : ''}
            {statusOf(percent)} · {percent}%
          </span>
        </div>
        <div className="reader-tools">
          <button className="ghost" onClick={toggleNight} aria-label="夜間模式">
            🌙
          </button>
          <button className="ghost" onClick={toggleBookmark}>
            {isBookmarked ? '已加書籤' : '書籤'}
          </button>
          <button
            className="ghost"
            onClick={() => {
              setTab('toc');
              setPanel('toc');
            }}
          >
            目錄
          </button>
          <button className="ghost" onClick={() => setPanel('settings')}>
            Aa
          </button>
        </div>
      </header>}

      <div className="progress-line">
        <div style={{ width: `${percent}%` }} />
      </div>

      {!paragraphs && <p className="empty">載入中…</p>}

      {paragraphs && !paged && (
        <div
          className="reader-body"
          onTouchStart={pressStart}
          onTouchMove={pressMove}
          onTouchEnd={pressEnd}
          onTouchCancel={pressEnd}
          onContextMenu={(e) => {
            if (pressRef.current.fired) e.preventDefault();
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && window.getSelection()?.isCollapsed) setChrome((c) => !c);
          }}
        >
          {paragraphs.map((p, i) => (
            <p
              key={i}
              id={`p-${i}`}
              data-para={i}
              className={`${i === index ? 'para current' : 'para'}${isHeading(i) ? ' heading' : ''}`}
              style={{ textIndent: s.indent && !isHeading(i) ? '2em' : 0 }}
              onClick={() => {
                if (suppressIfPressed()) return;
                if (!window.getSelection()?.isCollapsed) return;
                goTo(i);
                if (playingRef.current) play();
                setChrome((c) => !c);
              }}
            >
              {renderSegs(p, i)}
            </p>
          ))}
        </div>
      )}

      {paragraphs && paged && (
        <div
          className="page-area"
          ref={pageAreaRef}
          onClick={onPageClick}
          onTouchStart={(e) => {
            onTouchStart(e);
            pressStart(e);
          }}
          onTouchMove={pressMove}
          onTouchEnd={(e) => {
            onTouchEnd(e);
            pressEnd();
          }}
          onTouchCancel={pressEnd}
          onContextMenu={(e) => {
            if (pressRef.current.fired) e.preventDefault();
          }}
        >
          <div
            ref={measureRef}
            className="page-text"
            aria-hidden="true"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'auto', overflow: 'visible', visibility: 'hidden', padding: `16px ${s.margin}px` }}
          />
          {pages && pages[pageIdx] && (
            <div className="page-text" style={{ padding: `16px ${s.margin}px` }}>
              {pages[pageIdx].map((c, k) => (
                <p
                  key={k}
                  data-para={c.para}
                  className={`para${c.start === 0 && isHeading(c.para) ? ' heading' : ''}`}
                  style={{ textIndent: s.indent && c.start === 0 && !isHeading(c.para) ? '2em' : 0 }}
                >
                  {renderSegs(paragraphs[c.para].slice(c.start, c.end), c.para)}
                </p>
              ))}
            </div>
          )}
          <div className="page-foot">{pages ? `${pageIdx + 1} / ${pages.length}` : ''}</div>
        </div>
      )}

      {showChrome && <footer className="player">
        {sleepEnd && <p className="sleep-note">⏱ 約 {Math.max(1, Math.ceil((sleepEnd - Date.now()) / 60000))} 分鐘後自動停止</p>}
        {speechError && <p className="notice error">{speechError}</p>}
        <input
          type="range"
          min="0"
          max={paged && pages ? Math.max(0, pages.length - 1) : Math.max(0, (paragraphs?.length || 1) - 1)}
          value={paged && pages ? pageIdx : index}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (paged && pages) {
              setPageIdx(v);
              if (pages[v]?.[0]) {
                anchorRef.current = { para: pages[v][0].para, start: pages[v][0].start };
                goTo(pages[v][0].para, { keepPage: true });
              }
            } else {
              goTo(v);
              if (playingRef.current) play();
            }
          }}
        />
        <div className="player-buttons">
          <button
            onClick={() => {
              if (paged) turnPage(-1);
              else {
                goTo(index - 1, { scroll: true });
                if (playingRef.current) play();
              }
            }}
          >
            上一{paged ? '頁' : '段'}
          </button>
          <button className="primary" onClick={togglePlay} disabled={!paragraphs}>
            {playing ? '暫停' : '朗讀'}
          </button>
          <button
            onClick={() => {
              if (paged) turnPage(1);
              else {
                goTo(index + 1, { scroll: true });
                if (playingRef.current) play();
              }
            }}
          >
            下一{paged ? '頁' : '段'}
          </button>
          <button onClick={openChapter} disabled={!paragraphs}>
            本章
          </button>
        </div>
      </footer>}

      {selection && (
        <div className="rd-selbar">
          {Object.entries(COLORS).map(([k, c]) => (
            <button key={k} className="dot" style={{ background: c }} onClick={() => addHighlight(k)} aria-label="劃線" />
          ))}
          <button onClick={() => openLookup('word')}>查單字</button>
          <button onClick={() => openLookup('ai')}>AI 解釋</button>
          <button onClick={makeCard}>做成卡片</button>
        </div>
      )}

      {panel && <div className="rd-backdrop" onClick={() => setPanel(null)} />}

      {panel === 'toc' && (
        <TocPanel
          tab={tab}
          setTab={setTab}
          chapters={chapters}
          currentChapter={chapter}
          index={curPara}
          paragraphs={paragraphs}
          bookmarks={anno.bookmarks}
          highlights={anno.highlights}
          onGo={(i) => {
            setPanel(null);
            goTo(i, { scroll: true });
            if (playingRef.current) play();
          }}
          onRemoveBookmark={(para) => saveAnnoState({ ...annoRef.current, bookmarks: annoRef.current.bookmarks.filter((b) => b.para !== para) })}
          onRemoveHighlight={(id) => saveAnnoState({ ...annoRef.current, highlights: annoRef.current.highlights.filter((h) => h.id !== id) })}
          onEditNote={editNote}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === 'settings' && (
        <SettingsPanel
          s={s}
          onlyBook={anno.onlyBook}
          onToggleOnlyBook={toggleOnlyBook}
          onChange={changeSetting}
          voices={voices}
          onClose={() => setPanel(null)}
          sleepEnd={sleepEnd}
          onSleep={setSleep}
        />
      )}

      {sheet && (
        <WordSheet
          sheet={sheet}
          onAdd={addToVocab}
          onPick={runChapterAI}
          onClose={() => setSheet(null)}
        />
      )}

      {s.brightness > 0 && <div className="rd-dim" style={{ opacity: s.brightness / 100 }} />}
    </section>
    </div>,
    document.body
  );
}
