// 设计62 投资账户（开发2）：股票、基金、两融、打新、投资经理的钱都在 s.invest
// 转账一律两头各记一笔流水：
//   个人 ↔ 投资：免费、马上到（transfer_out / transfer_in）
//   投资 → 公司：算注资（投资账户 capital_out + 公司 capital，不交税，记实收资本，出《增资确认书》）
//   公司 → 投资：算分红（公司 dividend_out + 投资账户 dividend，代扣 20% 个税）
// 只能转投资账户里的现金：挂单里冻着的、持仓、基金都不能转。
// 注资 / 分红那一头在 companytax.js（开发1），用 setCompanyBridge 挂在下面。
import { pay, post, canPayMust } from './ledger.js?v=4306ebaa';
import { addNetWorthHook } from './economy.js?v=4306ebaa';
import * as CT from './companytax.js?v=4306ebaa';   // 开发1：注资 / 分红
import { divMax } from './cashflow.js?v=4306ebaa';

const r2 = (v) => Math.round(v * 100) / 100;
export const ACC = { personal: '个人账户', invest: '投资账户', company: '公司账户' };
/** 投资账户现金（挂单的钱已经划走了，就一个数） */
export const cashOf = (s) => r2(s.invest || 0);
/** 个人现金能转出的（认筹冻结的不算） */
export const personalFree = (s) => Math.max(0, Math.floor(((s.cash || 0) - (s.freezes || []).reduce((a, f) => a + f.amount, 0)) * 100) / 100);
/** 公司能分出来的：工资锁照旧（留够工资），贷款资金专款专用 */
export const companyFree = (s) => Math.max(0, Math.min(divMax(s), Math.floor((s.company || 0) - ((s.bank && s.bank.restricted) || 0))));   // 跟公司页「分红」同一个上限
/** 某个账户最多能转出多少 */
export function maxOut(s, from) {
  if (from === 'personal') return personalFree(s);
  if (from === 'invest') return Math.max(0, Math.floor(cashOf(s) * 100) / 100);
  if (from === 'company') return companyFree(s);
  return 0;
}

// 注资 / 分红走开发1 的 companytax.inject / dividend（设计62 第一节第 6 条，开发1 挂上）
let bridge = null;
/** inject(s, amount, t, { from: 'invest' }) / dividend(s, amount, t, { to: 'invest' })，返回 { ok, why, no / net, tax } */
export const setCompanyBridge = (b) => { bridge = b; };
setCompanyBridge({ inject: CT.inject, dividend: CT.dividend });
const inject = (s, amount, t) => bridge.inject(s, amount, t, { from: 'invest' });
const dividend = (s, amount, t) => bridge.dividend(s, amount, t, { to: 'invest' });

/** 转账：from / to ∈ personal | invest | company，至少一头是投资账户 */
export function transfer(s, from, to, amount, t = Date.now()) {
  amount = Math.floor(amount * 100) / 100;
  if (!(amount > 0)) return { ok: false, why: '金额不对' };
  if (from === to || (from !== 'invest' && to !== 'invest')) return { ok: false, why: '这里只转进转出投资账户' };
  if (amount > maxOut(s, from) + 1e-9) return { ok: false, why: `${ACC[from]}不够，最多能转 ¥${maxOut(s, from).toLocaleString()}` };
  if (from === 'personal' || to === 'personal') {
    const pw = from === 'personal' ? 'personal' : 'invest', iw = from === 'personal' ? 'invest' : 'personal';
    if (!canPayMust(s, pw, amount)) return { ok: false, why: `${ACC[from]}不够` };
    pay(s, { wallet: pw, cat: 'transfer_out', amount, party: ACC[to], note: `转到${ACC[to]}` }, t);
    post2(s, { wallet: iw, cat: 'transfer_in', amount, party: ACC[from], note: `从${ACC[from]}转入` }, t);
    return { ok: true, amount };
  }
  if (to === 'company') { const r = inject(s, amount, t); return r.ok ? { ok: true, amount, no: r.no } : r; }
  const r = dividend(s, amount, t); return r.ok ? { ok: true, amount, net: r.net, tax: r.tax } : r;
}
// 转入不算「收入」：直接 post（不走 receive 的收益流水挂钩）
const post2 = (s, e, t) => post(s, { ...e, dir: 'in' }, t);

/** 钱不够时一键补：从个人账户转差额进来（个人也不够就转个人能转的全部） */
export function topUpFromPersonal(s, short, t = Date.now()) {
  const amt = Math.min(Math.ceil(short * 100) / 100, personalFree(s));
  if (!(amt > 0)) return { ok: false, why: '个人现金也不够' };
  const r = transfer(s, 'personal', 'invest', amt, t); return r.ok ? { ...r, full: amt >= short - 1e-9 } : r;
}
/** 钱不够的统一说法：「投资账户不够，差 ¥X」（X 精确到分、往上取，界面一键转入照这个数转） */
export const shortWhy = (x) => `投资账户不够，差 ¥${(Math.ceil(Math.max(0, x) * 100 - 1e-6) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** 「投资账户不够，差 ¥X」里的 X */
export function shortOf(why) {
  const m = /投资账户不够，差 ¥([\d,]+(?:\.\d+)?)/.exec(why || ''); return m ? +m[1].replace(/,/g, '') : 0;
}

addNetWorthHook((s) => s.invest || 0);   // 身价含投资账户现金（持仓、挂单、基金照旧走资产挂钩）
