// 约会：地点、花钱、爱慕 / 好感、记录、次数解锁、同一天陪别人
import { whyEnergy, doEnergy, E_COST } from './manage.js?v=a184462c'; // 设计39 约会花精力
import { DATE_PLACES, PLACE_BY_ID, DATES_PER_DAY, CAR_TIER_LOVE, OTHER_SAME_DAY_LOVE, DATE_MILESTONES } from '../config/dates.js?v=a184462c';
import { ensureSec } from './secretary.js?v=a184462c';
import { addFavor, addLove, daily, markWith, favorMult } from './affection.js?v=a184462c';
import { isTraining } from './training.js?v=a184462c';
import { bump } from './daily.js?v=a184462c';
import { afterDate } from './love.js?v=a184462c';   // 设计56 定情信物
import { pay, receive, accrue, canPay } from './ledger.js?v=a184462c';

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
/** 今天跟她约了几次（设计86 起不限次数，留给每日任务 / 统计） */
export const datesWith = (s, id, t) => ((daily(s, t).dates || {})[id] || 0);
/** 设计86：约会只看精力，不限次数、没有约会券 */
export const dateBtnText = () => `约会（${E_COST.date} 精力）`;
export const datesToday = (s, t) => Object.values(daily(s, t).dates || {}).reduce((a, b) => a + b, 0);

export function whyNotDate(s, id, placeId, t) {
  if (!s.secs[id]) return '还没有这个秘书';
  if (isTraining(s, id)) return '她在上课';
  const gate = placeGate(s, placeId); if (gate) return gate;
  if (!placeOpen(s, id, placeId)) return `跟她约会满 ${PLACE_BY_ID[placeId].needDates} 次解锁`;
  { const w = whyEnergy(s, E_COST.date, t); if (w) return w; } /* 设计86：约会花 E_COST.date（20）精力，不限次数 */
  if (!canPay(s, 'personal', placePrice(s, placeId))) return '个人现金不够';
  return null;
}

/** carTier：开的车是第几档（0 = 打车）。返回结果，含这次解锁了哪些里程碑 */
export function goDate(s, id, placeId, t, carTier = 0) {
  const why = whyNotDate(s, id, placeId, t);
  if (why) return { ok: false, why };
  const p = PLACE_BY_ID[placeId]; const r = ensureSec(s, id); const d = daily(s, t); const adj = placeAdj(s, placeId);
  doEnergy(s, E_COST.date, t);
  pay(s, { wallet: 'personal', cat: 'date', amount: adj ? adj.price : p.price, party: p.name, note: `和${id}约会` }, t);
  const loveN = Math.round((p.love + (CAR_TIER_LOVE[carTier] || 0) + (adj ? adj.love : 0)) * favorMult(s)); // 老板气场也让爱慕涨得快；设计56：只有约会能跨 20 / 40 / 60 / 80（最多 99）
  const { love, favor, milestones, hurt, token } = recordDate(s, id, t, p.name, loveN, p.favor + carTier * 2 + (adj ? adj.favor : 0));
  return { ok: true, place: p, love, favor, milestones, hurt, adj, token };
}
/** 约会记一次（普通约会、设计83 私密约会共用）：同一天约别人的扣爱慕、次数、记录、爱慕（能跨门）、好感、里程碑、定情信物 */
export function recordDate(s, id, t, placeName, loveN, favorN) {
  const r = ensureSec(s, id); const d = daily(s, t);
  d.dates = d.dates || {};
  // 同一天约别人：今天约过的其他人爱慕 -1
  const hurt = [];
  for (const other of Object.keys(d.dates)) if (other !== id) { const x = addLove(s, other, OTHER_SAME_DAY_LOVE); if (x.to < x.from) hurt.push(other); }
  d.dates[id] = (d.dates[id] || 0) + 1;
  r.rec.dates += 1; r.rec.places[placeName] = (r.rec.places[placeName] || 0) + 1; r.rec.lastDate = t;
  s.stats.dates = (s.stats.dates || 0) + 1; bump(s, t, 'date');
  markWith(s, id, t);
  const love0 = r.love;
  const love = addLove(s, id, loveN, { cross: true });
  const favor = addFavor(s, id, favorN);
  const milestones = DATE_MILESTONES.filter((m) => m.n === r.rec.dates);
  if (milestones.some((m) => m.kind === 'outfit')) r.dateOutfit = true;
  if (milestones.some((m) => m.kind === 'title')) r.dateTitle = true;
  const token = afterDate(s, id, love0, t);   // 设计56：爱慕 ≥ 80 以后的下一次约会，她提起定情信物
  return { love, favor, milestones, hurt, token };
}
export { DATE_PLACES };
