// 游戏月 / 季 / 年时钟：从开局算起；到点触发（发工资、报税、月报），离线回来按顺序补算
import CFG from '../config/gametime.json?v=598ef1ae' with { type: 'json' };
export const YEAR_MS = CFG.yearHours * 3600e3;
export const MONTH_MS = YEAR_MS / CFG.monthsPerYear;
export const QUARTER_MS = YEAR_MS / CFG.quartersPerYear;

/** 第几个游戏月（从 0 起，开局那个月是 0） */
export const monthIndex = (s, t) => Math.floor((t - s.createdAt) / MONTH_MS);
/** 游戏日期：{ year: 1 起, month: 1～12, day: 1～30 } */
export function gameDate(s, t) {
  const m = monthIndex(s, t);
  const inMonth = (t - s.createdAt - m * MONTH_MS) / MONTH_MS;
  return { year: Math.floor(m / 12) + 1, month: (m % 12) + 1, day: Math.min(30, Math.floor(inMonth * 30) + 1), monthIndex: m };
}
export const dateText = (d) => `第${d.year}年·${d.month}月${d.day}日`;

const handlers = { month: [], quarter: [], year: [] };
/** 注册：fn(s, periodIndex, endTime)；periodIndex 是刚结束的那个月 / 季 / 年 */
export const onPeriod = (kind, fn) => handlers[kind].push(fn);
export const clearHandlers = () => { handlers.month.length = 0; handlers.quarter.length = 0; handlers.year.length = 0; };

/** 补算到 t：每个结束的月按顺序触发；季、年在对应月末一起触发。返回结束了几个月 */
export function processPeriods(s, t) {
  s.clock = s.clock || { monthsDone: 0 };
  const target = monthIndex(s, t);
  let n = 0;
  while (s.clock.monthsDone < target) {
    const m = s.clock.monthsDone; // 刚结束的月
    const end = s.createdAt + (m + 1) * MONTH_MS;
    for (const fn of handlers.month) fn(s, m, end);
    if ((m + 1) % 3 === 0) for (const fn of handlers.quarter) fn(s, (m + 1) / 3 - 1, end);
    if ((m + 1) % 12 === 0) for (const fn of handlers.year) fn(s, (m + 1) / 12 - 1, end);
    s.clock.monthsDone = m + 1; n += 1;
  }
  return n;
}
