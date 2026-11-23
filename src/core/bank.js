// 银行（设计14 第三节、设计20 第六节，阶段二部分）：存款（活期 / 定期 / 大额存单）、经营贷（专款专用）、开发贷（四证、自有 30%、≤ 总投资 50%、预售先还）、审批、借款合同、月供、逾期罚息、征信
// 不 import economy（economy 用这里的 deposits / debt）；身价由 setNW 注入
import B from '../config/bank.json?v=daaa7f91' with { type: 'json' };
import { profitMul } from './calib.js?v=daaa7f91';
import { pay, receive, canPay, canPayMust } from './ledger.js?v=daaa7f91';
import { TAX } from './companytax.js?v=daaa7f91';
import { addContract } from './contracts.js?v=daaa7f91';
import { addMsg, onAction } from './inbox.js?v=daaa7f91';
import { holder, isSec } from './posts.js?v=daaa7f91';
import { MONTH_MS, YEAR_MS, monthIndex } from './gametime.js?v=daaa7f91';
import { re, totalInvest, setLoanHook } from './realestate.js?v=daaa7f91';
export { B as BANK_CFG };

const MIN = 60e3; const r2 = (x) => Math.round(x * 100) / 100;
let nwFn = () => 0; export const setNW = (fn) => { nwFn = fn; };
export const bank = (s) => (s.bank = s.bank || { deposits: [], loans: [], apps: [], seq: 0, credit: 'good', restricted: 0, month: null });
const CREDIT = ['good', 'fair', 'bad']; export const CREDIT_NAME = { good: '良好', fair: '一般（有过逾期）', bad: '差（不批贷款）' };
const cfoBy = (s) => { const c = holder(s, 'cfo'); return isSec(c) ? c : ''; };

// ---------- 存款 ----------
export function whyNotDeposit(s, bk, kind, wallet, amount) {
  const K = B.deposits[kind]; if (!B.banks[bk] || !K) return '选银行和存款种类';
  if (!(amount > 0)) return '金额不对'; if (K.min && amount < K.min) return `大额存单 ${K.min / 1e4} 万起存`;
  if (!canPay(s, wallet, amount)) return `${wallet === 'company' ? '公司账户' : '个人现金'}不够`;
  return null;
}
export function deposit(s, bk, kind, wallet, amount, t) {
  const why = whyNotDeposit(s, bk, kind, wallet, amount); if (why) return { ok: false, why };
  const K = B.deposits[kind]; const X = bank(s); X.seq += 1;
  pay(s, { wallet, cat: 'deposit_in', amount, party: B.banks[bk].name, note: `存入${B.banks[bk].name} ${K.name}` }, t);
  const d = { id: X.seq, bank: bk, kind, wallet, amount, rate: depRate(bk, kind, s), start: t, end: K.months ? t + K.months * MONTH_MS : 0 };
  X.deposits.push(d); return { ok: true, d };
}
/** 利息：按游戏时间；没到期取出按活期 */
/** 存款年利率（按游戏年）= 真实 × profitMul（设计21 第九节） */
export const depRate = (bk, kind, s = null) => Math.max(0.0005, B.deposits[kind].rate + (B.deposits[kind].months ? B.banks[bk].depAdj : 0) + (s && isPrivateAt(s, bk) ? B.private.depUp : 0)) * profitMul(); // 私行客户存款高一档
export function interestOf(d, t) { const early = d.end && t < d.end; const rate = early ? B.deposits.demand.rate * profitMul() : d.rate; return r2(d.amount * rate * Math.max(0, Math.min(t, d.end || t) - d.start) / YEAR_MS); }
export function withdraw(s, id, t) {
  const X = bank(s); const i = X.deposits.findIndex((x) => x.id === id); if (i < 0) return { ok: false, why: '没有这笔存款' };
  const d = X.deposits[i]; const it = interestOf(d, t); X.deposits.splice(i, 1);
  receive(s, { wallet: d.wallet, cat: 'deposit_out', amount: d.amount, party: B.banks[d.bank].name, note: `${B.banks[d.bank].name} ${B.deposits[d.kind].name} 取出${d.end && t < d.end ? '（提前支取，按活期算息）' : ''}` }, t);
  if (it > 0) { receive(s, { wallet: d.wallet, cat: 'interest_in', amount: it, party: B.banks[d.bank].name, note: '存款利息（储蓄存款利息免个税）' }, t); if (d.wallet === 'company' && s.period) s.period.other = (s.period.other || 0) - it; }
  return { ok: true, interest: it, early: !!(d.end && t < d.end) };
}
export const depositTotal = (s, wallet) => (s.bank ? s.bank.deposits.filter((d) => !wallet || d.wallet === wallet).reduce((a, d) => a + d.amount, 0) : 0);

// ---------- 贷款 ----------
/** 银行看的年营收：最近 12 个月报（不满 12 个月按月均 × 12） */
export function annualRevenue(s) { const m = (s.monthly || []).slice(-12); return m.length ? m.reduce((a, x) => a + x.rev, 0) / m.length * 12 : 0; }
export const monthlyPay = (P, rate, n) => { const r = rate / 12; return r ? r2(P * r / (1 - Math.pow(1 + r, -n))) : r2(P / n); };
export const loanDebt = (s) => (s.bank ? s.bank.loans.reduce((a, l) => a + l.principal, 0) : 0);
export const monthlyDue = (s) => (s.bank ? s.bank.loans.reduce((a, l) => a + (l.payment ? l.payment : r2(l.principal * l.rate / 12)), 0) : 0);
export function rateFor(s, bk, type, years = 1) {
  const base = type === 'dev' ? B.dev.rate : type === 'ma' ? B.ma.rate : B.biz.rate[0] + (B.biz.rate[1] - B.biz.rate[0]) * (years - 1) / 2;
  const base2 = type === 'stock' ? B.stockPledge.rate : type === 'art' ? B.artPledge.rate : base;
  return Math.round((base2 + rateAdjFn(s) + B.banks[bk].loanAdj + B.creditAdj[bank(s).credit] - (holder(s, 'biz') ? B.bizPostCut : 0) - (isPrivateAt(s, bk) ? B.private.loanCut : 0)) * profitMul() * 10000) / 10000; // 商务总监能谈低一档；真实年利率 × profitMul（按游戏年，设计21 第九节）
}
export const bizLimit = (s) => Math.max(0, annualRevenue(s) * B.biz.limitOfRevenue - bank(s).loans.filter((l) => l.type === 'biz').reduce((a, l) => a + l.principal, 0) - bank(s).apps.filter((a) => a.type === 'biz' && a.status !== 'done').reduce((x, a) => x + a.amount, 0));
/** 开发贷：项目四证齐了；最多总投资 50%；自有资金（地 + 已付建安）≥ 30% */
export function devLimit(s, p) { return p ? Math.max(0, Math.round(totalInvest(p) * B.dev.maxOfInvest)) : 0; }
export function whyNotLoan(s, o) {
  const K = B.banks[o.bank]; const X = bank(s); if (!K) return '选一家银行';
  if (X.credit === 'bad') return '征信差，银行不批';
  if (!(o.amount > 0)) return '金额不对';
  const rate = rateFor(s, o.bank, o.type, o.years || 1); const inc = annualRevenue(s) / 12;
  if (o.type === 'biz') {
    if (K.minNetWorth && nwFn(s) < K.minNetWorth) return `${K.name}只做身价 ${K.minNetWorth / 1e8} 亿以上的客户`;
    if (!inc) return '还没有完整的月报，银行看不到流水';
    if (o.amount > bizLimit(s)) return `额度不够：约年营收 30%，还能贷 ${Math.round(bizLimit(s) / 1e4)} 万`;
    const pay1 = monthlyPay(o.amount, rate, o.years * 12);
    if ((monthlyDue(s) + pay1) / inc > B.debtRatioMax) return `负债率超过 50%：每月要还 ${Math.round((monthlyDue(s) + pay1) / 1e4)} 万，月收入 ${Math.round(inc / 1e4)} 万`;
    return null;
  }
  if (K.noDev) return `${K.name}不做开发贷`;
  const p = re(s).projects.find((x) => x.id === o.project);
  if (!p || !['ready', 'build'].includes(p.stage)) return '开发贷要项目四证齐全（办完四证、还没开盘）';
  if (X.loans.some((l) => l.project === p.id) || X.apps.some((a) => a.project === p.id && a.status !== 'done')) return '这个项目已经有开发贷了';
  if ((p.land + p.deed + p.stamp + p.paidBuild) / totalInvest(p) < B.dev.ownMin) return '自有资金不到总投资 30%';
  if (o.amount > devLimit(s, p)) return `最多总投资 50%：${Math.round(devLimit(s, p) / 1e4)} 万`;
  return null;
}
/** 申请：V0.2.3 审批立刻出结果（approveMin = 0，下一秒 tickBank 批） */
export function applyLoan(s, o, t, rnd = Math.random) {
  const why = whyNotLoan(s, o); if (why) return { ok: false, why };
  const X = bank(s); X.seq += 1; const [a, b] = (o.type === 'dev' ? B.dev : B.biz).approveMin;
  const app = { id: X.seq, ...o, years: o.years || 1, rate: rateFor(s, o.bank, o.type, o.years || 1), status: 'pending', at: t + (a + (b - a) * rnd()) * MIN, t };
  X.apps.push(app); return { ok: true, app };
}
/** 签借款合同 + 印花税（借款合同 0.005%）→ 放款到公司账户（贷款资金限用途） */
export function signLoan(s, id, t) {
  const X = bank(s); const a = X.apps.find((x) => x.id === id && x.status === 'approved'); if (!a) return { ok: false, why: '没有批下来的贷款' };
  const K = B.banks[a.bank]; const n = a.type === 'biz' ? a.years * 12 : 0; const payment = a.type === 'biz' ? monthlyPay(a.amount, a.rate, n) : 0;
  const p = a.type === 'dev' ? re(s).projects.find((x) => x.id === a.project) : null;
  const stamp = r2(a.amount * TAX.stamp.loan);
  const ct = addContract(s, { prefix: 'JK', kind: 'loan', title: `${a.type === 'dev' ? '房地产开发贷款' : '流动资金借款'}合同`, parties: [['贷款人', K.name], ['借款人', s.companyName || '我的公司']],
    subject: a.type === 'dev' ? `${p ? p.name : ''} 开发贷款（土地和在建工程抵押；预售款先还贷）` : `经营周转（受托支付，专款专用于产业经营；股权质押）`, rows: [['借款金额', a.amount], ['年利率', `${(a.rate * 100).toFixed(2)}%`], [a.type === 'dev' ? '还款' : '月供（等额本息）', a.type === 'dev' ? '按月付息，预售回款先还本' : payment], ['印花税（0.005%）', stamp]], total: a.amount, wallet: 'company' }, t);
  receive(s, { wallet: 'company', cat: 'loan_in', amount: a.amount, party: K.name, ref: ct.no, note: `${K.name}${a.type === 'dev' ? '开发贷' : '经营贷'}放款（贷款资金限用途）` }, t);
  pay(s, { wallet: 'company', cat: 'tax_company', amount: stamp, force: true, party: '税务局', ref: ct.no, note: '借款合同印花税' }, t);
  X.restricted += a.amount; a.status = 'done';
  const l = { id: a.id, bank: a.bank, type: a.type, principal: a.amount, amount: a.amount, rate: a.rate, n, left: n, payment, project: a.project || null, overdue: 0, contract: ct.no, start: t };
  X.loans.push(l); return { ok: true, loan: l };
}
onAction('loan_sign', (s, m, a, t) => { if (a === 'approve') return signLoan(s, m.data.id, t).ok; const x = bank(s).apps.find((y) => y.id === m.data.id); if (x) x.status = 'done'; return true; });
/** 开发贷：预售款进监管账户后先还（地产 batch 里调用），直接从监管账户划走 */
setLoanHook((s, p, amount, t) => {
  const l = s.bank && s.bank.loans.find((x) => x.project === p.id); if (!l) return 0;
  const k = Math.min(l.principal, amount); l.principal = r2(l.principal - k);
  pay(s, { wallet: 'company', cat: 'loan_out', amount: k, memo: true, party: B.banks[l.bank].name, note: `${p.name} 预售款从监管账户直接还开发贷` }, t);
  if (l.principal <= 0.01) s.bank.loans = s.bank.loans.filter((x) => x !== l);
  return k;
});
/** 提前还清 */
export function repay(s, id, t) {
  const X = bank(s); const l = X.loans.find((x) => x.id === id); if (!l) return { ok: false, why: '没有这笔贷款' };
  if (!canPay(s, 'company', l.principal)) return { ok: false, why: '公司账户不够' };
  pay(s, { wallet: 'company', cat: 'loan_out', amount: l.principal, party: B.banks[l.bank].name, note: '提前还清贷款' }, t); X.loans = X.loans.filter((x) => x !== l); if (l.collateral && releaseHook) releaseHook(s, l); return { ok: true };
}
const worse = (s) => { const X = bank(s); X.credit = CREDIT[Math.min(2, CREDIT.indexOf(X.credit) + 1)]; };

/** 每秒 / 离线：审批到点；每游戏月月供（逾期罚息 1.5 倍、征信、连续 3 期处置）；定期到期自动转回；开发项目交房还清 */
export function tickBank(s, t) {
  const X = bank(s); const ev = [];
  for (const a of X.apps) if (a.status === 'pending' && t >= a.at) {
    const why = whyNotLoan(s, { ...a, amount: a.amount });
    const recheck = why && !/已经有开发贷/.test(why) && !/额度不够/.test(why);
    if (recheck) { a.status = 'done'; addMsg(s, { kind: 'system', type: 'loan', title: `${B.banks[a.bank].name}没批`, body: why }, t); continue; }
    a.status = 'approved';
    addMsg(s, { kind: 'request', type: 'loan_sign', from: cfoBy(s), title: `${B.banks[a.bank].name}批了：${a.type === 'dev' ? '开发贷' : '经营贷'} ${Math.round(a.amount / 1e4)} 万`, body: `年利率 ${(a.rate * 100).toFixed(2)}%${a.type === 'biz' ? `，${a.years} 年，月供 ${Math.round(monthlyPay(a.amount, a.rate, a.years * 12))}` : '，按月付息，预售回款先还本'}。签借款合同就放款。`, data: { id: a.id }, actions: [{ key: 'approve', label: '签合同' }, { key: 'reject', label: '不要了' }] }, t);
    ev.push(`${B.banks[a.bank].name}批了贷款`);
  }
  for (const d of [...X.deposits]) if (d.end && t >= d.end) { const r = withdraw(s, d.id, d.end); ev.push(`定期到期，连本带息 ${Math.round((d.amount + r.interest) / 1e4)} 万回到${d.wallet === 'company' ? '公司账户' : '个人现金'}`); }
  for (const l of [...X.loans]) if (l.project) { const p = re(s).projects.find((x) => x.id === l.project); if (p && p.stage === 'done') { pay(s, { wallet: 'company', cat: 'loan_out', amount: l.principal, force: true, party: B.banks[l.bank].name, note: `${p.name} 交房，开发贷还清` }, t); X.loans = X.loans.filter((x) => x !== l); } }
  const m = monthIndex(s, t); if (X.month == null) X.month = m;
  while (X.month < m) {
    X.month += 1; const at = s.createdAt + X.month * MONTH_MS;
    for (const l of [...X.loans]) {
      const K = B.banks[l.bank]; const it = r2(l.principal * l.rate / 12 * (l.overdue ? B.overduePenalty : 1));
      const prin = l.payment ? Math.min(l.principal, r2(l.payment - l.principal * l.rate / 12)) : 0; const due = it + prin;
      if (canPayMust(s, 'company', due)) {
        pay(s, { wallet: 'company', cat: 'interest', amount: it, party: K.name, note: `${LOAN_NAME[l.type]}利息${l.overdue ? '（含逾期罚息）' : ''}` }, at);
        if (prin > 0) pay(s, { wallet: 'company', cat: 'loan_out', amount: prin, party: K.name, note: `${LOAN_NAME[l.type]}还本` }, at);
        s.period = s.period || {}; s.period.other = (s.period.other || 0) + it; // 利息所得税前扣
        l.principal = r2(l.principal - prin); l.left -= l.payment ? 1 : 0; l.overdue = 0;
        if (l.payment && (l.left <= 0 || l.principal <= 0.01)) X.loans = X.loans.filter((x) => x !== l);
        continue;
      }
      l.overdue += 1; l.principal = r2(l.principal + it); worse(s); // 没还上：利息滚进本金，下期罚息 1.5 倍
      addMsg(s, { kind: 'system', type: 'loan', from: cfoBy(s), title: `${K.name}贷款逾期第 ${l.overdue} 期`, body: `公司账户不够还 ${Math.round(due)} 元。罚息按 1.5 倍，征信变成「${CREDIT_NAME[X.credit]}」；连续 ${B.seizeAfter} 期银行就处置抵押物。` }, at);
      if (l.overdue >= B.seizeAfter) {
        if (l.type === 'dev') { const p = re(s).projects.find((x) => x.id === l.project); if (p) { p.stage = 'done'; p.result = { seized: true, net: -(p.land + p.paidBuild) }; } addMsg(s, { kind: 'system', type: 'loan', title: `${K.name}处置了抵押的项目`, body: `${p ? p.name : ''} 的土地和在建工程被银行拿走抵债。` }, at); }
        else if (l.collateral && seizeHook) { seizeHook(s, l, at); }
        else { pay(s, { wallet: 'company', cat: 'loan_out', amount: l.principal, force: true, party: K.name, note: '逾期 3 期，银行处置质押股权，强制划扣' }, at); addMsg(s, { kind: 'system', type: 'loan', title: `${K.name}强制划扣`, body: '逾期 3 期，质押的公司股权被处置，剩下的本金直接从公司账户扣（账户可能变负）。' }, at); }
        X.loans = X.loans.filter((x) => x !== l); X.credit = 'bad';
      }
    }
  }
  return ev;
}
/** 拿地、分红这类不能用贷款的钱：公司账户 − 贷款资金（限用途） */
export const freeCompany = (s) => (s.company || 0) - ((s.bank && s.bank.restricted) || 0);

// ---------- 并购贷款（验收阶段二 2-16b：提前到老板阶段）----------
/** P-05 大盘降息 / 加息新闻：之后 1 个游戏月利率 ∓0.25 点（core/manage.js 挂进来） */
let rateAdjFn = () => 0; export const setRateAdjFn = (fn) => { rateAdjFn = fn; };
export const LOAN_NAME = { biz: '经营贷', dev: '开发贷', ma: '并购贷款', stock: '股票质押', art: '艺术品质押' };
// ---------- 私人银行 + 质押的挂钩（3-01，逻辑在 core/pledge.js） ----------
let finAssetsFn = () => 0; export const setFinAssetsFn = (fn) => { finAssetsFn = fn; };
let seizeHook = null, releaseHook = null; export const setPledgeHooks = (seize, release) => { seizeHook = seize; releaseHook = release; };
/** 金融资产 = 存款 + 股票 + 基金（股票基金由 pledge.js 注入） */
export const finAssets = (s) => depositTotal(s) + finAssetsFn(s);
/** 是不是这家的私行客户（招尚 ≥ 1000 万、瑞鑫 ≥ 1 亿金融资产） */
export const isPrivateAt = (s, bk) => !!(B.private[bk] && B.private[bk].min && finAssets(s) >= B.private[bk].min);
export const privateTier = (s) => (isPrivateAt(s, 'ruixin') ? 'ruixin' : isPrivateAt(s, 'zhaoshang') ? 'zhaoshang' : null);
export const BANK_CFG_PRIVATE = B.private;
/** 这笔收购最多能贷多少：交易价 60%、自有 ≥ 40%，而且不超过现在要付的（一次付清 = 全价；分期 = 首付） */
export const maMax = (s, value, payNow) => Math.max(0, Math.floor(Math.min(value * B.ma.maxOfDeal, value * (1 - B.ma.ownMin), payNow)));
export function whyNotMa(s, bk, value, payNow, amount) {
  const K = B.banks[bk]; if (!K) return '选一家银行';
  if ((s.title || 0) < B.ma.minTitle) return '并购贷款要「老板」称号';
  if (bank(s).credit === 'bad') return '征信差，银行不批';
  if (!(amount > 0)) return '金额不对';
  if (amount > maMax(s, value, payNow)) return `最多贷 ${Math.round(maMax(s, value, payNow) / 1e4)} 万（交易价 60%，自有资金至少 40%，不超过现在要付的）`;
  const inc = annualRevenue(s) / 12; if (!inc) return '还没有完整的月报，银行看不到流水';
  const pay1 = monthlyPay(amount, rateFor(s, bk, 'ma'), B.ma.years * 12);
  if ((monthlyDue(s) + pay1) / inc > B.debtRatioMax) return `负债率超过 50%：每月要还 ${Math.round((monthlyDue(s) + pay1) / 1e4)} 万，月收入 ${Math.round(inc / 1e4)} 万`;
  return null;
}
/** 放并购贷款：签《并购借款合同》（股权质押），钱直接用于这笔收购（不进限用途余额）。返回 loan */
export function maLoan(s, bk, targetName, amount, t) {
  const X = bank(s); const K = B.banks[bk]; const rate = rateFor(s, bk, 'ma'); const n = B.ma.years * 12; const payment = monthlyPay(amount, rate, n);
  const stamp = r2(amount * TAX.stamp.loan); X.seq = (X.seq || 0) + 1;
  const ct = addContract(s, { prefix: 'JK', kind: 'loan', title: '并购借款合同', parties: [['贷款人', K.name], ['借款人', s.companyName || '我的公司']], subject: `收购${targetName}股权（专款专用，受托支付给转让方；以收购来的${targetName}股权质押）`, rows: [['借款金额', amount], ['年利率', `${(rate * 100).toFixed(2)}%（游戏年）`], ['期限', `${B.ma.years} 个游戏年，等额本息`], ['月供', payment], ['印花税（0.005%）', stamp]], total: amount, wallet: 'company' }, t);
  receive(s, { wallet: 'company', cat: 'loan_in', amount, party: K.name, ref: ct.no, note: `${K.name}并购贷款放款（受托支付：收购${targetName}）` }, t);
  pay(s, { wallet: 'company', cat: 'tax_company', amount: stamp, force: true, party: '税务局', ref: ct.no, note: '借款合同印花税' }, t);
  const l = { id: 'ma' + X.seq, bank: bk, type: 'ma', principal: amount, amount, rate, n, left: n, payment, project: null, overdue: 0, contract: ct.no, start: t, target: targetName };
  X.loans.push(l); return l;
}
