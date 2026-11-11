// 每日閱讀目標（分鐘），存在本機
const KEY = 'rd_goal_min';
export const GOAL_OPTIONS = [10, 15, 30, 60];

export function loadGoal() {
  const v = Number(localStorage.getItem(KEY));
  return GOAL_OPTIONS.includes(v) ? v : 15;
}

export function saveGoal(min) {
  localStorage.setItem(KEY, String(min));
}

// 連續閱讀天數：從今天往回算；今天還沒讀時從昨天開始算
export function streakDays(stats, todayKeyFn) {
  const sumOf = (key) => Object.values(stats[key] || {}).reduce((a, b) => a + b, 0);
  let n = 0;
  for (let i = 0; i < 3650; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = todayKeyFn(d);
    if (i === 0 && sumOf(key) === 0) continue;
    if (sumOf(key) > 0) n += 1;
    else break;
  }
  return n;
}
