// 物流（设计20 第二节 2）：规模制产业 + 车队（公司资产、购置税、4 年折旧）+ 双十一 + 联动（便利店、服装进货 −2%）
// 不 import economy（economy 用这里的收入、车队价值）
import L from '../config/logistics.json?v=b846574c' with { type: 'json' };
import { ECO, SOCIAL } from './calib.js?v=b846574c';
import PAY from '../config/payroll.json?v=b846574c' with { type: 'json' };
import { IND_BY_ID } from '../config/industries.js?v=b846574c';
import { pay } from './ledger.js?v=b846574c';
import { payTaxItem } from './companytax.js?v=b846574c';
import { estTotal, onDuty, onDutyRole, wage, lookOf } from './staff.js?v=b846574c';
import { MONTH_MS, YEAR_MS, monthIndex, gameDate } from './gametime.js?v=b846574c';
import { addMsg } from './inbox.js?v=b846574c';
import { holder, isSec, postMeta } from './posts.js?v=b846574c';
export { L as LOGI_CFG };

const r2 = (x) => Math.round(x * 100) / 100;
const MONTH_SEC = MONTH_MS / 1000;
export const logi = (s) => (s.logi = s.logi || { lots: [], depMonth: null, d11: null, d11Told: null });

/** 游戏里人均月营收（真实经济，设计21）：(profitMul × 真实人均营收 × 真实净利率 + 人均工资社保 + 场地 + 车辆折旧) ÷ (1 − 进货 − 增值税) */
export function revPerHeadGame(look) {
  const tpl = PAY.staffing.logistics[look]; let n = 0, w = 0; for (const [r, k] of Object.entries(tpl)) { n += k; w += k * PAY.roles[r].wage; }
  const K = L.fleet.kinds[L.fleet.byLook[look]]; const dep = K.price / L.fleet.vatDiv * (1 + L.fleet.purchaseTax) / (L.fleet.headsPerUnit * K.units) / (L.fleet.years * 12);
  return (ECO.profitMul * L.revPerHead * L.realMargin + w / n * (1 + SOCIAL) + L.rentPerHead + dep) / (1 - IND_BY_ID.logistics.cogs - L.calibVat);
}
/** 满编时每秒营业收入（不含缺编、缺车、双十一） */
export const baseRevPerSec = (s) => (s.inds.logistics ? estTotal(s, 'logistics') * revPerHeadGame(lookOf(s, 'logistics')) / MONTH_SEC : 0);
/** 车：有多少、要多少（按「运力单位」：厢式货车 1、重卡 3） */
export const fleetUnits = (s) => logi(s).lots.reduce((a, x) => a + x.n * L.fleet.kinds[x.kind].units, 0);
export const fleetNeed = (s) => (s.inds.logistics ? Math.ceil(estTotal(s, 'logistics') / L.fleet.headsPerUnit) : 0);
export const fleetFactor = (s) => { const n = fleetNeed(s); return n ? Math.min(1, fleetUnits(s) / n) : 1; };
/** 现在这个样子该买哪种车、补齐要几辆、多少钱（含购置税） */
export function fleetGap(s) {
  const kind = L.fleet.byLook[lookOf(s, 'logistics')] || 'truck'; const K = L.fleet.kinds[kind];
  const n = Math.max(0, Math.ceil((fleetNeed(s) - fleetUnits(s)) / K.units));
  const ex = K.price / L.fleet.vatDiv; const tax = ex * L.fleet.purchaseTax;
  return { kind, name: K.name, n, price: K.price, cost: r2(n * (K.price + tax)), tax: r2(n * tax) };
}
/** 买车：车价（含 13% 增值税，进项抵扣）+ 购置税 10%；公司资产，按 4 年折旧 */
export function buyFleet(s, n, t, by = '') {
  const g = fleetGap(s); n = n ?? g.n; if (!(n > 0)) return { ok: false, why: '车够了' };
  const K = L.fleet.kinds[g.kind]; const price = n * K.price; const ex = price / L.fleet.vatDiv; const tax = r2(ex * L.fleet.purchaseTax);
  if (!pay(s, { wallet: 'company', cat: 'fleet', amount: price, party: '汽车经销商', by, note: `物流 买${K.name} ${n} 辆（含增值税 13%）` }, t)) return { ok: false, why: '公司账户不够' };
  payTaxItem(s, { kind: '车辆购置税', label: K.name, base: ex, rate: L.fleet.purchaseTax, amount: tax, note: `${K.name} ${n} 辆 车辆购置税 10%` }, t, by);
  s.period = s.period || {}; s.period.inputExtra = (s.period.inputExtra || 0) + ex * L.fleet.inputVat; // 进项抵扣
  logi(s).lots.push({ kind: g.kind, n, cost: r2(ex + tax), t, dep: 0 }); // 入账价值 = 不含税价 + 购置税
  return { ok: true, n, cost: r2(price + tax) };
}
/** 车队账面价值（原值 − 累计折旧），算进身价 */
export const fleetValue = (s) => (s.logi ? s.logi.lots.reduce((a, x) => a + x.cost - x.dep, 0) : 0);

/** 双十一：每游戏年 11 月 11 日一整天，件量 ×3；人要 ×2 才接得住，不够就爆仓 */
export const isD11 = (s, t) => { const d = gameDate(s, t); return d.month === L.d11.month && d.day === L.d11.day; };
export function d11Mult(s) {
  const X = logi(s); const x = X.d11;
  if (!x || !x.on) return complainMult(s);
  const cap = Math.min(1, onDuty(s, 'logistics') / (estTotal(s, 'logistics') * L.d11.staffNeed));
  return L.d11.mult * cap;
}
/** 双十一爆仓以后的投诉：之后 complainMonths 个游戏月件量 −complainCut（时间用 tickLogi 记下的 lastT） */
export const complaining = (s) => { const X = logi(s); return !!(X.complain && (X.lastT || 0) < X.complain.until); };
export const complainMult = (s) => (complaining(s) ? 1 - L.d11.complainCut : 1);
/** 物流每秒营业收入：满编收入 × 在岗 / 编制（staffFactor 在 economy 里乘）× 车 × 双十一 */
export const logiRevPerSec = (s) => baseRevPerSec(s) * fleetFactor(s) * d11Mult(s);
/** 联动：有物流以后便利店、服装进货 −2% */
export const linkCogsMult = (s, id) => (s.inds && s.inds.logistics && L.linkCogs.inds.includes(id) ? 1 - L.linkCogs.cut : 1);

/** 每秒 / 离线：折旧（每个游戏月）、双十一开始结束和提醒、经理补车 */
export function tickLogi(s, t) {
  if (!s.inds.logistics) return [];
  const X = logi(s); const ev = []; const m = monthIndex(s, t); X.lastT = t;
  if (X.depMonth == null) X.depMonth = m;
  while (X.depMonth < m) { // 月底折旧：进本月利润（所得税前扣），流水记一条备忘
    X.depMonth += 1; let dep = 0;
    for (const lot of X.lots) { const d = Math.min(lot.cost - lot.dep, lot.cost / (L.fleet.years * 12)); lot.dep += d; dep += d; }
    if (dep >= 0.01) { s.period = s.period || {}; s.period.other = (s.period.other || 0) + dep; pay(s, { wallet: 'company', cat: 'depreciation', amount: r2(dep), memo: true, note: `物流 车队折旧（4 年直线）` }, s.createdAt + X.depMonth * MONTH_MS); }
  }
  const d = gameDate(s, t); const y = d.year;
  if (d.month === L.d11.month && d.day === L.d11.day - L.d11.noticeDays && X.d11Told !== y) {
    X.d11Told = y; const short = Math.max(0, estTotal(s, 'logistics') * L.d11.staffNeed - onDuty(s, 'logistics'));
    addMsg(s, { kind: 'system', type: 'd11', title: '双十一明天开始', body: `件量会翻 3 倍，一整个游戏日。要接住得有平时 2 倍的人，现在还差 ${short} 人 —— 劳务派遣马上到岗（公司 → 产业 → 物流 → 招聘）。` }, t);
    ev.push('双十一明天开始，记得补人');
  }
  const on = isD11(s, t);
  if (on && !(X.d11 && X.d11.on)) { X.d11 = { on: true, year: y, start: t }; ev.push('双十一开始了！件量 ×3'); }
  if (!on && X.d11 && X.d11.on) {
    const cap = Math.min(1, onDuty(s, 'logistics') / (estTotal(s, 'logistics') * L.d11.staffNeed));
    // 快递员计件：多出来的件按日薪折算多发
    const extra = r2(onDutyRole(s, 'logistics', 'courier') * wage('courier') / 30 * (L.d11.mult * cap - 1));
    if (extra > 0) pay(s, { wallet: 'company', cat: 'payroll', amount: extra, force: true, note: '物流 双十一快递员计件工资' }, t);
    X.d11 = { on: false, year: y, cap };
    if (cap < 1) X.complain = { from: t, until: t + L.d11.complainMonths * MONTH_MS, year: y };
    addMsg(s, { kind: 'system', type: 'd11', title: cap < 1 ? '双十一爆仓了' : '双十一顺利结束', body: cap < 1 ? `人手只够接 ${Math.round(cap * 100)}% 的件，积压、投诉，少收了不少钱。客户投诉、商家转单，之后 ${L.d11.complainMonths} 个月件量 −${Math.round(L.d11.complainCut * 100)}%。明年提前用劳务派遣补人。` : `件量 ×${L.d11.mult} 都接住了，快递员多发计件工资 ${Math.round(extra)} 元。` }, t);
    ev.push(cap < 1 ? '双十一爆仓了' : '双十一顺利结束');
  }
  // 物流经理：缺车自动补（不超过授权额度和可用的钱交给界面判断，这里只看授权）
  const mgr = holder(s, 'manager_logistics');
  if (mgr && fleetFactor(s) < 1 && (!X.lastAuto || t - X.lastAuto > 60e3)) {
    X.lastAuto = t; const g = fleetGap(s);
    if (g.cost <= postMeta(s, 'manager_logistics').auth && s.company - g.cost > 0) { const r = buyFleet(s, g.n, t, isSec(mgr) ? mgr : ''); if (r.ok) ev.push(`经理补了 ${g.n} 辆${g.name}`); }
  }
  return ev;
}
