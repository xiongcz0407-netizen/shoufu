// 约会：地点、花钱、爱慕 / 好感、记录、次数解锁、同一天陪别人
import { whyEnergy, doEnergy, E_COST } from './manage.js?v=e379aa95'; // 设计39 约会花精力
import { DATE_PLACES, PLACE_BY_ID, DATES_PER_DAY, CAR_TIER_LOVE, OTHER_SAME_DAY_LOVE, DATE_MILESTONES } from '../config/dates.js?v=e379aa95';
import { ensureSec } from './secretary.js?v=e379aa95';
import { addFavor, addLove, daily, markWith, favorMult } from './affection.js?v=e379aa95';
import { isTraining } from './training.js?v=e379aa95';
import { bump } from './daily.js?v=e379aa95';
import { afterDate } from './love.js?v=e379aa95';   // 设计56 定情信物
import { pay, receive, accrue, canPay } from './ledger.js?v=e379aa95';

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
/** 设计39：约会券存在 s.items.date（开发2 卖、送）；每个秘书每天免费约 1 次，再约一次用 1 张，每人每天最多用 3 张 */
export const DATE_TICKET_MAX = 3;
export const dateTickets = (s) => (s.items && s.items.date) || 0;
export const datesWith = (s, id, t) => ((daily(s, t).dates || {})[id] || 0);
/** 她今天还能约几次（含免费那次） */
export const datesLeftFor = (s, id, t) => Math.max(0, 1 + DATE_TICKET_MAX - datesWith(s, id, t));
/** 按钮上的话：没约过「今天免费约 1 次」；约过「今天约过了 · 用约会券再约（还有 N 张，她今天还能 2 次）」/「今天约过了 · 买约会券」/「明天再约」 */
export function dateBtnText(s, id, t) {
  const n = datesWith(s, id, t); if (!n) return `今天免费约 1 次（${E_COST.date} 精力）`;
  if (n >= 1 + DATE_TICKET_MAX) return '明天再约';
  return dateTickets(s) ? `今天约过了 · 用约会券再约（还有 ${dateTickets(s)} 张，她今天还能 ${datesLeftFor(s, id, t) - 0} 次）` : '今天约过了 · 买约会券';
}
export const datesToday = (s, t) => Object.values(daily(s, t).dates || {}).reduce((a, b) => a + b, 0);

export function whyNotDate(s, id, placeId, t) {
  if (!s.secs[id]) return '还没有这个秘书';
  if (isTraining(s, id)) return '她在上课';
  const gate = placeGate(s, placeId); if (gate) return gate;
  if (!placeOpen(s, id, placeId)) return `跟她约会满 ${PLACE_BY_ID[placeId].needDates} 次解锁`;
  { const n = datesWith(s, id, t); if (n >= 1 + DATE_TICKET_MAX) return '明天再约'; if (n >= 1 && !dateTickets(s)) return '今天约过了 · 买约会券'; }
  { const w = whyEnergy(s, E_COST.date, t); if (w) return w; } /* 设计39：约会花 10 精力，每个秘书每天免费 1 次，再约用约会券（每人每天最多 3 张） */
  if (!canPay(s, 'personal', placePrice(s, placeId))) return '个人现金不够';
  return null;
}

/** carTier：开的车是第几档（0 = 打车）。返回结果，含这次解锁了哪些里程碑 */
export function goDate(s, id, placeId, t, carTier = 0) {
  const why = whyNotDate(s, id, placeId, t);
  if (why) return { ok: false, why };
  const p = PLACE_BY_ID[placeId]; const r = ensureSec(s, id); const d = daily(s, t); const adj = placeAdj(s, placeId);
  if (datesWith(s, id, t) >= 1) s.items.date -= 1; /* 今天约过她了：用一张约会券 */
  doEnergy(s, E_COST.date, t);
  pay(s, { wallet: 'personal', cat: 'date', amount: adj ? adj.price : p.price, party: p.name, note: `和${id}约会` }, t);
  d.dates = d.dates || {};
  // 同一天约别人：今天约过的其他人爱慕 -1
  const hurt = [];
  for (const other of Object.keys(d.dates)) if (other !== id) { const x = addLove(s, other, OTHER_SAME_DAY_LOVE); if (x.to < x.from) hurt.push(other); }
  d.dates[id] = (d.dates[id] || 0) + 1;
  r.rec.dates += 1; r.rec.places[p.name] = (r.rec.places[p.name] || 0) + 1; r.rec.lastDate = t;
  s.stats.dates = (s.stats.dates || 0) + 1; bump(s, t, 'date');
  markWith(s, id, t);
  const love0 = r.love;
  const love = addLove(s, id, Math.round((p.love + (CAR_TIER_LOVE[carTier] || 0) + (adj ? adj.love : 0)) * favorMult(s)), { cross: true }); // 老板气场也让爱慕涨得快；设计56：只有约会能跨 20 / 40 / 60 / 80（最多 99）
  const favor = addFavor(s, id, p.favor + carTier * 2 + (adj ? adj.favor : 0));
  const milestones = DATE_MILESTONES.filter((m) => m.n === r.rec.dates);
  if (milestones.some((m) => m.kind === 'outfit')) r.dateOutfit = true;
  if (milestones.some((m) => m.kind === 'title')) r.dateTitle = true;
  const token = afterDate(s, id, love0, t);   // 设计56：爱慕 ≥ 80 以后的下一次约会，她提起定情信物
  return { ok: true, place: p, love, favor, milestones, hurt, adj, token };
}
export { DATE_PLACES };
