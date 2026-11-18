import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// 把一大段文字切成段落（以換行切開，去掉空白行）
export function splitParagraphs(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function baseName(fileName) {
  return fileName.replace(/\.[^.]+$/, '');
}

// ---------- TXT ----------
function decodeText(buffer) {
  // 依序嘗試：UTF-8 → Big5（台灣舊檔常見）→ GB18030（簡體舊檔常見）
  for (const enc of ['utf-8', 'big5', 'gb18030']) {
    try {
      return new TextDecoder(enc, { fatal: true }).decode(buffer);
    } catch {
      // try next encoding
    }
  }
  return new TextDecoder('utf-8').decode(buffer);
}

export async function parseTxt(file) {
  const text = decodeText(await file.arrayBuffer());
  return { title: baseName(file.name), author: '', paragraphs: splitParagraphs(text), cover: null, toc: [] };
}

// ---------- EPUB ----------
function resolvePath(base, href) {
  const parts = (base ? base + '/' : '').split('/').filter(Boolean);
  for (const seg of href.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const stripHash = (href) => decodeURIComponent(href.split('#')[0]);

function xhtmlToParagraphs(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = doc.body ? [...doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre')] : [];
  const nested = blocks.filter((el) => !blocks.some((other) => other !== el && other.contains(el)));
  if (nested.length === 0) return splitParagraphs(doc.body?.textContent ?? '');
  return nested.map((el) => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function isZip(buffer) {
  const b = new Uint8Array(buffer, 0, 4);
  return b[0] === 0x50 && b[1] === 0x4b; // "PK"
}

// 讀取目錄（EPUB3 nav 或 EPUB2 ncx），回傳 [{ title, href }]
async function readTocEntries(zip, manifestItems, opfDir) {
  const navItem = manifestItems.find((i) => (i.getAttribute('properties') || '').split(/\s+/).includes('nav'));
  const ncxItem = manifestItems.find((i) => i.getAttribute('media-type') === 'application/x-dtbncx+xml');
  const entries = [];
  if (navItem) {
    const navPath = resolvePath(opfDir, stripHash(navItem.getAttribute('href')));
    const xml = await zip.file(navPath)?.async('string');
    if (xml) {
      const doc = new DOMParser().parseFromString(xml, 'text/html');
      const navs = [...doc.querySelectorAll('nav')];
      const nav = navs.find((n) => /toc/i.test(n.outerHTML)) || navs[0];
      for (const a of nav?.querySelectorAll('a[href]') || []) {
        entries.push({ title: a.textContent.replace(/\s+/g, ' ').trim(), href: resolvePath(dirOf(navPath), stripHash(a.getAttribute('href'))) });
      }
    }
  } else if (ncxItem) {
    const ncxPath = resolvePath(opfDir, stripHash(ncxItem.getAttribute('href')));
    const xml = await zip.file(ncxPath)?.async('string');
    if (xml) {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      for (const np of doc.getElementsByTagNameNS('*', 'navPoint')) {
        const title = np.getElementsByTagNameNS('*', 'text')[0]?.textContent?.trim();
        const src = np.getElementsByTagNameNS('*', 'content')[0]?.getAttribute('src');
        if (title && src) entries.push({ title, href: resolvePath(dirOf(ncxPath), stripHash(src)) });
      }
    }
  }
  return entries;
}

export async function parseEpub(file) {
  const buffer = await file.arrayBuffer();
  if (!isZip(buffer)) {
    throw new Error('這個 EPUB 不是有效的壓縮檔格式，可能是改過副檔名的其他檔案，或檔案已損毀');
  }
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error('無法解開這個 EPUB，檔案可能已損毀，或有加密（例如 DRM）');
  }

  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('EPUB 格式不正確（找不到 container.xml）');
  const rootPath = new DOMParser()
    .parseFromString(containerXml, 'application/xml')
    .querySelector('rootfile')
    .getAttribute('full-path');
  const opfXml = await zip.file(rootPath).async('string');
  const opf = new DOMParser().parseFromString(opfXml, 'application/xml');
  const opfDir = dirOf(rootPath);

  const title = opf.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim() || baseName(file.name);
  const author = opf.getElementsByTagNameNS('*', 'creator')[0]?.textContent?.trim() || '';

  const manifestItems = [...opf.getElementsByTagNameNS('*', 'item')];
  const manifest = new Map(manifestItems.map((i) => [i.getAttribute('id'), i]));
  const spineIds = [...opf.getElementsByTagNameNS('*', 'itemref')].map((r) => r.getAttribute('idref'));

  // 封面：EPUB 3 用 properties="cover-image"，EPUB 2 用 <meta name="cover">
  let coverItem = manifestItems.find((i) => (i.getAttribute('properties') || '').split(/\s+/).includes('cover-image'));
  if (!coverItem) {
    const meta = [...opf.getElementsByTagNameNS('*', 'meta')].find((m) => m.getAttribute('name') === 'cover');
    if (meta) coverItem = manifest.get(meta.getAttribute('content'));
  }
  let cover = null;
  if (coverItem) {
    const entry = zip.file(resolvePath(opfDir, stripHash(coverItem.getAttribute('href'))));
    if (entry) {
      const bytes = await entry.async('uint8array');
      cover = new Blob([bytes], { type: coverItem.getAttribute('media-type') || 'image/jpeg' });
    }
  }

  // 內文，並記下每個檔案開始的段落位置（用來把目錄對到段落）
  const paragraphs = [];
  const fileStarts = new Map();
  for (const id of spineIds) {
    const item = manifest.get(id);
    if (!item) continue;
    const path = resolvePath(opfDir, stripHash(item.getAttribute('href')));
    const entry = zip.file(path);
    if (!entry) continue;
    if (!fileStarts.has(path)) fileStarts.set(path, paragraphs.length);
    paragraphs.push(...xhtmlToParagraphs(await entry.async('string')));
  }
  if (paragraphs.length === 0) throw new Error('EPUB 裡沒有可讀取的文字');

  // 目錄
  let toc = [];
  try {
    const entries = await readTocEntries(zip, manifestItems, opfDir);
    toc = entries
      .filter((e) => fileStarts.has(e.href))
      .map((e) => ({ title: e.title, index: fileStarts.get(e.href) }));
  } catch {
    toc = [];
  }
  return { title, author, paragraphs, cover, toc };
}

// ---------- PDF（文字型 PDF；掃描版無法讀取）----------
async function renderPdfCover(pdf) {
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 360 / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

// PDF 的每一行文字都會以換行結束，不能每行都當成一段。
// 依照版面判斷段落：段首縮排、或上一行明顯短於版面寬度（段尾）才換段，其餘接在同一段。
export function joinPdfLines(lines) {
  const mode = (arr) => {
    const count = new Map();
    arr.forEach((v) => count.set(v, (count.get(v) || 0) + 1));
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  };
  const clean = lines.filter((l) => l.text.trim());
  if (clean.length === 0) return [];
  const left = mode(clean.map((l) => Math.round(l.x0)));
  const sortedRight = clean.map((l) => l.x1).sort((a, b) => a - b);
  const right = sortedRight[Math.floor(sortedRight.length * 0.9)] ?? 0;

  const out = [];
  let cur = '';
  clean.forEach((l, i) => {
    const text = l.text.trim();
    const prev = clean[i - 1];
    const newPage = prev && l.page !== prev.page;
    const indented = l.x0 > left + l.size * 0.5;
    const prevShort = prev && prev.x1 < right - prev.size * 1.5;
    if (!cur || newPage || indented || prevShort) {
      if (cur) out.push(cur);
      cur = text;
    } else {
      const needsSpace = /[A-Za-z]$/.test(cur) && /^[A-Za-z]/.test(text);
      cur += (needsSpace ? ' ' : '') + text;
    }
  });
  if (cur) out.push(cur);
  return out;
}

export async function parsePdf(file) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let line = null;
    for (const item of content.items) {
      if (!item.str) {
        if (item.hasEOL && line) {
          lines.push(line);
          line = null;
        }
        continue;
      }
      const x = item.transform[4];
      const size = Math.abs(item.transform[3]) || item.height || 12;
      if (!line) line = { text: '', x0: x, x1: x, size, page: i };
      line.text += item.str;
      line.x1 = x + (item.width || 0);
      line.size = Math.max(line.size, size);
      if (item.hasEOL) {
        lines.push(line);
        line = null;
      }
    }
    if (line) lines.push(line);
  }
  const paragraphs = joinPdfLines(lines);
  if (paragraphs.length === 0) throw new Error('讀不到文字，這可能是掃描版 PDF（目前不支援）');

  let cover = null;
  try {
    cover = await renderPdfCover(pdf);
  } catch {
    cover = null; // 封面失敗不影響匯入
  }
  return { title: baseName(file.name), author: '', paragraphs, cover, toc: [] };
}

export async function parseBook(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.epub')) return parseEpub(file);
  if (name.endsWith('.pdf')) return parsePdf(file);
  if (name.endsWith('.txt')) return parseTxt(file);
  throw new Error('目前只支援 TXT、EPUB、PDF');
}
