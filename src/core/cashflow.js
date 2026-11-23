// V0.2.3 资金链断裂（设计35）：花钱前留够两个月工资 + 社保 + 房租；跨样子升级先算账；可用 < 1 个月工资发急报；
// 欠薪停业满 1 个游戏月员工自动遣散（N+1 记应付）；公司账户负数时银行给一次应急周转贷（3 个月工资，利率高一档）
import { IND_BY_ID } from '../config/industries.js?v=d69b03f5';
import B from '../config/bank.json?v=d69b03f5' with { type: 'json' };
import * as ST from './staff.js?v=d69b03f5';
import { available, monthlyRent, payables } from './accrual.js?v=d69b03f5';
import { lineK } from './cities.js?v=d69b03f5';
import { pay, receive, post, setCompanyFloor, lockState } from './ledger.js?v=d69b03f5';
import { addMsg } from './inbox.js?v=d69b03f5';
import { holder, isSec } from './posts.js?v=d69b03f5';
import { MONTH_MS, YEAR_MS } from './gametime.js?v=d69b03f5';
import { fmtMoney } from './format.js?v=d69b03f5';

export const CUSHION_MONTHS = 2;
const r2 = (x) => Math.round(x * 100) / 100;
const cf = (s) => (s.cf = s.cf || { alertAt: 0 });
const cfoOf = (s) => { const c = holder(s, 'cfo'); if (isSec(c)) return c; return Object.keys(s.secs || {})[0] || ''; };
/** 每月固定要付的：工资 + 社保 + 派遣 + 房租 */
export const monthlyWage = (s) => ST.monthlyLabor(s).total;
export const burn = (s) => monthlyWage(s) + monthlyRent(s);
/** V0.2.9：打工人留 1 个月工资 + 社保（开局 2 万照样能开小吃摊）；小老板起留 2 个月工资 + 社保 + 房租 */
export const cushion = (s) => ((s.title || 0) ? CUSHION_MONTHS * burn(s) : monthlyWage(s));
/** 花 cost 以后可用还够不够两个月；打工人阶段不管（开局 2 万要能开小吃摊，事件另有 20% 封顶）；测试可以 flags.noCushion 关掉 */
export function cushionShort(s, cost) {
  if ((s.flags && s.flags.noCushion) || lockState.bypass) return 0;   /* V0.2.9：玩家点了「照样花」 */   /* V0.2.9：打工人也锁（没开店时工资房租是 0，开局 2 万照样能开第一个摊） */
  const P = payables(s); /* 本月已经计提的工资房租就是这两个月里的第一个月，不重复算 */
  const k = Math.max(0, Math.ceil(cushion(s) - (available(s) + P.labor + ((s.title || 0) ? P.rent : 0) - cost)));
  if (k > 0) lockState.last = { cost, at: Date.now() };
  return k;
}
/** 花多少以后还留得够两个月工资（能花的上限） */
export const room = (s) => { const P = payables(s); return Math.max(0, Math.floor(available(s) + P.labor + ((s.title || 0) ? P.rent : 0) - cushion(s))); };
/** V0.2.9：最多能分红多少（留够工资以后）*/
export const divMax = (s) => Math.max(0, Math.min(Math.floor(available(s)), room(s)));
export const whyCushion = (s, cost) => (cushionShort(s, cost) > 0 ? LOCK_WHY : null);
export const LOCK_WHY = '钱不够（要留工资）';
setCompanyFloor((s, cost) => cushionShort(s, cost) > 0);
/** 锁住时给玩家看的：花多少、花完剩多少、要留多少、还差多少 */
export function lockInfo(s, cost) { const P = payables(s); const left = Math.floor(available(s) + P.labor + ((s.title || 0) ? P.rent : 0) - cost); return { cost: Math.round(cost), left, need: Math.round(cushion(s)), short: Math.max(0, Math.round(cushion(s) - left)), months: (s.title || 0) ? CUSHION_MONTHS : 1 }; }   // V0.2.9：公司账户自己选着花的钱都走这把锁

/** 跨样子升级先算账：{ cross, addStaff, addMonthly, months（升完账上够撑几个月） } */
export function upgradePreview(s, id, cost = 0) {
  const ind = s.inds[id]; if (!ind) return null;
  const nx = { ...s, inds: { ...s.inds, [id]: { ...ind, level: ind.level + 1 } } };
  const cross = ST.lookOf(nx, id) !== ST.lookOf(s, id);
  const e0 = ST.establishment(s, id), e1 = ST.establishment(nx, id); let addStaff = 0, addWage = 0;
  for (const r of new Set([...Object.keys(e0), ...Object.keys(e1)])) { const d = (e1[r] || 0) - (e0[r] || 0); if (d && ST.PAY.roles[r]) { addStaff += d; addWage += d * ST.wage(r) * lineK(s, id); } }
  const social = Object.values(ST.PAY.social).reduce((a, b) => a + b, 0);
  const addMonthly = Math.round(addWage * (1 + social) + (monthlyRent(nx) - monthlyRent(s)));
  const per = burn(s) + addMonthly; const months = per > 0 ? Math.max(0, (available(s) - cost) / per) : Infinity;
  return { cross, addStaff, addMonthly, months };
}

/** 资金链预警：可用 < 1 个月工资 */
export const fundLow = (s) => { const w = monthlyWage(s); return w > 0 && available(s) < ((s.title || 0) ? w : 0); }; /* 打工人阶段开局账上本来就薄：可用成了负数才报 */
export const FUND_ACTIONS = [{ key: 'inject', label: '注资' }, { key: 'loan', label: '申请经营贷' }, { key: 'sell', label: '卖股票 / 资产' }, { key: 'fire', label: '裁员 / 关店' }];
/** 每秒（在线）：缺钱了财务总监发急报，一个游戏月最多一次 */
export function tickFund(s, t) {
  if (!fundLow(s)) { for (const m of s.inbox || []) if (m.type === 'fund_low' && m.status === 'open') { m.status = 'done'; m.read = true; } return null; }   /* V0.2.9：钱够了急报自动收起 */ const C = cf(s); if (C.alertAt && t - C.alertAt < MONTH_MS) return null;
  C.alertAt = t; const w = monthlyWage(s); const av = available(s);
  return addMsg(s, { kind: 'request', type: 'fund_low', from: cfoOf(s), title: '急报：公司快发不出工资了',
    body: `公司可用 ${fmtMoney(av)}，一个月工资社保要 ${fmtMoney(w)}。发不出工资员工会走、拖两个月门店全部停业。先补上：注资、申请经营贷、卖股票 / 资产，或者裁员 / 关店。`, actions: [...FUND_ACTIONS, { key: 'ok', label: '知道了' }] }, t);
}

/** 月底（hookCompany 里 monthEnd 之后）：欠薪停业满 1 个月自动遣散；公司负数给应急周转贷 */
export function monthCheck(s, t) {
  const out = []; const p = s.payroll || {};
  if ((p.arrears || 0) >= 3 && ST.storeStaff(s) > 0) {
    let comp = 0, n = 0;
    for (const id of Object.keys(s.inds)) {
      const x = s.inds[id]; const years = Math.max(0, Math.floor((t - (x.openedAt || s.createdAt)) / YEAR_MS));
      for (const [r, k] of Object.entries(x.staff || {})) if (k > 0 && ST.PAY.roles[r]) { comp += k * ST.wage(r) * lineK(s, id) * (years + 1); n += k; x.staff[r] = 0; }
      for (const r of Object.keys(x.agency || {})) { n += x.agency[r] || 0; x.agency[r] = 0; }
    }
    s.hires = (s.hires || []).filter(() => false);
    p.owed = r2((p.owed || 0) + comp); p.arrears = 0; s.payroll = p; /* 欠的变成一笔应付（慢慢还），人走了就不算拖欠：重新招人门店就开门 */
    addMsg(s, { kind: 'system', type: 'fund_dismiss', from: cfoOf(s), title: '停业满一个月，员工都遣散了', body: `欠薪停业一个月，${n} 个员工走了，N+1 赔偿 ${fmtMoney(comp)} 记进应付（跟拖欠的工资一起，月底有钱就补发）。重新招人门店就能开门，欠的工资和赔偿以后有钱慢慢还。` }, t);
    out.push('员工遣散了');
  }
  const em = emergencyLoan(s, t); if (em) out.push(em);
  return out;
}
/** 公司账户负数：一次应急周转贷（还清以前不再给） */
export function emergencyLoan(s, t) {
  if ((s.company || 0) >= 0 || (s.flags && s.flags.noEmergency)) return null; const X = (s.bank = s.bank || { deposits: [], loans: [], apps: [], seq: 0, credit: 'good', restricted: 0, month: null });
  if (X.loans.some((l) => l.emergency)) return null;
  const w = Math.max(monthlyWage(s), ((s.payroll && s.payroll.owed) || 0) / Math.max(1, (s.payroll && s.payroll.arrears) || 1));
  const amt = Math.round(Math.max(3 * w, -(s.company || 0) + w)); if (!(amt > 0)) return null;
  const rate = B.biz.rate[1] + 0.02; const n = 12; const r = rate / 12; const payment = r2(amt * r / (1 - Math.pow(1 + r, -n)));
  X.seq += 1; const bk = 'gongshang';
  receive(s, { wallet: 'company', cat: 'loan_in', amount: amt, party: B.banks[bk].name, note: '应急周转贷（公司账户负数，银行给一次，发工资用）' }, t);
  X.loans.push({ id: X.seq, bank: bk, type: 'biz', principal: amt, amount: amt, rate, n, left: n, payment, project: null, overdue: 0, contract: '', start: t, emergency: true });
  addMsg(s, { kind: 'system', type: 'fund_loan', from: cfoOf(s), title: `银行给了应急周转贷 ${fmtMoney(amt)}`, body: `公司账户成了负数，${B.banks[bk].name}给了一次应急周转贷（3 个月工资，年利率 ${(rate * 100).toFixed(1)}%，比经营贷高一档，12 个月还）。有钱先还它（银行页「提前还清」）；还清以前不会再给。` }, t);
  return `应急周转贷 ${fmtMoney(amt)}`;
}

// ---------- V0.2.4 自动补员（设计36 第 3 条）：人事页开关，默认开；不管有没有店长，按缺编用贴招聘补满，立刻到岗 ----------
export const hr = (s) => (s.hr = s.hr || { auto: true, hired: 0, blocked: null });
export const autoOn = (s) => hr(s).auto !== false;
export function setAuto(s, on) { hr(s).auto = !!on; if (!on) hr(s).blocked = null; }
/** 每秒（在线）/ 离线结算后：补满编制；跨样子编制变大也补；钱不够留两个月工资（小老板起）就不补，记下来给首页提示 */
export function autoFill(s, t) {
  if (!autoOn(s)) return 0; const H = hr(s); let n = 0; let short = 0;
  const social = Object.values(ST.PAY.social).reduce((a, b) => a + b, 0);
  for (const id of Object.keys(s.inds)) {
    for (const [role, k] of Object.entries(ST.shortage(s, id))) {
      const pend = (s.hires || []).filter((h) => h.ind === id && h.role === role).reduce((a, h) => a + h.n, 0); const need = k - pend; if (need <= 0) continue;
      const add = need * ST.wage(role) * lineK(s, id) * (1 + social); // 招进来以后每月多的人工
      if ((s.title || 0) && cushionShort(s, CUSHION_MONTHS * add) > 0) { short += need; continue; }
      const r = ST.hire(s, id, role, need, 'door', t, Math.random, ''); if (!r.ok) { short += need; continue; }
      post(s, { wallet: 'company', dir: 'out', cat: 'recruit', amount: 0, memo: true, zero: true, by: '人事', note: `招聘 · 经手人：人事（${IND_BY_ID[id].name}${ST.PAY.roles[role].name} ${need} 人，贴招聘，立刻到岗）` }, t);
      n += need;
    }
  }
  H.hired = (H.hired || 0) + n; H.blocked = short > 0 ? { n: short, t } : null; return n;
}
