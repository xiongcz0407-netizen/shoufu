// 设计47 看盘改成时间段（开发2）：点「看盘」花 5 精力，选一个秘书盯现实 6 小时。
// 盯着的时候：开始那一刻扫一次，之后从开始起每 60 跳（现实 30 分钟）自动扫一次接下来 240 跳（手动「现在看一眼」不改这个点，冷却 10 跳）；
// 利好 / 利空新闻每跳检查、新闻前 30 跳就说（提前说 / 说准按「股票 + 新闻那一跳」定种子只掷一次，点几次都一样）。
// 机会：要涨停 / 有利好 / 有一波 → 「重要」消息（⅓仓 / 半仓 / 全仓 一点就挂）；手里有的要跌 → 「¥X 以下先卖掉」（卖 ⅓ / 一半 / 全部）。
// 设计48：提示不进消息，放在 s.mkt.wsTips（股票页看盘卡片下面列）；同一只不重复、最多 3 条；买入点过了收起；「不用了」这次看盘这只不再说。离线不补发：回来还在看盘时间里马上扫一次。结束弹战绩。不看盘就没有任何股票提示（规矩 9）。
import * as SK from './stocks.js?v=e379aa95';
import * as TR from './trade.js?v=e379aa95';
import { attrs as secAttrs } from './posts.js?v=e379aa95';
import { whyEnergy, doEnergy } from './manage.js?v=e379aa95';
import { isTraining } from './training.js?v=e379aa95';
import { SEC_BY_ID } from '../config/secretaries.js?v=e379aa95';
import { posShares, POS_BY, nFor } from './look.js?v=e379aa95';
import { have as haveItem, useItem } from './coupon.js?v=e379aa95';   // 设计53 投资券

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
// ---------- 设计48：看盘提示放股票页（不进消息）----------
const RANK = { lu: 4, fall: 3, news: 2, wave: 1 };
/** 现在的提示（涨停 > 要跌 > 利好 > 一波，同类新的在前）；看盘结束后没过期的照样留着 */
export const tips = (s) => ((s.mkt && s.mkt.wsTips) || []).slice().sort((a, b) => (RANK[b.data.kind] - RANK[a.data.kind]) || (b.at - a.at) || (b.id - a.id));
const msgs = (s) => (s.mkt && s.mkt.wsTips) || [];
export const tipById = (s, id) => msgs(s).find((x) => x.id === id) || null;
export function delTip(s, id) { const L = msgs(s); const i = L.findIndex((x) => x.id === id); if (i >= 0) L.splice(i, 1); return i >= 0; }
/** 「不用了」：收起，这次看盘这只不再说 */
export function dismissTip(s, id) { const x = tipById(s, id); if (!x) return false; delTip(s, id); const w = s.mkt.ws; if (w) (w.no = w.no || {})[x.data.code] = 1; return true; }
/** 点开过那一条就算看过（红点） */
export function seeTip(s, id) { const x = tipById(s, id); if (x && !x.seen) { x.seen = true; return true; } return false; }
export const unseen = (s) => msgs(s).filter((x) => !x.seen).length;

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
  const done = { who: w.who, sent: w.sent, placed: w.placed, pnl: r2(w.pnl), grps: w.grps.slice(), wrongGrps: { ...(w.wrongGrps || {}) }, right: w.right || 0, wrong: w.wrong || 0, at: t, early, line: WS.endLine };
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

// ---------- 设计51：只给马上能买、10 分钟内卖掉的 ----------
const K = W.look; const up2 = (v) => Math.ceil(v * 100 - 1e-7) / 100;
const cOf = (wv) => K.cBase + K.cK * Math.min(100, Math.max(0, wv)) / 100;
const AHEAD = () => WS.buyTicks + WS.sellTicks;
/** 这一跳以后的 2 + 20 跳（看盘只看这么远） */
const fut = (m) => SK.future(m, AHEAD());
/** 窗口里会封涨停的：{ code: 涨停价 }（封板那一跳在接下来 sellTicks + 1 跳里，现在还没封） */
function luIn(m, F) { const out = {}; const end = m.tick + AHEAD(); for (const p of (F.lu ? F.lu.act : [])) { const sealAt = p.at + W.lu.pullTicks - 1; if (p.limit && sealAt > m.tick && sealAt <= end && !SK.isSealed(m, p.code)) out[p.code] = p.limit; } return out; }
/** 一只的价：现在买 X（接下来 2 跳最高、往上取整、不超涨停价）→ 成交后 20 跳里卖 Y（设计41 算法 + 智慧，封顶 gBase + 智慧 × gK；会封涨停的卖在涨停价附近）；止损 Z < X；mins 约几分钟后到 */
export function quick(m, code, path, wv, luLimit = null) {
  const P = m.px[code]; if (!(P > 0) || !path || path.length < AHEAD() || SK.onBoard(m, code) === 'up') return null;
  const B = SK.band(m, code); let X = up2(Math.max(...path.slice(0, WS.buyTicks))); if (B.up != null) X = Math.min(X, B.up);
  const win = path.slice(1, 1 + WS.sellTicks); const H = Math.max(...win); const Lw = Math.min(...win); const w = Math.min(100, Math.max(0, wv)); const c = cOf(w);
  const lu = luLimit != null && H >= luLimit - 1e-9;
  let Y = lu ? X + (luLimit - X) * c : X + (H - X) * c;
  Y = dn2(Math.min(Y, H)); if (!lu) Y = Math.min(Y, up2(X * (1 + WS.gBase + w * WS.gK)));
  const g = Y / X - 1;   // 设计54：封顶往上取整到分（便宜股几块钱，往下取整会掉到 3% 以下）
  if (!(g >= WS.minG - 5e-4)) return null;
  const Z = Math.min(dn2(Math.min(Lw, path[0]) * K.slK), dn2(X * K.slK));
  const j = win.findIndex((p) => p >= Y - 1e-9); return { code, X, Y, Z, g, lu, mins: Math.min(Math.ceil(WS.sellTicks / 2), Math.max(1, Math.ceil((j + 1) / 2))) };
}
/** 手里有的要跌：现在卖 Z（接下来 2 跳最低、往下取整、不低于跌停价）；drop 不卖还要跌多少 */
export function quickFall(m, code, path, force = false) {
  const P = m.px[code]; if (!(P > 0) || !path) return null; const win = path.slice(0, WS.sellTicks);
  if (!force && (Math.max(...win) > P * (1 + WS.fallUp) || Math.min(...win) > P * (1 - WS.fallDn))) return null;
  const B = SK.band(m, code); const Z = Math.max(B.dn || 0, dn2(Math.min(...path.slice(0, WS.buyTicks)))); return { code, X: Z, drop: Math.min(...win) / P - 1 };
}
/** 她看得到哪几只（这次看盘里每天固定）+ 正在造的那只 */
function visible(s, w) {
  const m = s.mkt; const day = Math.floor((m.tick - w.st) / (24 * HOUR_TICKS)); let i = 0; const rnd = () => SK.hu(`WSV${s.gid || ''}:${w.who}`, (w.st + day) * 64 + (i++));
  const pool = SK.STOCKS.map((x) => x.code).filter((c) => m.px[c] > 0);
  for (let a = pool.length - 1; a > 0; a--) { const b = Math.floor(rnd() * (a + 1)); [pool[a], pool[b]] = [pool[b], pool[a]]; }
  const see = pool.slice(0, SK.seeCount(wit(s, w)));   // 设计54：5 + 智慧 × 0.45，最多 50
  for (const g of m.guards || []) if (!g.w && g.from + g.ticks > m.tick && !see.includes(g.code)) see.push(g.code);
  return see;
}

// ---------- 提示（设计48：放股票页，不进消息）----------
const isGood = (x) => x.data.kind !== 'fall' && !x.data.pre && x.data.g >= WS.minG - 5e-4;
const TITLE = { lu: '10 分钟内封涨停', news: '有利好', wave: '能涨一波', fall: '要跌' };
function send(s, w, d, t) {
  if (msgs(s).some((x) => x.data.code === d.code) || (w.no && w.no[d.code])) return null;   // 同一只不重复；「不用了」的这次看盘不再说
  const who = w.who; const sec = SEC_BY_ID[who] ? SEC_BY_ID[who].name : ''; const m = s.mkt;
  const tip = { id: (m.wsTipSeq = (m.wsTipSeq || 0) + 1), from: who, title: `${sec}：${nm(d.code)}${d.pre ? '有利好，马上要出' : TITLE[d.kind]}`, data: { ...d, at: t }, at: t, seen: false };
  (m.wsTips = m.wsTips || []).push(tip);
  w.sent += 1; w.toast.push({ who, code: d.code, kind: d.kind, id: tip.id, text: d.kind === 'fall' ? `${nm(d.code)}要跌，去看看` : d.pre ? `${nm(d.code)}有利好，马上要出` : `${nm(d.code)}有机会，去看看` });
  const all = tips(s);   // 最多 3 条：从排在后面的挤掉，但涨幅 ≥ 3% 的能买提示至少留一条（设计52 保底）
  for (let i = all.length - 1; i >= 0 && msgs(s).length > WS.maxMsgs; i--) { if (isGood(all[i]) && msgs(s).filter(isGood).length <= 1) continue; delTip(s, all[i].id); }
  return msgs(s).includes(tip) ? tip : null;
}
/** 现在有没有涨幅 ≥ minG 的能买提示（要跌、预告不算） */
const hasGood = (s) => msgs(s).some(isGood);
/** 下一次自动扫是哪一跳 */
const nextScan = (w, tk) => w.st + (Math.floor((tk - w.st) / WS.scanTicks) + 1) * WS.scanTicks;

// ---------- 设计52 保底：一次扫没有就造一只，下一次扫一定有 ----------
export function makeGuard(s, w, see, tk) {
  const m = s.mkt; const G = WS.guard; m.guards = (m.guards || []).filter((g) => g.from + g.ticks > tk - 200);
  if (m.guards.some((g) => !g.w && g.from > tk)) return null;   // 已经有一只在等（算错造的不算）
  const c = cOf(wit(s, w)); const rise = Math.pow(1 + WS.minG / c + G.extra, G.ticks / (G.ticks - WS.buyTicks)) - 1;
  const lus = new Set(((m.lu && m.lu.act) || []).map((p) => p.code)); const busy = new Set(msgs(s).map((x) => x.data.code)); for (const o of m.orders || []) busy.add(o.code); for (const [c, h] of Object.entries(m.hold || {})) if (h && h.n > 0) busy.add(c);   // 手里有的、挂着单的不碰（不然把已经说好的走势改了）
  const base = (code) => m.px[code] > 0 && !lus.has(code) && !busy.has(code) && !(w.no && w.no[code]) && !SK.onBoard(m, code) && !SK.BY[code].ipo && !m.guards.some((g) => g.code === code && g.from + g.ticks > tk);
  const room = (code) => { const B = SK.band(m, code); return B.up == null ? Infinity : B.up / m.px[code]; };
  const all = SK.STOCKS.map((x) => x.code);
  // 先在她看得到的里挑离涨停价够远的（留 4% 给开始前那几跳的波动），没有就放宽、再到别的股票里挑；都不够就挑离涨停最远的那只
  let ok = []; for (const [pool, k] of [[see, 1.04], [all, 1.04], [see, 1.01], [all, 1.01]]) { ok = pool.filter((c) => base(c) && room(c) > (1 + rise) * k); if (ok.length) break; }
  if (!ok.length) { const b = all.filter(base).sort((a, c) => room(c) - room(a)); if (!b.length) return null; ok = [b[0]]; }
  const code = ok[Math.floor(SK.hu(`WSG${s.gid || ''}`, tk) * ok.length)];
  const r1 = Math.pow(1 + WS.minG / c + G.extra + 0.03 / m.px[code], G.ticks / (G.ticks - WS.buyTicks)) - 1;   // 设计54：便宜股（几块钱）买价往上、卖价往下各取整到分，多留 3 分钱
  const g = { code, from: nextScan(w, tk) + 1, ticks: G.ticks, rise: Math.round(r1 * 1e6) / 1e6, p0: null, by: tk }; m.guards.push(g); w.guards = (w.guards || 0) + 1; return g;
}

// ---------- 设计53 秘书算错 ----------
/** 这条说没说对：按（存档 + 股票 + 出提示那一跳）定种子只掷一次；说对 = 50% + 智慧/2%（跟新闻同一个公式），智慧 100 必对 */
export const isRight = (s, code, tk, wv) => wv >= 100 || SK.hu(`WSR${s.gid || ''}:${code}`, tk) < T.rightBase + wv / T.rightDiv;
const tally = (w, wrong) => { if (wrong) w.wrong = (w.wrong || 0) + 1; else w.right = (w.right || 0) + 1; };
const busyCodes = (s) => { const m = s.mkt; const b = new Set(msgs(s).map((x) => x.data.code)); for (const o of m.orders || []) b.add(o.code); for (const [c, h] of Object.entries(m.hold || {})) if (h && h.n > 0) b.add(c); return b; };
/** 在 code 上造一段稳稳的走势：dir −1 跌 / +1 涨，20 跳 2%～3%（按种子），从下一跳起；写进存档 m.guards（w 标记），future() 算得出 */
function moveOn(s, code, tk, dir) {
  const m = s.mkt; const G = WS.wrong; m.guards = (m.guards || []).filter((g) => g.from + g.ticks > tk - 200);
  if (m.guards.some((g) => g.code === code && g.from + g.ticks > tk)) return null;
  const a = G.moveMin + SK.hu(`WSM${s.gid || ''}:${code}`, tk) * (G.moveMax - G.moveMin);
  const g = { code, from: tk + 1, ticks: WS.guard.ticks, rise: Math.round(dir * a * 1e6) / 1e6, p0: null, by: tk, w: dir }; m.guards.push(g); return g;
}
/** 「其实要跌」：22 跳最高 < 买价 × 1.01，而且到时（第 20～22 跳）比 2 跳内最低的成交价还低 0.5%（不会碰巧按现价卖赚了） */
const stillBad = (p, X) => Math.max(...p.slice(0, AHEAD())) < X * (1 + WS.wrong.maxUp) && Math.max(...p.slice(WS.sellTicks - 1, AHEAD())) < Math.min(...p.slice(0, WS.buyTicks)) * 0.995;
/** 说错的那条：她看得到的里挑一只接下来 20 跳最高 < 买价 × 1.01、到第 20 跳低于买价的；没有就造一只往下走的。提示长得和对的一样（买价照样是接下来 2 跳最高） */
function wrongBuy(s, w, see, kind, wv, ex, i) {
  const m = s.mkt; const tk = m.tick; let F = fut(m); const busy = busyCodes(s); for (const c of ex) busy.add(c);
  const lus = new Set(((m.lu && m.lu.act) || []).map((p) => p.code));
  const xOf = (c) => { const p = F.path[c]; const B = SK.band(m, c); let X = up2(Math.max(...p.slice(0, WS.buyTicks))); if (B.up != null) X = Math.min(X, B.up); return X; };
  const hiG = WS.gBase + Math.min(100, wv) * WS.gK + 0.005; const roomUp = (c) => { const B = SK.band(m, c); return B.up == null || xOf(c) * (1 + Math.max(hiG, WS.minG + 0.01)) < B.up; };   // 卖价不能超涨停价
  const bad = (c) => { const p = F.path[c]; if (!p || !roomUp(c)) return false; return stillBad(p, xOf(c)); };
  const fit = (c) => m.px[c] > 0 && !busy.has(c) && !(w.no && w.no[c]) && !SK.onBoard(m, c) && !SK.BY[c].ipo && !lus.has(c) && !(m.guards || []).some((g) => g.code === c && g.from + g.ticks > tk);
  const ok = see.filter((c) => fit(c) && bad(c)); let code;
  if (ok.length) code = ok[Math.floor(SK.hu(`WSW${s.gid || ''}`, tk * 8 + i) * ok.length)];
  else {   // 没有就造一只往下走的（离跌停够远）
    const room = (c) => { const B = SK.band(m, c); return (B.dn == null || m.px[c] * (1 - WS.wrong.moveMax) > B.dn * 1.01) && roomUp(c); };
    let L = see.filter((c) => fit(c) && room(c)); if (!L.length) L = SK.STOCKS.map((x) => x.code).filter((c) => fit(c) && room(c)); if (!L.length) return null;
    code = L[Math.floor(SK.hu(`WSD${s.gid || ''}`, tk * 8 + i) * L.length)]; if (!moveOn(s, code, tk, -1)) return null; F = fut(m);
  }
  const X = xOf(code); const B = SK.band(m, code); const lo = WS.minG + 0.001, hi = Math.max(lo + 0.002, WS.gBase + Math.min(100, wv) * WS.gK);
  const g0 = lo + SK.hu(`WSG0${s.gid || ''}:${code}`, tk) * (hi - lo); const lu = kind === 'lu' && B.up != null;
  const Y = lu ? B.up : dn2(X * (1 + g0));
  return { kind, code, X, Y, Z: dn2(X * K.slK), g: Y / X - 1, g0, lu, mins: 3 + Math.floor(SK.hu(`WSN${s.gid || ''}:${code}`, tk) * 7), wrong: 1, until: tk + WS.scanTicks };
}
/** 说错的买单刷新：买价照样跟着变；还是「其实要跌」就留着（最多 scanTicks 跳），涨起来了就收起 */
function refreshWrong(s, x, F) {
  const m = s.mkt; const d = x.data; const p = F.path[d.code]; if (!p || m.tick > d.until) return false;
  const B = SK.band(m, d.code); let X = up2(Math.max(...p.slice(0, WS.buyTicks))); if (B.up != null) X = Math.min(X, B.up);
  if (!stillBad(p, X)) return false;
  const Y = d.lu && B.up != null ? B.up : dn2(X * (1 + d.g0)); if (B.up != null && (Y > B.up || Y / X - 1 < WS.minG - 5e-4)) return false; Object.assign(d, { X, Y, Z: dn2(X * K.slK), g: Y / X - 1 }); return true;
}

/** 扫一次（自动 / 手动一样）：看得到的里 10 分钟内封涨停 / 能涨 ≥ 3% 的 + 手里有的要跌；没有好的就造一只（下一次扫一定有）；返回新发的提示 */
export function scan(s, t = Date.now(), manual = false) {
  const w = ws(s); if (!w) return [];
  const m = s.mkt; w.scans.push({ tk: m.tick, manual }); if (w.scans.length > 80) w.scans.shift(); const wv = wit(s, w);
  const F = fut(m); const LU = luIn(m, F); const see = visible(s, w); const out = [];
  const rows = see.map((code) => quick(m, code, F.path[code], wv, LU[code] != null ? LU[code] : null)).filter(Boolean).sort((a, b) => (b.lu - a.lu) || (b.g - a.g));
  const ex = new Set(rows.map((r) => r.code)); let wi = 0;
  for (const r of rows) {
    if (msgs(s).some((x) => x.data.code === r.code) || (w.no && w.no[r.code])) continue;
    const right = isRight(s, r.code, m.tick, wv); let d = { kind: r.lu ? 'lu' : 'wave', code: r.code, X: r.X, Y: r.Y, Z: r.Z, g: r.g, lu: r.lu, mins: r.mins };
    if (!right) { d = wrongBuy(s, w, see, d.kind, wv, ex, wi++); if (!d) continue; }   // 设计53 说错：换成一只其实要跌的，长得一样
    const x = send(s, w, d, t); if (x) { out.push(x); tally(w, !right); }
  }
  for (const code of Object.keys(m.hold || {})) {   // 手里有的要跌一波
    const have = TR.sellable(s, code); if (have < 1) continue; let f = quickFall(m, code, F.path[code]); if (!f) continue;
    if (msgs(s).some((x) => x.data.code === code) || (w.no && w.no[code])) continue;
    const right = isRight(s, code, m.tick, wv); const d = { kind: 'fall', code, X: f.X, have, g: f.drop };
    if (!right) {   // 设计53 说错：卖掉以后反而涨（造一只往上走的；挂着单的不碰）
      if ((m.orders || []).some((o) => o.code === code)) continue;
      { const B = SK.band(m, code); if (B.up != null && m.px[code] * (1 + WS.wrong.moveMax) * 1.01 >= B.up) continue; }   // 离涨停太近涨不动的不说
      if (!moveOn(s, code, m.tick, 1)) continue; f = quickFall(m, code, fut(m).path[code], true); Object.assign(d, { X: f.X, wrong: 1, until: m.tick + WS.scanTicks });
    }
    const x = send(s, w, d, t); if (x) { out.push(x); tally(w, !right); }
  }
  const good = hasGood(s); w.scans[w.scans.length - 1].good = good;
  if (!good) makeGuard(s, w, see, m.tick);
  return out;
}
/** 新闻前 newsLead 跳（每跳查）：利好先出一行灰的预告（能「现在买、10 分钟卖」时才有按钮）；利空、手里有 → 要跌 */
function newsCheck(s, w, tk, t) {
  const nt = tk + WS.newsLead; if (w.said[nt]) return null; for (const k of Object.keys(w.said)) if (+k < tk) delete w.said[k]; const c = newsCall(s, w, nt); if (!c) return null; w.said[nt] = 1;
  if (!c.early) return null;
  if (c.up) return send(s, w, { kind: 'news', code: c.code, pre: true, newsTick: nt, g: Math.max(0, c.J2), right: c.right, wit: w.who ? wit(s, w) : 50 }, t);
  const have = TR.sellable(s, c.code); if (have < 1) return null; const f = quickFall(s.mkt, c.code, fut(s.mkt).path[c.code], true);
  const x = send(s, w, { kind: 'fall', code: c.code, X: f.X, have, g: c.J2, newsTick: nt, right: c.right, wrong: c.right ? 0 : 1 }, t); if (x) tally(w, !c.right); return x;
}
/** 利好看错了的那只：照样给价（买价接下来 2 跳最高、卖价 +3.x%），其实新闻出来要跌 */
function wrongNews(s, w, code, wv) {
  const m = s.mkt; const p = fut(m).path[code]; if (!p || SK.onBoard(m, code) === 'up') return null; const B = SK.band(m, code);
  let X = up2(Math.max(...p.slice(0, WS.buyTicks))); if (B.up != null) X = Math.min(X, B.up); const lo = WS.minG + 0.001, hi = Math.max(lo + 0.002, WS.gBase + Math.min(100, wv) * WS.gK);
  const g0 = lo + SK.hu(`WSG0${s.gid || ''}:${code}`, m.tick) * (hi - lo); const Y = dn2(X * (1 + g0)); if (B.up != null && Y > B.up) return null;
  return { X, Y, Z: dn2(X * K.slK), g: Y / X - 1, g0, lu: false, mins: 3 + Math.floor(SK.hu(`WSN${s.gid || ''}:${code}`, m.tick) * 7), wrong: 1, until: m.tick + WS.scanTicks };
}
/** 每跳重算（设计51）：买价跟着变；机会没了收起；预告到能买时出按钮 */
export function refresh(s) {
  const m = s.mkt; const L = msgs(s); if (!L.length) return; const tk = m.tick; const F = fut(m); const LU = luIn(m, F);
  for (const x of L.slice()) {
    const d = x.data; const wv = s.secs[x.from] ? Math.min(100, secAttrs(s, x.from).wit) : 50;
    if (d.kind === 'fall' && d.wrong && d.newsTick == null) {   // 设计53 说错的要跌：留 scanTicks 跳，价钱跟着变
      const have = TR.sellable(s, d.code); if (have < 1 || tk > d.until) { delTip(s, x.id); continue; } const f = quickFall(m, d.code, F.path[d.code], true); Object.assign(d, { X: f.X, have }); continue;
    }
    if (d.wrong && d.kind !== 'fall') { if (!refreshWrong(s, x, F)) delTip(s, x.id); continue; }
    if (d.pre && d.right === false) {   // 设计53：利好看错了（其实是利空）—— 新闻快到时照样出按钮，跟了会亏
      if (d.newsTick - tk > WS.sellTicks - 2) continue;
      const w = ws(s); const nd = w ? wrongNews(s, w, d.code, wv) : null; if (!nd) { delTip(s, x.id); continue; }
      Object.assign(d, nd, { pre: false }); if (w) { tally(w, true); w.toast.push({ who: x.from, code: d.code, kind: 'news', id: x.id, text: `${nm(d.code)}有利好，现在能买了` }); } continue;
    }
    if (d.kind === 'fall') {
      const have = TR.sellable(s, d.code); if (have < 1) { delTip(s, x.id); continue; }
      const f = quickFall(m, d.code, F.path[d.code], d.newsTick != null && tk < d.newsTick); if (!f) { delTip(s, x.id); continue; }
      Object.assign(d, { X: f.X, have, g: d.newsTick != null && tk < d.newsTick ? d.g : f.drop }); continue;
    }
    const q = quick(m, d.code, F.path[d.code], wv, LU[d.code] != null ? LU[d.code] : null);
    if (!q) { if (d.pre && tk <= d.newsTick + WS.buyTicks) continue; delTip(s, x.id); continue; }   // 预告：新闻出来前一直留着
    if (d.pre) { d.pre = false; const w = ws(s); if (w) tally(w, false); if (w) w.toast.push({ who: x.from, code: d.code, kind: 'news', id: x.id, text: `${nm(d.code)}有利好，现在能买了` }); x.title = `${SEC_BY_ID[x.from] ? SEC_BY_ID[x.from].name : ''}：${nm(d.code)}有利好`; }
    Object.assign(d, { X: q.X, Y: q.Y, Z: q.Z, g: q.g, mins: q.mins, lu: q.lu }); if (d.kind !== 'news') d.kind = q.lu ? 'lu' : 'wave';
  }
}
/** 每一跳（stocks.js advance 的钩子）：重算提示、到点自动扫、新闻前、结束；离线补的跳不发，回到现在马上扫一次 */
function step(s, tk) {
  const m = s.mkt; if (!m) return; const w = m.ws; const t = tk * TICK;
  const gap = SK.advancingTo() - tk;   // 离「现在」还差几跳：差 3 跳以上算离线补的，不发
  if (w && tk >= w.et) stopWatch(s, w.end, false);
  if (gap < 3 && (m.wsTips || []).length) refresh(s);
  if (!m.ws) return;
  if (gap >= 3) { m.ws.resume = true; return; }
  let did = false; if (m.ws.resume) { if (gap > 0) return; m.ws.resume = false; scan(s, t); did = true; }   // 离线回来：走到「现在」那一跳马上扫一次（正好是自动扫的点就不再扫第二次）
  newsCheck(s, m.ws, tk, t);
  if (!did && tk > m.ws.st && (tk - m.ws.st) % WS.scanTicks === 0) scan(s, t);
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
/** 买的：⅓仓 / 半仓 / 全仓 一点挂上三张联动单（用点的那一刻的价；2 跳没成交撤、钱退回；买进后 20 跳没卖掉按现价卖） */
export function placeWs(s, msg, k, t = Date.now()) {
  const d = msg.data; if (d.pre) return { ok: false, why: '还不能买，等她说能买了' };
  const n = posShares(s, d.code, d.X, k); if (n < 1) return { ok: false, why: '不够 1 股' };
  const r = placeLegs(s, msg, [{ code: d.code, kind: 'buy', px: d.X, n, role: 'in' }, { code: d.code, kind: 'tp', px: d.Y, n, role: 'out' }, { code: d.code, kind: 'sl', px: d.Z, n, role: 'out' }], t);
  return r.ok ? { ...r, n, pos: POS_BY[k].name } : r;
}
/** 跟一单（⅓仓 / 半仓 / 全仓，或者「改」了价钱再挂）：先看今天还能不能跟（免费的 → 投资券），挂上才算 */
export function placeLegs(s, msg, legs, t = Date.now()) {
  const d = msg.data; const f = followState(s, t); if (!f.ok) return { ok: false, why: '今天免费的用完了，没有投资券', noCoupon: true };
  const r = TR.addGroup(s, legs, { src: 'watch', exp: t + WS.buyTicks * TICK + 1000, lu: !!d.lu, hold: WS.sellTicks }, t); if (!r.ok) return r;
  const used = useFollow(s, t); delTip(s, msg.id); const w = ws(s); if (w) { w.placed += 1; w.grps.push(r.grp); if (d.wrong) (w.wrongGrps = w.wrongGrps || {})[r.grp] = 1; }
  return { ...r, coupon: used === 'coupon' };
}
// ---------- 设计53 跟单次数：每天免费 freePerDay 单（手机本地 0 点重置），用完一单一张投资券（不封顶）；撤单不退 ----------
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
/** { free 今天还能免费跟几单, used 今天跟了几单, coupons 投资券几张, ok 能不能跟 } */
export function followState(s, t = Date.now()) {
  const f = s.mkt && s.mkt.follow; const used = f && f.day === dayKey(t) ? f.n : 0; const free = Math.max(0, WS.freePerDay - used); const coupons = haveItem(s, 'invest');
  return { free, used, coupons, ok: free > 0 || coupons > 0 };
}
function useFollow(s, t) {
  const m = s.mkt; const k = dayKey(t); if (!m.follow || m.follow.day !== k) m.follow = { day: k, n: 0, free: 0, coupon: 0 };
  const free = m.follow.free < WS.freePerDay; if (!free && !useItem(s, 'invest')) return null;
  m.follow.n += 1; if (free) m.follow.free += 1; else m.follow.coupon += 1; return free ? 'free' : 'coupon';
}
/** 要跌的：卖 ⅓ / 一半 / 全部 → 「现在卖 ¥Z」（2 跳内卖掉，没卖掉撤） */
export function sellWs(s, msg, k, t = Date.now()) {
  const d = msg.data; const n = Math.floor(TR.sellable(s, d.code) * POS_BY[k].f); if (n < 1) return { ok: false, why: '没有能卖的' };
  const r = TR.addGroup(s, [{ code: d.code, kind: 'sl', px: d.X, n, role: 'in' }], { src: 'watch', exp: t + WS.buyTicks * TICK + 1000 }, t);
  if (!r.ok) return r; delTip(s, msg.id); const w = ws(s); if (w) { w.placed += 1; w.grps.push(r.grp); } return { ...r, n };
}
TR.addGroupHook((s, e) => {
  const w = s.mkt && (s.mkt.ws || s.mkt.wsLast); if (!w || e.kind !== 'out' || e.pnl == null || !w.grps.includes(e.grp)) return; w.pnl = r2((w.pnl || 0) + e.pnl);
  if (e.pnl < 0 && w.wrongGrps && w.wrongGrps[e.grp]) {   // 设计53：跟了她说错的那条、亏了 → 她说一句（按性格）
    const sec = SEC_BY_ID[w.who]; const L = (sec && WS.wrongLines[sec.type]) || WS.wrongLines._; const line = L[Math.floor(SK.hu(`WSL${s.gid || ''}`, e.grp) * L.length)];
    (s.mkt.wrongQ = s.mkt.wrongQ || []).push({ who: w.who, line, pnl: e.pnl, grp: e.grp }); if (s.mkt.wrongQ.length > 5) s.mkt.wrongQ.shift();
  }
});
/** 说错亏了的台词（拿一次就清） */
export const takeWrong = (s) => { const q = (s.mkt && s.mkt.wrongQ) || []; if (s.mkt) s.mkt.wrongQ = []; return q; };
export { nFor };
