// 举牌、要约收购、换股收购（第 3-05 项，设计23 第七节）
// 验收阶段三：个人买只算投资（最多 5% 以下）；「公司买」的才举牌、要约、控股（公司账户，要约可以用并购贷款）；个人持有的可以按市价转给公司（个人交 20% 财产转让所得）
// 股票列表里的公司：公司持股每 5% 举牌公告（core/stocks.js stake）；二级市场最多买到 30%，再往上要发要约（价格 ≥ 最近 3 个游戏天均价 = 现实 30 天 ÷ profitMul），
// 要约期 3 个游戏天，股东按溢价决定卖多少；到 50% 以上 = 控股（并进集团，资本页、集团页显示）
// 换股：上市以后收购对手（battle.acquire 的挂钩），最多 50% 用你公司的新股付，按你的股价算，你的持股被稀释
import CFG from '../config/takeover.json?v=d69b03f5' with { type: 'json' };
import SCFG from '../config/stocks.json?v=d69b03f5' with { type: 'json' };
import * as SK from './stocks.js?v=d69b03f5';
import { pay, receive, canPay } from './ledger.js?v=d69b03f5';
import { taxRec } from './fiscal.js?v=d69b03f5';
import { addCompanyAssetHook } from './economy.js?v=d69b03f5';
import { maMax, whyNotMa, maLoan } from './bank.js?v=d69b03f5';
import { holder, isSec } from './posts.js?v=d69b03f5';
import { addContract } from './contracts.js?v=d69b03f5';
import { MONTH_MS } from './gametime.js?v=d69b03f5';
import { addMsg } from './inbox.js?v=d69b03f5';
import { addAttrHook } from './boss.js?v=d69b03f5';
import { setSwapHook } from './battle.js?v=d69b03f5';
import { cap } from './capital.js?v=d69b03f5';
import { listed, marketCap } from './listing.js?v=d69b03f5';

export const TCFG = CFG;
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (n) => (Math.abs(n) >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : Math.abs(n) >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);
const DAY = () => MONTH_MS / 30;
const total = (code) => SK.BY[code].shares * 1e8;
const freeCo = (s) => (s.company || 0) - ((s.bank && s.bank.restricted) || 0);
const cfoBy = (s) => { const m = holder(s, 'cfo'); return isSec(m) ? m : ''; };
const LOAN_BANK = 'gongshang';
/** 公司持股 s.mkt.coHold：{ code: { n, cost, at } } */
export const coHold = (s) => { const m = SK.mkt(s); m.coHold = m.coHold || {}; return m.coHold; };
/** s.takeover：{ offers: { code: { target, price, start, end, frozen } }, ctrl: { code: { at, pct } } } */
export function tk(s) { const d = (s.takeover = s.takeover || {}); d.offers = d.offers || {}; d.ctrl = d.ctrl || {}; return d; }
export const pctOf = (s, code) => { const h = coHold(s)[code]; return h ? h.n / total(code) : 0; };
export const myPct = (s, code) => { const h = SK.mkt(s).hold[code]; return h ? h.n / total(code) : 0; };
export const coValue = (s) => (s.mkt && s.mkt.coHold ? Object.entries(s.mkt.coHold).reduce((a, [c, h]) => a + (SK.BY[c] ? h.n * SK.price(s, c) : 0), 0) : 0);
addCompanyAssetHook(coValue);   // 公司持有的股票算公司资产（进公司估值）

// ---------- 公司买卖、个人转给公司 ----------
const slip = (s, code, title, sub, rows, total, t) => addContract(s, { prefix: 'JG', kind: 'stock', title, parties: [['股东', s.companyName || '我的公司'], ['券商', '华太正券']], subject: sub, rows, total, wallet: 'company' }, t);
export function whyNotCoBuy(s, code, n) {
  if (!SK.BY[code]) return '没有这只股票'; n = Math.floor(n); if (n < 1) return '最少 1 股';
  if ((((coHold(s)[code] || { n: 0 }).n) + n) / total(code) > SCFG.stake.tender + 1e-12) return `公司持股要超过 ${SCFG.stake.tender * 100}%：二级市场不能再买，只能发要约收购`;
  if (freeCo(s) < SK.quote(s, code, n, 'buy').total) return '公司账户自有资金不够（融资款、贷款不能炒股）';
  return null;
}
/** 公司全仓（任务板 V0.2.11 第 1e 项）：公司账户自有资金最多能买几股（二级市场最多到 30%） */
export const maxCoBuy = (s, code) => SK.maxBuyN(s, code, freeCo(s), Math.max(0, Math.floor(SCFG.stake.tender * total(code)) - ((coHold(s)[code] || { n: 0 }).n)));
export function coBuy(s, code, n, t) {
  n = Math.floor(n); const why = whyNotCoBuy(s, code, n); if (why) return { ok: false, why };
  const q = SK.quote(s, code, n, 'buy'); const x = SK.BY[code];
  const ct = slip(s, code, '交割单（公司账户）', `买入 ${x.name}（${code}）${n.toLocaleString()} 股，成交价 ${q.exec}`, [['成交金额', q.gross, ''], ['佣金、过户费', q.fees, '']], q.total, t);
  pay(s, { wallet: 'company', cat: 'co_stock', amount: q.total, ref: ct.no, party: '证券账户（公司）', by: cfoBy(s), note: `公司买入 ${x.name} ${n.toLocaleString()} 股` }, t);
  const h = coHold(s)[code] || (coHold(s)[code] = { n: 0, cost: 0, at: t }); if (!h.n) h.at = t; h.cost = r2((h.cost * h.n + q.total) / (h.n + n)); h.n += n;
  return { ok: true, quote: q, slip: ct, stake: SK.stake(s, code) };
}
/** 公司卖：钱回公司账户，赚的进企业所得税 */
export function coSell(s, code, n, t) {
  const h = coHold(s)[code]; n = Math.floor(n); if (!h || h.n < n || n < 1) return { ok: false, why: '公司没有这么多股' };
  if (controls(s, code) && (h.n - n) / total(code) < CFG.controlLine) delete tk(s).ctrl[code];
  const q = SK.quote(s, code, n, 'sell'); const x = SK.BY[code]; const gain = r2(q.total - h.cost * n);
  const ct = slip(s, code, '交割单（公司账户）', `卖出 ${x.name}（${code}）${n.toLocaleString()} 股，成交价 ${q.exec}`, [['成交金额', q.gross, ''], ['佣金、过户费、印花税', -q.fees, '']], q.total, t);
  receive(s, { wallet: 'company', cat: 'co_stock_sell', amount: q.total, ref: ct.no, party: '证券账户（公司）', by: cfoBy(s), note: `公司卖出 ${x.name} ${n.toLocaleString()} 股（${gain >= 0 ? '赚' : '亏'} ${fmt(Math.abs(gain))}，进企业所得税）` }, t);
  for (const k of ['qtr', 'yearAcc']) { const z = (s[k] = s[k] || {}); z.rev = z.rev || {}; z.rev.invest = (z.rev.invest || 0) + gain; }
  h.n -= n; if (!h.n) delete coHold(s)[code];
  return { ok: true, quote: q, gain };
}
/** 个人持有的（没质押的）按现价转给公司：公司付钱，个人交 20% 财产转让所得 */
export function transferQuote(s, code) { const h = SK.mkt(s).hold[code]; if (!h) return null; const n = h.n - (h.pledged || 0); const px = SK.price(s, code); const amt = r2(n * px); const gain = r2((px - h.cost) * n); return { n, px, amount: amt, gain, tax: r2(Math.max(0, gain) * CFG.transferTax) }; }
export function whyNotTransfer(s, code) { const q = transferQuote(s, code); if (!q || q.n < 1) return '个人没有能转的（质押的不能转）'; if ((((coHold(s)[code] || { n: 0 }).n) + q.n) / total(code) > SCFG.stake.tender + 1e-12) return '转过去公司持股会超过 30%'; if (freeCo(s) < q.amount) return '公司账户自有资金不够'; return null; }
export function transfer(s, code, t) {
  const why = whyNotTransfer(s, code); if (why) return { ok: false, why };
  const q = transferQuote(s, code); const x = SK.BY[code]; const h = SK.mkt(s).hold[code];
  const ct = addContract(s, { prefix: 'GZ', kind: 'stock', title: '股份转让协议（个人 → 公司）', parties: [['转让方', s.bossName || '老板'], ['受让方', s.companyName || '我的公司']], subject: `${x.name}（${code}）${q.n.toLocaleString()} 股，按现价 ${q.px} 元`, rows: [['转让价款', q.amount, '公司账户付'], ['财产转让所得个税', q.tax, `（现价 − 成本）× 20%`]], total: q.amount, wallet: 'company' }, t);
  pay(s, { wallet: 'company', cat: 'co_stock', amount: q.amount, ref: ct.no, party: s.bossName || '老板', note: `受让老板持有的 ${x.name} ${q.n.toLocaleString()} 股` }, t);
  receive(s, { wallet: 'personal', cat: 'stock_sell', amount: q.amount, ref: ct.no, party: s.companyName || '公司', note: `${x.name} ${q.n.toLocaleString()} 股转给公司` }, t);
  if (q.tax >= 0.01) { const c = taxRec(s, { kind: '财产转让所得个税', base: q.gain, rate: CFG.transferTax, amount: q.tax, t }); pay(s, { wallet: 'personal', cat: 'tax_personal', amount: q.tax, tax: q.tax, ref: c || ct.no, party: '税务局', note: '股份转给公司：财产转让所得 20%', force: true }, t); }
  h.n -= q.n; if (!h.n) delete SK.mkt(s).hold[code];
  const c2 = coHold(s)[code] || (coHold(s)[code] = { n: 0, cost: 0, at: t }); if (!c2.n) c2.at = t; c2.cost = r2((c2.cost * c2.n + q.amount) / (c2.n + q.n)); c2.n += q.n;
  return { ok: true, ...q, contract: ct, stake: SK.stake(s, code) };
}
export const controls = (s, code) => !!(s.takeover && s.takeover.ctrl && s.takeover.ctrl[code]);
/** 要约最低价：最近 3 个游戏天的均价（长线历史每 20 跳一个点） */
export function avgPrice(s, code) {
  const m = SK.mkt(s); const pts = Math.max(1, Math.round(CFG.avgDays * DAY() / (SCFG.tickSec * 1000) / SCFG.history.longEvery));
  const a = (m.long[code] || []).slice(-pts); const b = a.length ? a : [m.px[code]];
  return r2(b.reduce((x, y) => x + y, 0) / b.length);
}
/** 要约报价：目标持股、溢价 → 价格、要买的股数、要冻结的钱 */
export function offerQuote(s, code, target, premium) {
  const price = r2(avgPrice(s, code) * (1 + premium)); const need = Math.max(0, Math.round((target - pctOf(s, code)) * total(code)));
  return { price, need, cost: r2(need * price), floor: avgPrice(s, code), now: SK.price(s, code) };
}
export function whyNotOffer(s, code, target, premium, loan = false) {
  if (!SK.BY[code]) return '没有这只股票';
  if (tk(s).offers[code]) return '要约还在进行中';
  if (pctOf(s, code) < SCFG.stake.notice) return `公司先在二级市场买到 ${SCFG.stake.notice * 100}% 举牌（「公司买」）`;
  if (!CFG.targets.includes(target) || !CFG.premiums.includes(premium)) return '条件不对';
  if (target <= pctOf(s, code) + 1e-9) return '你已经有这么多了';
  const q = offerQuote(s, code, target, premium);
  if (freeCo(s) + (loan ? maMax(s, q.cost, q.cost) : 0) < q.cost) return `要约要准备 ${fmt(q.cost)}（公司自有资金${loan ? ' + 并购贷款' : ''}还差 ${fmt(q.cost - freeCo(s) - (loan ? maMax(s, q.cost, q.cost) : 0))}）`;
  if (loan) { const w = whyNotMa(s, LOAN_BANK, q.cost, q.cost, Math.max(1, Math.floor(maMax(s, q.cost, q.cost)))); if (w) return `并购贷款：${w}`; }
  return null;
}
/** 发要约：发《要约收购报告书》，冻结钱，要约期 3 个游戏天 */
export function offer(s, code, target, premium, t, { loan = false } = {}) {
  const why = whyNotOffer(s, code, target, premium, loan); if (why) return { ok: false, why };
  const q = offerQuote(s, code, target, premium); const x = SK.BY[code];
  const ct = addContract(s, { prefix: 'YY', kind: 'stock', title: '要约收购报告书', parties: [['收购人', s.companyName || '我的公司'], ['被收购公司', `${x.name}（${code}）`]], subject: `以每股 ${q.price} 元（最近 ${CFG.avgDays} 个游戏天均价 ${q.floor}${premium ? ` 溢价 ${premium * 100}%` : ''}）向全体股东要约收购，目标持股 ${target * 100}%`, rows: [['预计收购股数', q.need, '股'], ['预计收购资金', q.cost, loan ? '公司账户 + 并购贷款' : '公司账户']], total: q.cost, wallet: 'company' }, t);
  tk(s).offers[code] = { target, premium, price: q.price, start: t, end: t + CFG.offerDays * DAY(), contract: ct.no, loan };
  SK.mkt(s).px[code] = r2(Math.max(SK.mkt(s).px[code], q.price * CFG.priceToOffer));   // 要约一出，股价向要约价靠
  return { ok: true, quote: q, contract: ct };
}
/** 股东接受比例：要约价比现价高得越多，卖的人越多 */
export const acceptRate = (s, code, price) => Math.max(CFG.accept.min, Math.min(CFG.accept.max, CFG.accept.base + (price / SK.price(s, code) - 1) * CFG.accept.perPremium));
/** 要约期满：按接受比例成交；到 50% 以上控股 */
export function settle(s, code, t) {
  const o = tk(s).offers[code]; const x = SK.BY[code]; const m = SK.mkt(s); void canPay;
  const CH = coHold(s); const mine = (CH[code] || { n: 0 }).n; const others = total(code) - mine - ((m.hold[code] || { n: 0 }).n); const want = Math.max(0, Math.round(o.target * total(code)) - mine);
  let n = Math.min(want, Math.round(Math.max(0, others) * acceptRate(s, code, o.price)));
  let loanAmt = 0; if (o.loan && n > 0) { const g0 = n * o.price; const mx = Math.floor(maMax(s, g0, g0)); if (mx > 0 && !whyNotMa(s, LOAN_BANK, g0, g0, mx)) loanAmt = mx; }
  n = Math.min(n, Math.floor(Math.max(0, freeCo(s) + loanAmt) / o.price));
  const gross = r2(n * o.price); let L = null;
  if (n > 0) {
    if (loanAmt > 0) { loanAmt = Math.min(loanAmt, gross); L = maLoan(s, LOAN_BANK, `${x.name}股份（要约收购）`, loanAmt, t); const c = (s.contracts || []).find((z) => z.no === L.contract); if (c) c.subject = `要约收购${x.name}（${code}）股份（专款专用；以收购的股份质押）`; }
    pay(s, { wallet: 'company', cat: 'co_stock', amount: gross, ref: o.contract, by: cfoBy(s), party: '要约收购（中登公司过户）', note: `要约收购 ${x.name} ${n.toLocaleString()} 股 × ${o.price}${loanAmt ? `（含并购贷款 ${fmt(loanAmt)}）` : ''}` }, t);
    const h = CH[code] || (CH[code] = { n: 0, cost: 0, at: t }); if (!h.n) h.at = t; h.cost = r2((h.cost * h.n + gross) / (h.n + n)); h.n += n;
  }
  delete tk(s).offers[code];
  const pct = pctOf(s, code); SK.stake(s, code);
  let ctrl = false; if (pct >= CFG.controlLine && !controls(s, code)) { tk(s).ctrl[code] = { at: t, pct }; ctrl = true; }
  if (controls(s, code)) tk(s).ctrl[code].pct = pct;
  return { n, gross, pct, ctrl, loan: loanAmt };
}
export function tick(s, t) {
  if (!s.takeover) return [];
  const out = [];
  for (const [code, o] of Object.entries(tk(s).offers)) if (t >= o.end) {
    const x = SK.BY[code]; const r = settle(s, code, t);
    out.push(`${x.name}要约期满：收到 ${r.n.toLocaleString()} 股（${fmt(r.gross)}），你现在持股 ${(r.pct * 100).toFixed(1)}%${r.ctrl ? `，成了控股股东！${x.name}并进你的集团` : r.pct < CFG.controlLine ? '，没到 50%，还不是控股股东' : ''}`);
  }
  for (const m of out) addMsg(s, { kind: 'system', type: 'takeover', title: '要约收购', body: m }, t);
  return out;
}
/** 控股的上市公司（集团页、资本页显示）：估算年净利 = 市值 ÷ 市盈率 */
export const controlled = (s) => Object.entries((s.takeover && s.takeover.ctrl) || {}).filter(([c]) => SK.BY[c]).map(([code, c]) => ({ code, name: SK.BY[code].name, pct: pctOf(s, code), mcap: SK.marketCap(s, code), profit: r2(SK.marketCap(s, code) / CFG.ctrlPE) }));
addAttrHook((s) => ({ network: (s.takeover ? Object.keys(s.takeover.ctrl || {}).length : 0) * CFG.ctrlNetwork }));

// ---------- 换股收购（battle.acquire 的挂钩） ----------
export const swapMax = (s, r, plan) => (listed(s) && plan === 'full' ? Math.floor(r.value * CFG.swapMax) : 0);
function swapWhy(s, r, plan, amount) {
  if (!listed(s)) return '上市以后才能用新股换股';
  if (plan !== 'full') return '分期收购不能换股';
  if (amount > swapMax(s, r, plan) + 1e-6) return `换股最多付 ${CFG.swapMax * 100}%`;
  return null;
}
/** 发新股给转让方：按现价，你的持股、投资人、激励池、期权一起稀释 */
function swapIssue(s, r, amount, t) {
  const X = s.listing.listed; const n = Math.round(amount / X.px); const k = X.shares / (X.shares + n);
  const C = cap(s); C.stake *= k; for (const h of C.holders) { h.pct *= k; if (h.pool) { h.free *= k; h.dil = (h.dil || 1) * k; } }
  for (const g of Object.values(C.options || {})) { g.pct *= k; g.done = (g.done || 0) * k; }
  C.holders.push({ name: `${r.boss}（换股）`, round: 'swap', roundName: `收购${r.name}换股`, pct: n / (X.shares + n), invest: amount });
  X.shares += n;
  return { n, price: X.px, pct: n / X.shares };
}
setSwapHook({ why: swapWhy, issue: swapIssue, row: (s, r, amount) => [`其中：以新股支付（换股，按 ${s.listing.listed.px} 元 / 股）`, amount, `${Math.round(amount / s.listing.listed.px).toLocaleString()} 股`] });
export { marketCap };
