// V2-13 每周经营会（设计29 第五节）：企业家起每 7 个游戏天，秘书发消息约你开会，30 分钟内开
// 会上：看各线上周营收 / 利润 / 增长；负责的秘书汇报一句（按她的属性给建议）；把预算（上周利润 10%）分到广告 / 扩张 / 研发 / 人才，到这个游戏周结束都有加成
// 不开会：到点按平均分，效果七折。大亨起改「董事会」，多一项分红 / 回购 / 并购三选一
// 存档 s.meet = { wk 上次结算到第几周, acc 累计营收进货, base 本周开始时的累计, prev 上周各线营收, cur 这一周的会, fx 这一周的加成, hist 最近几次 }
import { setMeetAdHook } from './ads.js?v=598ef1ae'; // V0.2.3
import { credit } from './credit.js?v=598ef1ae'; // V3-01 亲自拍板攒投入度
import C from '../config/meeting.json?v=598ef1ae' with { type: 'json' };
import { IND_BY_ID } from '../config/industries.js?v=598ef1ae';
import { SEC_BY_ID } from '../config/secretaries.js?v=598ef1ae';
import { setMeetingHooks, lineNetMonth, industryRevenue } from './economy.js?v=598ef1ae';
import { staffFactor, setTurnoverHook } from './staff.js?v=598ef1ae';
import { setAcquireHook } from './battle.js?v=598ef1ae';
import { setTrackHook, dividend } from './companytax.js?v=598ef1ae';
import { pay } from './ledger.js?v=598ef1ae';
import { available } from './accrual.js?v=598ef1ae';
import { addMsg } from './inbox.js?v=598ef1ae';
import { holder, isSec, attrs } from './posts.js?v=598ef1ae';
import { DAY_MS } from './manage.js?v=598ef1ae';
import { MONTH_MS } from './gametime.js?v=598ef1ae';
import { pushEvent, closeEvent } from './agenda.js?v=598ef1ae'; // V3-02 经营会也进日程
export { C as MEET_CFG };

const DIRS = Object.keys(C.dirs);
const WEEK_MS = C.weekDays * DAY_MS;
const r2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const mt = (s) => { const m = (s.meet = s.meet || { wk: null, acc: { rev: {}, cogs: {} }, base: null, prev: {}, cur: null, fx: null, hist: [] }); m.acc = m.acc || { rev: {}, cogs: {} }; m.hist = m.hist || []; return m; };
export const weekOf = (s, t) => Math.floor((t - s.createdAt) / WEEK_MS);
export const weekEnd = (s, wk) => s.createdAt + (wk + 1) * WEEK_MS;
export const isBoard = (s) => (s.title || 0) >= C.boardTitle;
export const unlocked = (s) => (s.title || 0) >= C.minTitle;
export const nameOf = (s) => (isBoard(s) ? '董事会' : '经营会');

// —— 统计：每笔营收进货都累计（companytax.track 的挂钩）——
setTrackHook((s, id, rev, cogs) => { const a = mt(s).acc; a.rev[id] = (a.rev[id] || 0) + rev; a.cogs[id] = (a.cogs[id] || 0) + cogs; });
const copy = (o) => ({ rev: { ...o.rev }, cogs: { ...o.cogs } });
/** 这条线的净利率（按满编估：估值那套口径），给「上周利润」用；地产按营收 − 成本 */
function margin(s, id) {
  const sf = staffFactor(s, id) || 1; const rev = industryRevenue(s, id) / sf * (MONTH_MS / 1000); if (!(rev > 0)) return 0;
  return clamp(lineNetMonth(s, id) / rev, -1, 1);
}
/** 上周各线：营收、利润、增长（跟上上周比） */
export function weekStats(s) {
  const m = mt(s); const b = m.base || { rev: {}, cogs: {} }; const rows = [];
  for (const id of Object.keys(s.inds)) {
    const rev = r2((m.acc.rev[id] || 0) - (b.rev[id] || 0)); const cogs = (m.acc.cogs[id] || 0) - (b.cogs[id] || 0);
    if (!(rev > 0) && !(m.prev[id] > 0)) continue;
    const profit = r2(IND_BY_ID[id].kind === 'project' ? rev - cogs : rev * margin(s, id));
    const pv = m.prev[id] || 0;
    rows.push({ id, name: IND_BY_ID[id].name, rev, profit, growth: pv > 0 ? rev / pv - 1 : null });
  }
  rows.sort((a, b) => b.rev - a.rev);
  return { rows, rev: r2(rows.reduce((a, r) => a + r.rev, 0)), profit: r2(rows.reduce((a, r) => a + r.profit, 0)) };
}
/** 各线负责的秘书汇报一句（店长是秘书的线），按增长 + 她最强的属性给建议 */
export function reports(s, st, rnd = Math.random) {
  const out = [];
  for (const r of st.rows) {
    const who = holder(s, 'manager_' + r.id); if (!isSec(who) || !SEC_BY_ID[who]) continue;
    const a = attrs(s, who); const best = DIRS.slice().sort((x, y) => (a[C.dirs[y].attr] || 0) - (a[C.dirs[x].attr] || 0))[0];
    const kind = r.growth == null || Math.abs(r.growth) < 0.03 ? 'flat' : r.growth > 0 ? 'up' : 'down';
    const ls = C.lines[kind]; const g = r.growth == null ? '' : `${Math.round(Math.abs(r.growth) * 100)}%`;
    out.push({ sec: who, id: r.id, dir: best, text: ls[Math.floor(rnd() * ls.length)].replace('{name}', r.name).replace('{g}', g) + C.lines.adv[best] });
  }
  return out;
}

// —— 周期 ——
/** 每跳叫（在线 ticker、离线补算）：过了一周就结上周、约这周的会；到点没开就按平均分（七折） */
export function tick(s, t, rnd = Math.random) {
  const m = mt(s); const wk = weekOf(s, t); m.now = t;
  if (m.wk == null) { m.wk = wk; m.base = copy(m.acc); return null; }
  let out = null;
  if (m.cur && !m.cur.done && t >= m.cur.due) out = decide(s, null, t, { auto: true });
  if (wk > m.wk) {
    if (m.cur && !m.cur.done) decide(s, null, t, { auto: true });
    const st = weekStats(s); m.prev = {}; for (const r of st.rows) m.prev[r.id] = r.rev;
    m.base = copy(m.acc); m.wk = wk;
    if (unlocked(s)) out = invite(s, st, wk, t, rnd);
  }
  return out;
}
function invite(s, st, wk, t, rnd) {
  const m = mt(s); const budget = Math.max(0, r2(st.profit * C.budgetPct));
  const rep = reports(s, st, rnd); const from = rep.length ? rep[0].sec : (Object.keys(s.secs || {})[0] || '');
  const msg = addMsg(s, { kind: 'invite', type: 'meeting', from, title: `每周${nameOf(s)}`, body: `上周营收 ${fmt(st.rev)}、利润 ${fmt(st.profit)}。这周的预算 ${fmt(budget)}（上周利润的 ${Math.round(C.budgetPct * 100)}%）等你来分。${C.dueMin} 分钟内不开，就按平均分，效果打七折。`, actions: [{ key: 'open', label: `开${nameOf(s)}` }], data: { wk } }, t);
  m.cur = { wk, at: t, due: t + C.dueMin * 60e3, msgId: msg.id, stats: st, rep, budget, board: isBoard(s), done: false };
  pushEvent(s, { kind: 'meeting', title: `每周${nameOf(s)}（预算 ${fmt(budget)}）`, ref: wk, due: m.cur.due }, t);
  return { invited: true, wk, budget };
}
const fmt = (n) => (Math.abs(n) >= 1e8 ? `¥${+(n / 1e8).toFixed(2)}亿` : Math.abs(n) >= 1e4 ? `¥${+(n / 1e4).toFixed(1)}万` : `¥${Math.round(n)}`);
export const pending = (s, t) => { const c = s.meet && s.meet.cur; return c && !c.done && t < c.due ? c : null; };
export const evenAlloc = () => { const o = {}; for (const d of DIRS) o[d] = 100 / DIRS.length; return o; };
export function whyAlloc(alloc) {
  const sum = DIRS.reduce((a, d) => a + (alloc[d] || 0), 0);
  if (DIRS.some((d) => (alloc[d] || 0) < 0)) return '不能是负的';
  if (Math.abs(sum - 100) > 0.01) return `加起来要 100%（现在 ${Math.round(sum)}%）`;
  return null;
}
/** 拍板：alloc { ad, exp, res, tal } 百分比（加起来 100）；board 'div' | 'buyback' | 'ma' | null。opts.auto：没开会，按平均、七折 */
export function decide(s, alloc, t, opts = {}) {
  const m = mt(s); const c = m.cur; if (!c || c.done) return { ok: false, why: '现在没有要开的会' };
  if (!opts.auto && t >= c.due) return { ok: false, why: '过了时间，已经按平均分了' };
  const auto = !!opts.auto; const al = auto ? evenAlloc() : alloc; const why = whyAlloc(al); if (why) return { ok: false, why };
  const k = auto ? C.autoK : 1; if (!auto) credit(s, 'meeting', 1, t); /* V3-01 亲自开会攒投入度（开发1 加的挂钩） */ const spend = r2(Math.min(c.budget, Math.max(0, available(s))));
  if (spend > 0) pay(s, { wallet: 'company', cat: 'meeting', amount: spend, party: '各部门', note: `第 ${c.wk + 1} 周${c.board ? '董事会' : '经营会'}预算（${DIRS.map((d) => `${C.dirs[d].name} ${Math.round(al[d])}%`).join('、')}${auto ? '，没开会按平均分' : ''}）` }, t);
  const scale = c.budget > 0 ? spend / c.budget : 0;
  const fx = { wk: c.wk, until: weekEnd(s, c.wk), auto };
  for (const d of DIRS) fx[d] = r2(C.dirs[d].max * (al[d] / 100) * k * scale * 1e4) / 1e4;
  let boardRes = null;
  if (c.board && !auto && opts.board) boardRes = boardAct(s, opts.board, c, t, fx);
  m.fx = fx; m.now = Math.max(m.now || 0, t); c.done = true; closeEvent(s, 'meeting', c.wk, auto ? 'expired' : 'done'); c.auto = auto; c.alloc = al; c.spend = spend; c.boardChoice = boardRes && boardRes.ok ? opts.board : null;
  const msg = (s.inbox || []).find((x) => x.id === c.msgId); if (msg && msg.status === 'open') { msg.status = 'done'; msg.choice = auto ? '没开，按平均分（七折）' : '开过了'; }
  m.hist.unshift({ wk: c.wk, auto, alloc: al, spend, fx: { ...fx }, board: c.boardChoice, profit: c.stats.profit }); if (m.hist.length > 12) m.hist.length = 12;
  return { ok: true, fx, spend, board: boardRes };
}
/** 董事会三选一 */
function boardAct(s, key, c, t, fx) {
  const B = C.board[key]; if (!B) return { ok: false, why: '没有这项' };
  const base = Math.max(0, c.stats.profit);
  if (key === 'div') { const amt = Math.floor(Math.min(base * B.pct, Math.max(0, available(s)))); return amt > 0 ? { ok: true, ...dividend(s, amt, t), amount: amt } : { ok: false, why: '没有利润可分' }; }
  if (key === 'buyback') {
    const L = s.listing && s.listing.listed; if (!L) return { ok: false, why: '还没上市，不能回购' };
    const amt = r2(Math.min(base * B.pct, Math.max(0, available(s)))); if (!(amt > 0)) return { ok: false, why: '没有钱回购' };
    const cap = L.px * L.shares; const up = Math.min(B.maxUp, amt / cap * B.k);
    pay(s, { wallet: 'company', cat: 'buyback', amount: amt, party: '二级市场', note: `董事会决议回购流通股注销（股价 +${(up * 100).toFixed(2)}%）` }, t);
    L.px = r2(L.px * (1 + up)); return { ok: true, amount: amt, up };
  }
  if (key === 'ma') { fx.acq = B.acq; return { ok: true }; }
  return { ok: false };
}
export const whyBoard = (s, key) => (key === 'buyback' && !(s.listing && s.listing.listed) ? '还没上市' : null);

// —— 加成挂钩 ——
const live = (s, t) => { const f = s.meet && s.meet.fx; return f && (t == null || t < f.until) ? f : null; };
const nowOf = (s) => (s.meet && s.meet.now) || 0; // 上一次 tick 的时间（在线每秒、离线按段），挂钩拿不到 t
/** 营业额：广告给门店、物流、传媒；研发给科技。估值（valueMode）不算 */
export function revMult(s, id, valueMode, t) {
  if (valueMode) return 1; const f = live(s, t ?? nowOf(s)); if (!f) return 1; const k = IND_BY_ID[id] && IND_BY_ID[id].kind;
  if (k === 'project') return 1; if (k === 'product') return 1 + (f.res || 0); if (IND_BY_ID[id].retail) return 1; /* V0.2.5 门店的「广告」改成这周广告升级打八折（core/ads.js） */ return 1 + (f.ad || 0);
}
export const brMult = (s, id, t) => { const f = live(s, t ?? nowOf(s)); return f ? 1 - (f.exp || 0) : 1; };
export const turnMult = (s, id, t) => { const f = live(s, t ?? nowOf(s)); return f ? 1 - (f.tal || 0) : 1; };
export const acqBonus = (s, t) => { const f = live(s, t ?? nowOf(s)); return f ? f.acq || 0 : 0; };
setMeetingHooks((s, id, vm) => revMult(s, id, vm), (s, id) => brMult(s, id));
setTurnoverHook((s, id) => turnMult(s, id));
setAcquireHook((s) => acqBonus(s));
setMeetAdHook((s) => { const f = live(s, nowOf(s)); return f ? f.ad || 0 : 0; }); // V0.2.5 这周广告升级打八折

/** econsim A：按情况分（有科技线给研发、要开店给扩张，剩下给广告），董事会：上市了回购、不然并购 */
export function smartAlloc(s) {
  const a = { ad: 60, exp: 20, res: 0, tal: 20 };
  if (s.inds.tech && s.inds.tech.branches !== undefined && (industryRevenue(s, 'tech') > 0)) { a.ad = 40; a.res = 40; a.exp = 10; a.tal = 10; }
  return a;
}
export function smartBoard(s) { return s.listing && s.listing.listed ? 'buyback' : 'ma'; }
