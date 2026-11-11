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
  return { title: baseName(file.name), author: '', paragraphs: splitParagraphs(text) };
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

function xhtmlToParagraphs(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = doc.body ? [...doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre')] : [];
  const nested = blocks.filter((el) => !blocks.some((other) => other !== el && other.contains(el)));
  if (nested.length === 0) return splitParagraphs(doc.body?.textContent ?? '');
  return nested.map((el) => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export async function parseEpub(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('EPUB 格式不正確（找不到 container.xml）');
  const rootPath = new DOMParser()
    .parseFromString(containerXml, 'application/xml')
    .querySelector('rootfile')
    .getAttribute('full-path');
  const opfXml = await zip.file(rootPath).async('string');
  const opf = new DOMParser().parseFromString(opfXml, 'application/xml');
  const opfDir = rootPath.includes('/') ? rootPath.slice(0, rootPath.lastIndexOf('/')) : '';

  const title = opf.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim() || baseName(file.name);
  const author = opf.getElementsByTagNameNS('*', 'creator')[0]?.textContent?.trim() || '';

  const manifest = new Map();
  for (const item of opf.getElementsByTagNameNS('*', 'item')) {
    manifest.set(item.getAttribute('id'), item.getAttribute('href'));
  }
  const spineIds = [...opf.getElementsByTagNameNS('*', 'itemref')].map((r) => r.getAttribute('idref'));

  const paragraphs = [];
  for (const id of spineIds) {
    const href = manifest.get(id);
    if (!href) continue;
    const entry = zip.file(resolvePath(opfDir, decodeURIComponent(href)));
    if (!entry) continue;
    const html = await entry.async('string');
    paragraphs.push(...xhtmlToParagraphs(html));
  }
  if (paragraphs.length === 0) throw new Error('EPUB 裡沒有可讀取的文字');
  return { title, author, paragraphs };
}

// ---------- PDF（文字型 PDF；掃描版無法讀取）----------
export async function parsePdf(file) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      text += item.str;
      text += item.hasEOL ? '\n' : '';
    }
    text += '\n';
  }
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) throw new Error('讀不到文字，這可能是掃描版 PDF（第一版暫不支援）');
  return { title: baseName(file.name), author: '', paragraphs };
}

export async function parseBook(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.epub')) return parseEpub(file);
  if (name.endsWith('.pdf')) return parsePdf(file);
  if (name.endsWith('.txt')) return parseTxt(file);
  throw new Error('目前只支援 TXT、EPUB、PDF');
}
