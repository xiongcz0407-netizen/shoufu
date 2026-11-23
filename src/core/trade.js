// 第 P-06 项（设计25 第五节）：前期炒股 —— 条件单、打新股、融资融券、看盘、炒股周报
// 条件单和两融的平仓线每跳检查（挂在 stocks.js 的 addStepHook 上，离线补算一样走）；打新、利息、周报按时间走 tick()（在线 ticker 和 core/offcap.js 都叫）
import * as SK from './stocks.js?v=47e8f1b5';
import { pay, receive } from './ledger.js?v=47e8f1b5';
import { addContract } from './contracts.js?v=47e8f1b5';
import { addMsg } from './inbox.js?v=47e8f1b5';
import { MONTH_MS, YEAR_MS } from './gametime.js?v=47e8f1b5';
import { profitMul } from './calib.js?v=47e8f1b5';
import { isTraining } from './training.js?v=47e8f1b5';
import { attrs as secAttrs } from './posts.js?v=47e8f1b5';
import { SEC_BY_ID } from '../config/secretaries.js?v=47e8f1b5';
import { netWorth } from './economy.js?v=47e8f1b5';
import { addAssetHook } from './assets.js?v=47e8f1b5';

const C = SK.SCFG; const O = C.orders, I = C.ipo, MG = C.margin, W = C.weekly;
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
/** 智慧最高的秘书（周报、两融提醒） */
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
// 买单：挂的时候从个人现金扣走 挂单价 × 股数 + 佣金（最低 5 元）+ 过户费（含大单滑点），放进单子（o.hold，记账 order_hold「挂单划款」）；
//   成交：划款转付股款（记账 order_back「挂单成交，划款转付股款」，再照常按成交价买），多扣的差价就留在个人现金里；撤单 / 到期 / 过期全退（order_back「挂单退回」）
// 卖单：挂的时候把股数从持仓划进单子（o.sh，或联动组 g.sh：止盈止损两张共用一份）；成交时放回持仓马上卖；撤单 / 到期退回持仓（成本价照旧）
//   联动单买入成交后，买到的股票直接留在组里（g.sh），不进持仓
// 身价照算：挂单里的钱 + 股票（按现价）挂进资产（orderValue）
/** 按挂单价算要扣多少（跟 SK.quote 一样的算法，价换成挂单价） */
export function buyCost(s, code, px, n) {
  const F = C.fees; const x = SK.BY[code]; const amt = px * n; const cap = px * x.shares * 1e8;
  const impact = amt / cap > F.impactFrom ? amt / cap * F.impactK : 0; const gross = r2(r2(px * (1 + impact)) * n);
  return r2(gross + r2(Math.max(F.minCommission, gross * F.commission)) + r2(gross * F.transfer));
}
/** 个人现金里能花的（认筹冻结照旧不算；挂单的钱已经扣走了） */
export const availCash = (s) => SK.availCash(s);
/** 这张买单要扣多少：融资买入只扣自己出的那部分 */
const needHold = (s, o) => { const c = buyCost(s, o.code, o.px, o.n); return o.margin ? Math.max(0, r2(c - room(s))) : c; };
function holdCash(s, o, t) {
  if (o.kind !== 'buy' || o.on === false || o.hold != null) return true;
  const amt = needHold(s, o); if (availCash(s) < amt - 1e-9) return false;
  if (amt > 0 && !pay(s, { wallet: 'personal', cat: 'order_hold', amount: amt, party: '证券账户', note: `挂单划款：${name(o.code)} ${o.n.toLocaleString()} 股（到价 ${o.px} 买入）` }, t)) return false;
  o.hold = amt; return true;
}
function backCash(s, o, t, note) { const a = o.hold || 0; o.hold = 0; if (a > 0) receive(s, { wallet: 'personal', cat: 'order_back', amount: a, party: '证券账户', note: `${note}：${name(o.code)} ${o.n.toLocaleString()} 股` }, t); return a; }
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
addAssetHook({ value: (s) => orderValue(s) });
/** 玩家自己卖（个股页的卖出 / 全部卖出）：只卖持仓里剩下的 */
export function sellMine(s, code, n, t = Date.now()) {
  const k = sellable(s, code); const lk = lockedShares(s, code);
  if (Math.floor(n) > k) return { ok: false, why: `持股只有 ${k.toLocaleString()} 股${lk ? `（另有 ${lk.toLocaleString()} 股在卖单里）` : ''}` };
  return SK.sell(s, code, n, t);
}

// ---------- 条件单 ----------
export const KIND = { buy: '到价买入', tp: '止盈卖出', sl: '止损卖出' };
export function whyNotOrder(s, o) {
  const m = tr(s); if (!KIND[o.kind]) return '选一种条件单';
  if (!(m.px[o.code] > 0)) return '还没上市';
  if (m.orders.length >= O.max) return `最多同时挂 ${O.max} 张`;
  if (!(o.n >= 1)) return '最少 1 股'; if (!(o.px > 0)) return '填一个价格';
  { const B = SK.band(m, o.code); if (B.up != null && (o.px > B.up + 1e-9 || o.px < B.dn - 1e-9)) return `挂单价要在今天跌停 ${B.dn} 和涨停 ${B.up} 之间`; }   // 设计41 第九节
  if (o.kind !== 'buy' && o.on !== false) { const k = sellable(s, o.code); if (k < o.n) return `持股只有 ${k.toLocaleString()} 股`; }   // 设计43：卖单挂上就把股票划走
  if (o.kind === 'buy' && o.on !== false) { const need = o.margin ? Math.max(0, buyCost(s, o.code, o.px, o.n) - room(s)) : buyCost(s, o.code, o.px, o.n); if (availCash(s) < need - 1e-9) return `钱不够（个人现金 ¥${fmt(Math.max(0, availCash(s)))}，要 ¥${fmt(need)}）`; }   // 设计43：买单挂上就扣钱
  return null;
}
export function addOrder(s, o, t = Date.now()) {
  const why = whyNotOrder(s, o); if (why) return { ok: false, why };
  const m = tr(s, t); const x = { id: ++m.ordSeq, code: o.code, kind: o.kind, px: r2(o.px), n: Math.floor(o.n), at: t }; if (o.margin) x.margin = true;
  if (!holdCash(s, x, t)) return { ok: false, why: `钱不够（个人现金 ¥${fmt(Math.max(0, availCash(s)))}）` };
  if (!holdShares(s, x)) return { ok: false, why: `持股只有 ${sellable(s, x.code).toLocaleString()} 股` };
  m.orders.push(x); return { ok: true, order: x, held: x.hold || 0 };
}
/** 撤单：钱退回个人现金、股票退回持仓（o.back 退了多少钱、o.backN 退了多少股）。成交时 filled = true：钱转付股款、股票放回持仓马上卖 */
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
  for (const l of legs) { const why = whyNotOrder(s, { ...l, on: l.role === 'in' }); if (why) return { ok: false, why }; }
  const g = (m.grpSeq = (m.grpSeq || 0) + 1); m.grps = m.grps || {};
  m.grps[g] = { src: meta.src || '', code: ins[0].code, at: t, lu: !!meta.lu, cost: 0, n: 0 };
  const out = legs.map((l) => { const x = { id: ++m.ordSeq, code: l.code, kind: l.kind, px: r2(l.px), n: Math.floor(l.n), at: t, grp: g, role: l.role, on: l.role === 'in' }; if (meta.exp && l.role === 'in') x.exp = meta.exp; return x; });
  const x0 = out.find((x) => x.role === 'in');   // 设计43：开头那张挂上就划款 / 划股（出场单买入成交后才有股票）
  if (!holdCash(s, x0, t)) { delete m.grps[g]; return { ok: false, why: `钱不够（个人现金 ¥${fmt(Math.max(0, availCash(s)))}）` }; }
  if (!holdShares(s, x0)) { delete m.grps[g]; return { ok: false, why: `持股只有 ${sellable(s, x0.code).toLocaleString()} 股` }; }
  m.orders.push(...out);
  return { ok: true, grp: g, orders: out };
}
/** 照她挂的单成交以后（战绩用）：fn(s, { grp, kind: 'in' | 'out', pnl, lu }) */
const GROUP_HOOKS = []; export const addGroupHook = (fn) => { GROUP_HOOKS.push(fn); };
const hit = (o, p) => (o.kind === 'tp' ? p >= o.px : p <= o.px);
function checkOrders(s, tk) {
  const m = s.mkt; if (!m.orders || !m.orders.length) return;
  const t = tk * TICK;
  for (const o of m.orders.slice()) {
    if (!m.orders.includes(o) || o.on === false || (o.role === 'out' && o.at >= t)) continue;   // 联动单还没生效的不看；这一跳刚生效的下一跳才看
    if (t - o.at > O.expireDays * DAY || (o.exp && t >= o.exp)) { cancelOrder(s, o.id, false, t); addMsg(s, { kind: 'system', type: 'stock_order', title: `条件单${o.exp && t >= o.exp ? '到期' : '过期'}撤了：${name(o.code)} ${KIND[o.kind]} ${o.px}`, body: `${o.exp && t >= o.exp ? '看盘的单子 2 小时没成交，撤了' : `${O.expireDays} 个游戏天没触发`}${o.back ? `，挂单的 ¥${fmt(o.back)} 退回个人现金` : ''}${o.backN ? `，${o.backN.toLocaleString()} 股退回持仓` : ''}` }, t); continue; }
    const p = m.px[o.code]; if (!(p > 0) || !hit(o, p)) continue;
    const bd = SK.onBoard(m, o.code); if ((o.kind === 'buy' && bd === 'up') || (o.kind !== 'buy' && bd === 'down')) continue;   // 设计41 第九节：封在板上这一跳不成交
    const held = o.hold || 0; cancelOrder(s, o.id, true, t);   // 设计43：划款转付股款 / 股票放回持仓，再按实际成交价买卖
    let r = o.kind === 'buy' ? (o.margin ? marginBuy(s, o.code, o.n, t) : SK.buy(s, o.code, o.n, t)) : SK.sell(s, o.code, Math.min(o.n, (m.hold[o.code] || { n: 0 }).n), t);
    if (!r.ok && o.kind === 'buy' && o.margin) r = SK.buy(s, o.code, o.n, t);
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
    for (const x of mates) { x.on = true; x.n = got; x.at = t; if (!holdCash(s, x, t)) { cancelOrder(s, x.id, false, t); addMsg(s, { kind: 'system', type: 'stock_order', title: `抄底单挂不上：${name(x.code)}`, body: `个人现金不够（要 ¥${fmt(buyCost(s, x.code, x.px, x.n))}）` }, t); } }   // 设计43：抄底那张买单生效时扣钱
    if (g) { g.cost = o.kind === 'buy' ? r.quote.total : 0; g.n = got; g.side = o.kind; }
    for (const fn of GROUP_HOOKS) fn(s, { grp: o.grp, kind: 'in', lu: g && g.lu, src: g && g.src });
    if (!mates.length && g) delete m.grps[o.grp];
    return;
  }
  for (const x of mates) cancelOrder(s, x.id, false, t);
  let pnl = null; if (g && g.side === 'buy' && g.n) pnl = r2(r.quote.total - g.cost * Math.min(1, o.n / g.n));
  for (const fn of GROUP_HOOKS) fn(s, { grp: o.grp, kind: 'out', pnl, lu: g && g.lu, src: g && g.src });
  if (g) delete m.grps[o.grp];
}

// ---------- 融资融券（只做融资买入） ----------
export const mg = (s) => tr(s).margin || null;
export function whyNotOpen(s) {
  if (mg(s)) return '已经开通了';
  if (netWorth(s) < MG.openAt) return `身价到 ${fmt(MG.openAt)} 才能开（照现实：账户资产 ≥ 50 万）`;
  if (s.cash + SK.holdValue(s) < MG.openAt) return `账户资产（个人现金 + 持仓市值）要 ≥ ${fmt(MG.openAt)}`;
  return null;
}
export function openMargin(s, t = Date.now()) {
  const why = whyNotOpen(s); if (why) return { ok: false, why };
  const ct = addContract(s, { prefix: 'RZ', kind: 'margin', title: '融资融券合同', parties: [['客户', s.bossName || '老板'], ['券商', '华太正券']], subject: `用证券账户里的持仓作担保融资买入：最多借持仓净值的 ${MG.maxLever} 倍，年利率 ${(MG.yearRate * 100).toFixed(0)}%（游戏口径 × ${profitMul()}）按小时计；维持担保比例低于 ${Math.round(MG.call * 100)}% 追加保证金（${MG.callDays} 个游戏天内补足），低于 ${Math.round(MG.force * 100)}% 强制平仓`, rows: [['授信额度', 0, '按持仓净值随时变'], ['年利率（游戏口径）', 0, `${(MG.yearRate * profitMul() * 100).toFixed(0)}%`]], total: 0, wallet: 'personal' }, t);
  tr(s, t).margin = { debt: 0, intAt: t, call: null, warned: false, no: ct.no };
  return { ok: true, contract: ct };
}
const shareVal = (s) => SK.holdValue(s) + inOrders(s).value - inOrders(s).cash;   // 设计43：挂在卖单里的股票也算担保
export const ratio = (s) => { const g = mg(s); return g && g.debt > 0 ? shareVal(s) / g.debt : Infinity; };
/** 还能借多少：maxLever × (持仓市值 − 已借) − 已借 */
export const room = (s) => { const g = mg(s); if (!g) return 0; return Math.max(0, r2(MG.maxLever * (shareVal(s) - g.debt) - g.debt)); };
export function marginBuy(s, code, n, t = Date.now()) {
  const g = mg(s); if (!g) return { ok: false, why: '先开通融资融券' };
  const q = SK.quote(s, code, Math.floor(n), 'buy'); if (q.total > room(s)) return { ok: false, why: `融资额度不够（还能借 ${fmt(room(s))}）` };
  receive(s, { wallet: 'personal', cat: 'margin_in', amount: q.total, party: '华太正券', note: `融资买入 ${name(code)} ${Math.floor(n)} 股（借款直接付股款）` }, t);
  const r = SK.buy(s, code, n, t);
  if (!r.ok) { pay(s, { wallet: 'personal', cat: 'margin_repay', amount: q.total, party: '华太正券', note: '融资买入没成交，借款退回', force: true }, t); return r; }
  g.debt = r2(g.debt + q.total); return { ...r, borrowed: q.total };
}
export function repay(s, amount, t = Date.now()) {
  const g = mg(s); if (!g || g.debt <= 0) return { ok: false, why: '没有融资负债' };
  amount = Math.min(r2(amount), g.debt); if (!(amount > 0)) return { ok: false, why: '还多少？' };
  if (!pay(s, { wallet: 'personal', cat: 'margin_repay', amount, party: '华太正券', note: '归还融资' }, t)) return { ok: false, why: '个人现金不够' };
  g.debt = r2(g.debt - amount); if (ratio(s) >= MG.call) g.call = null; return { ok: true, amount };
}
/** 平仓：从市值大的卖起，卖到维持担保比例回到 restore 或者还清 */
export function liquidate(s, t, why) {
  const g = mg(s); if (!g || g.debt <= 0) return 0;
  let H = SK.holdValue(s), D = g.debt; const R = MG.restore;
  let need = H <= D ? Infinity : Math.max(0, (R * D - H) / (R - 1)); let got = 0; const sold = [];
  for (const h of SK.holdings(s).sort((a, b) => b.value - a.value)) {
    if (got >= need || got >= D) break;
    const p = SK.price(s, h.code); const free = h.n - (h.pledged || 0); if (free <= 0) continue;
    const k = Math.min(free, Math.ceil((Math.min(need, D) - got) / p / (1 - 0.002)));
    const r = SK.sell(s, h.code, k, t); if (r.ok) { got += r.quote.total; sold.push(`${name(h.code)} ${k.toLocaleString()} 股`); }
  }
  const back = Math.min(D, got, s.cash); if (back > 0) pay(s, { wallet: 'personal', cat: 'margin_repay', amount: r2(back), party: '华太正券', note: `强制平仓还融资（${why}）`, force: true }, t);
  g.debt = r2(D - back); g.call = null; g.warned = false;
  addMsg(s, { kind: 'system', type: 'margin', title: `融资强制平仓（${why}）`, body: `券商卖了 ${sold.join('、') || '—'}，还了 ${fmt(back)}；剩下负债 ${fmt(g.debt)}` }, t);
  return back;
}
function checkMargin(s, tk) {
  const g = s.mkt.margin; if (!g || g.debt <= 0) return;
  const t = tk * TICK; const r = ratio(s);
  if (r < MG.force) { liquidate(s, t, `维持担保比例 ${(r * 100).toFixed(0)}% 低于 ${Math.round(MG.force * 100)}%`); return; }
  if (g.call && r >= MG.call) g.call = null;
  if (g.call && t >= g.call.until) { liquidate(s, t, `追加保证金到期，比例还是 ${(r * 100).toFixed(0)}%`); return; }
  if (!g.call && r < MG.call) { g.call = { at: t, until: t + MG.callDays * DAY }; addMsg(s, { kind: 'request', type: 'margin_call', title: `追加保证金通知：维持担保比例 ${(r * 100).toFixed(0)}%`, body: `低于 ${Math.round(MG.call * 100)}%。${MG.callDays} 个游戏天内还一部分融资或者补仓位，让比例回到 ${Math.round(MG.call * 100)}% 以上，不然券商强制平仓。财富 → 投资 → 持仓 → 融资融券` }, t); }
  if (!g.warned && r < MG.warn) { g.warned = true; const w = wisest(s); addMsg(s, { kind: 'system', type: 'margin_warn', from: w || '', title: `${w ? SEC_BY_ID[w].name : '券商'}：维持担保比例 ${(r * 100).toFixed(0)}% 了`, body: '老板，融资那块快到警戒线了，要不要先还一点？' }, t); g.warnNew = true; }
  if (g.warned && r > MG.warn * 1.07) g.warned = false;
}
function interest(s, t) {
  const g = s.mkt.margin; if (!g) return;
  const n = Math.floor((t - g.intAt) / 3600e3); if (n <= 0) return; g.intAt += n * 3600e3;
  if (g.debt <= 0) return;
  const amt = r2(g.debt * MG.yearRate * profitMul() / (YEAR_MS / 3600e3) * n); /* 每真实 1 小时 = 一年的 1 / 144 */
  if (amt < 0.01) return;
  if (s.cash >= amt) pay(s, { wallet: 'personal', cat: 'margin_interest', amount: amt, party: '华太正券', note: `融资利息（${n} 小时）` }, t);
  else { g.debt = r2(g.debt + amt); g.capInt = r2((g.capInt || 0) + amt); }   // 现金不够：利息记进负债
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
export function subscribe(s, t = Date.now()) {
  const why = whyNotSub(s, t); if (why) return { ok: false, why };
  const c = curIpo(s); c.sub = { lots: lotsOf(s), at: t }; return { ok: true, lots: c.sub.lots };
}
const popOf = (code) => { const u = SK.hu('IPO' + code, 1); const v = SK.hu('IPOV' + code, 2); let acc = 0; for (const [p, lo, hi] of I.pop) { acc += p; if (u < acc) return lo + (hi - lo) * v; } const [, lo, hi] = I.pop.at(-1); return lo + (hi - lo) * v; };
export const ipoInfo = (code) => SK.BY[code];
function ipoTick(s, t, rnd) {
  const m = s.mkt; const ip = m.ipo;
  while (t - ip.dayAt >= DAY) { ip.dayAt += DAY; ip.daily.push(r2(SK.holdValue(s))); if (ip.daily.length > I.avgDays) ip.daily.shift(); }
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
        if (w) { const amt = r2(w * I.lotShares * x.price); if (pay(s, { wallet: 'personal', cat: 'ipo_pay', amount: amt, party: x.name, note: `新股中签缴款 ${w} 签 × ${I.lotShares} 股 × ${x.price}` }, at)) { c.paid = w * I.lotShares; addMsg(s, { kind: 'system', type: 'ipo', title: `中签了！${x.name} ${w} 签`, body: `缴款 ${fmt(amt)}，${I.listDay - I.drawDay} 个游戏天后上市` }, at); } else addMsg(s, { kind: 'system', type: 'ipo', title: `${x.name} 中签 ${w} 签，个人现金不够缴款，算放弃`, body: `要 ${fmt(amt)}` }, at); }
        else addMsg(s, { kind: 'system', type: 'ipo', title: `${x.name}：没中签（申购 ${c.sub.lots} 签）`, body: `每签中签率 ${(I.winRate * 100).toFixed(1)}%` }, at);
      }
      continue;
    }
    if (c.drawn && t >= c.open + I.listDay * DAY) {
      const at = c.open + I.listDay * DAY; const pop = popOf(c.code);
      m.px[c.code] = Math.max(C.model.minPrice, r2(x.price * (1 + pop))); m.fv[c.code] = x.price * (1 + pop * I.fvKeep);
      m.hist[c.code] = [x.price, m.px[c.code]]; m.long[c.code] = [m.px[c.code]]; m.ipoOn.push(c.code);
      if (c.paid) { m.hold[c.code] = { n: c.paid, cost: x.price, at }; const f = m.wk.f[c.code] || (m.wk.f[c.code] = { buy: 0, sell: 0 }); f.buy = r2(f.buy + c.paid * x.price); }
      addMsg(s, { kind: 'system', type: 'ipo', title: `${x.name} 上市，首日 ${pop >= 0 ? '+' : ''}${(pop * 100).toFixed(0)}%${pop < 0 ? '（破发）' : ''}`, body: c.paid ? `你中的 ${c.paid} 股现在值 ${fmt(c.paid * m.px[c.code])}（成本 ${fmt(c.paid * x.price)}）` : '已经进股票列表，可以买卖' }, at);
      ip.done.push({ code: c.code, sub: c.sub ? c.sub.lots : 0, win: c.win || 0, paid: c.paid || 0, pop: r2(pop) });
      const [lo, hi] = I.everyMonths; ip.next = c.open + (lo + (hi - lo) * SK.hu('IPON' + c.code, 3)) * MONTH_MS; ip.cur = null; ip.idx++;
      continue;
    }
    return;
  }
}

// ---------- 炒股周报 ----------
function snapWeek(s, t) { const v0 = {}; for (const h of SK.holdings(s)) v0[h.code] = h.value; return { start: t, v0, f: {}, sells: [] }; }
/** 这一周到现在：{ pnl, rate（没卖过是 null）, best, worst, rows } */
export function weekStat(s) {
  const m = tr(s); const w = m.wk; const now = {}; for (const h of SK.holdings(s)) now[h.code] = h.value;
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

/** 按时间走的部分（在线 ticker、离线补算都叫）：打新、两融利息、周报 */
const TICK_HOOKS = []; export const addTickHook = (fn) => { TICK_HOOKS.push(fn); };   // 设计41：看盘消息过期删（core/look.js）
export function tick(s, t, rnd = Math.random) {
  if (!s.mkt) return null;
  tr(s, t); ipoTick(s, t, rnd); interest(s, t); for (const fn of TICK_HOOKS) fn(s, t); return weekly(s, t);
}
SK.addStepHook((s, tk) => { if (!s.mkt) return; checkOrders(s, tk); checkMargin(s, tk); });
