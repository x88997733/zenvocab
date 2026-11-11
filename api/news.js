// 新聞標題來源（RSS）。伺服器端抓取，避免瀏覽器跨網域限制；每 30 分鐘快取一次。
const GN = (topic) => `https://news.google.com/rss/headlines/section/topic/${topic}?hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
const FEEDS = {
  top: 'https://news.google.com/rss?hl=zh-TW&gl=TW&ceid=TW:zh-Hant',
  nation: GN('NATION'),
  world: GN('WORLD'),
  business: GN('BUSINESS'),
  technology: GN('TECHNOLOGY'),
  entertainment: GN('ENTERTAINMENT'),
  sports: GN('SPORTS'),
  english: 'https://feeds.bbci.co.uk/news/world/rss.xml',
};
const cache = {};

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

const tagOf = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : '';
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const feed = FEEDS[req.query.feed] ? req.query.feed : 'top';
  const hit = cache[feed];
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return res.status(200).json({ items: hit.items });
  try {
    const r = await fetch(FEEDS[feed], { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`新聞來源回應 ${r.status}`);
    const xml = await r.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .slice(0, 15)
      .map((m) => ({
        title: tagOf(m[1], 'title'),
        link: tagOf(m[1], 'link'),
        pubDate: tagOf(m[1], 'pubDate'),
        source: tagOf(m[1], 'source'),
      }))
      .filter((x) => x.title);
    cache[feed] = { at: Date.now(), items };
    return res.status(200).json({ items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || '新聞讀取失敗' });
  }
}
