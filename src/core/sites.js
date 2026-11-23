// V2-08 选址开分店（设计29 第三节）：开分店先出 3 个候选铺位（按城市随机），秘书可以先去踩点（10 分钟，管理高的看得准），
// 选了铺位这家店的营业额系数 = 人流 × 适配度 ÷ 同行竞争（0.7～1.4），租金按铺位，口碑起点好 55 / 差 45；表现差的可以关店转让（拿回 30% 开店费）
// 存档：s.sites = { pick: { id, city, n, list, chosen, scout }, lines: { 产业id: [{ type, city, k, rentK, flow, comp, cost, at }] } }
// 没记铺位的店（老档、收购并进来的）按系数 1、租金 1 算
import C from '../config/sites.json?v=f10d7ba9' with { type: 'json' };
import { IND_BY_ID } from '../config/industries.js?v=f10d7ba9';
import { SEC_BY_ID } from '../config/secretaries.js?v=f10d7ba9';
import { setSiteHooks } from './economy.js?v=f10d7ba9';
import { setRentHook } from './accrual.js?v=f10d7ba9';
import { lineCities, cityName, cityK } from './cities.js?v=f10d7ba9';
import { receive } from './ledger.js?v=f10d7ba9';
import { estTotal, onDuty } from './staff.js?v=f10d7ba9';
import { attrs } from './posts.js?v=f10d7ba9';
import { isTraining } from './training.js?v=f10d7ba9';
import { isScouting } from './busy.js?v=f10d7ba9';
import { line as mgLine } from './manage.js?v=f10d7ba9';
import * as CB from './calib.js?v=f10d7ba9';
export { C as SITE_CFG };

const TYPES = Object.keys(C.types);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r3 = (x) => Math.round(x * 1000) / 1000;
/** 种子随机：同一个城市、同一家（第几家）出的候选不变，关掉面板再开不会刷新 */
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const seedOf = (s, id, city, n, extra = '') => hash(`${s.createdAt || 0}|${(s.sites && s.sites.salt) || ''}|${id}|${city}|${n}|${extra}`); // salt：econsim 每个种子不一样（游戏里靠 createdAt）

export const st = (s) => { const x = (s.sites = s.sites || { pick: null, lines: {} }); x.lines = x.lines || {}; return x; };
export const isSiteLine = (id) => !!(IND_BY_ID[id] && IND_BY_ID[id].retail);
export const kOf = (id, type, flow, comp) => r3(clamp((C.norm[id] || 1) * flow * C.types[type].fit[id] / (1 + comp * C.compPer), C.kRange[0], C.kRange[1]));
const lv = (tbl, x) => tbl.find(([at]) => x >= at)[1];
export const flowLv = (flow) => lv(C.flowLv, flow);
export const fitLv = (fit) => lv(C.fitLv, fit);

/** 生成一个候选铺位 */
function cand(id, type, r) {
  const T = C.types[type]; const flow = r3(T.flow[0] + (T.flow[1] - T.flow[0]) * r()); const comp = T.comp[0] + Math.floor(r() * (T.comp[1] - T.comp[0] + 1));
  return { type, flow, comp, fit: T.fit[id], k: kOf(id, type, flow, comp), rentK: r3(T.rentK * C.rentNorm) };
}
/** 一组候选（3 个不同类型） */
export function gen(id, seed) {
  const r = rng(seed); const pool = TYPES.slice(); const out = [];
  for (let i = 0; i < C.picks && pool.length; i++) out.push(cand(id, pool.splice(Math.floor(r() * pool.length), 1)[0], r));
  return out;
}
/** 现在这条线在这个城市开下一家的候选（存在 s.sites.pick，换线 / 换城市 / 家数变了才重出） */
export function candidates(s, id, city) {
  const S = st(s); const n = s.inds[id].branches; const p = S.pick;
  if (p && p.id === id && p.city === city && p.n === n) return p;
  S.pick = { id, city, n, list: gen(id, seedOf(s, id, city, n)), chosen: null, scout: null };
  return S.pick;
}
/** 一个候选的租金（每月） */
export function rentOf(s, id, city, c) { const cfg = IND_BY_ID[id]; return Math.round(cfg.rent[lookAt(s, id)] * cityK(city) * c.rentK); }
const lookAt = (s, id) => CB.lookAt(IND_BY_ID[id], s.inds[id].level);

// —— 踩点 ——
export function whyScout(s, secId, t) {
  const p = st(s).pick; if (!p) return '先选城市';
  if (p.scout) return p.scout.at > t ? '正在踩点' : '已经踩过了';
  if (!secId || !s.secs[secId]) return '选一个秘书去';
  if (isTraining(s, secId)) return '上课中的秘书去不了';
  if (isScouting(s, secId, t)) return '她在别处踩点';
  return null;
}
/** 派秘书去踩点：10 分钟真实时间；误差按她的管理（0 → ±30%，100 → ±3%），定好存起来（结果不会刷） */
export function scout(s, secId, t) {
  const why = whyScout(s, secId, t); if (why) return { ok: false, why };
  const p = st(s).pick; const m = clamp(attrs(s, secId).manage || 0, 0, 100) / 100;
  const err = C.scoutErr[0] + (C.scoutErr[1] - C.scoutErr[0]) * m; const r = rng(seedOf(s, p.id, p.city, p.n, 'scout' + secId));
  const S = st(s); S.busy = S.busy || {}; for (const k of Object.keys(S.busy)) if (S.busy[k] <= t) delete S.busy[k]; S.busy[secId] = t + C.scoutMin * 60e3; // 占用 10 分钟（core/busy.js）
  p.scout = { sec: secId, at: t + C.scoutMin * 60e3, err: r3(err), est: p.list.map((c) => estOf(p.id, c, err, r)) };
  return { ok: true, at: p.scout.at };
}
function estOf(id, c, err, r) {
  const flow = c.flow * (1 + (r() * 2 - 1) * err); const comp = Math.max(0, c.comp + Math.round((r() * 2 - 1) * err / C.scoutErr[0] * C.compErr));
  return { flow: r3(flow), people: Math.round(flow * C.flowBase / 10) * 10, comp, k: kOf(id, c.type, flow, comp) };
}
/** 踩点状态：null 没去；{ left } 还在路上；{ done, est, sec, err } 回来了 */
export function scoutState(s, t) {
  const p = st(s).pick; if (!p || !p.scout) return null;
  if (t < p.scout.at) return { left: p.scout.at - t, sec: p.scout.sec };
  return { done: true, est: p.scout.est, sec: p.scout.sec, err: p.scout.err };
}
/** 选中第 i 个（之后马上 E.openBranch，开店的挂钩读它） */
export function choose(s, id, city, i) { const p = candidates(s, id, city); p.chosen = clamp(i | 0, 0, p.list.length - 1); return p.list[p.chosen]; }
/** 挂机 / econsim A：按踩点估的系数选最好的（没踩点按真的系数，误差按 mgr 管理） */
export function bestIdx(s, id, city, manage = 60) {
  const p = candidates(s, id, city); const err = C.scoutErr[0] + (C.scoutErr[1] - C.scoutErr[0]) * clamp(manage, 0, 100) / 100;
  const r = rng(seedOf(s, id, city, p.n, 'auto')); const est = p.list.map((c) => estOf(id, c, err, r).k);
  return est.indexOf(Math.max(...est));
}

// —— 开店的挂钩（core/economy.js openBranch 成功后叫）——
function onOpen(s, id, city, t, cost) {
  if (!isSiteLine(id)) return;
  const S = st(s); const n = s.inds[id].branches; const p = S.pick;
  let c; if (p && p.id === id && p.city === city && p.n === n - 1 && p.chosen != null) c = p.list[p.chosen];
  else { const list = p && p.id === id && p.city === city && p.n === n - 1 ? p.list : gen(id, seedOf(s, id, city, n - 1)); c = list[Math.floor(rng(seedOf(s, id, city, n - 1, 'rand'))() * list.length)]; } // 没选（秘书代开、挂机）：随机一个
  (S.lines[id] = S.lines[id] || []).push({ type: c.type, city, k: c.k, rentK: c.rentK, flow: c.flow, comp: c.comp, cost: Math.round(cost || 0), at: t });
  if (p && p.id === id) S.pick = null;
  const L = mgLine(s, id); const prev = L.nb || n - 1; const start = c.k >= C.rep.goodAt ? C.rep.good : c.k <= C.rep.badAt ? C.rep.bad : null;
  if (start != null && prev > 0) { L.rep = (L.rep * prev + start) / n; L.nb = n; } // 选得好 55、差 45，整条线按家数平均（其余照 manage 的 50）
  return c;
}
/** 这条线的营业额系数 / 租金系数（没记铺位的店按 1） */
export function revMult(s, id) {
  const ind = s.inds[id]; const xs = st(s).lines[id]; if (!ind || !ind.branches || !xs || !xs.length) return 1;
  const n = Math.min(xs.length, ind.branches); let a = 0; for (let i = 0; i < n; i++) a += xs[i].k; return (a + ind.branches - n) / ind.branches;
}
export function rentMult(s, id) {
  const ind = s.inds[id]; const xs = st(s).lines[id]; if (!ind || !ind.branches || !xs || !xs.length) return 1;
  const n = Math.min(xs.length, ind.branches); let a = 0; for (let i = 0; i < n; i++) a += xs[i].rentK; return (a + ind.branches - n) / ind.branches;
}
setSiteHooks(revMult, onOpen);
setRentHook(rentMult);

/** 线详情：每家记了铺位的分店（i 是下标） */
export function branchesOf(s, id) {
  const cfg = IND_BY_ID[id]; const ind = s.inds[id]; if (!ind) return [];
  return (st(s).lines[id] || []).map((x, i) => ({ i, ...x, name: C.types[x.type].name, cityName: cityName(x.city), monthRev: Math.round(CB.gameRev(cfg, ind.level) * cityK(x.city) * x.k), rent: Math.round(cfg.rent[lookAt(s, id)] * cityK(x.city) * x.rentK), back: Math.round(x.cost * C.sellBack) }));
}
export function whyClose(s, id, i) {
  const xs = st(s).lines[id]; const ind = s.inds[id];
  if (!ind || !xs || !xs[i]) return '没有这家店';
  if (ind.branches <= 1) return '只剩一家，不能关';
  return null;
}
/** 关店转让：拿回开店费的 30%（转让费，走公司账户），家数 −1，城市家数 −1；over = 这家店超编出来的人数（不自动裁） */
export function close(s, id, i, t) {
  const why = whyClose(s, id, i); if (why) return { ok: false, why };
  const xs = st(s).lines[id]; const x = xs[i]; const back = Math.round(x.cost * C.sellBack); const ind = s.inds[id];
  if (back > 0) receive(s, { wallet: 'company', cat: 'branch_sell', amount: back, party: '接手的老板', note: `${IND_BY_ID[id].name}${cityName(x.city)}${C.types[x.type].name}那家关店转让（拿回开店费 ${Math.round(C.sellBack * 100)}%）` }, t);
  const est0 = estTotal(s, id); const cs = lineCities(s, id); ind.branches -= 1; cs[x.city] = Math.max(0, (cs[x.city] || 0) - 1);
  xs.splice(i, 1); const L = mgLine(s, id); L.nb = ind.branches; if (st(s).pick && st(s).pick.id === id) st(s).pick = null;
  const est1 = estTotal(s, id); const over = Math.max(0, Math.min(est0 - est1, onDuty(s, id) - est1)); // 这家店的人超编了（不自动裁，去人事裁员）
  return { ok: true, back, over };
}
export const secList = (s) => Object.keys(s.secs || {}).filter((k) => SEC_BY_ID[k]);
