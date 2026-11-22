// 约会：地点、花钱、爱慕 / 好感、记录、次数解锁、同一天陪别人
import { DATE_PLACES, PLACE_BY_ID, DATES_PER_DAY, CAR_TIER_LOVE, OTHER_SAME_DAY_LOVE, DATE_MILESTONES } from '../config/dates.js?v=1236a42d';
import { ensureSec } from './secretary.js?v=1236a42d';
import { addFavor, addLove, daily, markWith, favorMult } from './affection.js?v=1236a42d';
import { isTraining } from './training.js?v=1236a42d';
import { bump } from './daily.js?v=1236a42d';
import { pay, receive, accrue, canPay } from './ledger.js?v=1236a42d';

/** 地点的调整（第 2-11 项：自己有游艇就不花租船钱、按档次多加）：fn(s, placeId) → null 或 { price, love, favor, note } */
const ADJ = [];
export const addPlaceAdj = (fn) => { ADJ.push(fn); };
export const placeAdj = (s, placeId) => { for (const fn of ADJ) { const r = fn(s, placeId); if (r) return r; } return null; };
export const placePrice = (s, placeId) => { const a = placeAdj(s, placeId); return a ? a.price : PLACE_BY_ID[placeId].price; };
/** 地点要满足的条件（地标楼顶要有地标）：fn(s, placeId) → null 或 不能去的原因 */
const GATES = [];
export const addPlaceGate = (fn) => { GATES.push(fn); };
export const placeGate = (s, placeId) => { for (const fn of GATES) { const r = fn(s, placeId); if (r) return r; } return null; };
export const placeOpen = (s, id, placeId) => ensureSec(s, id).rec.dates >= PLACE_BY_ID[placeId].needDates;
export const datesToday = (s, t) => Object.values(daily(s, t).dates || {}).reduce((a, b) => a + b, 0);

export function whyNotDate(s, id, placeId, t) {
  if (!s.secs[id]) return '还没有这个秘书';
  if (isTraining(s, id)) return '她在上课';
  const gate = placeGate(s, placeId); if (gate) return gate;
  if (!placeOpen(s, id, placeId)) return `跟她约会满 ${PLACE_BY_ID[placeId].needDates} 次解锁`;
  if (datesToday(s, t) >= DATES_PER_DAY) return `今天约了 ${DATES_PER_DAY} 次了`;
  if (!canPay(s, 'personal', placePrice(s, placeId))) return '个人现金不够';
  return null;
}

/** carTier：开的车是第几档（0 = 打车）。返回结果，含这次解锁了哪些里程碑 */
export function goDate(s, id, placeId, t, carTier = 0) {
  const why = whyNotDate(s, id, placeId, t);
  if (why) return { ok: false, why };
  const p = PLACE_BY_ID[placeId]; const r = ensureSec(s, id); const d = daily(s, t); const adj = placeAdj(s, placeId);
  pay(s, { wallet: 'personal', cat: 'date', amount: adj ? adj.price : p.price, party: p.name, note: `和${id}约会` }, t);
  d.dates = d.dates || {};
  // 同一天约别人：今天约过的其他人爱慕 -1
  const hurt = [];
  for (const other of Object.keys(d.dates)) if (other !== id) { const x = addLove(s, other, OTHER_SAME_DAY_LOVE); if (x.to < x.from) hurt.push(other); }
  d.dates[id] = (d.dates[id] || 0) + 1;
  r.rec.dates += 1; r.rec.places[p.name] = (r.rec.places[p.name] || 0) + 1; r.rec.lastDate = t;
  s.stats.dates = (s.stats.dates || 0) + 1; bump(s, t, 'date');
  markWith(s, id, t);
  const love = addLove(s, id, Math.round((p.love + (CAR_TIER_LOVE[carTier] || 0) + (adj ? adj.love : 0)) * favorMult(s))); // 老板气场也让爱慕涨得快
  const favor = addFavor(s, id, p.favor + carTier * 2 + (adj ? adj.favor : 0));
  const milestones = DATE_MILESTONES.filter((m) => m.n === r.rec.dates);
  if (milestones.some((m) => m.kind === 'outfit')) r.dateOutfit = true;
  if (milestones.some((m) => m.kind === 'title')) r.dateTitle = true;
  return { ok: true, place: p, love, favor, milestones, hurt, adj };
}
export { DATE_PLACES };
