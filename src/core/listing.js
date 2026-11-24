// 上市（第 3-04 项，设计23 第四节）：四个板块条件 → 选券商 → 股改 → 辅导 → 申报审核（可能问询）→ 发行定价 → 路演 → 敲钟
// 上市后：你的公司进股票列表（自己一只，跟大盘和利润走）；身价 = 市值 × 你的持股；锁定期后每 3 个游戏月最多减持 1%（限售股 20% 个税）；每年年报 + 分红
import CFG from '../config/listing.json?v=ad479e23' with { type: 'json' };
import { pay, receive, canPay, canPayMust } from './ledger.js?v=ad479e23';
import { addContract } from './contracts.js?v=ad479e23';
import { MONTH_MS, YEAR_MS } from './gametime.js?v=ad479e23';
import { taxRec } from './fiscal.js?v=ad479e23';
import { gm } from './calib.js?v=ad479e23';
import { addMsg } from './inbox.js?v=ad479e23';
import { holder, isSec } from './posts.js?v=ad479e23';
import { companyEquity, earningsValue, stakeOf, addNetWorthHook } from './economy.js?v=ad479e23';
import { cap, ipoPower } from './capital.js?v=ad479e23';
import { room } from './cashflow.js?v=ad479e23'; // V0.2.3
import * as SK from './stocks.js?v=ad479e23';

export const LCFG = CFG;
export const BOARDS = CFG.boards;
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (n) => (Math.abs(n) >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : Math.abs(n) >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);
const finSec = (s) => { const m = holder(s, 'ipo'); return m ? m : null; };   // 投融资总监（3-03，职位 ipo；外包 FA 也算一点）
const cfoSec = (s) => { const m = holder(s, 'cfo'); return isSec(m) ? m : null; };
export const STAGE = { reform: '股改', tutor: '辅导', review: '审核', inquiry: '审核问询（等你回复）', answering: '回复问询中', approved: '注册生效，等发行', roadshow: '路演定价', listed: '已上市', rejected: '被否' };

/** s.listing：{ stage, board, broker: [名, 承销费率, 问询概率], at, reviewEnd, inqAt, left, issue, contract, listed: { at, shares, px, hist, name, code, lockUntil, win, used, divYear } } */
export const lst = (s) => (s.listing = s.listing || {});
export const listed = (s) => !!(s.listing && s.listing.listed);
const monthsBack = (s, n) => (s.monthly || []).slice(-n).reduce((a, x) => a + (x.profit || 0), 0);
/** 年化净利（近 12 个游戏月的月报，不满按月均） */
export const profit12 = (s) => { const m = (s.monthly || []).slice(-12); return m.length ? m.reduce((a, x) => a + (x.profit || 0), 0) / m.length * 12 : 0; };
/** 公司里非经营那块（账户、存款、项目、车队、收购的、地标 − 负债） */
export const nonOperating = (s) => companyEquity(s) - earningsValue(s);
/** 发行前估值（投前）= 年净利 × 板块市盈率 + 非经营；亏损按经营估值 */
export function preMoney(s, board) { const p = profit12(s); return r2(Math.max(0, p > 0 ? p * BOARDS[board].pe : earningsValue(s)) + nonOperating(s)); }
/** 研发占全公司营收（近 12 个游戏月） */
function rndShare(s, t) {
  const rows = (s.ledger || []).filter((r) => r.wallet === 'company' && r.t > t - YEAR_MS && r.t <= t);
  const rnd = rows.filter((r) => r.cat === 'rnd').reduce((a, r) => a + r.amount, 0); const rev = rows.filter((r) => r.dir === 'in' && ['revenue', 'acquired_revenue', 'presale', 'rent_co'].includes(r.cat)).reduce((a, r) => a + r.amount, 0);
  return rev > 0 ? rnd / rev : 0;
}
/** 板块条件：[[说明, 现在, 要求, 达到没]] */
export function conditions(s, board, t = Date.now()) {
  const N = BOARDS[board].need; const out = [];
  if (N.profit3y) out.push(['最近 3 个游戏年累计净利', monthsBack(s, 36), N.profit3y, monthsBack(s, 36) >= N.profit3y]);
  if (N.profit1y) out.push(['最近 1 个游戏年净利', monthsBack(s, 12), N.profit1y, monthsBack(s, 12) >= N.profit1y]);
  if (N.tech) out.push(['有科技线', s.inds && s.inds.tech ? '有' : '没有', '有', !!(s.inds && s.inds.tech)]);
  if (N.rnd) { const x = rndShare(s, t); out.push(['研发占营收', `${(x * 100).toFixed(1)}%`, `${N.rnd * 100}%`, x >= N.rnd]); }
  if (N.cap) { const c = preMoney(s, board); out.push(['预计市值（发行前）', c, N.cap, c >= N.cap]); }
  // 设计30：港股 / 纳斯达克不再要境外账户、红筹架构，只看利润、市值这些门槛
  return { items: out, ok: out.every((x) => x[3]) };
}
export function whyNotStart(s, board, t) {
  const L = lst(s); if (L.listed) return '已经上市了';
  if (L.stage && L.stage !== 'rejected') return `正在走流程（${STAGE[L.stage]}）`;
  if (!BOARDS[board]) return '选一个板块';
  const c = conditions(s, board, t); if (!c.ok) { const x = c.items.find((z) => !z[3]); return `${x[0]}不够`; }
  if (!canPay(s, 'company', CFG.reform.fee)) return `公司账户要有股改费用 ${fmt(CFG.reform.fee)}`;
  return null;
}
/** 选板块 + 券商，签保荐协议，开始股改 */
export function start(s, board, bi, t) {
  const why = whyNotStart(s, board, t); if (why) return { ok: false, why };
  const B = BOARDS[board]; const br = B.brokers[bi] || B.brokers[0];
  const ct = addContract(s, { prefix: 'BJ', kind: 'ipo', title: '保荐协议 + 承销协议', parties: [['发行人', s.companyName || '我的公司'], ['保荐机构', br[0]]], subject: `${B.name}首次公开发行股票并上市`, rows: [[CFG.reform.name, CFG.reform.fee, '现在付'], ['承销保荐费', 0, `募资额的 ${+(br[1] * 100).toFixed(1)}%，发行时从募资里扣`]], total: CFG.reform.fee, wallet: 'company' }, t);
  pay(s, { wallet: 'company', cat: 'filing', amount: CFG.reform.fee, ref: ct.no, party: '会计师、评估师、律师', by: cfoSec(s) || '', note: CFG.reform.name }, t);
  Object.assign(lst(s), { stage: 'reform', board, broker: br, at: t + CFG.reform.min * 60e3, contract: ct.no, from: t, inqAt: null, left: 0 });
  return { ok: true };
}
/** 问询概率：券商便宜问得多；有投融资总监少问一些 */
export const inquiryRate = (s) => Math.max(0, lst(s).broker[2] - (finSec(s) ? CFG.inquiryFinCut * Math.min(1, ipoPower(s)) : 0) - Math.min(0.1, ((s.agenda && s.agenda.gov) || 0) * 0.02)); // V3-02：慈善攒的政府关系，每点问询概率 −2%（最多 −10%）
/** 回复问询：派财务总监（没有就外包给券商）处理，几分钟后接着审 */
export function answer(s, t) {
  const L = lst(s); if (L.stage !== 'inquiry') return { ok: false, why: '没有问询' };
  L.stage = 'answering'; L.at = t + CFG.inquiryMin * 60e3; return { ok: true, who: cfoSec(s) };
}
/** 发行：选发行比例，路演定价 */
export function issue(s, pct, t) {
  const L = lst(s); if (L.stage !== 'approved') return { ok: false, why: '还没注册生效' };
  if (!CFG.issue.some((x) => Math.abs(x - pct) < 1e-9)) return { ok: false, why: '发行比例不对' };
  L.issue = pct; L.stage = 'roadshow'; L.at = t + CFG.roadshowMin * 60e3; return { ok: true };
}
/** 发行报价：投前、募资、费用、发行后市值、股数、发行价 */
export function issueQuote(s, pct, board = lst(s).board) {
  const pre = preMoney(s, board); const raised = r2(pre * pct / (1 - pct)); const L = lst(s); const br = L.broker || BOARDS[board].brokers[0];
  const fee = r2(raised * br[1]); const other = r2(raised * CFG.otherFeeRate); const post = r2(pre + raised);
  const shares = Math.max(1e6, Math.round(post / CFG.issuePrice)); return { pre, raised, fee, other, net: r2(raised - fee - other), post, shares, price: r2(post / shares) };
}
function goPublic(s, t) {
  const L = lst(s); const q = issueQuote(s, L.issue); const B = BOARDS[L.board]; const C = cap(s);
  const ct = addContract(s, { prefix: 'FX', kind: 'ipo', title: '首次公开发行股票发行结果公告', parties: [['发行人', s.companyName || '我的公司'], ['主承销商', L.broker[0]]], subject: `${B.name}发行 ${(L.issue * 100).toFixed(0)}% 新股，发行价 ${q.price} 元，发行后总股本 ${(q.shares / 1e8).toFixed(2)} 亿股`, rows: [['募资总额', q.raised, ''], ['承销保荐费', -q.fee, `${+(L.broker[1] * 100).toFixed(1)}%`], ['审计、律师、信息披露等', -q.other, ''], ['募资净额（进公司账户）', q.net, '']], total: q.net, wallet: 'company' }, t);
  receive(s, { wallet: 'company', cat: 'ipo', amount: q.raised, ref: ct.no, party: '公众投资者', note: `${B.name}上市募资` }, t);
  pay(s, { wallet: 'company', cat: 'ipo_fee', amount: q.fee + q.other, ref: ct.no, party: L.broker[0], force: true, note: '承销保荐费和发行费用' }, t);
  // 稀释：跟融资一样，所有老股东 × (1 − 发行比例)；新进公众股东
  const k = 1 - L.issue; C.stake = C.stake * k; for (const h of C.holders) { h.pct *= k; if (h.pool) { h.free *= k; h.dil = (h.dil || 1) * k; } }
  for (const g of Object.values(C.options || {})) { g.pct *= k; g.done = (g.done || 0) * k; }   // 激励池和期权一起稀释（照 capital.raise）
  C.holders.push({ name: L.board === 'hk' || L.board === 'nasdaq' ? '公众股东（境外）' : '公众股东（流通股）', round: 'ipo', roundName: '上市发行', pct: L.issue, invest: q.raised, pre: q.pre, contract: ct.no });
  C.listed = true;
  const code = { main: '6', star: '688', hk: 'HK', nasdaq: 'NQ' }[L.board];
  L.listed = { at: t, shares: q.shares, px: q.price, issuePx: q.price, hist: [q.price], name: s.companyName || '我的公司', code: `${code}${String(Math.floor(t / 1000) % 1000).padStart(3, '0')}`, lockUntil: t + gm(CFG.lockRealMonths) * MONTH_MS, win: t, used: 0, divYear: Math.floor((t - s.createdAt) / YEAR_MS), board: L.board, raised: q.raised };
  L.stage = 'listed'; L.justListed = true;
  s.stats = s.stats || {}; s.stats.listed = 1;
  return q;
}
/** 到点推进 */
export function tick(s, t, rnd = Math.random) {
  const L = s.listing; if (!L || !L.stage) return [];
  const out = []; const B = BOARDS[L.board];
  if (L.stage === 'reform' && t >= L.at) { L.stage = 'tutor'; L.at += CFG.tutorMonths * MONTH_MS; out.push(`股改做完了：公司变成股份有限公司，${L.broker[0]}进场辅导（${CFG.tutorMonths} 个游戏月）`); }
  if (L.stage === 'tutor' && t >= L.at) {
    const mo = CFG.reviewMonths[0] + Math.floor(rnd() * (CFG.reviewMonths[1] - CFG.reviewMonths[0] + 1));
    L.stage = 'review'; const st = L.at; L.at = st + mo * MONTH_MS; L.inqAt = rnd() < inquiryRate(s) ? st + mo * MONTH_MS / 2 : null;
    out.push(`辅导验收通过，材料报给${L.board === 'hk' ? '港交所' : L.board === 'nasdaq' ? '美国证监会' : '交易所'}了，审核大约 ${mo} 个游戏月`);
  }
  if (L.stage === 'review' && L.inqAt && t >= L.inqAt) { L.left = L.at - L.inqAt; L.inqAt = null; L.stage = 'inquiry'; out.push('审核问询来了：要补材料（财富 → 资本 → 上市，点「回复问询」）'); }
  if (L.stage === 'answering' && t >= L.at) { L.stage = 'review'; L.at = t + L.left; out.push(`问询回复交上去了${cfoSec(s) ? '（财务总监写的）' : ''}，接着审`); }
  if (L.stage === 'review' && t >= L.at) {
    const c = conditions(s, L.board, t);
    if (c.ok) { L.stage = 'approved'; out.push(`${B.name}审核通过、注册生效：可以发行了（选发行比例）`); }
    else { L.stage = 'rejected'; const x = c.items.find((z) => !z[3]); out.push(`审核没通过：${x[0]}不达标了。可以重新申报（股改费不退）`); }
  }
  if (L.stage === 'roadshow' && t >= L.at) { const q = goPublic(s, t); out.push(`发行完成：募资 ${fmt(q.raised)}，发行价 ${q.price} 元，市值 ${fmt(q.post)}。准备敲钟！`); }
  if (L.listed) { annual(s, t, out); }
  for (const m of out) addMsg(s, { kind: 'system', type: 'ipo', title: '上市', body: m }, t);
  return out;
}

// ---------- 上市以后：股价 ----------
export const marketCap = (s) => (listed(s) ? r2(s.listing.listed.px * s.listing.listed.shares) : 0);
/** 合理市值：年净利 × 板块市盈率 + 非经营（亏损按经营估值） */
export const fairCap = (s) => preMoney(s, s.listing.listed.board);
const STK_SH = SK.STOCKS.map((x) => [x.code, x.shares]);
SK.addStepHook((s, tk, prev, px) => {
  if (!listed(s) || !prev) return; const X = s.listing.listed; const S = CFG.self;
  const a = STK_SH.reduce((z, [c, sh]) => z + px[c] * sh, 0), b = STK_SH.reduce((z, [c, sh]) => z + prev[c] * sh, 0); const rm = Math.log(a / b);
  const lf = Math.log(Math.max(1, fairCap(s)) / X.shares); const lp = Math.log(X.px);
  X.px = Math.max(0.5, Math.round(Math.exp(lp + S.beta * rm + S.sigma * SK.hn('SELF', tk) + S.kappa * (lf - lp)) * 100) / 100);
  X.hist.push(X.px); if (X.hist.length > 240) X.hist.shift();
});
// 身价：上市后公司那块按市值 × 你的持股（替换「公司估值 × 持股」）
addNetWorthHook((s) => (listed(s) ? (marketCap(s) - companyEquity(s)) * stakeOf(s) : 0));

// ---------- 减持 ----------
const winMs = () => CFG.reduceEveryMonths * MONTH_MS;
export function reduceLeft(s, t) { const X = s.listing.listed; if (t - X.win >= winMs()) return CFG.reduceMax; return Math.max(0, CFG.reduceMax - X.used); }
export function whyNotReduce(s, pct, t) {
  if (!listed(s)) return '还没上市';
  const X = s.listing.listed; if (t < X.lockUntil) return `控股股东锁定期，还要 ${((X.lockUntil - t) / MONTH_MS).toFixed(1)} 个游戏月`;
  if (!(pct > 0)) return '比例不对';
  if (pct > stakeOf(s) - 1e-9) return '你没有那么多';
  if (s.cap && s.cap.pledgedPct && pct > stakeOf(s) - s.cap.pledgedPct + 1e-9) return `有 ${+(s.cap.pledgedPct * 100).toFixed(2)}% 质押在银行，不能减持`; // 3-01 股票质押（开发1 加的挂钩）
  if (pct > reduceLeft(s, t) + 1e-9) return `每 ${CFG.reduceEveryMonths} 个游戏月最多减持 ${CFG.reduceMax * 100}%（这一期还能 ${+(reduceLeft(s, t) * 100).toFixed(2)}%）`;
  return null;
}
/** 减持 pct（占总股本）：钱进个人现金；限售股 20% 个税 + 卖出印花税 */
export function reduce(s, pct, t) {
  const why = whyNotReduce(s, pct, t); if (why) return { ok: false, why };
  const X = s.listing.listed; if (t - X.win >= winMs()) { X.win = t; X.used = 0; }
  const n = Math.round(X.shares * pct); const gross = r2(n * X.px); const stamp = r2(gross * CFG.stamp); const tax = r2((gross - stamp) * CFG.reduceTax);
  const ct = addContract(s, { prefix: 'JG', kind: 'stock', title: '交割单（减持）', parties: [['股东', s.bossName || '老板'], ['券商', lst(s).broker[0]]], subject: `减持 ${X.name}（${X.code}）${n.toLocaleString()} 股 × ${X.px} 元（占总股本 ${+(pct * 100).toFixed(2)}%）`, rows: [['成交金额', gross, ''], ['印花税', -stamp, '0.05%'], ['限售股转让所得个税', -tax, '20%（券商代扣）']], total: r2(gross - stamp - tax), wallet: 'personal' }, t);
  receive(s, { wallet: 'personal', cat: 'reduce', amount: gross, ref: ct.no, party: '证券账户', note: `减持 ${X.name} ${+(pct * 100).toFixed(2)}%` }, t);
  const c1 = taxRec(s, { kind: '证券交易印花税', base: gross, rate: CFG.stamp, amount: stamp, t }); pay(s, { wallet: 'personal', cat: 'stock_fee', amount: stamp, ref: c1 || ct.no, party: '税务局', note: '减持印花税', force: true }, t);
  const c2 = taxRec(s, { kind: '限售股转让所得个税', base: gross - stamp, rate: CFG.reduceTax, amount: tax, t }); pay(s, { wallet: 'personal', cat: 'tax_personal', amount: tax, tax, ref: c2 || ct.no, party: '税务局', note: '限售股减持个税 20%（券商代扣）', force: true }, t);
  const C = cap(s); C.stake -= pct; const pub = C.holders.find((h) => h.round === 'ipo'); if (pub) pub.pct += pct;
  X.used += pct;
  return { ok: true, gross, stamp, tax, net: r2(gross - stamp - tax), shares: n };
}

// ---------- 年报 + 分红（每个游戏年一次） ----------
function annual(s, t, out) {
  const X = s.listing.listed; const y = Math.floor((t - s.createdAt) / YEAR_MS);
  while (X.divYear < y) {
    X.divYear += 1; const at = s.createdAt + X.divYear * YEAR_MS; const p = monthsBack(s, 12);
    const D0 = r2(Math.max(0, p) * CFG.dividendRatio); const D = r2(Math.min(D0, room(s))); /* V0.2.3（设计35）：年度分红也要留够两个月工资，不够就少分 */
    let line = `第 ${X.divYear} 年年报：净利 ${fmt(p)}，年末市值 ${fmt(marketCap(s))}`;
    if (D >= 1 && canPayMust(s, 'company', D)) {
      const mine = r2(D * stakeOf(s)); const held = (at - X.at) / MONTH_MS; const rate = CFG.divTax.find(([m]) => held < m)[1]; const tax = r2(mine * rate);
      pay(s, { wallet: 'company', cat: 'dividend_out', amount: D, party: '全体股东', note: `${X.name} 年度分红（净利 ${CFG.dividendRatio * 100}%）` }, at);
      receive(s, { wallet: 'personal', cat: 'stock_div', amount: mine, tax, party: X.name, note: `${X.name} 分红（你持股 ${+(stakeOf(s) * 100).toFixed(2)}%）` }, at);
      if (tax >= 0.01) { const c = taxRec(s, { kind: '股息红利个税', base: mine, rate, amount: tax, t: at }); pay(s, { wallet: 'personal', cat: 'tax_personal', amount: tax, tax, ref: c || '', party: '税务局', note: `分红个税 ${rate * 100}%（持有不到 ${CFG.divTax.find(([m]) => held < m)[0]} 个游戏月）`, force: true }, at); }
      line += `；分红 ${fmt(D)}，你拿 ${fmt(mine - tax)}（税后）`;
    }
    out.push(line);
  }
}
