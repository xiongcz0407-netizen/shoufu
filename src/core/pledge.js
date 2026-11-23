// 3-01 私人银行 + 股票质押 + 艺术品质押（设计23 第五节）
// 私行：金融资产到门槛自动是客户（core/bank.js isPrivateAt / privateTier）：存款高一档、贷款低一档、人脉 +5、客户经理消息
// 质押：个人的股票 / 古董押给银行，钱借给公司（专款专用）；按月付息、1 个游戏年到期还本；股票 150% 预警、130% 强平；逾期 3 期处置
import { BANK_CFG as B, bank, loanDebt, rateFor, privateTier, isPrivateAt, setFinAssetsFn, setPledgeHooks, finAssets } from './bank.js?v=876cadde';
import * as SK from './stocks.js?v=876cadde';
import * as FD from './funds.js?v=876cadde';
import * as AQ from './antique.js?v=876cadde';
import { addAttrHook } from './boss.js?v=876cadde';
import { receive, pay, canPay } from './ledger.js?v=876cadde';
import { TAX } from './companytax.js?v=876cadde';
import { addContract } from './contracts.js?v=876cadde';
import { addMsg } from './inbox.js?v=876cadde';
import { YEAR_MS, monthIndex } from './gametime.js?v=876cadde';
import * as LS from './listing.js?v=876cadde';
import { stakeOf } from './economy.js?v=876cadde';

const r2 = (x) => Math.round(x * 100) / 100;
setFinAssetsFn((s) => (s.mkt ? SK.holdValue(s) : 0) + (s.fund ? FD.value(s) : 0));
addAttrHook((s) => (privateTier(s) ? { network: B.private.network } : {})); // 私行客户：拍卖、限量车人脉 +5

/** 私行：第一次够门槛发一条客户经理的消息 */
export function tickPrivate(s, t) {
  const tier = privateTier(s); const X = bank(s); if (!tier || X.privateTold === tier) return [];
  X.privateTold = tier; const P = B.private[tier];
  addMsg(s, { kind: 'system', type: 'private_bank', title: `${P.name}：${P.manager}来电`, body: `您的金融资产到了 ${Math.round(P.min / 1e4)} 万，已是${P.name}客户：这家存款高一档、贷款低一档；拍卖会和限量车优先（人脉 +${B.private.network}）。${tier === 'ruixin' ? '艺术品可以来质押。' : ''}` }, t);
  return [`成为${P.name}客户`];
}

// ---------- 股票质押 ----------
/** 能押多少股（没押的）；质押率 60%。自己公司（上市后，3-04）的股按持股比例押：市值 ≥ 100 亿 50%，以下 30% */
const SP = B.stockPledge;
export const stockRatio = () => SP.ratio;
export const ownRatio = (s) => (LS.marketCap(s) >= SP.ownBig ? SP.ownRatio[1] : SP.ownRatio[0]);
export const freeOwn = (s) => (LS.listed(s) ? Math.max(0, stakeOf(s) - ((s.cap && s.cap.pledgedPct) || 0)) : 0);
export function whyNotOwnPledge(s, bk, pct) {
  if (!LS.listed(s)) return '公司还没上市';
  if (!SP.banks.includes(bk)) return `${B.banks[bk].name}不做股票质押`;
  if (bank(s).credit === 'bad') return '征信差，银行不批';
  if (!(pct > 0) || pct > freeOwn(s) + 1e-9) return '没有这么多没质押的股份';
  return null;
}
/** 押自己公司的股 pct（占总股本）：借款 = 市值 × pct × 质押率；押着的不能减持 */
export function pledgeOwn(s, bk, pct, t) {
  const why = whyNotOwnPledge(s, bk, pct); if (why) return { ok: false, why };
  const X = s.listing.listed; const val = r2(LS.marketCap(s) * pct); const k = ownRatio(s); const amount = Math.floor(val * k);
  const l = mkLoan(s, bk, 'stock', amount, t, { kind: 'own', pct }, `${X.name}（${X.code}）占总股本 ${+(pct * 100).toFixed(2)}%（市值 ${Math.round(val / 1e4)} 万，质押率 ${Math.round(k * 100)}%）`);
  s.cap.pledgedPct = ((s.cap && s.cap.pledgedPct) || 0) + pct;
  return { ok: true, loan: l, amount };
}
export const freeShares = (s, code) => { const h = s.mkt && s.mkt.hold[code]; return h ? h.n - (h.pledged || 0) : 0; };
export function whyNotStockPledge(s, bk, code, n) {
  if (!SP.banks.includes(bk)) return `${B.banks[bk].name}不做股票质押`;
  if (bank(s).credit === 'bad') return '征信差，银行不批';
  if (!(n >= 1) || n > freeShares(s, code)) return '没有这么多没质押的股票';
  return null;
}
/** 押 n 股：借款 = 市值 × 质押率，进公司账户（专款专用）；签《股票质押合同》 */
export function pledgeStock(s, bk, code, n, t) {
  const why = whyNotStockPledge(s, bk, code, n); if (why) return { ok: false, why };
  const val = r2(SK.price(s, code) * n); const amount = Math.floor(val * stockRatio(code));
  const l = mkLoan(s, bk, 'stock', amount, t, { kind: 'stock', code, n }, `${SK.BY[code].name} ${n} 股（市值 ${Math.round(val / 1e4)} 万，质押率 ${Math.round(stockRatio(code) * 100)}%）`);
  s.mkt.hold[code].pledged = (s.mkt.hold[code].pledged || 0) + n;
  return { ok: true, loan: l, amount };
}
/** 履约保障比例 = 股票现值 ÷ 欠款 */
export const collValue = (s, c) => (c.kind === 'own' ? LS.marketCap(s) * c.pct : c.kind === 'stock' ? SK.price(s, c.code) * c.n : 0);
export const coverOf = (s, l) => (l.principal > 0 ? collValue(s, l.collateral) / l.principal : Infinity);

// ---------- 艺术品质押 ----------
const AP = B.artPledge;
export const artRatio = (it) => (AQ.AQ[it.id] && AQ.AQ[it.id].limit === 1 ? AP.ratio[1] : AP.ratio[0]); // 孤品 50%，其他 40%
export function whyNotArtPledge(s, bk, uid) {
  if (!AP.banks.includes(bk)) return '艺术品质押只有瑞鑫私行做';
  if (!isPrivateAt(s, bk)) return `要先是${B.private[bk].name}客户（金融资产 ≥ ${Math.round(B.private[bk].min / 1e8)} 亿）`;
  const it = AQ.pieces(s).find((x) => x.uid === uid); if (!it) return '没有这件';
  if (it.fake) return '银行鉴定是仿品，不收';
  if (it.pledged) return '已经押着了';
  return null;
}
export function pledgeArt(s, bk, uid, t) {
  const why = whyNotArtPledge(s, bk, uid); if (why) return { ok: false, why };
  const it = AQ.pieces(s).find((x) => x.uid === uid); const amount = Math.floor(it.est * artRatio(it));
  const l = mkLoan(s, bk, 'art', amount, t, { kind: 'art', uid }, `${AQ.AQ[it.id].name}（估值 ${Math.round(it.est / 1e4)} 万，质押率 ${Math.round(artRatio(it) * 100)}%；押着期间不能卖、不能借展）`);
  it.pledged = l.id;
  return { ok: true, loan: l, amount };
}

// ---------- 共用：放款、到期、强平、处置、解押 ----------
function mkLoan(s, bk, type, amount, t, collateral, what) {
  const X = bank(s); const K = B.banks[bk]; const C = type === 'stock' ? SP : AP; const rate = rateFor(s, bk, type);
  const stamp = r2(amount * TAX.stamp.loan); X.seq = (X.seq || 0) + 1;
  const ct = addContract(s, { prefix: 'ZY', kind: 'loan', title: type === 'stock' ? '股票质押合同' : '艺术品质押合同', parties: [['质权人', K.name], ['出质人', s.bossName || '老板'], ['借款人', s.companyName || '我的公司']], subject: `${what}；借款用于公司经营，专款专用`, rows: [['借款金额', amount], ['年利率', `${(rate * 100).toFixed(2)}%（游戏年）`], ['期限', `${C.years} 个游戏年，按月付息、到期还本`], ...(type === 'stock' ? [['预警线 / 平仓线', `履约保障比例 ${SP.warn * 100}% / ${SP.liquidate * 100}%`]] : []), ['印花税（0.005%）', stamp]], total: amount, wallet: 'company' }, t);
  receive(s, { wallet: 'company', cat: 'loan_in', amount, party: K.name, ref: ct.no, note: `${K.name}${type === 'stock' ? '股票质押' : '艺术品质押'}放款（专款专用）` }, t);
  pay(s, { wallet: 'company', cat: 'tax_company', amount: stamp, force: true, party: '税务局', ref: ct.no, note: '借款合同印花税' }, t);
  X.restricted += amount;
  const l = { id: type + X.seq, bank: bk, type, principal: amount, amount, rate, n: 0, left: 0, payment: 0, project: null, overdue: 0, contract: ct.no, start: t, end: t + C.years * YEAR_MS, collateral };
  if (X.month == null) X.month = monthIndex(s, t); // 从放款这个月起按月付息
  X.loans.push(l); return l;
}
/** 还清了：专款专用的额度不超过还欠着的贷款 */
const capRestricted = (s) => { const X = bank(s); X.restricted = Math.min(X.restricted, loanDebt(s)); };
/** 解押（还清后） */
function release(s, l) {
  const c = l.collateral; if (!c) return; if (!bank(s).loans.includes(l)) capRestricted(s);
  if (c.kind === 'own') { if (s.cap) s.cap.pledgedPct = Math.max(0, (s.cap.pledgedPct || 0) - c.pct); }
  else if (c.kind === 'stock') { const h = s.mkt && s.mkt.hold[c.code]; if (h) h.pledged = Math.max(0, (h.pledged || 0) - c.n); }
  else { const it = AQ.pieces(s).find((x) => x.uid === c.uid); if (it) delete it.pledged; }
}
/** 银行处置抵押物：股票按市价卖（强平）/ 古董送拍；卖得的钱先还贷款，剩下的回个人 */
function seize(s, l, t, why) {
  const X = bank(s); const K = B.banks[l.bank]; const c = l.collateral; let got = 0;
  release(s, l);
  if (c.kind === 'own') { // 银行在二级市场卖：不受锁定期和每期减持上限（借 listing.reduce 记账，卖完把窗口还原）
    const X = s.listing.listed; const pct = Math.min(c.pct, stakeOf(s)); const keep = [X.lockUntil, X.win, X.used]; X.lockUntil = 0; X.win = t; X.used = LS.LCFG.reduceMax - pct; const c0 = s.cash;
    const r = LS.reduce(s, pct, t); [X.lockUntil, X.win, X.used] = keep; if (r.ok) got = s.cash - c0;
  } else if (c.kind === 'stock') { const c0 = s.cash; const r = SK.sell(s, c.code, Math.min(c.n, (s.mkt.hold[c.code] || {}).n || 0), t); if (r.ok) got = s.cash - c0; }
  else { const c0 = s.cash; const r = AQ.sell(s, c.uid, t, () => 0.5); if (r.ok) got = s.cash - c0; }
  const back = Math.min(got, l.principal);
  if (back > 0) pay(s, { wallet: 'personal', cat: 'pledge_repay', amount: back, force: true, party: K.name, ref: l.contract, note: `${why}：处置所得还${l.type === 'stock' ? '股票质押' : '艺术品质押'}借款` }, t);
  const rest = r2(l.principal - back); if (rest > 0.01) pay(s, { wallet: 'company', cat: 'loan_out', amount: rest, force: true, party: K.name, ref: l.contract, note: `${why}：处置不够，从公司账户划扣` }, t);
  X.loans = X.loans.filter((x) => x !== l); capRestricted(s);
  addMsg(s, { kind: 'system', type: 'loan', title: `${K.name}${why}`, body: `${c.kind === 'own' ? `自己公司 ${+(c.pct * 100).toFixed(2)}% 的股份被银行在二级市场卖了` : c.kind === 'stock' ? `${SK.BY[c.code].name} ${c.n} 股按市价卖了` : '藏品送拍了'}，得 ${Math.round(got)} 元，先还借款 ${Math.round(l.principal)} 元。` }, t);
}
setPledgeHooks((s, l, t) => seize(s, l, t, '逾期 3 期，处置质押物'), release);
/** 每秒 / 离线：股票质押看履约保障比例（150% 预警、130% 强平）；到期还本（公司账户不够就处置） */
export function tickPledge(s, t) {
  const ev = [...tickPrivate(s, t)]; if (!s.bank) return ev;
  for (const l of [...s.bank.loans]) {
    if (!l.collateral) continue;
    if (l.type === 'stock') {
      const cv = coverOf(s, l);
      if (cv <= SP.liquidate) { seize(s, l, t, `履约保障比例跌到 ${Math.round(cv * 100)}%，强制平仓`); ev.push('股票质押强制平仓'); continue; }
      if (cv <= SP.warn && !l.warned) { l.warned = true; addMsg(s, { kind: 'system', type: 'loan', from: (s.positions || {}).cfo || '', title: `⚠️ 股票质押预警：履约保障比例 ${Math.round(cv * 100)}%`, body: `跌到 ${SP.liquidate * 100}% 银行会强制平仓。可以提前还款（财富 → 银行 → 我的贷款）。` }, t); ev.push('股票质押预警'); }
      if (cv > SP.warn * 1.05) l.warned = false;
    }
    if (t >= l.end) {
      if (canPay(s, 'company', l.principal)) { pay(s, { wallet: 'company', cat: 'loan_out', amount: l.principal, party: B.banks[l.bank].name, ref: l.contract, note: `${l.type === 'stock' ? '股票质押' : '艺术品质押'}到期还本` }, l.end); s.bank.loans = s.bank.loans.filter((x) => x !== l); release(s, l); capRestricted(s); ev.push('质押借款到期还清，解押了'); }
      else { seize(s, l, t, '到期公司还不上，处置质押物'); ev.push('质押借款到期还不上，被处置'); }
    }
  }
  return ev;
}
export { finAssets, privateTier };
