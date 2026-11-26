/* 设计79 第三版：存「结果」不存「过程」（开发2）——记账时顺手累加，任何数字都不再翻明细算
   s.books = {
     month: { 游戏月: { w: { 钱包: { 键: [进, 出] } }, e: 同上（正好在月初那一刻记的，单独放：按 (月初, 月底] 算提成的也对得上） } }   只留最近 24 个月
     year:  { 游戏年: { 钱包: { 键: [进, 出] } } }   每年一格，不删
     total: { 钱包: { 键: [进, 出] } }               开局到现在
     day:   { d: 游戏天, w: { 钱包: { 键: [进, 出] } } }   今天（换天清零）
     sec:   { 秘书: { sal 工资绩效合计, gift: [件, 钱]（礼物，收的人是她）, cloth: [件, 钱]（衣服）, any: [件, 钱]（礼物 + 衣服，备注里点到她的也算） } }
     tax:   { month: { 游戏月: { 税种|个人/公司: 钱 } }（留 24 个月）, year: {…}, total: {…}, day: { d, k: {…} } }
   }
   键 = 类别，报表要分的再带一段：营收 / 进货 / 土地 / 建安按产业名（「revenue|便利店」）、秘书工资分「sec」和「perf」（店长绩效），备忘行加「|m」
   报表要「某段时间的流水」时，用 rowsSince 把格子变成几条「假流水」（字段跟明细一样，note 写产业名 / 秘书工资），原来的报表代码照算 */
import { MONTH_MS, YEAR_MS } from './gametime.js?v=06229def';
import { INDUSTRIES } from '../config/industries.js?v=06229def';
import { SEC_BY_ID } from '../config/secretaries.js?v=06229def';

const r2 = (x) => Math.round(x * 100) / 100;
export const KEEP_MONTHS = 24;
const DAY = MONTH_MS / 30;
const IND_NAMES = INDUSTRIES.map((x) => x.name).sort((a, b) => b.length - a.length);
const BY_IND = ['revenue', 'acquired_revenue', 'presale', 'rent_co', 'cogs', 'land', 'construction'];
export const mon = (s, t) => Math.floor((t - (s.createdAt || 0)) / MONTH_MS);
export const yr = (s, t) => Math.floor((t - (s.createdAt || 0)) / YEAR_MS);
export const gday = (s, t) => Math.floor((t - (s.createdAt || 0)) / DAY);
const monStart = (s, m) => (s.createdAt || 0) + m * MONTH_MS;

/** 键：类别 + 报表要分的那段 + 备忘 */
export function keyOf(r) {
  const n = r.note || ''; let sub = '';
  if (BY_IND.includes(r.cat)) sub = IND_NAMES.find((x) => n.startsWith(x)) || '';
  else if (r.cat === 'sec_salary') sub = n === '秘书工资' ? 'sec' : 'perf';
  return r.cat + (sub ? '|' + sub : '') + (r.memo ? '|m' : '');
}
/** 键 → 假流水的 note（报表按 note 分产业、分秘书工资） */
const noteOfKey = (sub) => (sub === 'sec' ? '秘书工资' : sub === 'perf' ? '店长绩效' : sub || '');

export function books(s) {
  const B = (s.books = s.books || { v: 3, month: {}, year: {}, total: {}, day: { d: -1, w: {} }, sec: {}, tax: { month: {}, year: {}, total: {}, day: { d: -1, k: {} } } });
  return B;
}
const add = (bk, wallet, key, dir, amt) => { const w = (bk[wallet] = bk[wallet] || {}); const a = (w[key] = w[key] || [0, 0]); const i = dir === 'out' ? 1 : 0; a[i] = r2(a[i] + amt); };
const prune = (obj, m) => { for (const k of Object.keys(obj)) if (+k < m - KEEP_MONTHS + 1) delete obj[k]; };
/** 这笔是给哪个秘书花的（礼物 / 衣服）：收的人是她，或备注里点到她 */
const secOfGift = (r) => (SEC_BY_ID[r.party] ? r.party : Object.keys(SEC_BY_ID).find((k) => (r.note || '').includes(k)) || null);

/** 临时累加器（离线补算这段时间用，回来出完汇总就丢）：{ cats: { 钱包|进出|类别: { wallet, dir, cat, amount, n } }, sec: { 秘书: { 进出|类别: { dir, wallet, cat, n, amount } } } } */
const TAPS = [];
export function startTap() { const acc = { cats: {}, sec: {} }; TAPS.push(acc); return () => { const i = TAPS.indexOf(acc); if (i >= 0) TAPS.splice(i, 1); return acc; }; }

/** 记一笔（ledger.js 记账时叫）：月、年、总、今天、秘书、临时累加器一起加 */
export function bookRow(s, r) {
  const B = books(s); const amt = r.amount || 0; if (!amt) return;
  const k = keyOf(r), m = mon(s, r.t), y = yr(s, r.t), d = gday(s, r.t);
  let M = B.month[m]; if (!M) { M = B.month[m] = { w: {}, e: {} }; prune(B.month, m); }
  add(r.t === monStart(s, m) ? M.e : M.w, r.wallet, k, r.dir, amt);
  add((B.year[y] = B.year[y] || {}), r.wallet, k, r.dir, amt);
  add(B.total, r.wallet, k, r.dir, amt);
  if (B.day.d !== d) { if (d < B.day.d) { /* 补记以前的（迁移）：今天格子不动 */ } else B.day = { d, w: {} }; }
  if (B.day.d === d) add(B.day.w, r.wallet, k, r.dir, amt);
  if (r.cat === 'sec_salary') for (const id of new Set([r.by, r.party])) if (SEC_BY_ID[id]) { const x = (B.sec[id] = B.sec[id] || {}); x.sal = r2((x.sal || 0) + amt); }
  if ((r.cat === 'gift' || r.cat === 'clothes') && r.dir === 'out') {
    const any = secOfGift(r);
    if (any) { const x = (B.sec[any] = B.sec[any] || {}); const a = (x.any = x.any || [0, 0]); a[0] += 1; a[1] = r2(a[1] + amt); const kk = r.cat === 'gift' ? 'gift' : 'cloth'; const b = (x[kk] = x[kk] || [0, 0]); b[0] += 1; b[1] = r2(b[1] + amt); }
    if (r.cat === 'gift' && SEC_BY_ID[r.party]) { const x = (B.sec[r.party] = B.sec[r.party] || {}); const a = (x.giftP = x.giftP || [0, 0]); a[0] += 1; a[1] = r2(a[1] + amt); }
  }
  if (!r.memo) for (const T of TAPS) {
    const ck = `${r.wallet}|${r.dir}|${r.cat}`; const c = (T.cats[ck] = T.cats[ck] || { wallet: r.wallet, dir: r.dir, cat: r.cat, amount: 0, n: 0 }); c.amount += amt; c.n += 1;
    if (r.by && SEC_BY_ID[r.by]) { const S = (T.sec[r.by] = T.sec[r.by] || {}); const sk = `${r.dir}|${r.cat}`; const x = (S[sk] = S[sk] || { dir: r.dir, wallet: r.wallet, cat: r.cat, n: 0, amount: 0 }); x.n += 1; x.amount += amt; }
  }
}
/** 记一张完税凭证（cap.js 的 taxes 加进来时叫） */
export function bookTax(s, x) {
  const B = books(s); const T = B.tax; const amt = x.amount || 0; if (!amt) return; const k = `${x.kind}|${x.payer === 'personal' ? 'p' : 'c'}`;
  const put = (o) => { o[k] = (o[k] || 0) + amt; };   // 凭证金额有的没取整（增值税），不取整，跟一张张加一样
  const m = mon(s, x.t), y = yr(s, x.t), d = gday(s, x.t);
  if (!T.month[m]) { T.month[m] = {}; prune(T.month, m); } put(T.month[m]); put((T.year[y] = T.year[y] || {})); put(T.total);
  if (T.day.d !== d && d > T.day.d) T.day = { d, k: {} }; if (T.day.d === d) put(T.day.k);
}

/* ---------- 读 ---------- */
const merge = (dst, src) => { for (const [w, o] of Object.entries(src || {})) for (const [k, a] of Object.entries(o)) { const x = ((dst[w] = dst[w] || {})[k] = (dst[w] || {})[k] || [0, 0]); x[0] = r2(x[0] + a[0]); x[1] = r2(x[1] + a[1]); } return dst; };
const monthAll = (M) => merge(merge({}, M && M.w), M && M.e);
/** 从 from 到现在的格子：全部 / 今天 / 本月 / 本年 正好对上；别的 from 按整游戏月（月初 ≥ from 的月份）加 */
export function cellsSince(s, from, t) {
  const B = books(s);
  if (!(from > (s.createdAt || 0))) return merge({}, B.total);
  if (from === (s.createdAt || 0) + gday(s, t) * DAY) return B.day.d === gday(s, t) ? merge({}, B.day.w) : {};
  if (from === monStart(s, mon(s, t))) return monthAll(B.month[mon(s, t)]);
  if (from === (s.createdAt || 0) + yr(s, t) * YEAR_MS) return merge({}, B.year[yr(s, t)]);
  const out = {}; for (const [m, M] of Object.entries(B.month)) if (monStart(s, +m) >= from) merge(out, monthAll(M)); return out;
}
/** 某个游戏月：incl = [月初, 下月初)；excl = (月初, 下月初]（月底结算按这个算） */
export function cellsOfMonth(s, m, mode = 'incl') {
  const B = books(s); const M = B.month[m], N = B.month[m + 1];
  return mode === 'excl' ? merge(merge({}, M && M.w), N && N.e) : mode === 'both' ? merge(monthAll(M), N && N.e) : monthAll(M);
}
/** 近 12 个游戏月（含这个月），按整月加 */
export function cellsLast12(s, t) { const B = books(s); const m0 = mon(s, t); const out = {}; for (let m = m0 - 11; m <= m0; m++) merge(out, monthAll(B.month[m])); return out; }
/** 格子 → 假流水（报表代码照用）：t 写 from，note 写产业名 / 秘书工资 */
export function rowsOf(cells, t = 0) {
  const out = [];
  for (const [wallet, o] of Object.entries(cells)) for (const [k, [a, b]] of Object.entries(o)) {
    const [cat, ...rest] = k.split('|'); const memo = rest.includes('m'); const sub = rest.find((x) => x !== 'm') || '';
    const base = { t, wallet, cat, memo, tax: 0, party: '', ref: '', by: '', note: noteOfKey(sub), book: true };
    if (a) out.push({ ...base, dir: 'in', amount: a }); if (b) out.push({ ...base, dir: 'out', amount: b });
  }
  return out;
}
/** 某段时间的完税合计 { 税种|p/c: 钱 } */
export function taxSince(s, from, t) {
  const T = books(s).tax; const sumOf = (objs) => { const o = {}; for (const x of objs) for (const [k, v] of Object.entries(x || {})) o[k] = r2((o[k] || 0) + v); return o; };
  if (!(from > (s.createdAt || 0))) return { ...T.total };
  if (from === (s.createdAt || 0) + gday(s, t) * DAY) return T.day.d === gday(s, t) ? { ...T.day.k } : {};
  if (from === monStart(s, mon(s, t))) return { ...(T.month[mon(s, t)] || {}) };
  if (from === (s.createdAt || 0) + yr(s, t) * YEAR_MS) return { ...(T.year[yr(s, t)] || {}) };
  return sumOf(Object.entries(T.month).filter(([m]) => monStart(s, +m) >= from).map(([, x]) => x));
}
export const taxOfYear = (s, y) => ({ ...(books(s).tax.year[y] || {}) });
/** 「一共」的某个格子：books.total 里 钱包 × 类别 前缀（不分产业）× 进 / 出 */
export function totalOf(s, wallet, cat, dir) { const o = books(s).total[wallet] || {}; let v = 0; for (const [k, a] of Object.entries(o)) if (k === cat || k.startsWith(cat + '|')) v += a[dir === 'out' ? 1 : 0]; return r2(v); }
export const secBook = (s, id) => books(s).sec[id] || {};

/** 老存档迁移：没有 books 就用现有的全部明细（和完税凭证）算一遍 */
export function buildBooks(s) {
  if (s.books) return false;
  books(s); const rows = (s.ledger || []).slice().sort((a, b) => a.t - b.t || a.id - b.id);
  const last = rows.length ? rows[rows.length - 1].t : 0;
  s.books.day.d = gday(s, last);   // 只有最后那天的进「今天」
  for (const r of rows) bookRow(s, r);
  s.books.tax.day.d = gday(s, last); for (const x of (s.taxes || []).slice().sort((a, b) => a.t - b.t)) bookTax(s, x);
  return true;
}
