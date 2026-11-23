// 公司交税（设计15 第二节 1）：增值税 + 附加每游戏月；企业所得税每游戏季度预缴；分红代扣 20% 个税
import TAX from '../config/tax.json?v=b7d8e042' with { type: 'json' };
import { pay, receive, canPay } from './ledger.js?v=b7d8e042';
import { MONTH_MS } from './gametime.js?v=b7d8e042';
import { addContract } from './contracts.js?v=b7d8e042';
export { TAX };

const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
/** 每秒记进本月、本季、本年的累计（营收按产业、进货） */
/** V2-13 每周经营会：按周统计各线营收（开发2，core/meeting.js 挂进来） */
let trackHook = null; export const setTrackHook = (fn) => { trackHook = fn; };
export function track(s, id, rev, cogs) {
  if (trackHook) trackHook(s, id, rev, cogs);
  for (const k of ['period', 'qtr', 'yearAcc']) {
    const p = (s[k] = s[k] || {}); p.rev = p.rev || {}; p.cogs = p.cogs || {};
    p.rev[id] = (p.rev[id] || 0) + rev; p.cogs[id] = (p.cogs[id] || 0) + cogs;
  }
}
/** 是不是小规模纳税人：过去一年营收 ≤ 500 万（一旦超过就转一般纳税人） */
export function isSmallVat(s) {
  if (s.vatGeneral) return false;
  return sum((s.yearAcc || {}).rev) + sum((s.lastYear || {}).rev) * 0 <= TAX.vat.smallLimitYear;
}
function record(s, kind, period, base, rate, amount, t) {
  s.taxSeq = (s.taxSeq || 0) + 1;
  const cert = `完税-${String(s.taxSeq).padStart(5, '0')}`;
  (s.taxes = s.taxes || []).push({ id: s.taxSeq, t, kind, period, base, rate, amount, payer: 'company', cert });
  return cert;
}
// 申报（设计16 第二节 2）：有财务总监 / 代账公司 → 自动申报交上；没有 → 进消息中心等你点「申报」，15 个游戏日内交，过期每天万分之五滞纳金
let filer = null; // fn(s, item, t) → { by, extra }：财务总监经手（第 7 项 core/postwork.js 设）；返回 null = 没人管，要你自己申报
export const setFiler = (fn) => { filer = fn; };
export const DAY_GAME_MS = () => MONTH_MS / 30;
export function lateFee(item, t) { const days = Math.max(0, Math.floor((t - item.dueT) / DAY_GAME_MS())); return Math.round(item.amount * TAX.lateDailyRate * days * 100) / 100; }
/** 交一笔税：记完税凭证 + 流水；by 经手人 */
export function payTaxItem(s, item, t, by = '') {
  const late = item.dueT ? lateFee(item, t) : 0;
  const c = record(s, item.kind, item.label, item.base, item.rate, item.amount, t);
  pay(s, { wallet: 'company', cat: 'tax_company', amount: item.amount, force: true, party: '税务局', ref: c, by, note: item.note }, t);
  if (late >= 0.01) { const c2 = record(s, '滞纳金', item.label, item.amount, TAX.lateDailyRate, late, t); pay(s, { wallet: 'company', cat: 'tax_company', amount: late, force: true, party: '税务局', ref: c2, by, note: `${item.kind}滞纳金（晚交 ${Math.floor((t - item.dueT) / DAY_GAME_MS())} 天）` }, t); }
  return { cert: c, late };
}
function settle(s, item, t) {
  const f = filer ? filer(s, item, t) : { by: '' };
  if (f) { payTaxItem(s, item, t, f.by); if (f.extra) f.extra(s, item, t); return; }
  s.taxSeq2 = (s.taxSeq2 || 0) + 1;
  (s.taxDue = s.taxDue || []).push({ ...item, id: s.taxSeq2, dueT: t + TAX.fileDays * DAY_GAME_MS(), at: t });
  onDue && onDue(s, s.taxDue[s.taxDue.length - 1], t);
}
let onDue = null; export const setOnDue = (fn) => { onDue = fn; };
/** 你自己申报（或者月底过期强制扣） */
export function fileDue(s, id, t, by = '') {
  const i = (s.taxDue || []).findIndex((x) => x.id === id); if (i < 0) return null;
  const [item] = s.taxDue.splice(i, 1);
  return payTaxItem(s, item, t, by);
}
export const dueTotal = (s) => (s.taxDue || []).reduce((a, x) => a + x.amount, 0);
/** 按本月到现在的营收算增值税 + 附加：{ vat, surcharge, small, sr } */
export function vatOf(s) {
  const p = s.period || {}; const rev = sum(p.rev);
  const small = !s.vatGeneral && sum((s.yearAcc || {}).rev) <= TAX.vat.smallLimitYear;
  let vat;
  if (small) vat = rev * TAX.vat.smallRate;
  else {
    let out = 0; for (const [id, r] of Object.entries(p.rev || {})) { const g = TAX.vat.generalRate[id] ?? 0.13; out += r * (Array.isArray(g) ? g.reduce((a, [w, k]) => a + w * k, 0) : g); } // 物流：运输 9% + 收派 6% 按比例
    vat = Math.max(0, out - sum(p.cogs) * TAX.vat.inputRate - (p.inputExtra || 0)); // inputExtra：买车等的进项
  }
  const sr = (TAX.surcharge['城建税'] + TAX.surcharge['教育费附加'] + TAX.surcharge['地方教育附加']) * (small && TAX.surcharge.smallHalf ? 0.5 : 1);
  return { vat, surcharge: vat * sr, small, sr, rev };
}
/** 月底：增值税 + 附加；返回 { vat, surcharge, small, rev, profit }（利润按权责：营收 − 进货 − 本月全部人工房租 − 税） */
export function monthTax(s, monthIdx, t) {
  const p = s.period || {};
  if (!s.vatGeneral && sum((s.yearAcc || {}).rev) > TAX.vat.smallLimitYear) s.vatGeneral = true; // 超 500 万转一般纳税人
  const { vat, surcharge, small, sr, rev } = vatOf(s);
  const label = `第${Math.floor(monthIdx / 12) + 1}年${(monthIdx % 12) + 1}月`;
  if (vat >= 0.01) settle(s, { kind: '增值税', label, base: rev, rate: small ? TAX.vat.smallRate : 'mix', amount: vat, note: `增值税（${small ? '小规模 1%' : '一般纳税人'}）${label}` }, t);
  if (surcharge >= 0.01) settle(s, { kind: '附加税', label, base: vat, rate: sr, amount: surcharge, note: `城建税 + 教育费附加${small ? '（小规模减半）' : ''}` }, t);
  s.qtr = s.qtr || {}; s.qtr.surcharge = (s.qtr.surcharge || 0) + surcharge; s.qtr.labor = (s.qtr.labor || 0) + ((s.period && s.period.labor) || 0); s.qtr.rent = (s.qtr.rent || 0) + ((s.period && s.period.rent) || 0);
  s.qtr.other = (s.qtr.other || 0) + ((s.period && s.period.other) || 0);
  const res = { vat, surcharge, small, rev, cogs: sum(p.cogs), profit: rev - sum(p.cogs) - (p.labor || 0) - (p.rent || 0) - vat - surcharge - (p.other || 0) };
  (s.monthly = s.monthly || []).push({ m: monthIdx, rev, cogs: sum(p.cogs), labor: (p.labor || 0), rent: (p.rent || 0), tax: vat + surcharge, profit: res.profit });
  if (s.monthly.length > 60) s.monthly.shift();
  s.period = {};
  return res;
}
/** 小型微利按「今年到现在累计的应纳税所得额」≤ 300 万判断（季度预缴的现行做法） */
export const citSmall = (s, qProfit) => (s.citYtd || 0) + qProfit <= TAX.cit.smallLimitYear;
/** 季度末：企业所得税（小型微利 5%、否则 25%），亏了不交 */
/** 第 3-06 项：集团架构的企业所得税挂钩 fn(s, qtr, profit, q, t) → { cit, note } 或 null */
let citHook = null; export const setCitHook = (fn) => { citHook = fn; };
export function quarterTax(s, q, t) {
  const p = s.qtr || {};
  const profit = sum(p.rev) - sum(p.cogs) - (p.labor || 0) - (p.rent || 0) - (p.surcharge || 0) - (p.other || 0);
  const small = citSmall(s, profit); s.citYtd = (s.citYtd || 0) + profit;
  const rate = small ? TAX.cit.smallRate : TAX.cit.rate;
  const gh = citHook ? citHook(s, p, profit, q, t) : null; // 集团各子公司分开算 / 高新 15%（第 3-06 项 core/group.js）
  const cit = gh ? gh.cit : Math.max(0, profit) * rate;
  const label = `第${Math.floor(q / 4) + 1}年第${(q % 4) + 1}季度`;
  s.citPaidYtd = (s.citPaidYtd || 0) + cit; // 年度汇算时跟全年应纳的比（第 2-15 项 core/fiscal.js）
  if (cit >= 0.01) settle(s, { kind: '企业所得税', label, base: profit, rate, amount: cit, note: gh ? `${gh.note}${label}` : `企业所得税（${small ? '小型微利 5%' : '25%'}）${label}` }, t);
  s.qtr = {};
  return { profit, cit, small };
}
/** 交一笔（有人管就交、没人管进待申报）：年度汇算补缴用 */
export const settleItem = (s, item, t) => settle(s, item, t);
export function yearEnd(s) { s.lastYear = s.yearAcc; s.yearAcc = {}; s.citYtd = 0; }

/** 实收资本：老档没有 s.paidIn 的，按开局注资（第一家店的开店费）算 */
export function paidIn(s) {
  if (typeof s.paidIn === 'number') return s.paidIn;
  const st = (s.ledger || []).filter((e) => e.wallet === 'company' && e.cat === 'capital').reduce((a, e) => a + (e.amount || 0), 0);
  return st;
}
/** 个人能动的现金（扣掉冻结中的） */
export const freeCash = (s) => Math.max(0, Math.floor((s.cash || 0) - (s.freezes || []).reduce((a, f) => a + f.amount, 0)));
/** 注资到公司（设计28 第零节）：个人现金 → 公司账户，不交税，记实收资本，出《增资确认书》 */
export function inject(s, amount, t) {
  amount = Math.floor(amount);
  if (!(amount > 0)) return { ok: false, why: '金额不对' };
  if (!canPay(s, 'personal', amount)) return { ok: false, why: '个人现金不够（冻结中的钱不能用）' };
  const before = paidIn(s);
  pay(s, { wallet: 'personal', cat: 'capital_out', amount, party: s.companyName || '公司', note: '注资到公司' }, t);
  receive(s, { wallet: 'company', cat: 'capital', amount, party: s.bossName || '老板', note: '老板注资' }, t);
  s.paidIn = before + amount;
  const ct = addContract(s, { prefix: 'ZZ', kind: 'capital', title: '增资确认书', parties: [['股东', s.bossName || '老板'], ['公司', s.companyName || '公司']], subject: `股东以货币增资，持股 100% 不变`, rows: [['本次增资', amount, '货币出资，已到公司账户'], ['增资前实收资本', before, ''], ['增资后实收资本', s.paidIn, '']], total: amount, wallet: 'personal' }, t);
  return { ok: true, paidIn: s.paidIn, no: ct.no };
}
/** 分红到个人：公司账户出 amount，代扣 20% 个税，到手 80% */
export function dividend(s, amount, t) {
  amount = Math.floor(amount);
  if (!(amount > 0)) return { ok: false, why: '金额不对' };
  if (!canPay(s, 'company', amount)) return { ok: false, why: '公司账户不够' };
  if (s.company - ((s.bank && s.bank.restricted) || 0) < amount) return { ok: false, why: '公司账户里有贷款资金，专款专用，不能拿来分红' };
  const tax = Math.round(amount * TAX.dividendIIT * 100) / 100;
  pay(s, { wallet: 'company', cat: 'dividend_out', amount, party: '老板', note: '分红给老板（税前）' }, t);
  s.taxSeq = (s.taxSeq || 0) + 1; const cert = `完税-${String(s.taxSeq).padStart(5, '0')}`;
  (s.taxes = s.taxes || []).push({ id: s.taxSeq, t, kind: '分红个税', period: '', base: amount, rate: TAX.dividendIIT, amount: tax, payer: 'personal', cert });
  receive(s, { wallet: 'personal', cat: 'dividend', amount: amount - tax, tax, party: s.companyName || '公司', ref: cert, note: `分红 ${amount}（代扣个税 20%）` }, t);
  return { ok: true, net: amount - tax, tax };
}
