import React, { useEffect, useState } from 'react';
import { loadStats, todayKey } from '../lib/store.js';
import { formatDuration } from '../lib/progress.js';
import { GOAL_OPTIONS, loadGoal, saveGoal, streakDays } from '../lib/goal.js';

export default function Stats({ books }) {
  const [stats, setStats] = useState({});
  const [goal, setGoal] = useState(loadGoal);

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
  const goalSecs = goal * 60;
  const goalPct = Math.min(100, Math.round((todaySecs / goalSecs) * 100));
  const streak = streakDays(stats, todayKey);

  // 本月、今年
  const nowKey = todayKey();
  let month = 0;
  let year = 0;
  for (const [k, day] of Object.entries(stats)) {
    const sec = Object.values(day).reduce((a, b) => a + b, 0);
    if (k.startsWith(nowKey.slice(0, 7))) month += sec;
    if (k.startsWith(nowKey.slice(0, 4))) year += sec;
  }

  // 熱力圖：最近 12 週（84 天）
  const cells = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    cells.push({ key, secs: Object.values(stats[key] || {}).reduce((a, b) => a + b, 0) });
  }
  const maxCell = Math.max(1, ...cells.map((c) => c.secs));

  return (
    <section className="page">
      <header className="page-header">
        <h1>閱讀統計</h1>
      </header>

      <div className="goal-card">
        <div className="goal-head">
          <strong>今日目標</strong>
          <select
            value={goal}
            onChange={(e) => {
              const v = Number(e.target.value);
              setGoal(v);
              saveGoal(v);
            }}
          >
            {GOAL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} 分鐘
              </option>
            ))}
          </select>
        </div>
        <div className="goal-bar">
          <div style={{ width: `${goalPct}%` }} />
        </div>
        <p className="meta">
          {todaySecs >= goalSecs ? '今天的目標達成了！' : `已讀 ${formatDuration(todaySecs)}，還差 ${formatDuration(goalSecs - todaySecs)}`}
          {streak > 0 && ` · 連續閱讀 ${streak} 天`}
        </p>
      </div>

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

      <div className="stat-tiles" style={{ marginTop: 12 }}>
        <div className="tile">
          <span className="meta">本月</span>
          <strong>{formatDuration(month)}</strong>
        </div>
        <div className="tile">
          <span className="meta">今年</span>
          <strong>{formatDuration(year)}</strong>
        </div>
      </div>

      <h2>閱讀熱力圖（最近 12 週）</h2>
      <div className="heatmap">
        {cells.map((c) => (
          <div
            key={c.key}
            className="hm-cell"
            title={`${c.key}：${formatDuration(c.secs)}`}
            style={{ opacity: c.secs ? 0.25 + 0.75 * (c.secs / maxCell) : 0.08 }}
          />
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
