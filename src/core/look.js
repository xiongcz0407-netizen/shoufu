// 设计41 秘书看盘给价（开发2）：价钱算法（bestRun / priceRow / lookRows / tipPlan）、她的战绩、设计46 仓位、设计45 持仓页数据。
// 设计47 起：秘书主动的新闻提醒、一次性「看盘」都去掉了，看盘改成时间段（core/ws.js 用这里的算法发消息）
// 看盘：lookNow 用 SK.future 把接下来 240 跳先算出来（跟真实走的一样），挑真实会到的低点 L、之后的高点 H 定价，一定能成交
import * as SK from './stocks.js?v=ab0bf094';
import * as TR from './trade.js?v=ab0bf094';
import { addMsg } from './inbox.js?v=ab0bf094';
import { attrs as secAttrs } from './posts.js?v=ab0bf094';
import { whyEnergy, doEnergy } from './manage.js?v=ab0bf094';
import { SEC_BY_ID } from '../config/secretaries.js?v=ab0bf094';

const W = SK.SCFG.watch; const TICK = SK.SCFG.tickSec * 1000;
const up2 = (v) => Math.ceil(v * 100 - 1e-7) / 100;     // 买入价往上取整到分
const dn2 = (v) => Math.floor(v * 100 + 1e-7) / 100;    // 卖出价往下取整到分
const fmt = (n) => (Math.abs(n) >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : Math.abs(n) >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);
const nm = (c) => SK.BY[c].name;
const lineOf = (who, k, v) => { const t = (SEC_BY_ID[who] || {}).type; const L = W.lines[t] || W.lines['知性']; return (L[k] || '').replace(/\{(\w+)\}/g, (_, x) => (v[x] != null ? v[x] : '')); };
// ---------- 设计46 看盘选仓位：⅓仓 / 半仓 / 全仓（按点的那一刻的投资账户现金算；挂单的钱已经划走了，设计43）----------
export const POS = [{ k: 'third', name: '⅓仓', sell: '⅓', f: 1 / 3 }, { k: 'half', name: '半仓', sell: '一半', f: 1 / 2 }, { k: 'all', name: '全仓', sell: '全部', f: 1 }];
export const POS_BY = Object.fromEntries(POS.map((x) => [x.k, x]));
/** 这么多钱按挂单价最多买几股（连买入费用一起不超过 amt） */
export function nFor(s, code, px, amt) { if (!(px > 0) || !(amt >= px)) return 0; let n = Math.floor(amt / px); while (n > 0 && TR.buyCost(s, code, px, n) > amt + 1e-9) n = Math.min(n - 1, Math.floor(n * amt / TR.buyCost(s, code, px, n))); return Math.max(0, n); }
/** 某个仓位买几股：金额 = 现金 × f（⅓ / ½ / 全部），股数 = 金额 ÷ 买价往下取整，连买入费用一起不超过金额（钱不能超；三只各 ⅓ 一定都挂得上） */
export function posShares(s, code, px, k, cash = Math.max(0, TR.availCash(s))) { return nFor(s, code, px, cash * POS_BY[k].f); }
/** 三个按钮：[{ k, name, n, amt }]（n = 0 = 不够 1 股） */
export const posOptions = (s, code, px) => POS.map((x) => { const n = posShares(s, code, px, x.k); return { k: x.k, name: x.name, n, amt: Math.round(n * px * 100) / 100 }; });
const sharesFor = (s, code, px) => posShares(s, code, px, 'third');   // 默认 ⅓ 仓（设计46：固定 30% 不用了）

// ---------- 战绩（本周看盘几次、抓到涨停几次、照她挂的单赚多少；每 7 个游戏天跟周报一起清零）----------
export function lk(s) { const m = TR.tr(s); if (!m.look) m.look = { day: null, n: 0 }; const w = m.wk; if (!w.look) w.look = { n: 0, lu: 0, pnl: 0 }; return m.look; }
export const weekLook = (s) => { lk(s); return TR.tr(s).wk.look; };
const dayKey = (t) => { const d = new Date(t); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
/** 今天（本地日）看了几次 */
export const looksToday = (s, t = Date.now()) => { const L = lk(s); return L.day === dayKey(t) ? L.n : 0; };
/** 今天的涨停：{ out 已出（封板了）, left 还没出 } */
export function luCount(s, t = Date.now()) { const m = SK.mkt(s, t); const xs = SK.luToday(m, SK.tickOf(t)); const out = xs.filter((x) => x.sealed).length; return { out, left: Math.max(0, W.lu.picks - out) }; }
TR.addGroupHook((s, e) => {
  if (!e.src) return; const w = weekLook(s);
  if (e.kind === 'in' && e.lu) w.lu += 1;
  if (e.kind === 'out' && e.pnl != null) w.pnl = Math.round((w.pnl + e.pnl) * 100) / 100;
});

// ---------- 消息：进「重要」，过期 / 挂完 / 不用了 直接删 ----------
export function delMsg(s, id) { const i = (s.inbox || []).findIndex((m) => m.id === id); if (i >= 0) s.inbox.splice(i, 1); return i >= 0; }
/** 过期就删（在线 ticker、离线补算都叫）：新闻提醒在新闻出来后再过 1 跳；看盘 2 小时 */
export function purge(s, t = Date.now()) {
  let n = 0; for (const m of (s.inbox || []).slice()) {
    if (m.type === 'stock_tip' && m.data && t >= (m.data.newsTick + 1) * TICK) n += delMsg(s, m.id) ? 1 : 0;
    else if (m.type === 'stock_look' && m.data && t >= m.data.exp) n += delMsg(s, m.id) ? 1 : 0;
  }
  return n;
}

// ---------- 新闻前给价（设计41 第二节的价钱算法；设计47 看盘中新闻前 30 跳用）----------
/** hint → 单子：要涨 买 / 止盈 / 止损；要跌且手里有 先卖 / 抄底；要跌没有 只提醒 */
export function tipPlan(s, h) {
  const T = W.tip; const B = SK.band(s.mkt, h.code); const cl = (v) => (B.up != null ? Math.min(B.up, Math.max(B.dn, v)) : v); /* 设计41 第九节：给的价夹在涨跌停之间 */ const P = h.P; const k = T.tpBase + T.tpK * Math.min(100, h.wit) / 100; const hold = (s.mkt.hold[h.code] || { n: 0 });
  if (h.up) {
    const buy = cl(up2(P * T.buyK)); const n = Math.max(1, sharesFor(s, h.code, buy));
    return { kind: 'up', legs: [{ code: h.code, kind: 'buy', px: buy, n, role: 'in' }, { code: h.code, kind: 'tp', px: cl(dn2(P * (1 + h.J2 * k))), n, role: 'out' }, { code: h.code, kind: 'sl', px: Math.min(dn2(P * T.slK), dn2(buy * T.slK)), n, role: 'out' }], amt: n * buy };
  }
  const free = hold.n - (hold.pledged || 0); if (free < 1) return { kind: 'warn', legs: [] };
  return { kind: 'down', legs: [{ code: h.code, kind: 'sl', px: cl(dn2(P * T.sellK)), n: free, role: 'in' }, { code: h.code, kind: 'buy', px: cl(up2(P * (1 - Math.abs(h.J2) * k))), n: free, role: 'out' }], amt: free * P };
}
// ---------- 看盘（第七节）----------
/** 一只股票接下来 n 跳里：低点 L（第 i 跳）→ 之后高点 H（j > i）涨得最多的那段；lo 是整段最低价 */
export function bestRun(path) {
  let lo = Infinity, loI = -1, best = { L: path[0], H: path[0], i: 0, j: 0, r: 0 }, min = Infinity;
  for (let k = 0; k < path.length; k++) { const p = path[k]; if (p < min) min = p; if (p < lo) { lo = p; loI = k; } const r = p / lo - 1; if (r > best.r) best = { L: lo, H: p, i: loI, j: k, r }; }
  return { ...best, min };
}
/** 她给的价：X 买入、Y 卖出、Z 止损、g 赚头 */
export function priceRow(run, wit, limit = null, dnBand = null) {
  const K = W.look; const w = Math.min(100, Math.max(0, wit)); const e = K.eBase + K.eK * (1 - w / 100); const c = K.cBase + K.cK * w / 100;
  const X = up2(run.L + (run.H - run.L) * e);
  let Y = limit != null ? X + (limit - X) * c : Math.min(X + (run.H - X) * c, X * (1 + K.gBase + w * K.gK));
  Y = dn2(Math.min(Y, run.H)); const Z = Math.min(dn2(run.min * K.slK), dn2(X * K.slK));   // V0.2.14 小修：止损一定低于买价，不按跌停价夹（原来夹在跌停价会出现「¥990 买 → 止损 ¥990」）
  void dnBand;
  return { X, Y, Z, g: Y / X - 1 };
}
/** 挑哪几只（纯计算，给测试用）：看得到 5 + 智慧/4 只；今天的涨停在窗口里、又在看得到的里，排第一；其余按赚头凑够 3 只 */
export function lookRows(s, who, rnd = Math.random, wit = secAttrs(s, who).wit) {
  const K = W.look; const m = s.mkt; const busy = new Set(m.orders.filter((o) => o.src === 'watch' || ((m.grps || {})[o.grp] || {}).src === 'watch').map((o) => o.code));
  const pool = SK.STOCKS.map((x) => x.code).filter((c) => !busy.has(c) && m.px[c] > 0 && SK.onBoard(m, c) !== 'up');   // 第九节：已经封在涨停的不列
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const see = pool.slice(0, SK.seeCount(wit));   // 设计54
  const F = SK.future(m, K.ticks); const end = m.tick + K.ticks;
  const luIn = {}; for (const p of (F.lu ? F.lu.act : [])) if (p.limit && p.at + W.lu.pullTicks - 1 > m.tick && p.at + W.lu.pullTicks - 1 <= end) luIn[p.code] = p.limit;
  const out = [];
  for (const c of see) {
    const run = bestRun(F.path[c]); const lu = luIn[c] != null && run.H >= luIn[c] - 1e-9;
    const pr = priceRow(run, wit, lu ? luIn[c] : null, SK.band(m, c).dn); if (!lu && pr.g < K.minG) continue;
    out.push({ code: c, ...pr, n: sharesFor(s, c, pr.X), lu });
  }
  out.sort((a, b) => (b.lu - a.lu) || (b.g - a.g));
  return out.slice(0, K.show);
}
/** 一行 → 三张联动单（买、止盈、止损） */
export function legsOfRow(r) { return [{ code: r.code, kind: 'buy', px: r.X, n: r.n, role: 'in' }, { code: r.code, kind: 'tp', px: r.Y, n: r.n, role: 'out' }, { code: r.code, kind: 'sl', px: r.Z, n: r.n, role: 'out' }]; }
TR.addTickHook((s, t) => purge(s, t));

// ---------- 设计45 第五版 持仓页整理（开发2）：「等着买入」按股票分组、「我的持仓」一只一块（股数真实、现价 / 成本 / 盈亏 / 每组卖价）----------
const SRC_NAME = { watch: '看盘', tip: '看盘' };   // 设计47：「提醒」并进「看盘」
const endOf = (o) => o.exp || o.at + SK.SCFG.orders.expireDays * TR.DAY;
/** 持仓页要的数据（纯计算）：{ buys: [{ code, px, rows: [{ id, X, n, tp, sl, gain, src, left }] }], cash, hold: [{ code, n, free, cost, px, value, pnl, pct, sells: [{ ids, tp, sl, n, cost, gain, pct, src, left }] }] } */
export function holdView(s, t = Date.now()) {
  const m = s.mkt; const out = { buys: [], cash: 0, hold: [] }; if (!m) return out; const orders = m.orders || []; const grps = m.grps || {};
  const srcOf = (o) => SRC_NAME[(grps[o.grp] || {}).src] || '自己挂';
  // 等着买入
  const byCode = new Map();
  for (const o of orders) {
    if (o.kind !== 'buy' || o.on === false) continue;
    const mates = o.grp && o.role === 'in' ? orders.filter((x) => x.grp === o.grp && x.role === 'out') : [];
    const tpO = mates.find((x) => x.kind === 'tp'); const slO = mates.find((x) => x.kind === 'sl');
    const row = { id: o.id, X: o.px, n: o.n, tp: tpO ? tpO.px : null, sl: slO ? slO.px : null, gain: tpO ? Math.round((tpO.px - o.px) * o.n * 100) / 100 : null, slGain: slO ? Math.round((slO.px - o.px) * o.n * 100) / 100 : null, pct: tpO ? tpO.px / o.px - 1 : null, slPct: slO ? slO.px / o.px - 1 : null, src: srcOf(o), left: Math.max(0, (grps[o.grp] && grps[o.grp].sellBy != null ? grps[o.grp].sellBy * SK.SCFG.tickSec * 1000 : endOf(o)) - t), quick: !!(grps[o.grp] && grps[o.grp].sellBy != null), eta: etaView(grps[o.grp], 'buy'), hold: o.hold || 0 };   // 设计59：看盘那组从挂单起 10 分钟
    out.cash += o.hold || 0; (byCode.get(o.code) || byCode.set(o.code, []).get(o.code)).push(row);
  }
  out.buys = [...byCode.entries()].map(([code, rows]) => ({ code, px: m.px[code], rows: rows.sort((a, b) => b.X - a.X) })).sort((a, b) => Math.min(...a.rows.map((r) => r.left)) - Math.min(...b.rows.map((r) => r.left)));
  out.cash = Math.round(out.cash * 100) / 100;
  // 我的持仓：持仓里的 + 卖单里的（同一只合一块，成本按股数加权）
  const boxes = new Map();
  for (const o of orders) {
    if (o.kind === 'buy' || o.on === false) continue;
    const g = o.grp ? grps[o.grp] : null; const k = o.grp ? 'g' + o.grp : 'o' + o.id; const sh = (g && g.sh) || o.sh;
    const b = boxes.get(k) || { code: o.code, ids: [], tp: null, sl: null, n: sh ? sh.n : o.n, cost: sh ? sh.cost : null, src: srcOf(o), end: Infinity };
    b.ids.push(o.id); if (o.kind === 'tp') b.tp = o.px; else b.sl = o.px; b.end = Math.min(b.end, g && g.sellAt ? g.sellAt * SK.SCFG.tickSec * 1000 : endOf(o)); if (g && g.sellAt) b.quick = true; if (g && g.etaSell != null) b.eta = etaView(g, 'sell'); boxes.set(k, b);   // 设计51：看盘那组 10 分钟到时按现价卖
  }
  const codes = new Set([...Object.keys(m.hold || {}).filter((c) => m.hold[c].n > 0), ...[...boxes.values()].map((b) => b.code)]);
  for (const code of codes) {
    const h = m.hold[code] || { n: 0, cost: 0 }; const px = m.px[code] || 0; const bs = [...boxes.values()].filter((b) => b.code === code).sort((a, b) => a.end - b.end);
    let n = h.n, c = h.cost * h.n; for (const b of bs) { n += b.n; c += (b.cost != null ? b.cost : h.cost) * b.n; }
    const cost = n ? c / n : 0; const pnl = Math.round((px - cost) * n * 100) / 100;
    const sells = bs.map((b) => { const bc = b.cost != null ? b.cost : cost; return { ids: b.ids, tp: b.tp, sl: b.sl, n: b.n, cost: bc, gain: b.tp != null ? Math.round((b.tp - bc) * b.n * 100) / 100 : null, pct: b.tp != null && bc ? b.tp / bc - 1 : null, slGain: b.sl != null ? Math.round((b.sl - bc) * b.n * 100) / 100 : null, slPct: b.sl != null && bc ? b.sl / bc - 1 : null, src: b.src, left: Math.max(0, b.end - t), quick: !!b.quick, eta: b.eta || null }; });
    out.hold.push({ code, n, free: TR.sellable(s, code), cost, px, value: Math.round(px * n * 100) / 100, pnl, pct: cost ? px / cost - 1 : 0, sells });
  }
  out.hold.sort((a, b) => b.value - a.value);
  return out;
}
/** 设计60 看盘单的预计时间（毫秒，现实时间）：{ kind: buy / sell, at（预计到低点买入 / 预计卖出）, by（最晚按现价卖）}；自己挂的、投资经理的没有 */
function etaView(g, kind) { const T = SK.SCFG.tickSec * 1000; if (!g || g.etaBuy == null || g.sellBy == null) return null; return { kind, at: (kind === 'buy' ? g.etaBuy : g.etaSell) * T, by: g.sellBy * T }; }
/** 撤一组卖单（同组的止盈止损一起撤，股票回到持仓） */
export function cancelSell(s, ids, t = Date.now()) { let n = 0; for (const id of ids) { const o = (s.mkt.orders || []).find((x) => x.id === id); if (TR.cancelOrder(s, id, false, t)) n = Math.max(n, (o && o.backN) || 0); } return n; }
import './ws.js?v=ab0bf094'; // 设计47：看盘改成时间段（挂进 stocks.js advance）
import './mgr.js?v=ab0bf094'; // 设计44：投资经理每天 4 轮（挂进 stocks.js advance）
