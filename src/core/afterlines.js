// 设计89 私密约会第二天的互动台词：私密约会那天（rec.privDay，本地 YYYY-MM-DD）的下一个自然日，点她先从 AFTER_LINES[id] 里挑没用过的（stk 的只在 rec.privStk 为真时进池子），用完回平常台词
import { AFTER_LINES } from '../config/story/index.js?v=6a9355f4';
export { AFTER_LINES };

const pad = (n) => String(n).padStart(2, '0');
/** 本地日期 YYYY-MM-DD */
export const localDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** YYYY-MM-DD 的下一天 */
export const nextDay = (day) => { const [y, m, d] = day.split('-').map(Number); return localDay(new Date(y, m - 1, d + 1, 12).getTime()); };
/** 这一句：{ t, stk } */
const norm = (x) => (typeof x === 'string' ? { t: x, stk: false } : { t: x.t, stk: !!x.stk });
/** 今天是不是她私密约会的下一天 */
export const isAfterDay = (s, id, t) => { const rec = s.secs[id] && s.secs[id].rec; return !!(rec && rec.privDay && AFTER_LINES[id] && nextDay(rec.privDay) === localDay(t)); };
/** 今天还能挑的句子序号 */
export function afterPool(s, id, t) {
  if (!isAfterDay(s, id, t)) return [];
  const rec = s.secs[id].rec; const day = localDay(t);
  if (rec.afterDay !== day) { rec.afterDay = day; rec.afterUsed = []; }
  return AFTER_LINES[id].map(norm).map((x, i) => (x.stk && !rec.privStk) || rec.afterUsed.includes(i) ? -1 : i).filter((i) => i >= 0);
}
/** 点她：有就挑一句（记下用过），没有返回 null */
export function afterLine(s, id, t, rnd = Math.random) {
  const pool = afterPool(s, id, t); if (!pool.length) return null;
  const i = pool[Math.floor(rnd() * pool.length)]; s.secs[id].rec.afterUsed.push(i);
  return norm(AFTER_LINES[id][i]).t;
}
