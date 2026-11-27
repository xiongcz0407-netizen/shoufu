// 财务报表（第 13 项，设计15 第三节 + 设计17 第三节）：从流水算利润表、个人收支、纳税、资产清单
import * as BK from './books.js?v=f00c2612';   // 设计79 第三版：报表数字从累加器拿
import { CATS } from './ledger.js?v=f00c2612';
import { MONTH_MS, YEAR_MS } from './gametime.js?v=f00c2612';
import { INDUSTRIES } from '../config/industries.js?v=f00c2612';

export const PERIODS = [['day', '今天'], ['month', '本月'], ['year', '本年'], ['all', '全部']];
/** 时间段起点（游戏日 / 月 / 年，从开局算） */
export function periodFrom(s, p, t) {
  const el = t - s.createdAt;
  if (p === 'day') return s.createdAt + Math.floor(el / (MONTH_MS / 30)) * (MONTH_MS / 30);
  if (p === 'month') return s.createdAt + Math.floor(el / MONTH_MS) * MONTH_MS;
  if (p === 'year') return s.createdAt + Math.floor(el / YEAR_MS) * YEAR_MS;
  return -Infinity;
}
/** 流水 + 还没写进流水的按秒累计（营收、进货、持有成本） */
export function allRows(s, t) {
  const v = Object.entries(s.accruals || {}).filter(([, x]) => x.amount >= 0.01).map(([k, x]) => ({ id: 'acc_' + k, t, wallet: x.wallet, dir: x.dir || 'in', cat: x.cat, amount: x.amount, note: x.note || k, by: '', party: '', ref: '', pending: true }));
  return [...(s.ledger || []), ...v];   // 明细（最近 300 条，流水页给人看）
}
/** 设计79：from 到现在的「假流水」（累加器格子变的，字段跟明细一样）+ 还没写进流水的按秒累计。报表都用这个 */
export function periodRows(s, from, t) {
  const v = Object.entries(s.accruals || {}).filter(([, x]) => x.amount >= 0.01).map(([k, x]) => ({ t, wallet: x.wallet, dir: x.dir || 'in', cat: x.cat, amount: x.amount, note: x.note || k, by: '', party: '', ref: '', pending: true }));
  return [...BK.rowsOf(BK.cellsSince(s, from, t), from), ...v];
}
export const inPeriod = (rows, from) => rows.filter((r) => r.t >= from);
const sum = (rows) => rows.reduce((a, r) => a + r.amount, 0);
const net = (rows) => rows.reduce((a, r) => a + (r.dir === 'in' ? -r.amount : r.amount), 0); /* 支出类别里的冲回（备货卖掉冲回进货成本）算负数 */
const byCat = (rows, cats) => rows.filter((r) => !r.memo && cats.includes(r.cat));
/** 公司利润表 */
export const companyPL = (s, from, t) => plOf(periodRows(s, from, t));
/** 利润表：在 core/pl.js（设计93：月底算月度利润也要用，拆出来免得循环引用） */
export { plOf } from './pl.js?v=f00c2612';
import { plOf } from './pl.js?v=f00c2612';
/** 个人收支 */
export const personal = (s, from, t) => personalOf(periodRows(s, from, t));
export function personalOf(all) {
  const rows = all.filter((r) => r.wallet === 'personal' && !r.memo && !['debug', 'deposit_in', 'deposit_out', 'transfer_in', 'transfer_out'].includes(r.cat)); // 存取款是转账，不算收支（设计62：个人 ↔ 投资账户转账也不算）
  const group = (dir) => { const o = {}; for (const r of rows.filter((x) => x.dir === dir)) o[r.cat] = (o[r.cat] || 0) + r.amount; return Object.entries(o).map(([k, v]) => [CATS[k] ? CATS[k][0] : k, v]).sort((a, b) => b[1] - a[1]); };
  const inc = group('in'), out = group('out');
  return { inc, out, incTotal: inc.reduce((a, x) => a + x[1], 0), outTotal: out.reduce((a, x) => a + x[1], 0) };
}
/** 纳税：按税种、个人 / 公司；代扣个税；税负率 */
export function taxes(s, from, t) {
  const list = (s.taxes || []).filter((x) => x.t >= from);   // 完税凭证明细（最近 100 张，给人看）
  const kinds = {}; for (const [kk, v] of Object.entries(BK.taxSince(s, from, t))) { const [kind, p] = kk.split('|'); const k = `${kind}（${p === 'p' ? '个人' : '公司'}）`; kinds[k] = (kinds[k] || 0) + v; }   // 设计79：合计从 books.tax
  return { ...taxesOf(periodRows(s, from, t)), kinds: Object.entries(kinds).sort((a, b) => b[1] - a[1]), list, due: (s.taxDue || []).reduce((a, x) => a + x.amount, 0) };
}
export function taxesOf(rows) {
  const personalTax = sum(rows.filter((r) => r.cat === 'tax_personal'));
  const withheld = sum(rows.filter((r) => r.cat === 'iit_withheld'));
  const pl = plOf(rows);
  const company = sum(rows.filter((r) => r.cat === 'tax_company' && !r.memo));
  return { personalTax, withheld, company, burden: pl.rev ? company / pl.rev : 0 };
}
/** 流水筛选 */
export function ledgerView(s, { wallet, cat, by, from }, t) {
  return inPeriod(allRows(s, t), from).filter((r) => (!wallet || r.wallet === wallet) && (!cat || r.cat === cat) && (!by || r.by === by)).sort((a, b) => b.t - a.t);
}

// ---------- 第 2-15 项：资产负债表、资产清单 ----------
import * as EC from './economy.js?v=f00c2612';
import { depositTotal, loanDebt } from './bank.js?v=f00c2612';
import { debt as bridgeDebt } from './rivalry.js?v=f00c2612';
import { equityOwed } from './equity.js?v=f00c2612';
import { payables } from './accrual.js?v=f00c2612';
import { fleetValue } from './logistics.js?v=f00c2612';
import { reValue } from './realestate.js?v=f00c2612';
import * as AS from './assets.js?v=f00c2612';
import * as YT from './yacht.js?v=f00c2612';
import * as LX from './luxury.js?v=f00c2612';
import * as AQ from './antique.js?v=f00c2612';
import * as OF from './offshore.js?v=f00c2612';
import * as SK from './stocks.js?v=f00c2612';
import * as TR from './trade.js?v=f00c2612'; // 设计43 第二版：挂单中
import { SEC_BY_ID } from '../config/secretaries.js?v=f00c2612';
import * as LMK from './landmark.js?v=f00c2612';
import { paidIn as paidInOf } from './companytax.js?v=f00c2612';

const r2b = (v) => Math.round(v * 100) / 100;
const tot = (rows) => r2b(rows.reduce((a, r) => a + r[1], 0));
/** 资产负债表：公司 + 个人；个人净资产 = 身价 */
export function balanceSheet(s) {
  const P = payables(s);
  const cA = [['公司账户', s.company || 0], ['银行存款（公司）', depositTotal(s, 'company')], [`经营估值（年净利 × 市盈率${EC.scaleK && EC.scaleK(s, 1) < 1 ? '，非上市规模折价' : ''}）`, EC.earningsValue(s)], ['收购来的公司（股权）', s.acquiredValue || 0], ['地产项目和持有物业', reValue(s)], ['物流车队（账面价值）', fleetValue(s)], ['地标建筑（估值）', LMK.value(s)], ['地标收购定金（共管账户）', LMK.escrow(s)]].filter((r) => Math.abs(r[1]) >= 0.01);
  const cL = [['银行贷款（本金）', loanDebt(s)], ['瑞霖过桥融资', bridgeDebt(s)], ['应付股权转让款（收购分期）', equityOwed(s)], ['应付工资、房租、杂费', P.labor + P.rent + P.other + P.owed], ['应交税费（增值税、附加、所得税、待申报）', P.vat + P.surcharge + P.cit + P.due]].filter((r) => Math.abs(r[1]) >= 1);
  const company = { assets: cA, liabilities: cL, A: tot(cA), L: tot(cL) }; company.equity = r2b(company.A - company.L); company.stake = EC.stakeOf ? EC.stakeOf(s) : 1; company.paidIn = paidInOf(s); company.retained = r2b(company.equity - company.paidIn);
  const g = s.garage || { cars: [], houses: [], planes: [] }; const byKind = (k, f = () => true) => ((g[k] || []).filter((id) => AS.ITEM[id] && f(AS.ITEM[id])).reduce((a, id) => a + AS.sellPrice(s, id), 0));
  const kindSum = (kind) => LX.mine(s, kind).reduce((a, id) => a + LX.sellPrice(s, id), 0);
  const mgr = s.mkt && s.mkt.mgr ? s.mkt.mgr.value : 0;
  const pA = [['个人现金', s.cash || 0], ['投资账户现金', s.invest || 0], ['银行存款（个人）', depositTotal(s, 'personal')], ['车', byKind('cars')], ['房产（国内）', byKind('houses', (it) => !OF.isAbroad(it))], ['房产（香港、海外）', byKind('houses', (it) => OF.isAbroad(it))], ['飞机', byKind('planes')], ['游艇', YT.value(s)], ['名表', kindSum('watch')], ['西装', kindSum('suit')], ['古董藏品（估价）', AQ.value(s)], ['股票（现价）', s.mkt ? SK.holdValue(s) : 0], ['交给投资经理的', mgr], ['挂单中（股票条件单里的钱和股票）', s.mkt ? TR.orderValue(s) : 0], [`公司股权（你持股 ${+(company.stake * 100).toFixed(2)}%）`, r2b(company.equity * company.stake)], ['其他（上市市值等）', EC.netWorth(s) - (s.cash + (s.invest || 0) + (s.assetValue || 0) + depositTotal(s, 'personal') + (EC.companyEquity ? EC.companyEquity(s) : company.equity) * company.stake)]].filter((r) => Math.abs(r[1]) >= 0.01);
  const pL = [['股票质押、艺术品质押（阶段三）', 0]];
  const personal = { assets: pA, liabilities: pL, A: tot(pA), L: 0 }; personal.net = personal.A;
  return { company, personal, netWorth: EC.netWorth(s) };
}
/** 资产清单：按类别分组，每组件数、买入合计、现价合计；每件一行 */
export function assetList(s) {
  const G = []; const add = (name, items) => { if (items.length) G.push({ name, items, buy: tot(items.map((x) => [0, x.buy])), now: tot(items.map((x) => [0, x.now])) }); };
  const g = s.garage || { cars: [], houses: [], planes: [], meta: {} }; const meta = g.meta || {};
  const gi = (ids) => ids.filter((id) => AS.ITEM[id]).map((id) => { const it = AS.ITEM[id]; const m = meta[id] || {}; return { name: AS.label(it), no: m.no ? `No.${String(m.no).padStart(3, '0')} / ${it.limit}` : '', buy: m.price || it.price, now: AS.sellPrice(s, id), at: m.at, upkeep: AS.upkeepYear(s, id) + (OF.isAbroad(it) ? OF.yearlyOf(s, id) : 0), ref: m.contract || '', rented: !!(s.rented && s.rented[id]), rare: it.limit ? (it.limit === 1 ? 'unique' : 'limited') : '' }; });
  add('车', gi(g.cars || [])); add('房产（国内）', gi((g.houses || []).filter((id) => !OF.isAbroad(AS.ITEM[id])))); add('房产（香港、海外）', gi((g.houses || []).filter((id) => OF.isAbroad(AS.ITEM[id])))); add('飞机', gi(g.planes || []));
  add('游艇', YT.mine(s).map((id) => { const y = YT.Y[id]; const m = meta[id] || {}; return { name: YT.label(y), no: m.no ? `No.${String(m.no).padStart(3, '0')} / ${y.limit}` : '', buy: m.price || y.price, now: YT.sellPrice(s, id), at: m.at, upkeep: YT.upkeepYear(s, id), ref: m.contract || '', rented: !!(s.rented && s.rented[id]), rare: y.limit ? (y.limit === 1 ? 'unique' : 'limited') : '' }; }));
  for (const [kind, name] of [['watch', '名表'], ['suit', '西装']]) add(name, LX.mine(s, kind).map((id) => { const x = LX.L[id]; const m = (s.lux && s.lux.meta[id]) || {}; return { name: LX.label(x), no: m.no ? `No.${String(m.no).padStart(3, '0')} / ${x.limit}` : '', buy: m.price || x.price, now: LX.sellPrice(s, id), at: m.at, upkeep: 0, ref: m.contract || m.inv || '', rare: x.limit ? (x.limit === 1 ? 'unique' : 'limited') : '' }; }));
  add('古董藏品', AQ.pieces(s).map((it) => { const x = AQ.AQ[it.id]; return { name: x.name + (it.fake ? '（仿品）' : ''), no: '', buy: it.paid, now: it.est, at: it.at, upkeep: 0, ref: it.contract || '', rare: x.limit === 1 ? 'unique' : x.limit ? 'limited' : '' }; }));
  if (s.mkt) add('股票', SK.holdings(s).map((h) => ({ name: `${SK.BY[h.code].name}（${h.code}）${h.n.toLocaleString()} 股`, no: '', buy: r2b(h.cost * h.n), now: h.value, at: h.at, upkeep: 0, ref: '' })));
  if (s.mkt && s.mkt.mgr) add('交给投资经理的', [{ name: '投资经理代管', no: '', buy: s.mkt.mgr.principal, now: s.mkt.mgr.value, upkeep: 0, ref: '' }]);
  // 设计30：没有境外账户、香港子公司了
  if (s.landmark) add('地标（公司持有）', LMK.mine(s).map((id) => { const x = LMK.LM[id]; const o = LMK.lm(s).own[id]; return { name: `${x.name}（${x.city}）`, no: '', buy: o.price, now: LMK.valOf(o), at: o.at, upkeep: LMK.yearly(x, LMK.valOf(o)).opex + LMK.yearly(x, LMK.valOf(o)).tax, ref: o.contract, rare: 'unique' }; }));
  const bs = balanceSheet(s); const mineEq = r2b(bs.company.equity * bs.company.stake); add('公司股权', [{ name: `${s.companyName || '公司'}（你持股 ${+(bs.company.stake * 100).toFixed(2)}%）`, no: '', buy: mineEq, now: mineEq, upkeep: 0, ref: '' }]);
  return G;
}
/** 送给秘书的：按秘书分（礼物、衣服、名包），件数和金额 */
export function giftsBySec(s) {
  const out = {};
  const put = (id, kind, amt, n = 1) => { if (!SEC_BY_ID[id]) return; const o = (out[id] = out[id] || { gift: [0, 0], clothes: [0, 0], bag: [0, 0] }); o[kind][0] += n; o[kind][1] += amt; };   // n：汇总行记着几条（设计79）
  for (const id of Object.keys(BK.books(s).sec)) { const b = BK.secBook(s, id); if (b.gift) put(id, 'gift', b.gift[1], b.gift[0]); if (b.cloth) put(id, 'clothes', b.cloth[1], b.cloth[0]); }   // 设计79：从 books.sec（记账时按秘书加好）
  for (const x of (s.lux && s.lux.given) || []) put(x.sec, 'bag', LX.L[x.id] ? LX.L[x.id].price : 0);
  return out;
}
