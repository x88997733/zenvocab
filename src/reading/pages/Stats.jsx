import React, { useEffect, useState } from 'react';
import { loadStats, todayKey } from '../lib/store.js';
import { formatDuration } from '../lib/progress.js';

export default function Stats({ books }) {
  const [stats, setStats] = useState({});

  useEffect(() => {
    loadStats().then(setStats);
  }, [books]);

  const titleOf = (id) => books.find((b) => b.id === id)?.title || '（已刪除的書）';

  const perBook = {};
  let total = 0;
  for (const day of Object.values(stats)) {
    for (const [id, sec] of Object.entries(day)) {
      perBook[id] = (perBook[id] || 0) + sec;
      total += sec;
    }
  }

  // 最近 7 天
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    const secs = Object.values(stats[key] || {}).reduce((a, b) => a + b, 0);
    days.push({ key, label: `${d.getMonth() + 1}/${d.getDate()}`, secs });
  }
  const maxSecs = Math.max(1, ...days.map((d) => d.secs));
  const todaySecs = days[days.length - 1].secs;

  const ranking = Object.entries(perBook).sort((a, b) => b[1] - a[1]);

  return (
    <section className="page">
      <header className="page-header">
        <h1>閱讀統計</h1>
      </header>

      <div className="stat-tiles">
        <div className="tile">
          <span className="meta">今天</span>
          <strong>{formatDuration(todaySecs)}</strong>
        </div>
        <div className="tile">
          <span className="meta">累計</span>
          <strong>{formatDuration(total)}</strong>
        </div>
      </div>

      <h2>最近 7 天</h2>
      <div className="week-chart">
        {days.map((d) => (
          <div key={d.key} className="week-col">
            <div className="week-bar-wrap">
              <div className="week-bar" style={{ height: `${(d.secs / maxSecs) * 100}%` }} title={formatDuration(d.secs)} />
            </div>
            <span className="meta">{d.label}</span>
          </div>
        ))}
      </div>

      <h2>每本書</h2>
      {ranking.length === 0 && <p className="empty">還沒有閱讀紀錄。</p>}
      <ul className="ranking">
        {ranking.map(([id, sec]) => (
          <li key={id}>
            <span>{titleOf(id)}</span>
            <strong>{formatDuration(sec)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
