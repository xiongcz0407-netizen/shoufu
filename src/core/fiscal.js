// 财务补全（第 2-15 项，设计15 V0.2 + 设计17 V0.2）：年度汇算清缴、欠税滞纳金和征信、一般纳税人进项抵扣（房租、杂费、装修设备）、
// 个人纳税记录（股票、基金、进口、境外所得……）、财务总监报税台词、销售提成、员工满意度、家族办公室
import CFG from '../config/fiscal.json?v=451b6719' with { type: 'json' };
import { TAX } from './companytax.js?v=451b6719';
import { pay, receive } from './ledger.js?v=451b6719';
import { holder, isSec } from './posts.js?v=451b6719';
import { addMsg } from './inbox.js?v=451b6719';
import { MONTH_MS, YEAR_MS } from './gametime.js?v=451b6719';
import { SEC_BY_ID } from '../config/secretaries.js?v=451b6719';
import { IND_BY_ID } from '../config/industries.js?v=451b6719';

export const FICFG = CFG;
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (n) => (Math.abs(n) >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : Math.abs(n) >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);

// ---------- 纳税记录（完税凭证）：个人也记 ----------
/** 记一条纳税记录：kind 税种、base 计税依据、rate 税率、amount、payer personal / company */
export function taxRec(s, { kind, base = 0, rate = '', amount, payer = 'personal', period = '', t = Date.now() }) {
  if (!(amount >= 0.01)) return null;
  s.taxSeq = (s.taxSeq || 0) + 1; const cert = `完税-${String(s.taxSeq).padStart(5, '0')}`;
  (s.taxes = s.taxes || []).push({ id: s.taxSeq, t, kind, period, base: r2(base), rate, amount: r2(amount), payer, cert });
  if (s.taxes.length > 800) s.taxes.shift();
  return cert;
}

// ---------- 一般纳税人进项抵扣 ----------
/** 这个月能抵的进项（房租 9%、水电杂费 6%、装修设备 13%；进货在 companytax 里按 13% 算）。价款都是含税的 */
export function inputExtra(s, from, to) {
  const p = s.period || {}; const I = CFG.input;
  const rent = (p.rent || 0) / (1 + I.rent) * I.rent;
  const other = (p.other || 0) / (1 + I.opex) * I.opex;
  const capex = (s.ledger || []).filter((r) => r.cat === 'expand' && r.t >= from && r.t <= to).reduce((a, r) => a + r.amount, 0) / (1 + I.capex) * I.capex;
  return { rent: r2(rent), other: r2(other), capex: r2(capex), total: r2(rent + other + capex) };
}

// ---------- 销售提成（单独算，设计17：销售、置业顾问底薪 + 提成）----------
export function commission(s, from, end) {
  let total = 0; const lines = [];
  for (const [id, rate] of Object.entries(CFG.commission.rates)) {
    if (!s.inds[id] || !IND_BY_ID[id]) continue; const nm = IND_BY_ID[id].name;
    const rev = (s.ledger || []).filter((r) => r.wallet === 'company' && r.dir === 'in' && ['revenue', 'presale'].includes(r.cat) && r.t > from && r.t <= end && (r.note || '').startsWith(nm)).reduce((x, r) => x + r.amount, 0);
    const amt = r2(rev * rate); if (amt < 0.01) continue;
    pay(s, { wallet: 'company', cat: 'commission', amount: amt, force: true, note: `${nm}销售提成（本月营收 ${fmt(rev)} × ${(rate * 100).toFixed(1)}%）` }, end);
    total += amt; lines.push([id, amt]);
  }
  if (total) { s.period = s.period || {}; s.period.labor = (s.period.labor || 0) + total; }   // 算进本月人工（所得税前扣）
  return { total, lines };
}

// ---------- 员工满意度（0～100）----------
/** 年终奖、福利、拖欠、店长管理 → 满意度；满意度影响流失率 */
export function satisfaction(s, mgmt = 0) {
  const S = CFG.satisfaction; const pr = s.payroll || {};
  let v = S.base;
  const bm = pr.bonusMonths != null ? pr.bonusMonths : 1; v += S.bonus[Math.min(3, Math.max(0, Math.round(bm)))] || 0;
  v += S.welfare[welfareLevel(s)] || 0;
  if (pr.arrears) v += S.arrears * pr.arrears;
  v += Math.min(S.mgmtMax, mgmt * S.mgmtK);
  return Math.max(0, Math.min(100, Math.round(v)));
}
/** 流失率倍数：满意度 50 → 1；100 → 0.7；0 → 1.3 */
export const turnoverMult = (sat) => 1 + (50 - sat) / 50 * CFG.satisfaction.turnoverSwing;
export const welfareLevel = (s) => Math.min(CFG.satisfaction.welfareCost.length - 1, Math.max(0, (s.payroll && s.payroll.welfare) || 0));
export function setWelfare(s, lv) { s.payroll = s.payroll || { arrears: 0, owed: 0 }; s.payroll.welfare = Math.max(0, Math.min(CFG.satisfaction.welfareCost.length - 1, lv)); return { ok: true }; }
/** 月底发福利（每人每月） */
export function payWelfare(s, staff, end) {
  const per = CFG.satisfaction.welfareCost[welfareLevel(s)]; if (!per || !staff) return 0;
  const amt = r2(per * staff); pay(s, { wallet: 'company', cat: 'welfare', amount: amt, force: true, note: `员工福利（每人每月 ${per} 元，${staff} 人）` }, end);
  s.period.other = (s.period.other || 0) + amt; return amt;
}

// ---------- 家族办公室：资产管家、投资经理、收藏顾问的工资和提成改由个人出 ----------
export const familyOffice = (s) => !!(s.family && s.family.on);
export const FO_POSTS = CFG.familyOffice.posts;
/** 这个秘书的工资谁发：家族办公室开着、她在资产管家 / 投资经理 / 收藏顾问 → 个人 */
export function payerOfSec(s, id) {
  if (!familyOffice(s)) return 'company';
  for (const k of FO_POSTS) if ((s.positions || {})[k] === id) return 'personal';
  return 'company';
}
/** 资产类职位的提成谁出 */
export const payerOfPost = (s, key) => (familyOffice(s) && FO_POSTS.includes(key) ? 'personal' : 'company');
export function openFamilyOffice(s, t) {
  const F = CFG.familyOffice; if (familyOffice(s)) return { ok: false, why: '已经成立了' };
  if ((s.title || 0) < F.title) return { ok: false, why: `称号要「${['打工人', '小老板', '老板', '企业家'][F.title]}」` };
  if (!pay(s, { wallet: 'personal', cat: 'family_office', amount: F.setupFee, party: '律师事务所', note: '成立家族办公室（注册、章程、律师费）' }, t)) return { ok: false, why: `个人现金不够 ${fmt(F.setupFee)}` };
  s.family = { on: true, at: t }; return { ok: true };
}
export function closeFamilyOffice(s) { if (s.family) s.family.on = false; return { ok: true }; }

// ---------- 欠税：公司账户交税交成负数 = 欠税，按日 0.05% 滞纳金；连续 3 个月影响征信 ----------
export function arrears(s, end, bankRef) {
  const owe = s.company < 0 ? -s.company : 0; const A = (s.taxArrears = s.taxArrears || { streak: 0 });
  if (owe <= 0.01) { A.streak = 0; return null; }
  const fee = r2(owe * TAX.lateDailyRate * 30);
  const cert = taxRec(s, { kind: '欠税滞纳金', base: owe, rate: TAX.lateDailyRate, amount: fee, payer: 'company', t: end });
  pay(s, { wallet: 'company', cat: 'tax_company', amount: fee, force: true, party: '税务局', ref: cert, note: `欠税滞纳金（欠 ${fmt(owe)}，按日 0.05%，一个月 30 天）` }, end);
  A.streak += 1; let credit = false;
  if (A.streak >= CFG.arrearsCreditAfter && bankRef) { const X = bankRef(s); const order = ['good', 'normal', 'bad']; const i = order.indexOf(X.credit); if (i >= 0 && i < 2) { X.credit = order[i + 1]; credit = true; } }
  return { owe, fee, streak: A.streak, credit };
}

// ---------- 企业所得税年度汇算清缴 ----------
/** 年底：全年应纳税所得额按年判断小型微利（≤ 300 万 5%，否则 25%），跟四个季度预缴的比，多退少补 */
/** 第 3-06 项：集团按子公司算全年应纳 fn(s, t) → { due, small, rate } 或 null */
let annualHook = null; export const setAnnualHook = (fn) => { annualHook = fn; };
export function annualCit(s, y, end, settle) {
  const profit = s.citYtd || 0; const G = annualHook ? annualHook(s, end) : null; const small = G ? G.small : profit <= TAX.cit.smallLimitYear;
  const rate = G ? G.rate : small ? TAX.cit.smallRate : TAX.cit.rate; const due = G ? G.due : r2(Math.max(0, profit) * rate); const prepaid = r2(s.citPaidYtd || 0);
  const diff = r2(due - prepaid); const label = `第${y + 1}年`;
  if (diff >= 0.01) settle(s, { kind: '企业所得税（汇算补缴）', label, base: profit, rate, amount: diff, note: `企业所得税年度汇算清缴 ${label}：全年应纳 ${fmt(due)}，已预缴 ${fmt(prepaid)}，补缴` }, end);
  else if (diff <= -0.01) {
    const cert = taxRec(s, { kind: '企业所得税（汇算退税）', base: profit, rate, amount: -diff, payer: 'company', period: label, t: end });
    receive(s, { wallet: 'company', cat: 'tax_refund', amount: -diff, party: '税务局', ref: cert, note: `企业所得税年度汇算清缴 ${label}：多预缴了，退税` }, end);
  }
  s.citPaidYtd = 0;
  return { profit, due, prepaid, diff, small };
}
/** 年度个人纳税汇总（分类所得：分红、财产转让、租金、股票分红、境外所得、买东西的税） */
export function personalYear(s, from, to) {
  const list = (s.taxes || []).filter((x) => x.payer === 'personal' && x.t >= from && x.t < to); const kinds = {};
  for (const x of list) kinds[x.kind] = (kinds[x.kind] || 0) + x.amount;
  return { total: r2(list.reduce((a, x) => a + x.amount, 0)), kinds: Object.entries(kinds).sort((a, b) => b[1] - a[1]) };
}

// ---------- 财务总监报税台词（按性格） ----------
export function cfoLine(s, vat, cit) {
  const who = holder(s, 'cfo'); if (!isSec(who)) return null; const c = SEC_BY_ID[who];
  const what = `${vat >= 0.01 ? `增值税和附加 ${fmt(vat)}` : '增值税零申报'}${cit ? `，企业所得税 ${fmt(cit)}` : ''}`;
  const L = CFG.cfoLines[c.type] || CFG.cfoLines['知性'];
  return { who, text: L.replace('{what}', what) };
}

/** 月底（company.js 在算增值税之前叫）：销售提成、员工福利、进项抵扣 */
export function monthBefore(s, m, end, { staff = 0 } = {}) {
  const from = s.createdAt + m * MONTH_MS;
  const c = commission(s, from, end); const w = payWelfare(s, staff, end); const inp = inputExtra(s, from, end);
  s.period = s.period || {}; s.period.inputExtra = (s.period.inputExtra || 0) + inp.total; s.period.inputDetail = inp;
  return { commission: c.total, welfare: w, input: inp };
}
/** 月底（算完增值税之后）：欠税、财务总监报税台词 */
export function monthAfter(s, m, end, tx, bankRef) {
  const a = arrears(s, end, bankRef);
  if (a) addMsg(s, { kind: 'system', type: 'tax', title: `欠税 ${fmt(a.owe)}：滞纳金 ${fmt(a.fee)}`, body: `公司账户交税交成了负数，按日 0.05% 收滞纳金。已经连续 ${a.streak} 个月${a.credit ? '，征信降了一档（贷款利率变高）' : `；连续 ${CFG.arrearsCreditAfter} 个月会影响征信`}。` }, end);
  const line = cfoLine(s, (tx.vat || 0) + (tx.surcharge || 0), 0);
  if (line && !(s.flags && s.flags.quietCfo)) addMsg(s, { kind: 'report', type: 'cfo_tax', from: line.who, title: `${SEC_BY_ID[line.who].name}：本月报税`, body: line.text }, end);
  return a;
}
