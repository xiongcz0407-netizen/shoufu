// 设计47 看盘改成时间段（开发2）：点「看盘」花 5 精力，选一个秘书盯现实 6 小时。
// 盯着的时候：开始那一刻扫一次，之后从开始起每 60 跳（现实 30 分钟）自动扫一次接下来 240 跳（手动「现在看一眼」不改这个点，冷却 10 跳）；
// 利好 / 利空新闻每跳检查、新闻前 30 跳就说（提前说 / 说准按「股票 + 新闻那一跳」定种子只掷一次，点几次都一样）。
// 机会：要涨停 / 有利好 / 有一波 → 「重要」消息（⅓仓 / 半仓 / 全仓 一点就挂）；手里有的要跌 → 「¥X 以下先卖掉」（卖 ⅓ / 一半 / 全部）。
// 同一只不重复、最多 3 条；买入点过了删消息。离线不补发：回来还在看盘时间里马上扫一次。结束弹战绩。不看盘就没有任何股票提示（规矩 9）。
import * as SK from './stocks.js?v=d17576a6';
import * as TR from './trade.js?v=d17576a6';
import { addMsg } from './inbox.js?v=d17576a6';
import { attrs as secAttrs } from './posts.js?v=d17576a6';
import { whyEnergy, doEnergy } from './manage.js?v=d17576a6';
import { isTraining } from './training.js?v=d17576a6';
import { SEC_BY_ID } from '../config/secretaries.js?v=d17576a6';
import { bestRun, priceRow, lookRows, tipPlan, delMsg, posShares, POS_BY, nFor } from './look.js?v=d17576a6';

const C = SK.SCFG; const W = C.watch; const WS = W.ws; const T = W.tip;
const TICK = C.tickSec * 1000; const HOUR_TICKS = 3600e3 / TICK;
const dn2 = (v) => Math.floor(v * 100 + 1e-7) / 100;
const r2 = (v) => Math.round(v * 100) / 100;
const nm = (c) => SK.BY[c].name;
const fmt = (n) => (Math.abs(n) >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : Math.abs(n) >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);

/** 现在的看盘（没有 / 过了就是 null） */
export const ws = (s, t = null) => { const w = s.mkt && s.mkt.ws; if (!w) return null; if (t != null && t >= w.end) return null; return w; };
export const watching = (s, t = Date.now()) => !!ws(s, t);
const wit = (s, w) => Math.min(100, secAttrs(s, w.who).wit);
const msgs = (s) => (s.inbox || []).filter((m) => m.type === 'stock_ws');

/** 开始看盘：花 5 精力（新手目标送的「看盘」不花），同一时间只一个秘书 */
export function startWatch(s, who, t = Date.now()) {
  if (!s.mkt) return { ok: false, why: '还不能开户' };
  if (ws(s, t)) return { ok: false, why: '已经在看盘了（想换人先结束看盘）' };
  if (!s.secs[who]) return { ok: false, why: '没有这个秘书' };
  if (isTraining(s, who)) return { ok: false, why: '她在上课' };
  SK.advance(s, t); const m = s.mkt; const free = m.freeHint > 0;
  if (!free) { const why = whyEnergy(s, W.look.energy, t); if (why) return { ok: false, why }; doEnergy(s, W.look.energy, t); } else m.freeHint -= 1;
  const st = m.tick; m.ws = { who, start: t, end: t + WS.hours * 3600e3, st, et: st + WS.hours * HOUR_TICKS, manual: null, sent: 0, placed: 0, pnl: 0, grps: [], said: {}, toast: [], resume: false, scans: [] };
  TR.setWatch(s, who); const wk = TR.tr(s).wk; if (wk) { wk.look = wk.look || { n: 0, lu: 0, pnl: 0 }; wk.look.n += 1; }
  const first = scan(s, t);   // V0.2.14 小修：开始那一刻马上扫一次（之后自动扫照旧从开始那一跳起每 60 跳）
  return { ok: true, free, ws: m.ws, msgs: first };
}
/** 结束看盘（提前结束不退精力）：不再发新的；发出的消息、挂上的单照常走完。返回战绩 */
export function stopWatch(s, t = Date.now(), early = true) {
  const m = s.mkt; const w = m && m.ws; if (!w) return null;
  const done = { who: w.who, sent: w.sent, placed: w.placed, pnl: r2(w.pnl), grps: w.grps.slice(), at: t, early, line: WS.endLine };
  m.ws = null; m.wsDone = done; m.wsLast = done; TR.setWatch(s, null); return done;
}
/** 战绩弹窗（拿一次就清） */
export const takeDone = (s) => { const d = s.mkt && s.mkt.wsDone; if (d) s.mkt.wsDone = null; return d || null; };
/** 小提示条（拿一次就清） */
export const takeToast = (s) => { const w = s.mkt && s.mkt.ws; if (!w || !w.toast.length) return []; const x = w.toast; w.toast = []; return x; };

// ---------- 她怎么判断（只掷一次：按股票 + 新闻那一跳定种子）----------
const roll = (s, code, tick, i) => SK.hu(`WS${s.gid || ''}:${code}`, tick * 8 + i);
/** 新闻前 newsLead 跳：她说不说、说对说错、估多少（设计41 第二节的公式；种子固定） */
export function newsCall(s, w, newsTick) {
  const nw = SK.newsAt(newsTick); if (!nw || nw.kind !== 'stock') return null;
  const m = s.mkt; const code = nw.target; const wv = wit(s, w);
  if (roll(s, code, newsTick, 0) >= wv / T.earlyDiv) return { code, early: false };
  const right = roll(s, code, newsTick, 1) < T.rightBase + wv / T.rightDiv;
  const lead = Math.max(1, newsTick - m.tick); const after = SK.future(m, lead).path[code][lead - 1]; const P = m.px[code];
  const Jt = after / P - 1; const e = T.errK * (1 - wv / 100); let J2 = Jt * (1 - e + 2 * e * roll(s, code, newsTick, 2)); if (!right) J2 = -J2;
  return { code, early: true, right, up: J2 > 0, J: Jt, J2, P, after, wit: wv, who: w.who, newsTick };
}

// ---------- 发消息 ----------
const TITLE = { lu: '今天会封涨停', news: '有利好', wave: '接下来能涨一波', fall: '要跌' };
function send(s, w, d, t) {
  if (msgs(s).some((x) => x.data && x.data.code === d.code)) return null;   // 同一只不重复
  const who = w.who; const sec = SEC_BY_ID[who] ? SEC_BY_ID[who].name : '';
  const body = d.kind === 'fall' ? `${nm(d.code)} 要跌，¥${d.X} 以下先卖掉（你手里 ${d.have.toLocaleString()} 股）`
    : `${nm(d.code)}${TITLE[d.kind]}：¥${d.X} 以内买进 · 涨到 ¥${d.Y} 卖 · 止损 ¥${d.Z}（+${(d.g * 100).toFixed(1)}%）`;
  const msg = addMsg(s, { kind: 'request', type: 'stock_ws', from: who, title: `${sec}：${nm(d.code)}${TITLE[d.kind]}`, body,
    actions: [{ key: 'open', label: d.kind === 'fall' ? '看 / 卖' : '看 / 挂单' }, { key: 'no', label: '不用了' }], data: { ...d, at: t } }, t);
  w.sent += 1; w.toast.push({ who, code: d.code, kind: d.kind, id: msg.id, text: d.kind === 'fall' ? `${nm(d.code)}要跌，去看看` : `${nm(d.code)}有机会，去看看` });
  // 最多 3 条：多了只留赚头最大的（要跌的排最前）
  const all = msgs(s); if (all.length > WS.maxMsgs) { const rank = (x) => (x.data.kind === 'fall' ? 9 : x.data.g || 0); all.sort((a, b) => rank(b) - rank(a)); for (const x of all.slice(WS.maxMsgs)) delMsg(s, x.id); }
  return (s.inbox || []).includes(msg) ? msg : null;
}
/** 买入点：路径里第一跳 ≤ X（过了就删消息）；没有就是窗口末尾 */
const buyEnd = (m, path, X) => { const i = path.findIndex((p) => p <= X + 1e-9); return (m.tick + 1 + (i < 0 ? path.length - 1 : i)) * TICK; };

/** 扫一次（自动 / 手动一样）：要涨停 / 有一波（看得到的）+ 手里有的要跌；返回新发的消息 */
export function scan(s, t = Date.now(), manual = false) {
  const w = ws(s); if (!w) return [];
  const m = s.mkt; w.scans.push({ tk: m.tick, manual }); if (w.scans.length > 40) w.scans.shift(); const wv = wit(s, w); const day = Math.floor((m.tick - w.st) / (24 * HOUR_TICKS));
  let i = 0; const rnd = () => SK.hu(`WSV${s.gid || ''}:${w.who}`, (w.st + day) * 64 + (i++));   // 看得到哪几只：这次看盘里每天固定
  const F = SK.future(m, WS.aheadTicks); const out = [];
  for (const r of lookRows(s, w.who, rnd, wv)) {
    const d = { kind: r.lu ? 'lu' : 'wave', code: r.code, X: r.X, Y: r.Y, Z: r.Z, g: r.g, lu: r.lu, exp: buyEnd(m, F.path[r.code], r.X) };
    const x = send(s, w, d, t); if (x) out.push(x);
  }
  for (const [code, h] of Object.entries(m.hold || {})) {   // 手里有的要跌一波
    const have = TR.sellable(s, code); if (have < 1 || !F.path[code]) continue; const P = m.px[code]; const path = F.path[code];
    if (Math.max(...path) > P * (1 + WS.fallUp) || Math.min(...path) > P * (1 - WS.fallDn)) continue;
    const B = SK.band(m, code); const X = Math.max(B.dn || 0, dn2(P * T.sellK)); const lo = Math.min(...path); const k = path.indexOf(lo);   // 跌到底之前都来得及卖
    const x = send(s, w, { kind: 'fall', code, X, have, g: Math.min(...path) / P - 1, exp: (m.tick + 1 + (k < 0 ? path.length - 1 : k)) * TICK }, t); if (x) out.push(x);
    void h;
  }
  return out;
}
/** 新闻前 newsLead 跳（每跳查）：她提前说 → 利好发「有利好」；利空、手里有 → 发「要跌」 */
function newsCheck(s, w, tk, t) {
  const nt = tk + WS.newsLead; if (w.said[nt]) return null; for (const k of Object.keys(w.said)) if (+k < tk) delete w.said[k]; const c = newsCall(s, w, nt); if (!c) return null; w.said[nt] = 1;
  if (!c.early) return null;
  const p = tipPlan(s, c); const m = s.mkt;
  if (p.kind === 'up') { const L = p.legs; return send(s, w, { kind: 'news', code: c.code, X: L[0].px, Y: L[1].px, Z: L[2].px, g: L[1].px / L[0].px - 1, lu: false, exp: nt * TICK, right: c.right }, t); }
  if (p.kind === 'down') { const have = TR.sellable(s, c.code); return send(s, w, { kind: 'fall', code: c.code, X: p.legs[0].px, have, g: c.J2, exp: nt * TICK, right: c.right }, t); }
  void m; return null;
}
/** 每一跳（stocks.js advance 的钩子）：到点自动扫、新闻前 30 跳、结束；离线补的跳不发，回到现在马上扫一次 */
function step(s, tk) {
  const m = s.mkt; const w = m && m.ws; if (!w) return;
  const t = tk * TICK; if (tk >= w.et) { stopWatch(s, w.end, false); return; }
  const gap = SK.advancingTo() - tk;   // 离「现在」还差几跳：差 3 跳以上算离线补的，不发
  if (gap >= 3) { w.resume = true; return; }
  if (w.resume) { if (gap > 0) return; w.resume = false; scan(s, t); }   // 离线回来：走到「现在」那一跳马上扫一次
  newsCheck(s, w, tk, t);
  if (tk > w.st && (tk - w.st) % WS.scanTicks === 0) scan(s, t);
}
SK.addStepHook(step);

/** 「让她现在看一眼」：不花精力、马上扫；冷却 10 跳；不改自动扫的点。返回 { ok, msgs } 或 { why, wait } */
export function cdLeft(s, t = Date.now()) { const w = ws(s, t); if (!w || w.manual == null) return 0; return Math.max(0, (w.manual + WS.manualCdTicks) * TICK - t); }
export function lookOnce(s, t = Date.now()) {
  if (!ws(s, t)) return { ok: false, why: '没在看盘' };
  SK.advance(s, t); const w = ws(s, t); if (!w) return { ok: false, why: '看盘刚结束' };
  const left = cdLeft(s, t); if (left > 0) return { ok: false, why: `刚看过 · ${Math.ceil(left / 60e3)} 分钟后再看`, wait: left };
  w.manual = s.mkt.tick; const out = scan(s, t, true); return { ok: true, msgs: out, line: out.length ? '' : WS.noneLine, who: w.who };
}

// ---------- 照她说的挂 ----------
/** 买的：⅓仓 / 半仓 / 全仓 一点挂上三张联动单（2 小时没买进撤买单） */
export function placeWs(s, msg, k, t = Date.now()) {
  const d = msg.data; const n = posShares(s, d.code, d.X, k); if (n < 1) return { ok: false, why: '不够 1 股' };
  const r = TR.addGroup(s, [{ code: d.code, kind: 'buy', px: d.X, n, role: 'in' }, { code: d.code, kind: 'tp', px: d.Y, n, role: 'out' }, { code: d.code, kind: 'sl', px: d.Z, n, role: 'out' }], { src: 'watch', exp: t + WS.aheadTicks * TICK, lu: !!d.lu }, t);
  if (!r.ok) return r; delMsg(s, msg.id); const w = ws(s); if (w) { w.placed += 1; w.grps.push(r.grp); } return { ...r, n, pos: POS_BY[k].name };
}
/** 要跌的：卖 ⅓ / 一半 / 全部 → 「¥X 以下先卖掉」的卖单 */
export function sellWs(s, msg, k, t = Date.now()) {
  const d = msg.data; const n = Math.floor(TR.sellable(s, d.code) * POS_BY[k].f); if (n < 1) return { ok: false, why: '没有能卖的' };
  const r = TR.addGroup(s, [{ code: d.code, kind: 'sl', px: d.X, n, role: 'in' }], { src: 'watch' }, t);
  if (!r.ok) return r; delMsg(s, msg.id); const w = ws(s); if (w) { w.placed += 1; w.grps.push(r.grp); } return { ...r, n };
}
TR.addGroupHook((s, e) => { const w = s.mkt && (s.mkt.ws || s.mkt.wsLast); if (!w || e.kind !== 'out' || e.pnl == null || !w.grps.includes(e.grp)) return; w.pnl = r2((w.pnl || 0) + e.pnl); });
/** 买入点过了的看盘消息删掉（在线 ticker、离线补算都叫） */
TR.addTickHook((s, t) => { for (const x of msgs(s)) if (x.data && t >= x.data.exp) delMsg(s, x.id); });
export { nFor };
