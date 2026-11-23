// 权责发生制（验收第六节第 2 次 #1）：工资社保、房租每秒按天数计提成「应付」（流水只记备忘，不动余额），月底再实际付；
// 增值税 + 附加按本月营收、企业所得税按本季利润估着记应付。公司账户「可用」= 余额 − 应付；身价减掉应付
import { IND_BY_ID } from '../config/industries.js?v=f10d7ba9';
import { monthlyLabor, lookOf, estTotal } from './staff.js?v=f10d7ba9';
import { lineK } from './cities.js?v=f10d7ba9';
import { vatOf, TAX } from './companytax.js?v=f10d7ba9';
import { MONTH_MS, monthIndex } from './gametime.js?v=f10d7ba9';
import { post } from './ledger.js?v=f10d7ba9';
import { storeOther } from './calib.js?v=f10d7ba9';
import * as CT from './companytax.js?v=f10d7ba9';

const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
export const DAY_MS = MONTH_MS / 30; // 游戏一天
/** V2-08 选址（开发2，core/sites.js 挂进来）：门店房租按铺位的租金系数 */
let rentHook = () => 1; export const setRentHook = (f) => { rentHook = f; };
export function monthlyRent(s) { let r = 0; for (const id of Object.keys(s.inds)) r += (IND_BY_ID[id].rentPerHead ? IND_BY_ID[id].rentPerHead * estTotal(s, id) : IND_BY_ID[id].rent[lookOf(s, id)] * s.inds[id].branches * rentHook(s, id)) * lineK(s, id); return r; } // 物流按人头算场地；都乘城市系数 // 物流按人头算场地
/** 门店其他经营费用（水电物业、营销、杂费；设计21）：每家店按样子 × 城市系数 */
export function monthlyOpex(s) { let r = 0; for (const id of Object.keys(s.inds)) { const c = IND_BY_ID[id]; if (c.retail) r += storeOther(c, s.inds[id].level) * s.inds[id].branches * lineK(s, id); } return r; }
const acc = (s) => { const a = (s.accr = s.accr || { labor: 0, rent: 0, other: 0, t: null, posted: 0, day: null }); if (a.other == null) a.other = 0; return a; };

/** 计提到 t：只算到这一笔所在那个月的月底（月结时清零重来） */
export function accruePayables(s, t) {
  const a = acc(s);
  if (a.t == null) a.t = s.createdAt + monthIndex(s, Math.max(s.createdAt, t - 1)) * MONTH_MS; // 旧存档：从这个月月初补
  if (a.day == null) a.day = Math.floor((a.t - s.createdAt) / DAY_MS);
  const end = s.createdAt + (monthIndex(s, a.t) + 1) * MONTH_MS;
  const to = Math.min(t, end);
  if (to > a.t) {
    const f = (to - a.t) / MONTH_MS;
    a.labor += monthlyLabor(s).total * f; a.rent += monthlyRent(s) * f; a.other += monthlyOpex(s) * f; a.t = to;
  }
  // 每个游戏日记一条备忘（应付增加多少），不动余额
  const day = Math.floor((a.t - s.createdAt) / DAY_MS);
  if (day !== a.day) { a.day = day; postMemo(s, a.t); }
}
function postMemo(s, t) {
  const a = acc(s); const p = payables(s); const cur = p.labor + p.rent + p.other + p.vat + p.surcharge + p.cit;
  const d = cur - (a.posted || 0);
  if (d >= 0.01) post(s, { wallet: 'company', dir: 'out', cat: 'accrued', amount: d, memo: true, note: `计提应付：工资社保 ${Math.round(p.labor)}、房租 ${Math.round(p.rent)}、水电杂费 ${Math.round(p.other)}、税 ${Math.round(p.vat + p.surcharge + p.cit)}（月底 / 季底实际付）` }, t);
  a.posted = cur;
}

/** 企业所得税估算：本季到现在的利润（含本月计提的人工房租和附加） */
function citEstimate(s, surcharge) {
  const q = s.qtr || {}; const a = acc(s);
  const profit = sum(q.rev) - sum(q.cogs) - (q.labor || 0) - (q.rent || 0) - (q.surcharge || 0) - (q.other || 0) - a.labor - a.rent - a.other - surcharge;
  const small = CT.citSmall(s, profit);
  return Math.max(0, profit) * (small ? TAX.cit.smallRate : TAX.cit.rate);
}
/** 应付明细：{ labor, rent, vat, surcharge, cit, owed（拖欠工资）, total } */
export function payables(s) {
  const a = acc(s); const v = vatOf(s);
  const cit = citEstimate(s, v.surcharge);
  const owed = (s.payroll && s.payroll.owed) || 0;
  const due = CT.dueTotal(s); // 没申报的税
  const total = a.labor + a.rent + a.other + v.vat + v.surcharge + cit + owed + due;
  return { labor: a.labor, rent: a.rent, other: a.other, vat: v.vat, surcharge: v.surcharge, cit, owed, due, total };
}
/** 公司账户可用 = 余额 − 应付 */
export const available = (s) => (s.company || 0) - payables(s).total;

/** 月结用：拿走本月计提的人工、房租，清零（下个月从 end 开始） */
export function takeMonth(s, end) {
  accruePayables(s, end);
  const a = acc(s); const out = { labor: a.labor, rent: a.rent, other: a.other };
  s.accr = { labor: 0, rent: 0, other: 0, t: end, posted: 0, day: Math.floor((end - s.createdAt) / DAY_MS) };
  return out;
}

/** 分红：最多分「可用」的 */
export function payDividend(s, amount, t) {
  if (amount > Math.floor(available(s)) + 0.5) return { ok: false, why: '超过可用的钱（要留着发工资、交房租和税）' };
  return CT.dividend(s, amount, t);
}
/** 注资到公司（个人 → 公司，不交税） */
export const injectCapital = (s, amount, t) => CT.inject(s, amount, t);
