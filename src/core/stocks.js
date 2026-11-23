// 股票 + 投资经理（第 2-09 项，设计12、设计14 第二节 6、设计16 投资经理）
// 30 只，每 30 秒一跳，一直开盘；跳数按服务器时间算（同一跳谁算都一样），离线回来一跳一跳补（最多 7 天）
// 每跳 ln P += β·M（大盘，牛 / 熊 / 震荡）+ B（板块）+ σ·ε + κ·(ln F − ln P) + 新闻跳空；随机数 = hash(名字, 跳数)，固定种子
// 只能用个人现金买；佣金、过户费、卖出印花税、大单滑点；交割单进档案柜；分红按持有时间扣个税；持股 5% 举牌公告，30% 进度
// 投资经理（秘书职位）：你划一笔钱 + 风格（稳健 / 平衡 / 进取）+ 止损线，按大盘走 + 她的超额（智慧）；新闻前一跳有概率提前给判断
import CFG from '../config/stocks.json?v=385b5781' with { type: 'json' };
import { pay, receive } from './ledger.js?v=385b5781';
import { addContract } from './contracts.js?v=385b5781';
import { addAssetHook } from './assets.js?v=385b5781';
import { holder, isSec, attrs as secAttrs, efficiency, OUT } from './posts.js?v=385b5781';
import { MONTH_MS, YEAR_MS } from './gametime.js?v=385b5781';
import { taxRec, payerOfPost } from './fiscal.js?v=385b5781';
import { profitMul } from './calib.js?v=385b5781';

export const SCFG = CFG;
export const STOCKS = CFG.stocks;
export const BY = Object.fromEntries(STOCKS.map((x) => [x.code, x]));
for (const x of (CFG.ipo && CFG.ipo.list) || []) BY[x.code] = { ...x, ipo: true };   // 第 P-06 项：新股（上市以后才进 s.mkt.px、才跳）
/** 现在在跳的全部股票：30 只 + 已经上市的新股（大盘指数只算 30 只） */
export const live = (m) => (m.ipoOn && m.ipoOn.length ? [...STOCKS, ...m.ipoOn.map((c) => BY[c])] : STOCKS);
export const SECTORS = [...new Set(STOCKS.map((x) => x.sector))];
const M = CFG.model, N = CFG.news;
const TICK = CFG.tickSec * 1000;
export const tickOf = (t) => Math.floor(t / TICK);
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (n) => (Math.abs(n) >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : Math.abs(n) >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);
const TICKS_PER_YEAR = YEAR_MS / TICK;
/** 合理价每跳漂移：真实年化 × profitMul（设计21 第九节） */
export const MU = () => Math.log(1 + M.yearDrift * profitMul()) / TICKS_PER_YEAR;

// ---------- 固定种子的随机 ----------
export function hu(key, tick) { let h = 2166136261 ^ tick; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function hn(key, tick) { const u = Math.max(1e-12, hu(key + 'a', tick)), v = hu(key + 'b', tick); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// ---------- 市场状态 s.mkt ----------
export function mkt(s, t = Date.now()) {
  if (!s.mkt) {
    const tk = tickOf(t);
    s.mkt = { tick: tk, px: {}, fv: {}, open: {}, regime: { kind: 'flat', until: tk + M.regimeTicks[0] }, news: [], hist: { IDX: [] }, long: { IDX: [] }, hold: {}, divAt: t, told: {}, mgr: null };
    for (const x of STOCKS) { s.mkt.px[x.code] = x.price; s.mkt.fv[x.code] = x.price; s.mkt.hist[x.code] = [x.price]; s.mkt.long[x.code] = [x.price]; }
    s.mkt.hist.IDX = [index(s)]; s.mkt.long.IDX = [index(s)]; s.mkt.base0 = s.mkt.hist.IDX[0];
  }
  return s.mkt;
}
const cap0 = STOCKS.reduce((a, x) => a + x.price * x.shares, 0);
/** 大盘指数：30 只按市值加权，起点 1000 */
export function index(s) { const m = s.mkt; return r2(STOCKS.reduce((a, x) => a + m.px[x.code] * x.shares, 0) / cap0 * 1000); }
export const price = (s, code) => mkt(s).px[code];
export const marketCap = (s, code) => price(s, code) * BY[code].shares * 1e8;

/** 这一跳的新闻（纯函数：只看跳数）：null 或 { kind: stock / sector / market, target, good, title, jump } */
export function newsAt(tick) {
  if (hu('N', tick) >= N.perTick) return null;
  const k = hu('NT', tick); const kind = k < N.share.stock ? 'stock' : k < N.share.stock + N.share.sector ? 'sector' : 'market';
  const good = hu('NG', tick) < N.goodP[kind]; const mag = hu('NM', tick);
  if (kind === 'stock') {
    const x = STOCKS[Math.floor(hu('NS', tick) * STOCKS.length)]; const list = good ? N.good : N.bad; const [title, lo, hi] = list[Math.floor(hu('NK', tick) * list.length)];
    return { kind, target: x.code, good, title: `${x.name}：${title}`, jump: lo + (hi - lo) * mag };
  }
  if (kind === 'sector') { const sec = SECTORS[Math.floor(hu('NS', tick) * SECTORS.length)]; const [title, lo, hi] = good ? N.sectorGood : N.sectorBad; return { kind, target: sec, good, title: `${sec}板块：${title}`, jump: lo + (hi - lo) * mag }; }
  const [title, lo, hi] = good ? N.marketGood : N.marketBad; return { kind, target: '', good, title: `大盘：${title}`, jump: lo + (hi - lo) * mag };
}
/** 走一跳（纯计算，改 m） */
export function step(m, tick) {
  if (tick >= m.regime.until) { const ks = Object.keys(M.regimes); const kind = ks[Math.floor(hu('R', tick) * ks.length)]; m.regime = { kind, until: tick + M.regimeTicks[0] + Math.floor(hu('RS', tick) * (M.regimeTicks[1] - M.regimeTicks[0])) }; }
  const mk = M.regimes[m.regime.kind] + M.marketSigma * hn('M', tick);
  const sec = {}; for (const sc of SECTORS) sec[sc] = M.sectorSigma * hn('S' + sc, tick);
  const nw = newsAt(tick);
  for (const x of live(m)) {
    const c = x.code; const lp = Math.log(m.px[c]); let lf = Math.log(m.fv[c]) + MU();
    let d = M.beta[x.vol] * mk + sec[x.sector] + M.sigma[x.vol] * hn(c, tick) + M.kappa * (lf - lp);
    d = Math.max(-M.maxStep, Math.min(M.maxStep, d));
    let j = 0; if (nw && (nw.kind === 'market' || (nw.kind === 'sector' && nw.target === x.sector) || (nw.kind === 'stock' && nw.target === c))) j = nw.jump;
    lf += Math.log(1 + j * N.fvShare);
    m.px[c] = Math.max(M.minPrice, Math.round(Math.exp(lp + d) * (1 + j) * 100) / 100); m.fv[c] = Math.exp(lf);
  }
  m.tick = tick;
  return nw;
}
function pushHist(m, s) {
  const H = CFG.history; const put = (k, v) => { const a = m.hist[k]; a.push(v); if (a.length > H.recent) a.shift(); if (m.tick % H.longEvery === 0) { const b = m.long[k]; b.push(v); if (b.length > H.longMax) b.shift(); } };
  for (const x of live(m)) put(x.code, m.px[x.code]); put('IDX', index(s));
}
/** 走到现在：返回 { ticks, news: [这次出的新闻], hints } */
export function advance(s, t, { live = false, rnd = Math.random } = {}) {
  const m = mkt(s, t); const target = tickOf(t); const out = { ticks: 0, news: [], hints: [] };
  if (target <= m.tick) return out;
  if (target - m.tick > CFG.offlineMaxTicks) m.tick = target - CFG.offlineMaxTicks;   // 离开太久：只补最近 7 天
  const prevIdx = index(s);
  while (m.tick < target) {
    const tk = m.tick + 1; const before = index(s); const prev = STEP_HOOKS.length ? { ...m.px } : null;
    const nw = step(m, tk); pushHist(m, s); out.ticks++;
    for (const fn of STEP_HOOKS) fn(s, tk, prev, m.px);   // 基金净值（core/funds.js）
    if (nw) { const n2 = { ...nw, tick: tk, t: tk * TICK }; m.news.push(n2); if (m.news.length > 50) m.news.shift(); out.news.push(n2); }
    mgrStep(s, Math.log(index(s) / before), tk);
  }
  if (live) { const h = hint(s, target + 1, rnd); if (h) out.hints.push(h); }
  out.idxRet = index(s) / prevIdx - 1;
  return out;
}

/** 每跳之后要算的（基金净值）；投资经理按风格配基金时的组合收益 */
const STEP_HOOKS = [];
export const addStepHook = (fn) => { STEP_HOOKS.push(fn); };
let styleRet = () => null; export const setStyleRet = (fn) => { styleRet = fn; };

// ---------- 买卖 ----------
/** 报价：side buy / sell，n 股 → { px 现价, exec 成交价（含滑点）, gross, commission, transfer, stamp, fees, total（买要付 / 卖到手）, impact } */
export function quote(s, code, n, side) {
  const F = CFG.fees; const p = price(s, code); const cap = marketCap(s, code); const amt = p * n;
  const impact = amt / cap > F.impactFrom ? amt / cap * F.impactK : 0;
  const exec = r2(p * (side === 'buy' ? 1 + impact : 1 - impact)); const gross = r2(exec * n);
  const commission = r2(Math.max(F.minCommission, gross * F.commission)); const transfer = r2(gross * F.transfer); const stamp = side === 'sell' ? r2(gross * F.stamp) : 0;
  const fees = r2(commission + transfer + stamp);
  return { px: p, exec, gross, commission, transfer, stamp, fees, impact, total: side === 'buy' ? r2(gross + fees) : r2(gross - fees) };
}
const freeCash = (s) => s.cash - (s.freezes || []).reduce((a, f) => a + f.amount, 0);
export const unlocked = (s) => (s.title || 0) >= CFG.unlockTitle;
function slip(s, code, n, side, q, t) {
  const x = BY[code];
  return addContract(s, { prefix: 'JG', kind: 'stock', title: '交割单', parties: [['股东', s.bossName || '老板'], ['券商', '华太正券']], subject: `${side === 'buy' ? '买入' : '卖出'} ${x.name}（${code}）${n.toLocaleString()} 股，成交价 ${q.exec}${q.impact ? `（大单滑点 ${(q.impact * 100).toFixed(2)}%）` : ''}`,
    rows: [['成交金额', q.gross, ''], ['佣金', q.commission, '0.025%，最低 5 元'], ['过户费', q.transfer, '0.001%'], ...(q.stamp ? [['印花税', q.stamp, '卖出 0.05%']] : [])], total: q.total, wallet: 'personal' }, t);
}
export function buy(s, code, n, t = Date.now()) {
  n = Math.floor(n); if (!unlocked(s)) return { ok: false, why: '还不能开户' }; if (n < 1) return { ok: false, why: '最少 1 股' };
  if (!(mkt(s, t).px[code] > 0)) return { ok: false, why: '还没上市' };
  const m0 = mkt(s, t); const have = (m0.hold[code] || { n: 0 }).n; if ((have + n) / (BY[code].shares * 1e8) >= CFG.stake.notice - 1e-12) return { ok: false, why: `个人最多买到 ${CFG.stake.notice * 100}% 以下（只算投资）；要举牌、要约、控股，用「公司买」` };   // 验收阶段三：个人买只算投资
  const q = quote(s, code, n, 'buy'); if (freeCash(s) < q.total) return { ok: false, why: `个人现金还差 ${fmt(q.total - freeCash(s))}（股票只能用个人现金）` };
  const ct = slip(s, code, n, 'buy', q, t);
  pay(s, { wallet: 'personal', cat: 'stock_buy', amount: q.gross, ref: ct.no, party: '证券账户', note: `买入 ${BY[code].name} ${n} 股` }, t);
  pay(s, { wallet: 'personal', cat: 'stock_fee', amount: q.fees, ref: ct.no, party: '华太正券', note: `${BY[code].name} 佣金、过户费` }, t);
  const m = mkt(s, t); const h = m.hold[code] || (m.hold[code] = { n: 0, cost: 0, at: t });
  if (!h.n) h.at = t; h.cost = r2((h.cost * h.n + q.total) / (h.n + n)); h.n += n;
  flow(m, code, 'buy', q.total); m.bought = (m.bought || 0) + 1;   // 第 P-06 项：周报、新手目标
  return { ok: true, quote: q, slip: ct, stake: stake(s, code) };
}
export function sell(s, code, n, t = Date.now()) {
  const m = mkt(s, t); const h = m.hold[code]; n = Math.floor(n); if (!h || h.n < n || n < 1) return { ok: false, why: '没有这么多股' };
  if (h.pledged && n > h.n - h.pledged) return { ok: false, why: `有 ${h.pledged} 股质押在银行，不能卖` }; // 3-01 股票质押（开发1 加的挂钩）
  const q = quote(s, code, n, 'sell'); const ct = slip(s, code, n, 'sell', q, t);
  taxRec(s, { kind: '证券交易印花税', base: q.gross, rate: CFG.fees.stamp, amount: q.stamp, t });
  receive(s, { wallet: 'personal', cat: 'stock_sell', amount: q.gross, ref: ct.no, party: '证券账户', note: `卖出 ${BY[code].name} ${n} 股（A 股差价免个税）` }, t);
  pay(s, { wallet: 'personal', cat: 'stock_fee', amount: q.fees, ref: ct.no, party: '华太正券', note: `${BY[code].name} 佣金、过户费、印花税`, force: true }, t);
  const gain = r2(q.total - h.cost * n);
  h.n -= n; if (!h.n) delete m.hold[code];
  flow(m, code, 'sell', q.total, gain);
  return { ok: true, quote: q, slip: ct, gain };
}
/** 第 P-06 项：这一周（周报）每只股票的买入 / 卖出金额、卖出的盈亏 */
function flow(m, code, side, amt, gain) {
  const w = m.wk; if (!w) return; const f = w.f[code] || (w.f[code] = { buy: 0, sell: 0 });
  f[side] = r2(f[side] + amt); if (side === 'sell') w.sells.push(gain);
}
/** 公司持股比例（验收阶段三：举牌、要约、控股只算公司买的）；每过一个 5% 举牌公告一次，股价跳一下 */
export function stake(s, code) {
  const m = mkt(s); const h = (m.coHold || {})[code]; const pct = h ? h.n / (BY[code].shares * 1e8) : 0;
  const lv = Math.floor(pct / CFG.stake.notice + 1e-9); const was = m.told[code] === true ? 1 : (m.told[code] || 0);
  let notice = false; if (lv > was) { m.told[code] = lv; notice = true; const j = CFG.stake.jump || 0; m.px[code] = r2(m.px[code] * (1 + j)); m.fv[code] *= 1 + j; (m.news = m.news || []).push({ kind: 'stock', target: code, good: true, title: `${BY[code].name}：举牌公告，${s.companyName || '神秘买家'}持股达到 ${lv * CFG.stake.notice * 100}%`, jump: j, tick: m.tick, t: m.tick * TICK }); }
  return { pct, notice, level: lv * CFG.stake.notice, toTender: Math.min(1, pct / CFG.stake.tender) };
}
export const holdings = (s) => Object.entries(mkt(s).hold).map(([code, h]) => ({ code, ...h, value: r2(h.n * price(s, code)), pnl: r2(h.n * price(s, code) - h.n * h.cost) }));
export const holdValue = (s) => holdings(s).reduce((a, h) => a + h.value, 0);

/** 分红：每真实 1 小时按「年股息率 / 200」发；个税按持有时间（游戏时间） */
export function dividends(s, t) {
  const m = mkt(s, t); const D = CFG.dividend; const per = D.everyMin * 60e3;
  const n = Math.floor((t - m.divAt) / per); if (n <= 0) return [];
  m.divAt += n * per; const out = [];
  for (const h of holdings(s)) {
    const x = BY[h.code]; if (!x.div) continue;
    const amt = r2(h.value * x.div * profitMul() / 200 * n * (D.everyMin / 60)); if (amt < 0.01) continue;
    const held = t - h.at; const rate = held >= YEAR_MS ? 0 : held >= MONTH_MS ? D.taxMid : D.taxShort; const tax = r2(amt * rate);
    taxRec(s, { kind: '股息红利个税', base: amt, rate, amount: tax, t });
    receive(s, { wallet: 'personal', cat: 'stock_div', amount: amt - tax, tax, party: x.name, note: `${x.name} 分红（持有${held >= YEAR_MS ? '满 1 年免税' : held >= MONTH_MS ? '1 个月～1 年，个税 10%' : '不到 1 个月，个税 20%'}）` }, t);
    out.push({ code: h.code, amt, tax });
  }
  return out;
}

// ---------- 投资经理 ----------
export const MGR = { styles: { safe: { name: '稳健', eq: 0.3, beta: 1 }, mid: { name: '平衡', eq: 0.6, beta: 1 }, bold: { name: '进取', eq: 1, beta: 1.3 } }, get safeYear() { return CFG.mgr.safeYear * profitMul(); }, get excessK() { return CFG.mgr.excessYear * profitMul(); }, feeRate: 0.1, reportMin: 30, outsourceWit: 50 };
const mgrWho = (s) => holder(s, 'invest');
function mgrWit(s, t) { const w = mgrWho(s); if (isSec(w)) return secAttrs(s, w).wit * efficiency(s, w, 'invest', t); return w === OUT ? MGR.outsourceWit : 0; }
export function giveMgr(s, amount, style, stop, t = Date.now()) {
  const w = mgrWho(s); if (!w) return { ok: false, why: '先在「秘书 → 职位」任命投资经理' };
  if (!MGR.styles[style]) return { ok: false, why: '选一个风格' };
  if (!pay(s, { wallet: 'personal', cat: 'inv_out', amount, party: isSec(w) ? w : '券商投顾', by: isSec(w) ? w : '', note: `划给投资经理（${MGR.styles[style].name}，止损 ${Math.round(stop * 100)}%）` }, t)) return { ok: false, why: '个人现金不够' };
  const m = mkt(s, t); const g = m.mgr;
  if (g && g.value > 0) { g.principal += amount; g.value += amount; g.style = style; g.stop = stop; g.stopped = false; }
  else m.mgr = { principal: amount, value: amount, style, stop, stopped: false, reportAt: t, lastValue: amount, excess: 0 };
  return { ok: true };
}
export function takeBack(s, t = Date.now()) {
  const m = mkt(s, t); const g = m.mgr; if (!g || g.value <= 0) return { ok: false, why: '她手上没有你的钱' };
  const w = mgrWho(s); const amt = r2(g.value);
  receive(s, { wallet: 'personal', cat: 'inv_in', amount: amt, by: isSec(w) ? w : '', party: '投资经理', note: `从投资经理收回（本金 ${fmt(g.principal)}，盈亏 ${fmt(amt - g.principal)}）` }, t);
  m.mgr = null; return { ok: true, amount: amt };
}
function mgrStep(s, idxRet, tk) {
  const g = s.mkt.mgr; if (!g || g.value <= 0) return;
  const st = MGR.styles[g.style]; const safe = Math.log(1 + MGR.safeYear) / TICKS_PER_YEAR;
  const wit = mgrWit(s, tk * TICK); const ex = g.stopped ? 0 : (wit - 50) / 50 * MGR.excessK / TICKS_PER_YEAR;
  const fr = g.stopped ? null : styleRet(s, g.style);   // 有基金（2-10）：按风格配好的基金组合走
  const r = g.stopped ? safe : (fr != null ? fr : st.eq * st.beta * idxRet + (1 - st.eq) * safe) + ex;
  g.value = g.value * Math.exp(r); g.excess += g.value * ex;
  if (!g.stopped && g.value < g.principal * (1 - g.stop)) { g.stopped = true; g.stopNote = true; }
}
/** 每 30 分钟汇报：返回 { text, fee } 或 null；超额的 10% 是她的提成（公司付） */
export function mgrReport(s, t) {
  const m = mkt(s, t); const g = m.mgr; if (!g) return null; const w = mgrWho(s);
  if (g.stopNote) { g.stopNote = false; return { text: `跌到止损线了，我先全部换成现金类（现在 ${fmt(g.value)}，本金 ${fmt(g.principal)}）。`, fee: 0, who: w }; }
  if (t - g.reportAt < MGR.reportMin * 60e3) return null;
  const pct = g.value / g.lastValue - 1; const fee = isSec(w) ? r2(Math.max(0, g.excess) * MGR.feeRate) : 0;
  if (fee >= 0.01) pay(s, { wallet: payerOfPost(s, 'invest'), cat: payerOfPost(s, 'invest') === 'personal' ? 'family_office' : 'sec_salary', amount: fee, force: true, party: w, by: w, note: '投资经理超额收益提成 10%' }, t);
  g.reportAt = t; g.lastValue = g.value; g.excess = 0;
  return { text: `这一轮${pct >= 0 ? '赚了' : '亏了'} ${(Math.abs(pct) * 100).toFixed(2)}%，现在 ${fmt(g.value)}（${MGR.styles[g.style].name}）。`, fee, who: w, pct };
}
/** 投资经理看盘：新闻出来前 1 跳，概率 智慧/150 提前说一句；说对的概率 50% + 智慧/400 */
let watcherOf = () => null; export const setWatcher = (fn) => { watcherOf = fn; };   // 第 P-06 项：开局就能派的「看盘」（core/trade.js）
export function hint(s, nextTick, rnd = Math.random) {
  const nw = newsAt(nextTick); if (!nw || nw.kind !== 'stock') return null;
  const m = s.mkt; const free = m && m.freeHint > 0;   // 新手目标奖励：送一次一定准的提示
  let w = watcherOf(s) || mgrWho(s); if (!isSec(w)) { if (!free) return null; w = s.current; } const wit = secAttrs(s, w).wit;
  if (!free && rnd() >= wit / 150) return null;
  if (free) m.freeHint -= 1;
  const right = free || rnd() < 0.5 + wit / 400; const up = right ? nw.good : !nw.good;
  return { who: w, code: nw.target, up, text: `老板，${BY[nw.target].name}……我觉得${up ? '要有好消息' : '不太妙'}。` };
}
/** 技术指标：每 10 点眼光多一档（均线 → 成交量 → 资金流向） */
export function indicators(s, code, vision) {
  const h = mkt(s).hist[code]; const lv = Math.min(3, Math.floor((vision || 0) / 10)); const out = [];
  if (lv >= 1) { const a = h.slice(-20); out.push(['20 跳均线', r2(a.reduce((x, y) => x + y, 0) / a.length)]); }
  if (lv >= 2) { let v = 0; for (let i = Math.max(1, h.length - 20); i < h.length; i++) v += Math.abs(h[i] / h[i - 1] - 1); out.push(['成交活跃度', `${(v * 100).toFixed(1)}`]); }
  if (lv >= 3) { const a = h.slice(-30); const f = a.length > 1 ? a.at(-1) / a[0] - 1 : 0; out.push(['资金流向', f > 0.005 ? '流入' : f < -0.005 ? '流出' : '平衡']); }
  return out;
}

addAssetHook({ value: (s) => (s.mkt ? holdValue(s) + ((s.mkt.mgr && s.mkt.mgr.value) || 0) : 0) });
