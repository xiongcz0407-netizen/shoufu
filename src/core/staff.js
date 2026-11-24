// 员工（设计17 第一节）：只是数字。按产业线 → 岗位记在岗人数；编制跟门店样子走
import PAY from '../config/payroll.json?v=d17576a6' with { type: 'json' };
import ECO from '../config/economy.json?v=d17576a6' with { type: 'json' };
import { IND_BY_ID } from '../config/industries.js?v=d17576a6';
import { pay, canPay, canPayMust, post } from './ledger.js?v=d17576a6';
import { YEAR_MS } from './gametime.js?v=d17576a6';
import { salaryOf, isSec } from './posts.js?v=d17576a6';
import { lineK } from './cities.js?v=d17576a6';
import { payerOfSec, satisfaction, turnoverMult } from './fiscal.js?v=d17576a6';
export { PAY };

const look = (ind) => { const c = IND_BY_ID[ind.id]; let i = 0; c.looks.forEach((lv, k) => { if (ind.level >= lv) i = k; }); return i; };
export const lookOf = (s, id) => look({ ...s.inds[id], id });
export const wage = (role) => PAY.roles[role].wage;
const sumv = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);

function line(s, id) { const x = s.inds[id]; x.staff = x.staff || {}; x.agency = x.agency || {}; return x; }
/** 编制：{ role: 人数 }（每家店 × 分店数） */
export function establishment(s, id) {
  const x = s.inds[id]; const tpl = PAY.staffing[id][lookOf(s, id)]; const out = {};
  const k = IND_BY_ID[id].kind === 'scale' ? x.level : 1; // 物流：每升一级多一份人（件量跟着人走）
  const own = ownerRun(s, id) ? PAY.staffing[id][0] : {}; // 第一家小店老板自己看（设计21 第四节）：少招一家小店的人
  for (const [r, n] of Object.entries(tpl)) { const v = n * x.branches * k - (own[r] || 0); if (v > 0) out[r] = v; }
  return out;
}
/** 老板自己看第一家店：开局那条线、小老板为止（economy.json start） */
/** 招聘面板能选的岗位（编制里有的）；第一家小店老板自己看时是空的（V0.2 修：开局点招聘空白） */
export const hireRoles = (s, id) => (s.inds[id] ? Object.keys(establishment(s, id)).filter((r) => PAY.roles[r]) : []);
export const OWNER_RUN_TEXT = '这家店现在你自己看着（开局到小老板为止，不用付自己工资），不缺人。开新的产业线、开分店或升级门店以后再来招人。';
export const ownerRun = (s, id) => id === ECO.start.firstStore && s.title <= ECO.start.ownerRunMaxTitle && !!s.inds[id] && s.inds[id].branches >= 1;
export const estTotal = (s, id) => sumv(establishment(s, id));
export const onDuty = (s, id) => { const x = line(s, id); return sumv(x.staff) + sumv(x.agency); };
export const onDutyRole = (s, id, r) => { const x = line(s, id); return (x.staff[r] || 0) + (x.agency[r] || 0); };
export const storeStaff = (s) => Object.keys(s.inds).reduce((a, id) => a + onDuty(s, id), 0);
export const hqStaff = (s) => { const n = storeStaff(s); return n >= PAY.hqFromStaff ? Math.max(1, Math.ceil(n * PAY.hqRate)) : 0; };
export const totalStaff = (s) => storeStaff(s) + hqStaff(s);
/** 拖欠工资两个月以上，门店停业 */
export const closedByArrears = (s) => (s.payroll && s.payroll.arrears >= 2);
/** 收入系数：在岗 / 编制（最多 1）；缺编超过一半停业 */
export function staffFactor(s, id) {
  if (closedByArrears(s)) return 0;
  if (s._fullStaff) return 1; /* V0.2.5 升级框算「升完人招满以后」的营业额 */
  const e = estTotal(s, id); if (!e) return 1;
  const r = Math.min(1, onDuty(s, id) / e);
  return r < PAY.understaffClose ? 0 : r;
}
/** 开局 / 刚解锁的产业线：按编制招满 */
export function staffUp(s, id) { const x = line(s, id); for (const [r, n] of Object.entries(establishment(s, id))) x.staff[r] = Math.max(x.staff[r] || 0, n); }
export const shortage = (s, id) => { const e = establishment(s, id); const o = {}; for (const [r, n] of Object.entries(e)) { const d = n - onDutyRole(s, id, r); if (d > 0) o[r] = d; } return o; };

/** 招聘渠道费用 */
export function hireCost(channel, role, n) {
  const c = PAY.channels[channel]; const w = wage(role);
  if (channel === 'web') return Math.round(w * c.costMonths * n);
  if (channel === 'hunter') return Math.round(w * 12 * c.costYearRate * n);
  return 0;
}
export function whyNotHire(s, id, role, n, channel) {
  const c = PAY.channels[channel];
  if (!s.inds[id] || !PAY.roles[role] || !(n > 0)) return '不对';
  if (c.roles && !c.roles.includes(role)) return '猎头只招店长、主管、总部';
  if (!canPay(s, 'company', hireCost(channel, role, n))) return '公司账户不够';
  return null;
}
/** 招人：劳务派遣立刻到；打工人阶段任何渠道都立刻到；别的等 min～max 分钟 */
export function hire(s, id, role, n, channel, t, rnd = Math.random, by = '') {
  const why = whyNotHire(s, id, role, n, channel); if (why) return { ok: false, why };
  const c = PAY.channels[channel]; const cost = hireCost(channel, role, n);
  if (cost) pay(s, { wallet: 'company', cat: 'recruit', amount: cost, by, note: `${IND_BY_ID[id].name}招${PAY.roles[role].name} ${n} 人（${c.name}）` }, t);
  if (channel === 'agency') { line(s, id).agency[role] = (line(s, id).agency[role] || 0) + n; return { ok: true, at: t }; }
  { line(s, id).staff[role] = (line(s, id).staff[role] || 0) + n; return { ok: true, at: t }; } /* V0.2.3（设计35 第十一节）：任何渠道都立刻到岗，钱照各渠道收 */
  let mins = c.minMin + rnd() * (c.maxMin - c.minMin);
  const at = t + mins * 60e3;
  s.hireSeq = (s.hireSeq || 0) + 1; (s.hires = s.hires || []).push({ id: s.hireSeq, ind: id, role, n, at, channel, t0: t });
  return { ok: true, at };
}
/** V0.2.2 一键补满：打工人阶段默认贴招聘（免费、立刻到），以后劳务派遣 */
export const fillChannel = (s) => ((s.title || 0) ? 'agency' : 'door');
export const needTotal = (s, id) => Math.max(0, Object.values(shortage(s, id)).reduce((a, n) => a + n, 0) - pendingHires(s, id));
export function fillUp(s, id, t, channel = fillChannel(s), rnd = Math.random) {
  const sh = shortage(s, id); const pend = {}; for (const h of s.hires || []) if (h.ind === id) pend[h.role] = (pend[h.role] || 0) + h.n;
  const todo = Object.entries(sh).map(([r, n]) => [r, n - (pend[r] || 0)]).filter(([r, n]) => n > 0 && !(PAY.channels[channel].roles && !PAY.channels[channel].roles.includes(r)));
  if (!todo.length) return { ok: false, why: '不缺人' };
  const cost = todo.reduce((a, [r, n]) => a + hireCost(channel, r, n), 0); if (!canPayMust(s, 'company', cost)) return { ok: false, why: '公司账户不够' };
  let n = 0; for (const [r, k] of todo) if (hire(s, id, r, k, channel, t, rnd).ok) n += k;
  return { ok: n > 0, n, cost, channel };
}
export function processHires(s, t) {
  const arrived = [];
  s.hires = (s.hires || []).filter((h) => { if (h.at > t) return true; const x = line(s, h.ind); x.staff[h.role] = (x.staff[h.role] || 0) + h.n; arrived.push(h); return false; });
  return arrived;
}
/** V0.2.2 加急：多付这批人半个月工资，立刻到岗 */
export const rushCost = (h) => Math.round(wage(h.role) * 0.5 * h.n);
export function rush(s, h, t) {
  const i = (s.hires || []).indexOf(h); if (i < 0) return { ok: false, why: '这批已经到岗了' };
  const cost = rushCost(h); if (!canPay(s, 'company', cost)) return { ok: false, why: '公司账户不够' };
  pay(s, { wallet: 'company', cat: 'recruit', amount: cost, note: `${IND_BY_ID[h.ind].name}招${PAY.roles[h.role].name} ${h.n} 人加急` }, t);
  s.hires.splice(i, 1); const x = line(s, h.ind); x.staff[h.role] = (x.staff[h.role] || 0) + h.n; return { ok: true, cost };
}
export const pendingHires = (s, id) => (s.hires || []).filter((h) => h.ind === id).reduce((a, h) => a + h.n, 0);
/** 裁员：N + 1（N = 在职游戏年数，最少 1 个月）；先裁派遣（不赔） */
/** V0.2.2 裁员前看一眼：先退派遣、再裁自己人；赔 N+1；裁完在岗、编制、会不会缺编 */
export function fireQuote(s, id, role, n, t) {
  const x = line(s, id); const ag = Math.min(n, x.agency[role] || 0); const own = Math.min(n - ag, x.staff[role] || 0);
  const years = Math.max(0, Math.floor((t - (s.inds[id].openedAt || s.createdAt)) / YEAR_MS)); const est = establishment(s, id)[role] || 0; const after = onDutyRole(s, id, role) - ag - own;
  return { ag, own, n: ag + own, years, comp: own * wage(role) * (years + 1), after, est, short: Math.max(0, est - after) };
}
export const overStaff = (s, id, role) => Math.max(0, onDutyRole(s, id, role) - (establishment(s, id)[role] || 0));
export function fire(s, id, role, n, t) {
  const x = line(s, id);
  let left = n; const ag = Math.min(left, x.agency[role] || 0); x.agency[role] = (x.agency[role] || 0) - ag; left -= ag;
  const own = Math.min(left, x.staff[role] || 0); if (!own && !ag) return { ok: false, why: '没有人可裁' };
  const years = Math.max(0, Math.floor((t - (s.inds[id].openedAt || s.createdAt)) / YEAR_MS)); // 工作满一年算一个月，不满也给 N+1 的 1
  const comp = own * wage(role) * (years + 1);
  if (own) { pay(s, { wallet: 'company', cat: 'severance', amount: comp, force: true, note: `${IND_BY_ID[id].name}裁${PAY.roles[role].name} ${own} 人（N+1）` }, t); x.staff[role] -= own; }
  return { ok: true, comp, n: own + ag };
}
/** 个税（月度，简化：工资 − 5000 起征点，速算扣除） */
export function iit(monthly) {
  const base = monthly - PAY.iitThreshold; if (base <= 0) return 0;
  const [, r, q] = PAY.iitBrackets.find(([lim]) => base <= lim);
  return Math.max(0, base * r - q);
}
const socialRate = () => sumv(PAY.social);

/** 本月人工成本（预估） */
/** V0.2.9 产业「收益」页：一条线一个月的人工（工资 + 社保 + 派遣），不含总部和秘书 */
export function lineLabor(s, id) {
  const x = line(s, id); const k = lineK(s, id); let w = 0, a = 0;
  for (const [r, n] of Object.entries(x.staff)) w += n * wage(r) * k;
  for (const [r, n] of Object.entries(x.agency)) a += n * wage(r) * k * (1 + PAY.channels.agency.markup);
  return w * (1 + socialRate()) + a;
}
export function monthlyLabor(s) {
  let wages = 0, agency = 0, iitSum = 0;
  for (const id of Object.keys(s.inds)) {
    const x = line(s, id); const k = lineK(s, id); // 城市系数：广州工资是上海的 0.85
    for (const [r, n] of Object.entries(x.staff)) { wages += n * wage(r) * k; iitSum += n * iit(wage(r) * k); }
    for (const [r, n] of Object.entries(x.agency)) agency += n * wage(r) * k * (1 + PAY.channels.agency.markup);
  }
  const hq = hqStaff(s) * wage('hq'); wages += hq; iitSum += hqStaff(s) * iit(wage('hq'));
  // 秘书也是公司员工（设计17 第二节）：按谈好的月薪
  let sec = 0; for (const id of Object.keys(s.secs || {})) { if (payerOfSec(s, id) === 'personal') continue; const w = salaryOf(s, id); sec += w; iitSum += iit(w); } // 家族办公室的人工资个人出（第 2-15 项）
  const all = wages + sec;
  return { wages, sec, social: all * socialRate(), agency, iit: iitSum, total: all * (1 + socialRate()) + agency };
}

/** 月底发工资 + 社保 + 派遣费 + 房租；钱不够就拖欠（下月补发）。
 *  acc = { labor, rent }：这个月按天计提的（权责），给了就按它付；不给按月底的人数算整月 */
export function monthEnd(s, t, rnd = Math.random, acc = null) {
  const p = (s.payroll = s.payroll || { arrears: 0, owed: 0 });
  const L0 = monthlyLabor(s);
  let rent = 0; for (const id of Object.keys(s.inds)) rent += IND_BY_ID[id].rent[lookOf(s, id)] * s.inds[id].branches;
  let L = L0;
  if (acc) { const k = L0.total ? acc.labor / L0.total : 0; L = { wages: L0.wages * k, sec: L0.sec * k, social: L0.social * k, agency: L0.agency * k, iit: L0.iit * k, total: acc.labor, k }; rent = acc.rent; }
  const k = L.k ?? 1;
  const due = L.total + p.owed;
  const out = { labor: L, rent, paid: false };
  /* V0.2.3（设计35）：本月工资发得出就算不拖欠（门店照常开）；以前欠的工资 / 遣散赔偿能还多少还多少，不用一次还清 */
  if (!canPayMust(s, 'company', due) && p.owed > 0 && canPayMust(s, 'company', L.total)) { const part = Math.max(0, Math.min(p.owed, (s.company || 0) - L.total)); if (part >= 0.01) { pay(s, { wallet: 'company', cat: 'payroll', amount: part, note: '补发拖欠工资（部分）' }, t); p.owed = Math.round((p.owed - part) * 100) / 100; } }
  if (canPayMust(s, 'company', L.total + p.owed)) {
    if (p.owed) pay(s, { wallet: 'company', cat: 'payroll', amount: p.owed, note: '补发拖欠工资' }, t);
    if (L.wages) pay(s, { wallet: 'company', cat: 'payroll', amount: L.wages, note: `本月工资（${totalStaff(s)} 人，按天计提）` }, t);
    for (const id of Object.keys(s.secs || {})) { if (payerOfSec(s, id) === 'personal') continue; const w = salaryOf(s, id) * k; if (w >= 0.01) pay(s, { wallet: 'company', cat: 'sec_salary', amount: w, party: id, by: id, note: `秘书工资` }, t); }
    if (L.social) pay(s, { wallet: 'company', cat: 'social', amount: L.social, note: '社保公积金（公司部分，含秘书）' }, t);
    if (L.agency) pay(s, { wallet: 'company', cat: 'agency', amount: L.agency, note: '劳务派遣费' }, t);
    if (L.iit) post(s, { wallet: 'company', dir: 'out', cat: 'iit_withheld', amount: L.iit, memo: true, party: '税务局', note: '代扣员工个税（从工资里扣，不算公司成本）' }, t);
    p.arrears = 0; p.owed = 0; out.paid = true;
  } else if (canPayMust(s, 'company', L.total)) { /* 本月的发了，欠的还在 */
    if (L.wages) pay(s, { wallet: 'company', cat: 'payroll', amount: L.wages, note: `本月工资（${totalStaff(s)} 人，按天计提）` }, t);
    for (const id of Object.keys(s.secs || {})) { if (payerOfSec(s, id) === 'personal') continue; const w = salaryOf(s, id) * k; if (w >= 0.01) pay(s, { wallet: 'company', cat: 'sec_salary', amount: w, party: id, by: id, note: `秘书工资` }, t); }
    if (L.social) pay(s, { wallet: 'company', cat: 'social', amount: L.social, note: '社保公积金（公司部分，含秘书）' }, t);
    if (L.agency) pay(s, { wallet: 'company', cat: 'agency', amount: L.agency, note: '劳务派遣费' }, t);
    if (L.iit) post(s, { wallet: 'company', dir: 'out', cat: 'iit_withheld', amount: L.iit, memo: true, party: '税务局', note: '代扣员工个税（从工资里扣，不算公司成本）' }, t);
    p.arrears = 0; out.paid = true;
  } else { p.arrears += 1; p.owed += L.total; out.unpaidSecs = Object.keys(s.secs || {}); }
  if (out.paid) (s.iitWithheld = s.iitWithheld || []).push({ t, amount: L.iit, who: 'staff' });
  if (rent) pay(s, { wallet: 'company', cat: 'rent', amount: rent, force: true, note: '门店房租' }, t);
  for (const id of Object.keys(s.secs || {})) if (payerOfSec(s, id) === 'personal') { const w = salaryOf(s, id) * (1 + socialRate()); if (w >= 0.01) pay(s, { wallet: 'personal', cat: 'family_office', amount: w, force: true, party: id, by: id, note: '家族办公室：秘书工资 + 社保（个人出）' }, t); }
  out.left = turnover(s, rnd);
  // 利润按权责发生制：这个月该发的工资都算这个月的成本（拖欠的也算）
  s.period = s.period || {}; s.period.labor = (s.period.labor || 0) + L.total; s.period.rent = (s.period.rent || 0) + rent;
  return out;
}
/** 月流失：零售 5%、餐饮 7%；店长管理高少流失（第 7 项接）；拖欠工资 ×3 */
let managerMgmt = () => 0;
export const setManagerMgmt = (fn) => { managerMgmt = fn; };
/** V2-13 每周经营会「人才」：员工流失打折（开发2，core/meeting.js 挂进来） */
let turnHook = () => 1; export const setTurnoverHook = (fn) => { turnHook = fn; };
/** 店长平均管理（满意度用） */
export const avgMgmt = (s) => { const ids = Object.keys(s.inds || {}); return ids.length ? ids.reduce((a, id) => a + managerMgmt(s, id), 0) / ids.length : 0; };
export function turnover(s, rnd = Math.random) {
  const mult = s.payroll && s.payroll.arrears ? PAY.arrearsTurnoverMult : 1;
  let left = 0;
  for (const id of Object.keys(s.inds)) {
    const x = line(s, id); const rate = turnHook(s, id) * PAY.turnover[id] * (1 - managerMgmt(s, id) / 100 * 0.5) * mult * turnoverMult(satisfaction(s, avgMgmt(s))); // 员工满意度（第 2-15 项）
    for (const r of Object.keys(x.staff)) {
      const exp = x.staff[r] * rate; let n = Math.floor(exp); if (rnd() < exp - n) n += 1;
      n = Math.min(n, x.staff[r]); x.staff[r] -= n; left += n;
    }
  }
  return left;
}
/** 年终奖：默认 1 个月工资（0～3 可改） */
export function yearBonus(s, t, profitPositive) {
  const months = s.payroll && s.payroll.bonusMonths != null ? s.payroll.bonusMonths : PAY.yearBonusMonths;
  if (!profitPositive || !months) return 0;
  const amt = monthlyLabor(s).wages * months;
  if (amt) pay(s, { wallet: 'company', cat: 'bonus', amount: amt, force: true, note: `年终奖 ${months} 个月` }, t);
  return amt;
}
