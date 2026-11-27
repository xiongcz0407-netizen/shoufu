// P-00 对手也在长大（设计24）：对手从出现那天（玩家到它那一档）起，年利润按行业现实增长率 × 赚钱倍数，每游戏月复利涨；
// 估值、实力跟着变（早动手便宜，拖着贵）；赢它一次 −8%、输一次 +3%；利润每翻一倍多抢一个城市、反击概率 +10%；收购了就不长
// 状态：s.rivals[id].g = { born, k（现在利润 ÷ 配置利润）, m（算到第几个游戏月）, prev（上个月的 k）, born0（出现时的 k）}
// 不 import economy / battle（battle、rivalry、equity 都用这里）
import { RIVALS, RIVAL_BY_ID, RIVAL_GROW as G } from '../config/rivals.js?v=b846574c';
import { monthIndex } from './gametime.js?v=b846574c';
import { profitMul } from './calib.js?v=b846574c';
import { CITY_IDS, cityName } from './cities.js?v=b846574c';

const rs = (s, id) => { s.rivals = s.rivals || {}; return (s.rivals[id] = s.rivals[id] || { wins: 0, losses: 0, acquired: false, cooldownUntil: 0 }); };
const gOf = (s, id) => (s.rivals && s.rivals[id] && s.rivals[id].g) || null;
/** 每游戏月的增长倍数 */
export const monthK = (r) => Math.pow(1 + (r.growReal || 0) * profitMul(), 1 / 12);
/** 出现了没有：到了它那一档 */
export const born = (s, r) => !r.noAcquire && (s.title || 0) >= r.stage;
/** 现在利润是配置的几倍 */
export const kOf = (s, id) => { const g = gOf(s, id); return g ? g.k : 1; };
/** 比上个月 +x%（小数） */
export const monthGrowth = (s, id) => { const g = gOf(s, id); return g && g.prev ? g.k / g.prev - 1 : 0; };
/** 利润比出现时翻了几倍（0～3） */
export const doublings = (s, id) => { const g = gOf(s, id); if (!g) return 0; return Math.max(0, Math.min(G.maxCities, Math.floor(Math.log2(Math.max(1, g.k / (g.born0 || 1)))))); };
/** 并进来的规模倍数：现在利润 ÷ 出现时利润，最多 × 3 */
export const mergeK = (s, id) => { const g = gOf(s, id); return g ? Math.min(G.mergeMax, g.k / (g.born0 || 1)) : 1; };
const scaleMerge = (m, k) => Object.fromEntries(Object.entries(m || {}).map(([ind, n]) => [ind, Math.max(1, Math.round(n * k))]));
/** 现在的样子：利润、估值、实力、并进来的规模都按现在算（battle / equity / 界面都用这个，配置里的是起点） */
export function live(s, id) {
  const r = RIVAL_BY_ID[id]; if (!r || r.noAcquire) return r;
  const k = kOf(s, id); const mk = mergeK(s, id); const e = r.effect || {};
  return { ...r, profit: r.profit * k, value: Math.round(r.value * k), power: r.power * k, k, merge: scaleMerge(r.merge, mk), effect: e.fleetUnits ? { ...e, fleetUnits: Math.round(e.fleetUnits * mk) } : e, mk };
}
/** 抢地盘的城市：配置的那个 + 每翻一倍多一个（按城市表顺序，最多 3 个） */
export function turfCities(s, r) {
  if (!r.turf) return [];
  const extra = CITY_IDS.filter((c) => c !== r.turf.city).slice(0, Math.max(0, Math.min(G.maxCities, 1 + doublings(s, r.id)) - 1));
  return [r.turf.city, ...extra];
}
/** 卡片上一条条写：它在哪些城市跟你抢 */
export const turfLines = (s, r) => turfCities(s, r).map((c) => `${r.name}在${cityName(c)}开店，这里的同行收入 −5%`);
/** 反击概率加多少（每翻一倍 +10%，最多 +30%） */
export const counterBonus = (s, id) => Math.min(G.counterMax, doublings(s, id) * G.counterPer);
/** 商战结果：赢一次它利润 × 0.92，输一次 × 1.03 */
export function onBattle(s, id, win, t, rounds = null) {
  const r = RIVAL_BY_ID[id]; if (!r || r.noAcquire) return; tickRivalGrow(s, t); const g = gOf(s, id); if (!g) return;
  if (rounds == null) { g.k *= win ? G.win : G.loss; return; }
  g.k *= (win ? 1 : G.loss) * Math.max(0, 1 - (G.perRound || 0.03) * rounds); // V2-05：每赢一回合 −3%（替代原来赢一次 −8%）；输了照旧 +3%
}
/** 每秒 / 离线（core/rivalry.tickRivalry 里叫）：出现的对手每过一个游戏月长一次；翻倍了多开一个城市 → 返回提示 */
export function tickRivalGrow(s, t) {
  const ev = []; const m = monthIndex(s, t);
  for (const r of RIVALS) {
    if (!born(s, r)) continue; const x = rs(s, r.id); if (x.acquired) continue;
    if (!x.g) { x.g = { born: t, k: 1, m, prev: 1, born0: 1 }; continue; }
    const g = x.g; const d0 = doublings(s, r.id);
    while (g.m < m) { g.m += 1; g.prev = g.k; g.k *= monthK(r); if (G.kMax) g.k = Math.min(g.k, (g.born0 || 1) * G.kMax); }
    const d1 = doublings(s, r.id);
    if (d1 > d0) { const cs = turfCities(s, r); ev.push(r.turf && cs.length > 1 ? `${r.name}利润又翻了一倍，在${cityName(cs[cs.length - 1])}也开了店` : `${r.name}利润又翻了一倍，反击更狠了`); }
  }
  return ev;
}
/** 离线对账单：离开前后每家对手的利润变化 */
export const snapRivals = (s) => Object.fromEntries(RIVALS.filter((r) => !r.noAcquire && born(s, r) && !rs(s, r.id).acquired).map((r) => [r.id, [kOf(s, r.id), turfCities(s, r).length]]));
export function diffRivals(s, before) {
  const out = [];
  for (const [id, [k0, c0]] of Object.entries(before)) {
    const r = RIVAL_BY_ID[id]; const x = rs(s, id); if (x.acquired) continue;
    const k1 = kOf(s, id), c1 = turfCities(s, r).length; if (Math.abs(k1 / k0 - 1) < 0.005 && c1 === c0) continue;
    const cs = turfCities(s, r);
    out.push([r.name, `利润 ${k1 >= k0 ? '+' : ''}${((k1 / k0 - 1) * 100).toFixed(1)}%${c1 > c0 ? `，又在${cityName(cs[cs.length - 1])}开了店` : ''}`]);
  }
  return out;
}
