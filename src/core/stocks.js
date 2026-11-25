// 股票 + 投资经理（第 2-09 项，设计12、设计14 第二节 6、设计16 投资经理）
// 50 只（设计54），每 30 秒一跳，一直开盘；跳数按服务器时间算（同一跳谁算都一样），离线回来一跳一跳补（最多 7 天）
// 每跳 ln P += β·M（大盘，牛 / 熊 / 震荡）+ B（板块）+ σ·ε + κ·(ln F − ln P) + 新闻跳空；随机数 = hash(名字, 跳数)，固定种子
// 设计62：只能用投资账户的钱买（个人现金先转进投资账户）；佣金、过户费、卖出印花税、大单滑点；交割单进档案柜；分红按持有时间扣个税；持股 5% 举牌公告，30% 进度
// 投资经理（秘书职位）：你划一笔钱 + 风格（稳健 / 平衡 / 进取）+ 止损线，按大盘走 + 她的超额（智慧）；新闻前一跳有概率提前给判断
import { capAdd } from './cap.js?v=c60d881c';   // 设计79：有上限的列表（config/caps.js）
import CFG from '../config/stocks.json?v=c60d881c' with { type: 'json' };
import { pay, receive } from './ledger.js?v=c60d881c';
import { addContract } from './contracts.js?v=c60d881c';
import { addAssetHook } from './assets.js?v=c60d881c';
import { shortWhy } from './invest.js?v=c60d881c';   // 设计62 投资账户（身价挂钩、钱不够的说法）
import { holder, isSec, attrs as secAttrs, efficiency, OUT } from './posts.js?v=c60d881c';
import { MONTH_MS, YEAR_MS } from './gametime.js?v=c60d881c';
const YEAR_H = YEAR_MS / 3600e3; // 游戏一年 = 现实多少小时（V0.2.10：144）
import { taxRec, payerOfPost } from './fiscal.js?v=c60d881c';
import { profitMul } from './calib.js?v=c60d881c';
import { TITLES } from '../config/titles.js?v=c60d881c';

export const SCFG = CFG;
export const STOCKS = CFG.stocks;
export const BY = Object.fromEntries(STOCKS.map((x) => [x.code, x]));
for (const x of (CFG.ipo && CFG.ipo.list) || []) BY[x.code] = { ...x, ipo: true };   // 第 P-06 项：新股（上市以后才进 s.mkt.px、才跳）
/** 现在在跳的全部股票：50 只（设计54）+ 已经上市的新股（大盘指数只算这 50 只） */
export const live = (m) => (m.ipoOn && m.ipoOn.length ? [...STOCKS, ...m.ipoOn.map((c) => BY[c])] : STOCKS);
export const SECTORS = [...new Set(STOCKS.map((x) => x.sector))];
/** 设计54：秘书（看盘 / 投资经理）看得到几只 = seeBase + 智慧 × seeK，最多 seeMax（50 只全看） */
export const seeCount = (wit) => { const L = CFG.watch.look; return Math.min(L.seeMax, STOCKS.length, Math.floor(L.seeBase + Math.min(100, Math.max(0, wit)) * L.seeK + 1e-9)); };
/** 设计54：老存档里没有的新股票按起始价补上（现价、合理价、走势），从这一跳开始跳 */
export function fillNew(m) {
  if (!m || !m.px) return 0; let n = 0;
  for (const x of STOCKS) if (!(m.px[x.code] > 0)) { m.px[x.code] = x.price; if (!m.fv) m.fv = {}; m.fv[x.code] = x.price; if (m.hist) m.hist[x.code] = [x.price]; if (m.long) m.long[x.code] = [x.price]; n++; }
  return n;
}
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
/** 大盘指数：50 只按市值加权（基数按起始市值），起点 1000 */
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
// ---------- 设计41 第八节：每天 2 只涨停（开发2）----------
// 每天（手机本地 0 点到 0 点）按日期种子从 30 只里挑 picks 只（设计52：4 只，0～6 / 6～12 / 12～18 / 18～24 点每段一只，段内随机一跳开始），pullTicks 跳拉到涨停价（前一天收盘 × 1.10，第九节），然后封板到 0 点（不跳噪声、不吃新闻）
// 起点价已经 = 涨停价的换下一只（同一个起点）；30 只每一跳都夹在当天涨跌停价之间（第九节）；第二天合理价 × 1.05。状态在 m.lu，跟着存档走；离线补算一跳一跳走，结果一样
const LUC = () => CFG.watch.lu;
const TPH = 3600e3 / TICK;
/** 这一跳属于哪一天：{ key: 20261123, start: 当天 0 点那一跳 } */
export function dayOfTick(tick) { const d = new Date(tick * TICK); const z = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); return { key: d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(), start: Math.ceil(z / TICK) }; }
/** 这一天的候选顺序（日期种子）和每只的起点跳 */
export function luOrder(key) { return STOCKS.map((x, i) => [x.code, hu('LU' + key, i)]).sort((a, b) => a[1] - b[1]).map(([c]) => c); }
/** 设计52：每 6 小时一段各一只（blocks），段内按种子随机开始；拉升 pullTicks 跳要在段内拉完 */
const luAt = (key, start, i) => { const L = LUC(); const [a, b] = L.blocks[i % L.blocks.length]; return start + Math.round(a * TPH) + Math.floor(hu('LUT' + key, i) * Math.max(1, (b - a) * TPH - L.pullTicks)); };
function luDay(m, tick) {
  const d = dayOfTick(tick); if (m.lu && m.lu.key === d.key) return m.lu;
  if (m.lu) for (const p of m.lu.act) if (p.sealed && m.fv[p.code]) m.fv[p.code] *= 1 + LUC().fvNext;   // 第二天：合理价往上挪一半
  const order = luOrder(d.key); const n = LUC().picks;
  const close = {}; for (const x of live(m)) close[x.code] = m.px[x.code];   // 设计41 第九节：前一天收盘价 = 0 点前最后一跳（这时 px 还是上一跳的）
  m.lu = { key: d.key, start: d.start, close, next: n, act: order.slice(0, n).map((c, i) => ({ code: c, at: luAt(d.key, d.start, i), limit: null, from: null, sealed: false })) };
  return m.lu;
}
/** 设计41 第九节：今天的涨停价 / 跌停价 = 前一天收盘 × 1.10 / × 0.90（四舍五入到分）；新上市的当天按第一次见到的价算 */
export function band(m, code) {
  const B = CFG.watch.band; const L = m.lu; if (!B || !L) return { up: null, dn: null, close: null };
  if (!L.close) L.close = {}; if (L.close[code] == null && m.px[code] > 0) L.close[code] = m.px[code];
  const c = L.close[code]; return c > 0 ? { up: r2(c * (1 + B.up)), dn: r2(c * (1 - B.dn)), close: c } : { up: null, dn: null, close: null };
}
/** 停在涨停价 / 跌停价：'up' | 'down' | null（界面标签、条件单板上不成交用） */
export function onBoard(m, code) { const B = band(m, code); const p = m.px[code]; return B.up != null && p >= B.up - 1e-9 ? 'up' : B.dn != null && p <= B.dn + 1e-9 ? 'down' : null; }
/** 今天的涨停：[{ code, at, limit, sealed, pulling }]（界面、看盘用） */
export function luToday(m, tick = m.tick) { const L = m.lu && m.lu.key === dayOfTick(tick).key ? m.lu : null; return L ? L.act.map((p) => ({ ...p, pulling: tick >= p.at && !p.sealed })) : []; }
export const isSealed = (m, code) => !!(m.lu && m.lu.act.some((p) => p.code === code && p.sealed));
// ---------- 设计55 行情 3 秒刷新（只改显示，底层仍 30 秒一跳）----------
const DSP = () => CFG.display;
/** 这一跳里第几个小步（0～steps−1；0 = 刚跳完，显示真实价） */
export const subOf = (m, t = Date.now()) => Math.max(0, Math.min(DSP().steps - 1, Math.floor((t - m.tick * TICK) / (DSP().subSec * 1000))));
/** 显示价：这一跳真实价 × (1 + 每跳波动 × k × 标准正态)，按（股票 + 跳 + 小步）定种子；不看下一跳；夹在涨跌停之间；封板 / 在板上的不抖。只给界面用，买卖一律 price() */
export function showPx(m, code, t = Date.now(), sub = null) {
  const p = m.px[code]; if (!(p > 0)) return p; const k = sub == null ? subOf(m, t) : sub; if (k <= 0 || isSealed(m, code) || onBoard(m, code)) return p;
  const x = BY[code]; let v = r2(p * (1 + M.sigma[(x && x.vol) || 'mid'] * DSP().k * hn('SUB' + code, m.tick * 16 + k)));
  const B = band(m, code); if (B.up != null) v = Math.min(B.up, Math.max(B.dn, v)); return v > 0 ? v : p;
}
/** 显示的大盘指数（按显示价算） */
export function showIndex(s, t = Date.now()) { const m = s.mkt; return r2(STOCKS.reduce((a, x) => a + showPx(m, x.code, t) * x.shares, 0) / cap0 * 1000); }
/** 这一跳到现在的小步显示价（分时图最后一段；第 1～现在这一步） */
export function subPath(m, code, t = Date.now()) { const n = subOf(m, t); const out = []; for (let k = 1; k <= n; k++) out.push(showPx(m, code, t, k)); return out; }

/** 走一跳（纯计算，改 m） */
export function step(m, tick) {
  if (!(m.px[STOCKS[STOCKS.length - 1].code] > 0)) fillNew(m);   // 设计54：老存档补新股票
  if (tick >= m.regime.until) { const ks = Object.keys(M.regimes); const kind = ks[Math.floor(hu('R', tick) * ks.length)]; m.regime = { kind, until: tick + M.regimeTicks[0] + Math.floor(hu('RS', tick) * (M.regimeTicks[1] - M.regimeTicks[0])) }; }
  const mk = M.regimes[m.regime.kind] + M.marketSigma * hn('M', tick);
  const sec = {}; for (const sc of SECTORS) sec[sc] = M.sectorSigma * hn('S' + sc, tick);
  const nw = newsAt(tick);
  const L = luDay(m, tick); const LC = LUC(); const pk = {};
  for (let k = 0; k < L.act.length; k++) {   // 到点了：定起点价、涨停价；起点已经 ≥ 涨停价的换下一只
    let p = L.act[k]; if (tick < p.at || p.from != null) { pk[p.code] = p; continue; }
    const order = luOrder(L.key);
    for (let g = 0; g < STOCKS.length; g++) {
      const lim = band(m, p.code).up; if (m.px[p.code] < lim && !L.act.some((q, j) => j !== k && q.code === p.code)) { p.limit = lim; p.from = m.px[p.code]; break; }
      const nc = order[L.next++ % order.length]; p = L.act[k] = { code: nc, at: p.at, limit: null, from: null, sealed: false };
    }
    pk[p.code] = p;
  }
  const gd = {}; for (const g of m.guards || []) if (tick > (g.by != null ? g.by : g.from - 1) && tick < g.from + g.ticks && !(pk[g.code] && pk[g.code].from != null)) gd[g.code] = g;   // 设计52 保底：造出来的那只
  for (const x of live(m)) {
    const c = x.code; const lu = pk[c];
    const gu = gd[c];
    if (gu) {   // 稳稳往上涨 rise（几何），不跳噪声、不吃新闻、不超涨停价；涨完照常跳
      m.fv[c] = Math.exp(Math.log(m.fv[c]) + MU());
      if (tick < gu.from) continue;   // 造出来到开始涨之间：价钱停着不动（不然这几跳可能先冲到涨停附近，没空间了）
      if (gu.p0 == null) gu.p0 = m.px[c];
      const k = tick - gu.from + 1;
      let v; if (gu.dip) { const D = gu.dn || 2; const lo = gu.p0 * (1 - gu.dip); v = k <= D ? gu.p0 * Math.pow(1 - gu.dip, k / D) : lo * Math.pow(1 + gu.rise, Math.min(1, (k - D) / (gu.ticks - D))); }   // 设计67 保底：先 D 跳往下走 dip 到低点，再涨 rise 到第 ticks 跳
      else v = gu.p0 * Math.pow(1 + gu.rise, k / gu.ticks);
      const B = band(m, c); m.px[c] = r2(Math.max(B.dn != null ? B.dn : 0, Math.min(B.up != null ? B.up : Infinity, v)));   // 设计53 算错造的也走这里（rise 可以是负的）
      continue;
    }
    if (lu && lu.from != null) {   // 涨停：拉升 pullTicks 跳，然后封板（不跳噪声、不吃新闻）
      const k = tick - lu.at + 1; m.fv[c] = Math.exp(Math.log(m.fv[c]) + MU());
      m.px[c] = k >= LC.pullTicks ? lu.limit : r2(lu.from * Math.pow(lu.limit / lu.from, k / LC.pullTicks)); if (k >= LC.pullTicks) lu.sealed = true;
      continue;
    }
    const lp = Math.log(m.px[c]); let lf = Math.log(m.fv[c]) + MU();
    let d = M.beta[x.vol] * mk + sec[x.sector] + M.sigma[x.vol] * hn(c, tick) + M.kappa * (lf - lp);
    d = Math.max(-M.maxStep, Math.min(M.maxStep, d));
    let j = 0; if (nw && (nw.kind === 'market' || (nw.kind === 'sector' && nw.target === x.sector) || (nw.kind === 'stock' && nw.target === c))) j = nw.jump;
    lf += Math.log(1 + j * N.fvShare);
    m.px[c] = Math.max(M.minPrice, Math.round(Math.exp(lp + d) * (1 + j) * 100) / 100); m.fv[c] = Math.exp(lf);
    const B = band(m, c); if (B.up != null) m.px[c] = Math.min(B.up, Math.max(B.dn, m.px[c]));   // 设计41 第九节：夹在跌停价和涨停价之间（碰到停在板上，算回来就开板）
  }
  m.tick = tick;
  return nw;
}
/** 设计41 第七节：接下来 n 跳的价（用当下的盘复制一份往前走，跟真实一跳一跳走出来的一样）：{ path: { code: [n 个价] }, lu: 走完时的涨停状态 } */
export function future(m, n) {
  const c = { tick: m.tick, px: { ...m.px }, fv: { ...m.fv }, regime: { ...m.regime }, ipoOn: m.ipoOn, lu: m.lu ? JSON.parse(JSON.stringify(m.lu)) : null, guards: m.guards ? JSON.parse(JSON.stringify(m.guards)) : null };
  const path = {}; for (const x of live(c)) path[x.code] = [];
  for (let k = 1; k <= n; k++) { step(c, m.tick + k); for (const code of Object.keys(path)) path[code].push(c.px[code]); }
  return { path, lu: c.lu };
}
function pushHist(m, s) {
  const H = CFG.history; const put = (k, v) => { const a = m.hist[k]; a.push(v); if (a.length > H.recent) a.shift(); if (m.tick % H.longEvery === 0) { const b = m.long[k]; b.push(v); if (b.length > H.longMax) b.shift(); } };
  for (const x of live(m)) put(x.code, m.px[x.code]); put('IDX', index(s));
}
/** 设计47：这次 advance 要走到哪一跳（看盘的跳钩子用来分「现在」和「离线补的」） */
let advTarget = 0; export const advancingTo = () => advTarget;
/** 走到现在：返回 { ticks, news: [这次出的新闻], hints（设计47 起不再有新闻提醒，永远空） } */
export function advance(s, t, { live = false, rnd = Math.random } = {}) {
  const m = mkt(s, t); const target = tickOf(t); const out = { ticks: 0, news: [], hints: [] };
  if (target <= m.tick) return out;
  advTarget = target;   // 设计47：看盘只在「现在附近的跳」发消息（离线补的不发）
  if (target - m.tick > CFG.offlineMaxTicks) m.tick = target - CFG.offlineMaxTicks;   // 离开太久：只补最近 7 天
  const prevIdx = index(s);
  while (m.tick < target) {
    const tk = m.tick + 1; const before = index(s); const prev = STEP_HOOKS.length ? { ...m.px } : null;
    const nw = step(m, tk); pushHist(m, s); out.ticks++;
    for (const fn of STEP_HOOKS) fn(s, tk, prev, m.px);   // 条件单、看盘、闲钱生息（设计72）
    if (nw) { const n2 = { ...nw, tick: tk, t: tk * TICK }; capAdd(s, 'mkt.news', m.news, n2); out.news.push(n2); }
    mgrStep(s, tk);   // 设计44：投资经理每天 4 轮（core/mgr.js 挂进来）
  }
  out.idxRet = index(s) / prevIdx - 1;
  return out;
}

/** 每跳之后要算的（条件单、看盘、闲钱生息） */
const STEP_HOOKS = [];
export const addStepHook = (fn) => { STEP_HOOKS.push(fn); };

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
const freeCash = (s) => s.invest || 0;   // 设计62：股票走投资账户（认筹冻结只在个人现金里，跟这里无关）
export const unlocked = (s) => (s.title || 0) >= CFG.unlockTitle;
/** 设计62 第四件：卖出交割单加「成本」「这笔赚了」两行（gain 跟 m.pl 记的是同一个数） */
const plRows = (cost, gain) => { const p = cost > 0 ? gain / cost : 0; const up = gain >= 0; const mag = Math.abs(gain).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return [['成本', cost, '成本价 × 卖出股数（成本价含买入手续费）'], ['这笔赚了', gain, '卖出到手 − 成本', up ? 'up' : 'down', `${up ? '+' : '−'}¥${mag}（${up ? '+' : '−'}${Math.abs(p * 100).toFixed(2)}%）`]]; };
function slip(s, code, n, side, q, t, extra = []) {
  const x = BY[code];
  return addContract(s, { prefix: 'JG', kind: 'stock', title: '交割单', parties: [['股东', s.bossName || '老板'], ['券商', '华太正券']], subject: `${side === 'buy' ? '买入' : '卖出'} ${x.name}（${code}）${n.toLocaleString()} 股，成交价 ${q.exec}${q.impact ? `（大单滑点 ${(q.impact * 100).toFixed(2)}%）` : ''}`,
    rows: [['成交金额', q.gross, ''], ['佣金', q.commission, '0.025%，最低 5 元'], ['过户费', q.transfer, '0.001%'], ...(q.stamp ? [['印花税', q.stamp, '卖出 0.05%']] : []), ...extra], total: q.total, wallet: 'invest' }, t);
}
/** 全仓（任务板 V0.2.11 第 1e 项）：budget 以内（含佣金过户费、大单滑点）最多能买几股；cap 是最多还能买到几股（个人 5%、公司 30% 的线） */
export function maxBuyN(s, code, budget, cap = Infinity) {
  const p = price(s, code); if (!(p > 0) || !(budget > 0)) return 0;
  let lo = 0, hi = Math.max(0, Math.min(cap, Math.floor(budget / p) + 1));
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (quote(s, code, mid, 'buy').total <= budget + 1e-9) lo = mid; else hi = mid - 1; }
  return lo;
}
/** 个人全仓：投资账户全部现金（设计62），个人最多买到 5% 以下 */
export const maxBuyMe = (s, code) => { const h = (mkt(s).hold[code] || { n: 0 }).n; const cap = Math.ceil(CFG.stake.notice * BY[code].shares * 1e8 - 1e-6) - 1 - h; return maxBuyN(s, code, freeCash(s), Math.max(0, cap)); };
/** 全部卖出：手里能卖的（质押的不算） */
export const maxSellMe = (s, code) => { const h = mkt(s).hold[code]; return h ? Math.max(0, h.n - (h.pledged || 0)) : 0; };   // 设计43：挂在卖单里的股票已经划出持仓
/** 投资账户能花的（设计62） */
export const availCash = (s) => freeCash(s);
export function buy(s, code, n, t = Date.now()) {
  n = Math.floor(n); if (!unlocked(s)) return { ok: false, why: '还不能开户' }; if (n < 1) return { ok: false, why: '最少 1 股' };
  if (!(mkt(s, t).px[code] > 0)) return { ok: false, why: '还没上市' };
  if (onBoard(mkt(s, t), code) === 'up') return { ok: false, why: '封在涨停，买不进（等开板）' };   // 设计41 第九节
  const m0 = mkt(s, t); const have = (m0.hold[code] || { n: 0 }).n; if ((have + n) / (BY[code].shares * 1e8) >= CFG.stake.notice - 1e-12) return { ok: false, why: `个人最多买到 ${CFG.stake.notice * 100}% 以下（只算投资）；要举牌、要约、控股，用「公司买」` };   // 验收阶段三：个人买只算投资
  const q = quote(s, code, n, 'buy'); if (freeCash(s) < q.total) return { ok: false, why: shortWhy(q.total - freeCash(s)), short: q.total - freeCash(s) };
  const ct = slip(s, code, n, 'buy', q, t);
  pay(s, { wallet: 'invest', cat: 'stock_buy', amount: q.gross, ref: ct.no, party: '证券账户', note: `买入 ${BY[code].name} ${n} 股` }, t);
  pay(s, { wallet: 'invest', cat: 'stock_fee', amount: q.fees, ref: ct.no, party: '华太正券', note: `${BY[code].name} 佣金、过户费` }, t);
  const m = mkt(s, t); const h = m.hold[code] || (m.hold[code] = { n: 0, cost: 0, at: t });
  if (!h.n) h.at = t; h.cost = r2((h.cost * h.n + q.total) / (h.n + n)); h.n += n;
  flow(m, code, 'buy', q.total); m.bought = (m.bought || 0) + 1;   // 第 P-06 项：周报、新手目标
  return { ok: true, quote: q, slip: ct, stake: stake(s, code) };
}
// ---------- 设计61 炒股今天和累计赚了多少（只算卖掉的；投资经理在自己的账上，不走这里）----------
const plDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
/** m.pl = { day, today, todayN, total, win, lose, n }（老存档从这一版开始记） */
function plAdd(m, gain, t) {
  const p = (m.pl = m.pl || { day: plDay(t), today: 0, todayN: 0, total: 0, win: 0, lose: 0, n: 0 }); const k = plDay(t);
  if (p.day !== k) { p.day = k; p.today = 0; p.todayN = 0; }
  p.today = r2(p.today + gain); p.todayN += 1; p.total = r2(p.total + gain); p.n += 1; if (gain > 0) p.win += 1; else if (gain < 0) p.lose += 1;
}
/** 卡片用：今天的过了 0 点算 0（只看不改） */
export function plView(s, t = Date.now()) {
  const p = s.mkt && s.mkt.pl; if (!p) return { today: 0, todayN: 0, total: 0, win: 0, lose: 0, n: 0 };
  const same = p.day === plDay(t); return { today: same ? p.today : 0, todayN: same ? p.todayN : 0, total: p.total, win: p.win, lose: p.lose, n: p.n || p.win + p.lose };
}
export function sell(s, code, n, t = Date.now(), opts = {}) {   // opts.note：记账备注前缀（设计73「持仓卖出」）
  const m = mkt(s, t); const h = m.hold[code]; n = Math.floor(n); if (!h || h.n < n || n < 1) return { ok: false, why: '没有这么多股' };
  if (onBoard(m, code) === 'down') return { ok: false, why: '封在跌停，卖不出（等开板）' };   // 设计41 第九节
  if (h.pledged && n > h.n - h.pledged) return { ok: false, why: `有 ${h.pledged} 股质押在银行，不能卖` }; // 3-01 股票质押（开发1 加的挂钩）
  const q = quote(s, code, n, 'sell'); const cost = r2(h.cost * n); const gain = r2(q.total - cost);   // 设计62：先算好，交割单和 m.pl 用同一个 gain
  const ct = slip(s, code, n, 'sell', q, t, plRows(cost, gain));
  taxRec(s, { kind: '证券交易印花税', base: q.gross, rate: CFG.fees.stamp, amount: q.stamp, t });
  receive(s, { wallet: 'invest', cat: 'stock_sell', amount: q.gross, ref: ct.no, party: '证券账户', note: `${opts.note ? `${opts.note}：` : ''}卖出 ${BY[code].name} ${n} 股（A 股差价免个税）` }, t);
  pay(s, { wallet: 'invest', cat: 'stock_fee', amount: q.fees, ref: ct.no, party: '华太正券', note: `${BY[code].name} 佣金、过户费、印花税`, force: true }, t);
  h.n -= n; if (!h.n) delete m.hold[code];
  flow(m, code, 'sell', q.total, gain); plAdd(m, gain, t);   // 设计61：每卖一笔记今天 / 累计赚多少
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
  let notice = false; if (lv > was) { m.told[code] = lv; notice = true; const j = CFG.stake.jump || 0; m.px[code] = r2(m.px[code] * (1 + j)); m.fv[code] *= 1 + j; capAdd(s, 'mkt.news', (m.news = m.news || []), { kind: 'stock', target: code, good: true, title: `${BY[code].name}：举牌公告，${s.companyName || '神秘买家'}持股达到 ${lv * CFG.stake.notice * 100}%`, jump: j, tick: m.tick, t: m.tick * TICK }); }
  return { pct, notice, level: lv * CFG.stake.notice, toTender: Math.min(1, pct / CFG.stake.tender) };
}
export const holdings = (s) => Object.entries(mkt(s).hold).map(([code, h]) => ({ code, ...h, value: r2(h.n * price(s, code)), pnl: r2(h.n * price(s, code) - h.n * h.cost) }));
export const holdValue = (s) => holdings(s).reduce((a, h) => a + h.value, 0);
/** V0.2.16「我的股票（含挂在卖单里的）」：{ code: { n, cost, at } }——持仓 m.hold + 卖单组 g.sh / 卖单 o.sh（联动组的出场单放组里，同一组只算一份），同一只合并、成本按股数加权、at 取最早。
 *  规矩 18：数持仓、算持股市值一律用这个；只看能卖多少的用 trade.js sellable。身价 / 资产负债表另外加了挂单（orderValue），那里不要用这个 */
export function myShares(s) {
  const m = s.mkt; const out = {}; if (!m) return out;
  const add = (code, x) => { if (!x || !(x.n > 0)) return; const o = out[code]; if (!o) { out[code] = { n: x.n, cost: x.cost || 0, at: x.at }; return; } o.cost = r2((o.cost * o.n + (x.cost || 0) * x.n) / (o.n + x.n)); o.n += x.n; if (x.at != null) o.at = o.at == null ? x.at : Math.min(o.at, x.at); };
  for (const [code, h] of Object.entries(m.hold || {})) add(code, h);
  const seen = new Set(); for (const o of m.orders || []) { const g = o.grp && m.grps ? m.grps[o.grp] : null; const box = g && o.role === 'out' ? g : o; if (seen.has(box) || !box.sh) continue; seen.add(box); add(o.code, box.sh); }
  return out;
}
/** 我的股票一只一行（跟 holdings 一样：code n cost at value pnl；含卖单里的） */
export const myHoldings = (s) => Object.entries(myShares(s)).map(([code, x]) => { const p = price(s, code); return { code, ...x, value: r2(x.n * p), pnl: r2(x.n * p - x.n * x.cost) }; });
/** 我的股票按现价算的市值（含卖单里的；不含买单里的钱） */
export const myShareValue = (s) => r2(myHoldings(s).reduce((a, h) => a + h.value, 0));

/** 分红：每真实 1 小时按「年股息率 ÷ 游戏一年的小时数」发；个税按持有时间（游戏时间） */
export function dividends(s, t) {
  const m = mkt(s, t); const D = CFG.dividend; const per = D.everyMin * 60e3;
  const n = Math.floor((t - m.divAt) / per); if (n <= 0) return [];
  m.divAt += n * per; const out = [];
  for (const h of myHoldings(s)) {   // V0.2.16：挂在卖单里的股票也分红
    const x = BY[h.code]; if (!x.div) continue;
    const amt = r2(h.value * x.div * profitMul() / YEAR_H * n * (D.everyMin / 60)); if (amt < 0.01) continue;
    const held = t - h.at; const rate = held >= YEAR_MS ? 0 : held >= MONTH_MS ? D.taxMid : D.taxShort; const tax = r2(amt * rate);
    taxRec(s, { kind: '股息红利个税', base: amt, rate, amount: tax, t });
    receive(s, { wallet: 'invest', cat: 'stock_div', amount: amt - tax, tax, party: x.name, note: `${x.name} 分红（持有${held >= YEAR_MS ? '满 1 年免税' : held >= MONTH_MS ? '1 个月～1 年，个税 10%' : '不到 1 个月，个税 20%'}）` }, t);
    out.push({ code: h.code, amt, tax });
  }
  return out;
}

// ---------- 投资经理（设计44：每天本地 0 / 6 / 12 / 18 点各一轮，用看盘那套挑股票；一轮怎么炒在 core/mgr.js）----------
export const MGR = { get feeRate() { return CFG.mgr.feeRate; }, outsourceWit: 50 };   // 设计44 第二版：没有风格
export const mgrWho = (s) => holder(s, 'invest');
/** 智慧 × 职位效率（好感、冷落照旧影响）；外包按 50 */
export function mgrWit(s, t) { const w = mgrWho(s); if (isSec(w)) return secAttrs(s, w).wit * efficiency(s, w, 'invest', t); return w === OUT ? MGR.outsourceWit : 0; }
/** 设计44 第二版：她最多管 = 下一个称号门槛 × capRate；大亨起封顶 capMax。title 不传就用现在的称号 */
export function mgrCap(s, title = s.title || 0) { const G = CFG.mgr; if (title >= G.capTopTitle || !TITLES[title + 1]) return G.capMax; return Math.min(G.capMax, TITLES[title + 1].need * G.capRate); }
/** 还能再划多少 */
export const mgrRoom = (s) => Math.max(0, r2(mgrCap(s) - ((s.mkt && s.mkt.mgr && s.mkt.mgr.value) || 0)));
export function giveMgr(s, amount, t = Date.now()) {
  const w = mgrWho(s); if (!w) return { ok: false, why: '先在「秘书 → 职位」任命投资经理' };
  amount = r2(amount); if (!(amount > 0)) return { ok: false, why: '填一个金额' };
  const room = mgrRoom(s); if (amount > room + 0.005) return { ok: false, why: `她最多管 ¥${fmt(mgrCap(s))}，还能再划 ¥${fmt(room)}` };
  if (!pay(s, { wallet: 'invest', cat: 'inv_out', amount, party: isSec(w) ? w : '券商投顾', by: isSec(w) ? w : '', note: '划给投资经理' }, t)) return { ok: false, why: shortWhy(amount - (s.invest || 0)), short: amount - (s.invest || 0) };
  const m = mkt(s, t); const g = m.mgr;
  if (g && g.value > 0) { g.principal += amount; g.value += amount; }
  else m.mgr = { principal: amount, value: amount, earn: 0, fees: 0, back: 0, cur: null, hist: [], day: null };
  return { ok: true };
}
export function takeBack(s, t = Date.now()) {
  const m = mkt(s, t); const g = m.mgr; if (!g || g.value <= 0) return { ok: false, why: '她手上没有你的钱' };
  const w = mgrWho(s); const amt = r2(g.value);
  receive(s, { wallet: 'invest', cat: 'inv_in', amount: amt, by: isSec(w) ? w : '', party: '投资经理', note: `从投资经理收回（本金 ¥${fmt(g.principal)}，她手上 ¥${fmt(amt)}）` }, t);
  m.mgr = null; return { ok: true, amount: amt };
}
/** 每跳：core/mgr.js 挂进来（开轮、成交、结算） */
let mgrStep = () => {}; export const setMgrStep = (fn) => { mgrStep = fn; };
/** 旧接口：汇报现在每轮结算时直接进「系统」（core/mgr.js），这里不再出 */
export const mgrReport = () => null;
/** 投资经理看盘：新闻出来前 3 跳（设计41），概率 智慧/100 提前说一句；说对的概率 50% + 智慧/200（智慧 100 一定提前、一定准） */
let watcherOf = () => null; export const setWatcher = (fn) => { watcherOf = fn; };   // 第 P-06 项：开局就能派的「看盘」（core/trade.js）
export function hint(s, nextTick, rnd = Math.random) {
  const nw = newsAt(nextTick); if (!nw || nw.kind !== 'stock') return null;
  const m = s.mkt; const free = m && m.freeHint > 0;   // 新手目标奖励：送一次一定准的提示
  let w = watcherOf(s) || mgrWho(s); if (!isSec(w)) { if (!free) return null; w = s.current; } const wit = secAttrs(s, w).wit;
  const T = CFG.watch.tip;
  if (!free && rnd() >= wit / T.earlyDiv) return null;
  if (free) m.freeHint -= 1;
  const right = free || rnd() < T.rightBase + wit / T.rightDiv;
  // 设计41 第二节（11-23 改）：J 用现价到新闻那一跳的真实涨跌（先把接下来几跳算出来）；她估的 J′ = J × 随机(1 − e, 1 + e)，e = 0.5 × (1 − 智慧/100)；说错方向取反
  const lead = Math.max(1, nextTick - m.tick); const after = future(m, lead).path[nw.target][lead - 1]; const P0 = m.px[nw.target];
  const Jt = after / P0 - 1; const e = T.errK * (1 - Math.min(100, wit) / 100); let J2 = Jt * (1 - e + 2 * e * rnd()); if (!right) J2 = -J2;
  const up = J2 > 0;
  return { who: w, code: nw.target, up, right, J: Jt, J2, P: P0, after, wit, newsTick: nextTick, text: `老板，${BY[nw.target].name}……我觉得${up ? '要有好消息' : '不太妙'}。` };
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
