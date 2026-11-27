// 第 P-06 项（设计25 第五节）：前期炒股 —— 条件单、打新股、看盘、炒股周报
// 条件单每跳检查（挂在 stocks.js 的 addStepHook 上，离线补算一样走）；打新、利息、周报按时间走 tick()（在线 ticker 和 core/offcap.js 都叫）
import { capAdd } from './cap.js?v=b846574c';   // 设计79：有上限的列表（config/caps.js）
import * as IDLE from './idle.js?v=b846574c';   // 设计72
import { shortWhy } from './invest.js?v=b846574c';   // 设计62
import { dropOrphans } from './orphans.js?v=b846574c';
import * as SK from './stocks.js?v=b846574c';
import { pay, receive } from './ledger.js?v=b846574c';
import { addContract } from './contracts.js?v=b846574c';
import { addMsg } from './inbox.js?v=b846574c';
import { MONTH_MS, YEAR_MS } from './gametime.js?v=b846574c';
import { profitMul } from './calib.js?v=b846574c';
import { isTraining } from './training.js?v=b846574c';
import { attrs as secAttrs } from './posts.js?v=b846574c';
import { SEC_BY_ID } from '../config/secretaries.js?v=b846574c';
import { netWorth } from './economy.js?v=b846574c';
import { addAssetHook } from './assets.js?v=b846574c';

const C = SK.SCFG; const O = C.orders, I = C.ipo, W = C.weekly;
export const DAY = MONTH_MS / 30;
const TICK = C.tickSec * 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (n) => (Math.abs(n) >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : Math.abs(n) >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);
const name = (code) => SK.BY[code].name;

/** 补齐 s.mkt 里 P-06 的字段（老存档、开局都走这里） */
export function tr(s, t = Date.now()) {
  const m = SK.mkt(s, t);
  if (!m.orders) { m.orders = []; m.ordSeq = 0; }
  if (!m.ipo) m.ipo = { next: t + I.firstMonths * MONTH_MS, idx: 0, cur: null, daily: [], dayAt: t, done: [] };
  if (!m.ipoOn) m.ipoOn = [];
  if (!m.wk) m.wk = snapWeek(s, t);
  return m;
}
/** 智慧最高的秘书（周报） */
export function wisest(s) { let best = null; for (const id of Object.keys(s.secs || {})) { const w = secAttrs(s, id).wit; if (!best || w > best.w) best = { id, w }; } return best && best.id; }

// ---------- 看盘 ----------
export function setWatch(s, id) {
  const m = tr(s); if (!id) { m.watcher = null; return { ok: true }; }
  if (!s.secs[id]) return { ok: false, why: '没有这个秘书' };
  if (isTraining(s, id)) return { ok: false, why: '她在上课，派了看盘就不能同时上课' };
  m.watcher = id; return { ok: true };
}
/** 现在能看盘的人：派了、在、没在上课 */
export const watcher = (s) => { const w = s.mkt && s.mkt.watcher; return w && s.secs[w] && !isTraining(s, w) ? w : null; };
SK.setWatcher(watcher);
/** 看盘的提前概率、准确率（给界面看） */
export const watchOdds = (s, id) => { const w = secAttrs(s, id).wit; const T = C.watch.tip; return { early: Math.min(1, w / T.earlyDiv), right: Math.min(1, T.rightBase + w / T.rightDiv) }; };

// ---------- 设计43 第二版：挂单直接划扣（Arvin 定，不冻结）----------
// 买单：挂的时候从投资账户扣走（设计62） 挂单价 × 股数 + 佣金（最低 5 元）+ 过户费（含大单滑点），放进单子（o.hold，记账 order_hold「挂单划款」）；
//   成交：划款转付股款（记账 order_back「挂单成交，划款转付股款」，再照常按成交价买），多扣的差价就留在投资账户里；撤单 / 到期 / 过期全退（order_back「挂单退回」）
// 卖单：挂的时候把股数从持仓划进单子（o.sh，或联动组 g.sh：止盈止损两张共用一份）；成交时放回持仓马上卖；撤单 / 到期退回持仓（成本价照旧）
//   联动单买入成交后，买到的股票直接留在组里（g.sh），不进持仓
// 身价照算：挂单里的钱 + 股票（按现价）挂进资产（orderValue）
/** 按挂单价算要扣多少（跟 SK.quote 一样的算法，价换成挂单价） */
export function buyCost(s, code, px, n, opts = {}) {   // 设计108：opts.noImpact 看盘单不算大单滑点
  const F = C.fees; const x = SK.BY[code]; const amt = px * n; const cap = px * x.shares * 1e8;
  const impact = !opts.noImpact && amt / cap > F.impactFrom ? amt / cap * F.impactK : 0; const gross = r2(r2(px * (1 + impact)) * n);
  return r2(gross + r2(Math.max(F.minCommission, gross * F.commission)) + r2(gross * F.transfer));
}
/** 投资账户里能花的（设计62；挂单的钱已经扣走了） */
export const availCash = (s) => SK.availCash(s);
/** 这张买单要扣多少 */
const needHold = (s, o) => buyCost(s, o.code, o.px, o.n, { noImpact: !!o.noImpact });
function holdCash(s, o, t) {
  if (o.kind !== 'buy' || o.on === false || o.hold != null) return true;
  const amt = needHold(s, o); if (availCash(s) < amt - 1e-9) return false;
  if (amt > 0 && !pay(s, { wallet: 'invest', cat: 'order_hold', amount: amt, party: '证券账户', note: `挂单划款：${name(o.code)} ${o.n.toLocaleString()} 股（到价 ${o.px} 买入）` }, t)) return false;
  o.hold = amt; return true;
}
function backCash(s, o, t, note) { const a = o.hold || 0; o.hold = 0; if (a > 0) receive(s, { wallet: 'invest', cat: 'order_back', amount: a, party: '证券账户', note: `${note}：${name(o.code)} ${o.n.toLocaleString()} 股` }, t); return a; }
const grpOf = (s, o) => (o.grp && s.mkt.grps ? s.mkt.grps[o.grp] : null);
/** 这张卖单的股票放在哪：联动组的出场单放组里，其余放单子里 */
const shOf = (s, o) => { const g = grpOf(s, o); return g && o.role === 'out' ? g : o; };
function takeShares(s, code, n) {
  const h = s.mkt.hold[code]; if (!h || h.n - (h.pledged || 0) < n) return null;
  const sh = { n, cost: h.cost, at: h.at }; h.n -= n; if (!h.n && !h.pledged) delete s.mkt.hold[code]; return sh;
}
function putShares(s, code, sh) {
  if (!sh || !sh.n) return 0; const m = s.mkt; const h = m.hold[code] || (m.hold[code] = { n: 0, cost: 0, at: sh.at });
  h.cost = r2((h.cost * h.n + sh.cost * sh.n) / (h.n + sh.n)); if (!h.n) h.at = sh.at; else h.at = Math.min(h.at, sh.at); h.n += sh.n; return sh.n;
}
function holdShares(s, o) {
  if (o.kind === 'buy' || o.on === false) return true; const box = shOf(s, o); if (box.sh && box.sh.n) return true;
  const sh = takeShares(s, o.code, o.n); if (!sh) return false; box.sh = sh; return true;
}
/** 这张单子撤了 / 到期：股票退回持仓（联动组还有别的出场单挂着就先留在组里） */
function backShares(s, o, force = false) {
  const box = shOf(s, o); if (!box.sh) return 0;
  if (!force && box !== o && s.mkt.orders.some((x) => x !== o && x.grp === o.grp && x.kind !== 'buy' && x.on !== false)) return 0;
  const n = putShares(s, o.code, box.sh); box.sh = null; return n;
}
/** 挂在卖单里的股数（同一组只算一份） */
export function lockedShares(s, code) {
  const m = s.mkt; if (!m || !m.orders) return 0; let n = 0; const seen = new Set();
  for (const o of m.orders) { if (o.code !== code) continue; const box = shOf(s, o); if (seen.has(box)) continue; seen.add(box); if (box.sh) n += box.sh.n; }
  return n;
}
/** 持仓里能卖的（挂在卖单里的已经不在持仓了） */
export const sellable = (s, code) => { const h = s.mkt && s.mkt.hold[code]; return h ? Math.max(0, h.n - (h.pledged || 0)) : 0; };
/** 挂单里放着的：{ cash 买单的钱, shares { code: 股数 }, value 钱 + 股票按现价 } */
export function inOrders(s) {
  const m = s.mkt; const out = { cash: 0, shares: {}, value: 0 }; if (!m || !m.orders) return out; const seen = new Set();
  for (const o of m.orders) { out.cash += o.hold || 0; const box = shOf(s, o); if (seen.has(box) || !box.sh) continue; seen.add(box); out.shares[o.code] = (out.shares[o.code] || 0) + box.sh.n; }
  out.cash = r2(out.cash); out.value = r2(out.cash + Object.entries(out.shares).reduce((a, [c, n]) => a + n * (m.px[c] || 0), 0)); return out;
}
export const orderValue = (s) => inOrders(s).value;
export const { myShares, myShareValue, myHoldings } = SK;   // V0.2.16：放在 stocks.js（分红也要用），这里转一下
addAssetHook({ value: (s) => orderValue(s) });
// ---------- 设计57 补仓：按成本价马上成交（不碰盘口、不动股价、不算滑点；佣金、过户费照收），并进挂着的卖单或持仓；不算跟单次数 ----------
const LOT = 100;
const POSK = [{ k: 'third', name: '⅓仓', f: 1 / 3 }, { k: 'half', name: '半仓', f: 1 / 2 }, { k: 'all', name: '全仓', f: 1 }];
const feesAt = (gross) => { const F = C.fees; const commission = r2(Math.max(F.minCommission, gross * F.commission)); const transfer = r2(gross * F.transfer); return { commission, transfer, fees: r2(commission + transfer) }; };
/** 补进哪：挂着卖单的 → 股数最多那份（联动组 g.sh 或单张 o.sh）；没挂 → 持仓。{ box（null = 持仓）, cost, n, outs（那份的卖单）} */
export function topUpBox(s, code) {
  const m = s.mkt; if (!m) return null; const seen = new Set(); let best = null;
  for (const o of m.orders || []) { if (o.code !== code || o.kind === 'buy') continue; const box = shOf(s, o); if (seen.has(box) || !box.sh || !(box.sh.n > 0)) continue; seen.add(box); if (!best || box.sh.n > best.sh.n) best = box; }
  if (best) return { box: best, cost: best.sh.cost, n: best.sh.n, outs: m.orders.filter((o) => o.kind !== 'buy' && shOf(s, o) === best) };
  const h = m.hold[code]; return h && h.n > 0 ? { box: null, cost: h.cost, n: h.n, outs: [] } : null;
}
/** 补 n 股要多少：{ gross, commission, transfer, fees, total } */
export const topUpCost = (cost, n) => { const gross = r2(cost * n); const f = feesAt(gross); return { gross, ...f, total: r2(gross + f.fees) }; };
/** 三个按钮：[{ k, name, n（100 股一手，0 = 不够一手）, cost, total, tp: { px, gain }, sl: { px, loss } }] */
export function topUpOptions(s, code) {
  const T = topUpBox(s, code); if (!T) return []; const cash = Math.max(0, availCash(s)); const R = 1 + C.fees.commission + C.fees.transfer;
  const capN = Math.max(0, Math.ceil(SK.BY[code].shares * 1e8 * C.stake.notice) - 1 - ((SK.myShares(s)[code] || { n: 0 }).n));   // 个人 5% 以下
  const tp = T.outs.find((o) => o.kind === 'tp'), sl = T.outs.find((o) => o.kind === 'sl');
  return POSK.map((x) => {
    const amt = cash * x.f; let n = Math.floor(Math.min(capN, amt / (T.cost * R)) / LOT) * LOT; while (n > 0 && topUpCost(T.cost, n).total > amt + 1e-9) n -= LOT;
    const q = topUpCost(T.cost, n);
    return { k: x.k, name: x.name, n, cost: T.cost, total: q.total, gross: q.gross, tp: tp ? { px: tp.px, gain: r2((tp.px - T.cost) * n) } : null, sl: sl ? { px: sl.px, loss: r2((sl.px - T.cost) * n) } : null };
  });
}
/** 补仓：n 股（100 的整数倍）按成本价马上成交 */
export function topUp(s, code, n, t = Date.now()) {
  const m = s.mkt; const T = topUpBox(s, code); n = Math.floor(n); if (!T) return { ok: false, why: '没有这只的持仓' };
  if (n < LOT || n % LOT) return { ok: false, why: '补仓按 100 股一手' };
  const q = topUpCost(T.cost, n); if (availCash(s) < q.total - 1e-9) return { ok: false, why: shortWhy(q.total - availCash(s)), short: q.total - availCash(s) };
  if (((SK.myShares(s)[code] || { n: 0 }).n + n) / (SK.BY[code].shares * 1e8) >= C.stake.notice - 1e-12) return { ok: false, why: `个人最多买到 ${C.stake.notice * 100}% 以下` };
  const x = SK.BY[code];
  const ct = addContract(s, { prefix: 'JG', kind: 'stock', title: '交割单', parties: [['股东', s.bossName || '老板'], ['券商', '华太正券']], subject: `补仓 ${x.name}（${code}）${n.toLocaleString()} 股，按成本价 ${T.cost}`, rows: [['成交金额', q.gross, '按成本价'], ['佣金', q.commission, '0.025%，最低 5 元'], ['过户费', q.transfer, '0.001%']], total: q.total, wallet: 'personal' }, t);
  pay(s, { wallet: 'invest', cat: 'stock_buy', amount: q.gross, ref: ct.no, party: '证券账户', note: `补仓（按成本价）：${x.name} ${n} 股 × ${T.cost}` }, t);
  pay(s, { wallet: 'invest', cat: 'stock_fee', amount: q.fees, ref: ct.no, party: '华太正券', note: `${x.name} 补仓佣金、过户费` }, t);
  if (T.box) {   // 并进那份卖单：股数、组的股数和成本、每张卖单的股数都加上，按原来的卖价、原来的时限一起卖
    T.box.sh.n += n; for (const o of T.outs) o.n += n;
    if (!T.outs.includes(T.box)) { const g = T.box; if (g.n != null) g.n += n; if (g.cost != null) g.cost = r2(g.cost + q.total); }   // 联动组：g.n、g.cost 跟着加（盈亏按全部股数算）
  } else m.hold[code].n += n;   // 成本不变（按成本价补）
  if (m.wk) { const f = m.wk.f[code] || (m.wk.f[code] = { buy: 0, sell: 0 }); f.buy = r2(f.buy + q.total); }
  return { ok: true, n, cost: T.cost, total: q.total, gross: q.gross, fees: q.fees, into: T.box ? 'order' : 'hold', slip: ct };
}
/** 玩家自己卖（个股页的卖出 / 全部卖出）：只卖持仓里剩下的 */
export function sellMine(s, code, n, t = Date.now(), opts = {}) {   // opts.live：按显示价（设计90）
  const k = sellable(s, code); const lk = lockedShares(s, code);
  if (Math.floor(n) > k) return { ok: false, why: `持股只有 ${k.toLocaleString()} 股${lk ? `（另有 ${lk.toLocaleString()} 股在卖单里）` : ''}` };
  return SK.sell(s, code, n, t, opts);
}

// ---------- 设计73 持仓一键卖出：这只的全部（可卖持仓 + 挂在卖单里的）按现价（30 秒那一跳）马上卖；没成交的买单、联动组还没买进的那组不动 ----------
const activeOuts = (s, code) => ((s.mkt && s.mkt.orders) || []).filter((o) => o.code === code && o.kind !== 'buy' && o.on !== false);
/** 卖之前给弹框看的：{ n 卖几股, px 现价, total 到手, gain 赚（负 = 亏）, outs 要撤几张卖单, why 卖不了的原因 } */
export function sellAllInfo(s, code, t = undefined) {   // 设计90：t = 按哪一刻的显示价（不给 = 现在）
  const my = SK.myShares(s)[code]; const h = s.mkt && s.mkt.hold[code]; const pledged = (h && h.pledged) || 0; const n = my ? my.n - pledged : 0;
  if (!my || n < 1) return { n: 0, why: pledged ? '都质押在银行，不能卖' : '没有这只的持仓' };
  const q = SK.quote(s, code, n, 'sell', SK.livePx(s, code, t)); const why = SK.onBoard(s.mkt, code) === 'down' ? '封在跌停，卖不出（等开板）' : null;   // 跌停照个股页卖出原来的规则
  return { n, px: q.px, total: q.total, gain: r2(q.total - my.cost * n), outs: activeOuts(s, code).length, pledged, why, quote: q };
}
export function sellAll(s, code, t = Date.now()) {
  const I = sellAllInfo(s, code, t); if (I.why) return { ok: false, why: I.why };
  for (const o of activeOuts(s, code)) cancelOrder(s, o.id, false, t);   // 卖单先撤、股票并回来
  const n = sellable(s, code); const r = SK.sell(s, code, n, t, { note: '持仓卖出', live: true });   // 设计90：按显示价
  return r.ok ? { ...r, n, total: r.quote.total } : r;
}

// ---------- 设计90 持仓分批卖：10 股 / 一半 / 全部，按现在的价马上卖 ----------
/** 这只能卖的总股数（含挂在卖单里的，去掉质押） */
const sellTotal = (s, code) => { const my = SK.myShares(s)[code]; const h = s.mkt && s.mkt.hold[code]; return my ? Math.max(0, my.n - ((h && h.pledged) || 0)) : 0; };
/** 挂着的卖单按「离成交最远」排：[{ box, outs }]（同一组 / 同一张一份；离成交的距离 = 各张卖单价离现价最近的那个） */
function sellBoxes(s, code) {
  const px = SK.price(s, code); const map = new Map();
  for (const o of activeOuts(s, code)) { const box = shOf(s, o); if (!box.sh || !(box.sh.n > 0)) continue; const e = map.get(box) || { box, outs: [], dist: Infinity }; e.outs.push(o); e.dist = Math.min(e.dist, Math.abs(o.px / px - 1)); map.set(box, e); }
  return [...map.values()].sort((a, b) => b.dist - a.dist);
}
/** 卖之前给弹框看的：{ n 卖几股, total 能卖的总数, fromOrders 要从卖单里扣几股, cancel 要撤几张, px, total 到手, gain, why } */
export function sellSomeInfo(s, code, n, t = undefined) {
  const all = sellTotal(s, code); const h = s.mkt && s.mkt.hold[code]; const pledged = (h && h.pledged) || 0;
  if (all < 1) return { n: 0, all, why: pledged ? '都质押在银行，不能卖' : '没有这只的持仓' };
  n = Math.max(1, Math.min(all, Math.floor(n))); const my = SK.myShares(s)[code];
  const why = SK.onBoard(s.mkt, code) === 'down' ? '封在跌停，卖不出（等开板）' : null;
  let rest = Math.max(0, n - sellable(s, code)); const fromOrders = rest; let cancel = 0;
  if (n >= all) cancel = activeOuts(s, code).length; else for (const e of sellBoxes(s, code)) { if (rest <= 0) break; const d = Math.min(rest, e.box.sh.n); rest -= d; if (d >= e.box.sh.n) cancel += e.outs.length; }
  const q = SK.quote(s, code, n, 'sell', SK.livePx(s, code, t));
  return { n, all, fromOrders, cancel, px: q.px, total: q.total, gain: r2(q.total - my.cost * n), pledged, why, quote: q };
}
/** 卖 n 股：先卖没挂单的；不够再从挂着的卖单里扣（离成交最远的先扣，扣完剩下的照旧挂着，减到 0 的撤）；n ≥ 全部 = 设计73 的「全部」 */
export function sellSome(s, code, n, t = Date.now()) {
  const I = sellSomeInfo(s, code, n, t); if (I.why) return { ok: false, why: I.why };
  if (I.n >= I.all) return sellAll(s, code, t);
  let rest = Math.max(0, I.n - sellable(s, code));
  for (const e of sellBoxes(s, code)) {
    if (rest <= 0) break; const d = Math.min(rest, e.box.sh.n); rest -= d;
    if (d >= e.box.sh.n) { for (const o of e.outs) cancelOrder(s, o.id, false, t); continue; }   // 扣到 0：撤单（股票并回持仓）
    e.box.sh.n -= d; for (const o of e.outs) o.n -= d; putShares(s, code, { n: d, cost: e.box.sh.cost, at: e.box.sh.at });   // 卖单数量减掉，剩下的照旧挂着
  }
  const r = SK.sell(s, code, I.n, t, { note: '持仓卖出', live: true });
  return r.ok ? { ...r, n: I.n, total: r.quote.total } : r;
}

/** 设计45 第五版「止盈红、止损绿」：卖单按实际赚亏上色（'up' 红 / 'down' 绿）。比的是这份股票的成本（联动组没成交时比买入价）；不知道成本就按单子种类（止盈红、止损绿） */
export function sellBase(s, o) {
  const m = s.mkt; const g = o.grp && m.grps ? m.grps[o.grp] : null; const sh = (g && g.sh) || o.sh; if (sh) return sh.cost;
  if (o.grp) { const b = m.orders.find((x) => x.grp === o.grp && x.role === 'in' && x.kind === 'buy'); if (b) return b.px; }
  const h = m.hold[o.code]; return h && h.n ? h.cost : null;
}
export const toneOf = (px, base, kind) => (base != null && Math.abs(px - base) > 1e-9 ? (px > base ? 'up' : 'down') : kind === 'sl' ? 'down' : kind === 'tp' ? 'up' : '');
export const sellTone = (s, o) => (o.kind === 'buy' ? '' : toneOf(o.px, sellBase(s, o), o.kind));

// ---------- 条件单 ----------
export const KIND = { buy: '到价买入', tp: '止盈卖出', sl: '止损卖出' };
export function whyNotOrder(s, o) {
  const m = tr(s); if (!KIND[o.kind]) return '选一种条件单';
  if (!(m.px[o.code] > 0)) return '还没上市';
  if (m.orders.length >= O.max) return `最多同时挂 ${O.max} 张`;
  if (!(o.n >= 1)) return '最少 1 股'; if (!(o.px > 0)) return '填一个价格';
  { const B = SK.band(m, o.code); if (B.up != null && (o.px > B.up + 1e-9 || (o.kind !== 'sl' && o.px < B.dn - 1e-9))) return `挂单价要在今天跌停 ${B.dn} 和涨停 ${B.up} 之间`; }   // 设计41 第九节；V0.2.14 小修：止损可以挂在跌停价下面（一定低于买价）
  if (o.kind !== 'buy' && o.on !== false) { const k = sellable(s, o.code); if (k < o.n) return `持股只有 ${k.toLocaleString()} 股`; }   // 设计43：卖单挂上就把股票划走
  if (o.kind === 'buy' && o.on !== false) { const need = buyCost(s, o.code, o.px, o.n, { noImpact: !!o.noImpact }); if (availCash(s) < need - 1e-9) return shortWhy(need - Math.max(0, availCash(s))); }   // 设计43：买单挂上就扣钱
  return null;
}
export function addOrder(s, o, t = Date.now()) {
  const why = whyNotOrder(s, o); if (why) return { ok: false, why };
  const m = tr(s, t); const x = { id: ++m.ordSeq, code: o.code, kind: o.kind, px: r2(o.px), n: Math.floor(o.n), at: t };
  if (!holdCash(s, x, t)) return { ok: false, why: shortWhy(Math.max(0, needHold(s, x) - availCash(s))), short: Math.max(0, needHold(s, x) - availCash(s)) };
  if (!holdShares(s, x)) return { ok: false, why: `持股只有 ${sellable(s, x.code).toLocaleString()} 股` };
  m.orders.push(x); return { ok: true, order: x, held: x.hold || 0 };
}
/** 撤单：钱退回投资账户、股票退回持仓（o.back 退了多少钱、o.backN 退了多少股）。成交时 filled = true：钱转付股款、股票放回持仓马上卖 */
export function cancelOrder(s, id, filled = false, t = Date.now()) {
  const m = tr(s); const i = m.orders.findIndex((x) => x.id === id); if (i < 0) return false; const o = m.orders[i];
  o.back = backCash(s, o, t, filled ? '挂单成交，划款转付股款' : '挂单退回'); o.backN = backShares(s, o, filled); m.orders.splice(i, 1);
  if (o.grp && o.role === 'in' && !filled) m.orders = m.orders.filter((x) => !(x.grp === o.grp && x.on === false));   // 联动单：买入撤了，还没生效的止盈止损一起撤
  return true;
}
// ---------- 设计41 第三节：联动单（买入成交以后止盈、止损才生效；一张成交另一张撤）----------
/** legs: [{ kind, px, n, role: 'in' | 'out' }]（第一张 in，其余 out）；meta: { src: 'tip' | 'watch' | '', exp（到期撤没成交的买单）, lu }。一次全挂上，挂不上一张都不挂 */
export function addGroup(s, legs, meta = {}, t = Date.now()) {
  const m = tr(s, t); if (m.orders.length + legs.length > O.max) return { ok: false, why: `最多同时挂 ${O.max} 张（现在 ${m.orders.length} 张）` };
  const ins = legs.filter((x) => x.role === 'in'); if (ins.length !== 1) return { ok: false, why: '联动单要一张开头的单子' };
  for (const l of legs) { const why = whyNotOrder(s, { ...l, on: l.role === 'in', noImpact: meta.src === 'watch' }); if (why) return { ok: false, why }; }   // 设计108：看盘单按不算滑点算钱
  const g = (m.grpSeq = (m.grpSeq || 0) + 1); m.grps = m.grps || {};
  m.grps[g] = { src: meta.src || '', code: ins[0].code, at: t, lu: !!meta.lu, cost: 0, n: 0 }; if (meta.hold) m.grps[g].hold = meta.hold; if (meta.sellBy != null) m.grps[g].sellBy = meta.sellBy; if (meta.etaBuy != null) { m.grps[g].etaBuy = meta.etaBuy; m.grps[g].etaSell = meta.etaSell; }   // 设计60   // 设计59：从挂单起 10 分钟（sellBy 那一跳）到了按现价卖   // 设计51：买入成交后 hold 跳没卖掉按现价卖
  const out = legs.map((l) => { const x = { id: ++m.ordSeq, code: l.code, kind: l.kind, px: r2(l.px), n: Math.floor(l.n), at: t, grp: g, role: l.role, on: l.role === 'in' }; if (meta.exp && l.role === 'in') x.exp = meta.exp; if (meta.src === 'watch') x.noImpact = true; return x; });   // 设计108：看盘单不算大单滑点
  const x0 = out.find((x) => x.role === 'in');   // 设计43：开头那张挂上就划款 / 划股（出场单买入成交后才有股票）
  if (!holdCash(s, x0, t)) { delete m.grps[g]; return { ok: false, why: shortWhy(Math.max(0, needHold(s, x0) - availCash(s))), short: Math.max(0, needHold(s, x0) - availCash(s)) }; }
  if (!holdShares(s, x0)) { delete m.grps[g]; return { ok: false, why: `持股只有 ${sellable(s, x0.code).toLocaleString()} 股` }; }
  m.orders.push(...out);
  return { ok: true, grp: g, orders: out };
}
/** 照她挂的单成交以后（战绩用）：fn(s, { grp, kind: 'in' | 'out', pnl, lu }) */
const GROUP_HOOKS = []; export const addGroupHook = (fn) => { GROUP_HOOKS.push(fn); };
const hit = (o, p) => (o.kind === 'tp' ? p >= o.px : p <= o.px);
/** 设计51 / 59 / 65：看盘买的那组，到 sellAt（挂单起 win 跳 = 现实 5 分钟）止盈止损都没触发 → 按当跳价卖掉、撤掉止盈止损 */
function timeUp(s, tk) {
  const m = s.mkt; const t = tk * TICK;
  for (const [id, g] of Object.entries(m.grps || {})) {
    if (!g.sellAt || tk < g.sellAt) continue; const gid = +id;
    const mates = m.orders.filter((x) => x.grp === gid); if (!mates.length) { delete m.grps[id]; continue; }
    if (SK.onBoard(m, g.code) === 'down') continue;   // 封在跌停卖不出：下一跳再试
    for (const x of mates) cancelOrder(s, x.id, true, t);   // 股票放回持仓
    const n = Math.min(g.n || 0, (m.hold[g.code] || { n: 0 }).n); if (n < 1) { delete m.grps[id]; continue; }
    const r = SK.sell(s, g.code, n, t, g.src === 'watch' ? { noImpact: true } : {}); if (!r.ok) continue;   // 设计108：看盘那组到时间按现价卖，也不算滑点
    const pnl = r2(r.quote.total - g.cost * Math.min(1, n / (g.n || n)));
    addMsg(s, { kind: 'system', type: 'stock_order', title: `到时间按现价卖出：${name(g.code)} ${n.toLocaleString()} 股 ${pnl >= 0 ? '+' : '−'}¥${fmt(Math.abs(pnl))}`, body: `到了最晚卖出的时间（看盘单从挂单起 ${Math.ceil(SK.SCFG.watch.ws.win / 2)} 分钟），止盈止损都没碰到，按现价 ${r.quote.exec} 卖掉，止盈止损撤了；交割单 ${r.slip.no}` }, t);
    capAdd(s, 'mkt.soldQ', (m.soldQ = m.soldQ || []), { code: g.code, n, px: r.quote.exec, pnl, t });
    for (const fn of GROUP_HOOKS) fn(s, { grp: gid, kind: 'out', pnl, lu: g.lu, src: g.src, timeUp: true });
    delete m.grps[id];
  }
}
export const takeSold = (s) => { const q = (s.mkt && s.mkt.soldQ) || []; if (s.mkt) s.mkt.soldQ = []; return q; };
function checkOrders(s, tk) {
  const m = s.mkt; if (!m.orders || !m.orders.length) return;
  const t = tk * TICK;
  for (const o of m.orders.slice()) {
    if (!m.orders.includes(o) || o.on === false || (o.role === 'out' && o.at >= t)) continue;   // 联动单还没生效的不看；这一跳刚生效的下一跳才看
    if (t - o.at > O.expireDays * DAY || (o.exp && t >= o.exp)) { cancelOrder(s, o.id, false, t); addMsg(s, { kind: 'system', type: 'stock_order', title: `条件单${o.exp && t >= o.exp ? '到期' : '过期'}撤了：${name(o.code)} ${KIND[o.kind]} ${o.px}`, body: `${o.exp && t >= o.exp ? '看盘的单子 2 小时没成交，撤了' : `${O.expireDays} 个游戏天没触发`}${o.back ? `，挂单的 ¥${fmt(o.back)} 退回个人现金` : ''}${o.backN ? `，${o.backN.toLocaleString()} 股退回持仓` : ''}` }, t); continue; }
    const p = m.px[o.code]; if (!(p > 0) || !hit(o, p)) continue;
    const bd = SK.onBoard(m, o.code); if ((o.kind === 'buy' && bd === 'up') || (o.kind !== 'buy' && bd === 'down')) continue;   // 设计41 第九节：封在板上这一跳不成交
    const held = o.hold || 0; cancelOrder(s, o.id, true, t);   // 设计43：划款转付股款 / 股票放回持仓，再按实际成交价买卖
    const nx = o.noImpact ? { px: o.px, noImpact: true } : {};   // 设计108：看盘单买按挂单价、卖按止盈 / 止损价，不算大单滑点
    let r = o.kind === 'buy' ? SK.buy(s, o.code, o.n, t, nx) : SK.sell(s, o.code, Math.min(o.n, (m.hold[o.code] || { n: 0 }).n), t, nx);
    if (r.ok && o.kind === 'buy' && held) r.diff = r2(held - r.quote.total);
    if (o.grp && r.ok) linked(s, o, r, t);
    addMsg(s, { kind: 'system', type: 'stock_order', title: r.ok ? `条件单成交：${KIND[o.kind]} ${name(o.code)} ${o.n.toLocaleString()} 股，成交价 ${r.quote.exec}` : `条件单没成交：${name(o.code)} ${KIND[o.kind]}`, body: r.ok ? `触发价 ${o.px}，交割单 ${r.slip.no}${r.diff > 0.005 ? `，挂单多扣的 ¥${fmt(r.diff)} 退回个人现金` : ''}${r.gain != null ? `，这笔${r.gain >= 0 ? '赚' : '亏'} ${fmt(Math.abs(r.gain))}` : ''}` : r.why }, t);
  }
}

/** 联动单成交以后：开头那张成交 → 后面的生效（股数照实际成交）；后面一张成交 → 同组其他的撤 */
function linked(s, o, r, t) {
  const m = s.mkt; const g = (m.grps || {})[o.grp]; const mates = m.orders.filter((x) => x.grp === o.grp);
  if (o.role === 'in') {
    const got = o.kind === 'buy' ? o.n : (r.quote ? Math.round(r.quote.gross / r.quote.exec) : o.n);
    if (o.kind === 'buy' && g && mates.some((x) => x.kind !== 'buy')) { const sh = takeShares(s, o.code, got); if (sh) { sh.cost = r2(r.quote.total / got); g.sh = sh; } }   // 设计43：买到的股票直接留在组里给止盈止损
    for (const x of mates) { x.on = true; x.n = got; x.at = t; if (!holdCash(s, x, t)) { cancelOrder(s, x.id, false, t); addMsg(s, { kind: 'system', type: 'stock_order', title: `抄底单挂不上：${name(x.code)}`, body: `投资账户不够（要 ¥${fmt(buyCost(s, x.code, x.px, x.n))}）` }, t); } }   // 设计43：抄底那张买单生效时扣钱
    if (g) { g.cost = o.kind === 'buy' ? r.quote.total : 0; g.n = got; g.side = o.kind; if (o.kind === 'buy') { if (g.sellBy != null) g.sellAt = g.sellBy; else if (g.hold) g.sellAt = Math.floor(t / TICK) + g.hold; } }
    for (const fn of GROUP_HOOKS) fn(s, { grp: o.grp, kind: 'in', lu: g && g.lu, src: g && g.src });
    if (!mates.length && g) delete m.grps[o.grp];
    return;
  }
  for (const x of mates) cancelOrder(s, x.id, false, t);
  let pnl = null; if (g && g.side === 'buy' && g.n) pnl = r2(r.quote.total - g.cost * Math.min(1, o.n / g.n));
  for (const fn of GROUP_HOOKS) fn(s, { grp: o.grp, kind: 'out', pnl, lu: g && g.lu, src: g && g.src });
  if (g) delete m.grps[o.grp];
}

// ---------- 打新股 ----------
export const curIpo = (s) => tr(s).ipo.cur;
const avgHold = (ip) => (ip.daily.length ? ip.daily.slice(-I.avgDays).reduce((a, b) => a + b, 0) / Math.min(I.avgDays, ip.daily.length) : 0);
/** 能申购几签：前 20 个游戏天日均持仓市值，每 1 万 1 签，最多 10 签 */
export const lotsOf = (s) => Math.min(I.maxLots, Math.floor(avgHold(tr(s).ipo) / I.perLot));
export const avgHoldOf = (s) => avgHold(tr(s).ipo);
export function whyNotSub(s, t = Date.now()) {
  const c = curIpo(s); if (!c) return '现在没有新股可以申购';
  if (t >= c.open + I.subDays * DAY) return '申购已经截止';
  if (c.sub) return '已经申购了';
  if (lotsOf(s) < 1) return `前 ${I.avgDays} 个游戏天日均持股市值不到 ${fmt(I.perLot)}，没有申购额度`;
  return null;
}
/** 设计90：能申购没申购的新股几只（0 / 1）——打新页签、投资、财富的红点 */
export const ipoPending = (s, t = Date.now()) => (s.mkt && curIpo(s) && !whyNotSub(s, t) ? 1 : 0);
/** 设计90：中签 / 没中 / 上市各弹一次（拿一次就清）：[{ k: 'win' | 'miss' | 'list', code, name, n, pop }] */
export const takeIpoPop = (s) => { const m = s.mkt; const q = (m && m.ipoPop) || []; if (m) m.ipoPop = []; return q; };
const ipoPop = (s, x) => capAdd(s, 'mkt.ipoPop', (s.mkt.ipoPop = s.mkt.ipoPop || []), x);
export function subscribe(s, t = Date.now()) {
  const why = whyNotSub(s, t); if (why) return { ok: false, why };
  const c = curIpo(s); c.sub = { lots: lotsOf(s), at: t }; return { ok: true, lots: c.sub.lots };
}
const popOf = (code) => { const u = SK.hu('IPO' + code, 1); const v = SK.hu('IPOV' + code, 2); let acc = 0; for (const [p, lo, hi] of I.pop) { acc += p; if (u < acc) return lo + (hi - lo) * v; } const [, lo, hi] = I.pop.at(-1); return lo + (hi - lo) * v; };
export const ipoInfo = (code) => SK.BY[code];
function ipoTick(s, t, rnd) {
  const m = s.mkt; const ip = m.ipo;
  while (t - ip.dayAt >= DAY) { ip.dayAt += DAY; ip.daily.push(r2(myShareValue(s)));   // V0.2.16：日均持股含卖单里的
    if (ip.daily.length > I.avgDays) ip.daily.shift(); }
  for (let k = 0; k < 20; k++) {
    if (!ip.cur) {
      if (ip.idx >= I.list.length || t < ip.next) return;
      const x = I.list[ip.idx]; ip.cur = { code: x.code, open: ip.next };
      addMsg(s, { kind: 'system', type: 'ipo', title: `新股申购：${x.name}（${x.code}），发行价 ${x.price}`, body: `${x.sector} · 申购 ${I.subDays} 个游戏天内有效；你现在能申购 ${lotsOf(s)} 签（前 ${I.avgDays} 个游戏天日均持股市值每 1 万 1 签，最多 ${I.maxLots} 签），每签 ${I.lotShares} 股。财富 → 投资 → 打新` }, ip.next);
      continue;
    }
    const c = ip.cur; const x = SK.BY[c.code];
    if (!c.drawn && t >= c.open + I.drawDay * DAY) {
      c.drawn = true; const at = c.open + I.drawDay * DAY;
      if (c.sub) {
        let w = 0; for (let i = 0; i < c.sub.lots; i++) if (rnd() < I.winRate) w++;
        c.win = w;
        if (w) { const amt = r2(w * I.lotShares * x.price); if (pay(s, { wallet: 'invest', cat: 'ipo_pay', amount: amt, party: x.name, note: `新股中签缴款 ${w} 签 × ${I.lotShares} 股 × ${x.price}` }, at)) { c.paid = w * I.lotShares; addMsg(s, { kind: 'system', type: 'ipo', title: `中签了！${x.name} ${w} 签`, body: `缴款 ${fmt(amt)}，${I.listDay - I.drawDay} 个游戏天后上市` }, at); ipoPop(s, { k: 'win', code: c.code, name: x.name, n: w * I.lotShares }); } else addMsg(s, { kind: 'system', type: 'ipo', title: `${x.name} 中签 ${w} 签，个人现金不够缴款，算放弃`, body: `要 ${fmt(amt)}` }, at); }
        else { addMsg(s, { kind: 'system', type: 'ipo', title: `${x.name}：没中签（申购 ${c.sub.lots} 签）`, body: `每签中签率 ${(I.winRate * 100).toFixed(1)}%` }, at); ipoPop(s, { k: 'miss', code: c.code, name: x.name, n: 0 }); }
      }
      continue;
    }
    if (c.drawn && t >= c.open + I.listDay * DAY) {
      const at = c.open + I.listDay * DAY; const pop = popOf(c.code);
      m.px[c.code] = Math.max(C.model.minPrice, r2(x.price * (1 + pop))); m.fv[c.code] = x.price * (1 + pop * I.fvKeep);
      m.hist[c.code] = [x.price, m.px[c.code]]; m.long[c.code] = [m.px[c.code]]; m.ipoOn.push(c.code);
      if (c.paid) { m.hold[c.code] = { n: c.paid, cost: x.price, at }; const f = m.wk.f[c.code] || (m.wk.f[c.code] = { buy: 0, sell: 0 }); f.buy = r2(f.buy + c.paid * x.price); }
      addMsg(s, { kind: 'system', type: 'ipo', title: `${x.name} 上市，首日 ${pop >= 0 ? '+' : ''}${(pop * 100).toFixed(0)}%${pop < 0 ? '（破发）' : ''}`, body: c.paid ? `你中的 ${c.paid} 股现在值 ${fmt(c.paid * m.px[c.code])}（成本 ${fmt(c.paid * x.price)}）` : '已经进股票列表，可以买卖' }, at);
      ipoPop(s, { k: 'list', code: c.code, name: x.name, n: c.paid || 0, pop: r2(pop) });   // 设计90
      capAdd(s, 'mkt.ipo.done', ip.done, { code: c.code, sub: c.sub ? c.sub.lots : 0, win: c.win || 0, paid: c.paid || 0, pop: r2(pop) });
      const [lo, hi] = I.everyMonths; ip.next = c.open + (lo + (hi - lo) * SK.hu('IPON' + c.code, 3)) * MONTH_MS; ip.cur = null; ip.idx++;
      continue;
    }
    return;
  }
}

// ---------- 炒股周报 ----------
function snapWeek(s, t) { const v0 = {}; for (const h of myHoldings(s)) v0[h.code] = h.value; return { start: t, v0, f: {}, sells: [] }; }
/** 这一周到现在：{ pnl, rate（没卖过是 null）, best, worst, rows } */
export function weekStat(s) {
  const m = tr(s); const w = m.wk; const now = {}; for (const h of myHoldings(s)) now[h.code] = h.value;
  const codes = new Set([...Object.keys(w.v0), ...Object.keys(now), ...Object.keys(w.f)]);
  const rows = [...codes].map((c) => { const f = w.f[c] || { buy: 0, sell: 0 }; return { code: c, pnl: r2((now[c] || 0) - (w.v0[c] || 0) + f.sell - f.buy) }; }).sort((a, b) => b.pnl - a.pnl);
  const pnl = r2(rows.reduce((a, x) => a + x.pnl, 0)); const rate = w.sells.length ? w.sells.filter((g) => g > 0).length / w.sells.length : null;
  return { pnl, rate, best: rows[0] || null, worst: rows.length > 1 ? rows.at(-1) : null, rows, trades: w.sells.length };
}
function weekly(s, t) {
  const m = s.mkt; if (t - m.wk.start < W.days * DAY) return null;
  const st = weekStat(s); const end = m.wk.start + W.days * DAY; const lw = m.wk.look; m.wk = snapWeek(s, t);   // 设计41：她的战绩跟周报一起清零
  if (!st.rows.length) return null;
  const who = wisest(s); const type = who ? SEC_BY_ID[who].type : '知性'; const ls = W.lines[type] || W.lines['知性'];
  const rateTxt = st.rate == null ? '—' : `${Math.round(st.rate * 100)}%`; const pnlTxt = `${st.pnl >= 0 ? '赚了' : '亏了'} ${fmt(Math.abs(st.pnl))}`;
  const line = ls[Math.floor(SK.hu('WK' + type, Math.floor(end / DAY)) * ls.length)].replace('{rate}', rateTxt).replace('{pnl}', pnlTxt);
  const body = `本周${pnlTxt}；胜率 ${rateTxt}${st.trades ? `（卖出 ${st.trades} 笔）` : '（这周没卖出）'}${st.best && st.best.pnl > 0 ? `；最赚：${name(st.best.code)} ${fmt(st.best.pnl)}` : ''}${st.worst && st.worst.pnl < 0 ? `；最亏：${name(st.worst.code)} ${fmt(st.worst.pnl)}` : ''}${lw && lw.n ? `\n看盘 ${lw.n} 次，抓到涨停 ${lw.lu} 次，照她挂的单${lw.pnl >= 0 ? '赚' : '亏'} ${fmt(Math.abs(lw.pnl))}` : ''}\n${who ? SEC_BY_ID[who].name : ''}：「${line}」`;
  addMsg(s, { kind: 'report', type: 'stock_weekly', from: who || '', title: `炒股周报：${pnlTxt}`, body }, t);
  return { ...st, line, who };
}

/** 按时间走的部分（在线 ticker、离线补算都叫）：打新、周报 */
const TICK_HOOKS = []; export const addTickHook = (fn) => { TICK_HOOKS.push(fn); };   // 设计41：看盘消息过期删（core/look.js）
export function tick(s, t, rnd = Math.random) {
  if (!s.mkt) return null;
  tr(s, t); ipoTick(s, t, rnd); for (const fn of TICK_HOOKS) fn(s, t); return weekly(s, t);
}
SK.addStepHook((s, tk) => { if (!s.mkt) return; checkOrders(s, tk); timeUp(s, tk); dropOrphans(s.mkt); IDLE.step(s, tk); });   // V0.2.16：每跳清孤儿卖单；设计72：投资账户闲钱生息
