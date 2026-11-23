// 设计41 秘书看盘给价（开发2）：新闻提醒给价 + 玩家点「看盘」；进消息「重要」、过期直接删；她的战绩
// 新闻提醒：core/stocks.js hint() 提前 3 跳出 → tipMsg 变成一条「重要」消息（带三张联动单）
// 看盘：lookNow 用 SK.future 把接下来 240 跳先算出来（跟真实走的一样），挑真实会到的低点 L、之后的高点 H 定价，一定能成交
import * as SK from './stocks.js?v=59e44493';
import * as TR from './trade.js?v=59e44493';
import { addMsg } from './inbox.js?v=59e44493';
import { attrs as secAttrs } from './posts.js?v=59e44493';
import { whyEnergy, doEnergy } from './manage.js?v=59e44493';
import { SEC_BY_ID } from '../config/secretaries.js?v=59e44493';

const W = SK.SCFG.watch; const TICK = SK.SCFG.tickSec * 1000;
const up2 = (v) => Math.ceil(v * 100 - 1e-7) / 100;     // 买入价往上取整到分
const dn2 = (v) => Math.floor(v * 100 + 1e-7) / 100;    // 卖出价往下取整到分
const fmt = (n) => (Math.abs(n) >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : Math.abs(n) >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);
const nm = (c) => SK.BY[c].name;
const lineOf = (who, k, v) => { const t = (SEC_BY_ID[who] || {}).type; const L = W.lines[t] || W.lines['知性']; return (L[k] || '').replace(/\{(\w+)\}/g, (_, x) => (v[x] != null ? v[x] : '')); };
const sharesFor = (s, px, share) => { const amt = Math.max(0, s.cash) * share; return amt >= px ? Math.floor(amt / px) : 0; };

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

// ---------- 新闻提醒给价（第二节）----------
/** hint → 单子：要涨 买 / 止盈 / 止损；要跌且手里有 先卖 / 抄底；要跌没有 只提醒 */
export function tipPlan(s, h) {
  const T = W.tip; const B = SK.band(s.mkt, h.code); const cl = (v) => (B.up != null ? Math.min(B.up, Math.max(B.dn, v)) : v); /* 设计41 第九节：给的价夹在涨跌停之间 */ const P = h.P; const k = T.tpBase + T.tpK * Math.min(100, h.wit) / 100; const hold = (s.mkt.hold[h.code] || { n: 0 });
  if (h.up) {
    const buy = cl(up2(P * T.buyK)); const n = Math.max(1, sharesFor(s, buy, T.cashShare));
    return { kind: 'up', legs: [{ code: h.code, kind: 'buy', px: buy, n, role: 'in' }, { code: h.code, kind: 'tp', px: cl(dn2(P * (1 + h.J2 * k))), n, role: 'out' }, { code: h.code, kind: 'sl', px: cl(dn2(P * T.slK)), n, role: 'out' }], amt: n * buy };
  }
  const free = hold.n - (hold.pledged || 0); if (free < 1) return { kind: 'warn', legs: [] };
  return { kind: 'down', legs: [{ code: h.code, kind: 'sl', px: cl(dn2(P * T.sellK)), n: free, role: 'in' }, { code: h.code, kind: 'buy', px: cl(up2(P * (1 - Math.abs(h.J2) * k))), n: free, role: 'out' }], amt: free * P };
}
export function tipMsg(s, h, t = Date.now()) {
  const p = tipPlan(s, h); const L = p.legs; const v = { name: nm(h.code) };
  if (p.kind === 'up') Object.assign(v, { buy: L[0].px, tp: L[1].px, sl: L[2].px }); else if (p.kind === 'down') Object.assign(v, { sell: L[0].px, back: L[1].px });
  const say = lineOf(h.who, p.kind, v);
  const body = p.kind === 'up' ? `${say}\n买入 ¥${L[0].px} 以内 · 涨到 ¥${L[1].px} 卖 · 跌破 ¥${L[2].px} 走 · 买 ${L[0].n.toLocaleString()} 股（约 ¥${fmt(p.amt)}）`
    : p.kind === 'down' ? `${say}\n¥${L[0].px} 以下先卖掉 ${L[0].n.toLocaleString()} 股 · 跌到 ¥${L[1].px} 再接回来` : say;
  const msg = addMsg(s, { kind: 'request', type: 'stock_tip', from: h.who, title: `${SEC_BY_ID[h.who] ? SEC_BY_ID[h.who].name : ''}：${nm(h.code)}${p.kind === 'up' ? '要有好消息' : '不太妙'}`, body,
    actions: p.legs.length ? [{ key: 'place', label: '照她说的挂单' }, { key: 'no', label: '不用了' }] : [{ key: 'no', label: '好，不碰' }],
    data: { code: h.code, kind: p.kind, legs: p.legs, newsTick: h.newsTick, say } }, t);
  return msg;
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
  Y = dn2(Math.min(Y, run.H)); const Z = Math.max(dn2(run.min * K.slK), dnBand || 0);   // 设计41 第九节：止损不低于跌停价
  return { X, Y, Z, g: Y / X - 1 };
}
/** 现在看一眼：返回 { rows: [{ code, X, Y, Z, g, n, lu }], who } 或 { why }。会扣 5 精力、记战绩、进「重要」 */
export function lookNow(s, t = Date.now(), rnd = Math.random, { free = false } = {}) {
  const who = TR.watcher(s); if (!who) return { why: '先派人看盘' };
  const K = W.look; if (!free) { const w = whyEnergy(s, K.energy, t); if (w) return { why: w }; }
  SK.advance(s, t); const m = TR.tr(s, t);
  const rows = lookRows(s, who, rnd);
  if (!free) doEnergy(s, K.energy, t);
  const L = lk(s); const d = dayKey(t); if (L.day !== d) { L.day = d; L.n = 0; } L.n += 1; weekLook(s).n += 1;
  const v = { name: rows[0] ? nm(rows[0].code) : '' }; const say = lineOf(who, rows.length ? (rows[0].lu ? 'lu' : 'look') : 'none', v);
  const exp = t + K.ticks * TICK;
  const msg = addMsg(s, { kind: 'request', type: 'stock_look', from: who, title: `${SEC_BY_ID[who].name} · 看盘（接下来 2 小时内都能成交）`,
    body: rows.length ? `${rows.map((r) => `${r.lu ? '🔥 ' : ''}${nm(r.code)}：¥${r.X} 以内买进，涨到 ¥${r.Y} 卖（+${(r.g * 100).toFixed(1)}%${r.lu ? '，要涨停了！' : ''}）`).join('\n')}\n「${say}」` : `「${say}」`,
    actions: rows.length ? [{ key: 'open', label: '看 / 挂单' }, { key: 'no', label: '不用了' }] : [{ key: 'no', label: '好' }],
    data: { rows, exp, say, at: t } }, t);
  return { rows, who, say, msg, exp };
}
/** 挑哪几只（纯计算，给测试用）：看得到 5 + 智慧/4 只；今天的涨停在窗口里、又在看得到的里，排第一；其余按赚头凑够 3 只 */
export function lookRows(s, who, rnd = Math.random, wit = secAttrs(s, who).wit) {
  const K = W.look; const m = s.mkt; const busy = new Set(m.orders.filter((o) => o.src === 'watch' || ((m.grps || {})[o.grp] || {}).src === 'watch').map((o) => o.code));
  const pool = SK.STOCKS.map((x) => x.code).filter((c) => !busy.has(c) && m.px[c] > 0 && SK.onBoard(m, c) !== 'up');   // 第九节：已经封在涨停的不列
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const see = pool.slice(0, Math.min(30, Math.floor(K.seeBase + Math.min(100, wit) / K.seeDiv)));
  const F = SK.future(m, K.ticks); const end = m.tick + K.ticks;
  const luIn = {}; for (const p of (F.lu ? F.lu.act : [])) if (p.limit && p.at + W.lu.pullTicks - 1 > m.tick && p.at + W.lu.pullTicks - 1 <= end) luIn[p.code] = p.limit;
  const share = K.cashShare; const out = [];
  for (const c of see) {
    const run = bestRun(F.path[c]); const lu = luIn[c] != null && run.H >= luIn[c] - 1e-9;
    const pr = priceRow(run, wit, lu ? luIn[c] : null, SK.band(m, c).dn); if (!lu && pr.g < K.minG) continue;
    out.push({ code: c, ...pr, n: sharesFor(s, pr.X, share), lu });
  }
  out.sort((a, b) => (b.lu - a.lu) || (b.g - a.g));
  return out.slice(0, K.show);
}
/** 挂一行（玩家改过的 legs 可以传进来）：成了这行写「已挂」，都挂了 / 不用了 删消息 */
export function legsOfRow(r) { return [{ code: r.code, kind: 'buy', px: r.X, n: r.n, role: 'in' }, { code: r.code, kind: 'tp', px: r.Y, n: r.n, role: 'out' }, { code: r.code, kind: 'sl', px: r.Z, n: r.n, role: 'out' }]; }
export function placeLegs(s, msg, idx, legs, t = Date.now()) {
  const look = msg.type === 'stock_look'; const r = look ? msg.data.rows[idx] : null;
  if (look && !(r.n >= 1) && !(legs && legs[0].n >= 1)) return { ok: false, why: '钱不够' };
  const res = TR.addGroup(s, legs || (look ? legsOfRow(r) : msg.data.legs), { src: look ? 'watch' : 'tip', exp: look ? msg.data.exp : null, lu: !!(r && r.lu) }, t);
  if (!res.ok) return res;
  if (look) { r.placed = true; if (msg.data.rows.every((x) => x.placed || !(x.n >= 1))) delMsg(s, msg.id); } else delMsg(s, msg.id);
  return res;
}
/** 一键全挂：能挂的都挂上（不再一张张确认） */
export function placeAll(s, msg, t = Date.now()) {
  let n = 0; const why = []; for (let i = 0; i < msg.data.rows.length; i++) { const r = msg.data.rows[i]; if (r.placed || !(r.n >= 1)) continue; const x = placeLegs(s, msg, i, null, t); if (x.ok) n++; else why.push(x.why); }
  if (n && (s.inbox || []).includes(msg)) delMsg(s, msg.id);
  return { n, why: why[0] };
}
TR.addTickHook((s, t) => purge(s, t));
