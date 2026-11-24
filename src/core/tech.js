// 科技（设计20 第二节 3）：产品项目（立项 → 研发 → 上线 → S 曲线 → 止损）、研发费用加计扣除 100%、软件即征即退、联动管理效率 +3%
// 不 import economy
import { whyCushion } from './cashflow.js?v=e379aa95'; // V0.2.3 留够两个月工资
import T from '../config/tech.json?v=e379aa95' with { type: 'json' };
import { headCap, gm } from './calib.js?v=e379aa95';
import { pay, receive, canPay } from './ledger.js?v=e379aa95';
import { holder, isSec, attrs } from './posts.js?v=e379aa95';
import { bossAttrs } from './boss.js?v=e379aa95';
import { lookOf, establishment, wage, PAY, onDuty } from './staff.js?v=e379aa95';
import { MONTH_MS, monthIndex } from './gametime.js?v=e379aa95';
import { addMsg } from './inbox.js?v=e379aa95';
export { T as TECH_CFG };

const MIN = 60e3; const MONTH_SEC = MONTH_MS / 1000;
const r2 = (x) => Math.round(x * 100) / 100;
export const tech = (s) => (s.tech = s.tech || { products: [], seq: 0, month: null, swRev: 0 });
export const maxProducts = (s) => (s.inds.tech ? T.maxProducts[lookOf(s, 'tech')] : 0);
export const liveProducts = (s) => tech(s).products.filter((p) => p.stage !== 'closed');
export const devCost = (s, dir) => T.directions[dir].devCost * T.devCostByLook[s.inds.tech ? lookOf(s, 'tech') : 0];
const pm = (s) => holder(s, 'manager_tech');
const cfo = (s) => holder(s, 'cfo');

export function whyNotStart(s, dir) {
  if (!s.inds.tech) return '还没有科技公司';
  if (!T.directions[dir]) return '没有这个方向';
  if (liveProducts(s).length >= maxProducts(s)) return `现在最多同时做 ${maxProducts(s)} 个产品（升级公司能多做）`;
  if (!canPay(s, 'company', devCost(s, dir))) return '公司账户不够';
  { const w = whyCushion(s, devCost(s, dir)); if (w) return w; } /* V0.2.3 */
  return null;
}
/** 产品成败：产品经理（科技经理）的智慧 + 老板眼光 + 运气（对数正态，社交 / AI 更两极） */
export function rollQuality(s, dir, rnd = Math.random) {
  const m = pm(s); const wit = isSec(m) ? attrs(s, m).wit : m ? 40 : 15; const vis = bossAttrs(s).vision || 0;
  const Q = T.quality; const sp = Q.spread[dir] || 1;
  const z = Math.sqrt(-2 * Math.log(1 - rnd() * 0.999999)) * Math.cos(2 * Math.PI * rnd());
  return Math.max(0.02, Q.base * (1 + wit / 100 * Q.witK) * (1 + Math.min(100, vis) / 100 * Q.visionK) * Math.exp(Q.sigma * sp * z - (Q.sigma * sp) ** 2 / 2));
}
/** 立项：研发费用（外包、服务器、采购）一次付；研发期 30 分钟只花钱 */
export function startProduct(s, dir, t, rnd = Math.random) {
  const why = whyNotStart(s, dir); if (why) return { ok: false, why };
  const D = T.directions[dir]; const X = tech(s); const cost = devCost(s, dir);
  pay(s, { wallet: 'company', cat: 'rnd', amount: cost, by: isSec(pm(s)) ? pm(s) : '', note: `科技 立项「${D.name}」研发费用` }, t);
  s.period = s.period || {}; s.period.other = (s.period.other || 0) + cost; s.period.rnd = (s.period.rnd || 0) + cost; // 费用化，所得税前扣；加计扣除另算
  X.seq += 1;
  const p = { id: X.seq, dir, scale: T.marketByLook[lookOf(s, 'tech')], name: `${D.name} ${['星图', '云帆', '极光', '回声', '方舟', '灵犀', '织梦', '光年'][X.seq % 8]}`, stage: 'dev', start: t, at: t + gm(D.devMonths) * MONTH_MS, cost, q: rollQuality(s, dir, rnd), users: 0, revTotal: 0 };
  X.products.push(p);
  return { ok: true, product: p };
}
/** 用户：上线后按 S 曲线（logistic）涨到上限 = 市场 × 质量 */
export function usersAt(p, t) {
  if (p.stage === 'closed' && t >= (p.closedAt || 0)) return 0;
  const launch = p.launch || p.at; if (t < launch) return 0; // 研发期没有用户（离线一段段算时按时间判断，不看 stage）
  const cap = userCap(p); const ramp = gm(T.directions[p.dir].rampMonths) * MONTH_MS; const mid = launch + ramp / 2; const k = 10 / ramp;
  return Math.round(cap / (1 + Math.exp(-k * (t - mid))));
}
export const userCap = (p) => Math.round(T.directions[p.dir].market * (p.scale || 1) * p.q); // 公司越大、立项越贵，市场也越大
/** 一个产品每秒营业收入 */
export const productRev = (s, p, t) => usersAt(p, t) * T.directions[p.dir].arpu / MONTH_SEC * (1 + T.levelRev * ((s.inds.tech && s.inds.tech.level) || 1));
/** 科技每秒营业收入（economy 再乘在岗、经理、眼光） */
/** 人效上限：全部产品月收入 ≤ 在岗人数 × 人均上限（core/calib.js headCap，按真实人均营收和净利 × profitMul 反推） */
export const revCapPerSec = (s) => (s.inds.tech ? onDuty(s, 'tech') * headCap('tech', lookOf(s, 'tech'), T.real) / MONTH_SEC : 0); // 真实经济反推（设计21）
const rawRev = (s, t) => { let r = 0; for (const p of s.tech.products) r += productRev(s, p, t); return r; };
/** 超过上限的部分不算：所有产品按比例压（用户也涨不动） */
export function capFactor(s, t = s._now || Date.now()) { if (!s.tech) return 1; const raw = rawRev(s, t); const cap = revCapPerSec(s); return raw > cap ? (raw > 0 ? cap / raw : 1) : 1; }
/** 科技每秒营业收入（economy 再乘在岗、经理、眼光）；离线时按 S 曲线把离开那段切成小段平均（s._win = [从, 到]） */
export function techRevPerSec(s, t = s._now || Date.now()) {
  if (!s.tech) return 0;
  if (s._win) { const [a, b] = s._win; const n = 120; let sum = 0; for (let i = 0; i < n; i++) { const x = a + (b - a) * (i + 0.5) / n; sum += Math.min(rawRev(s, x), revCapPerSec(s)); } return sum / n; }
  return Math.min(rawRev(s, t), revCapPerSec(s));
}
/** 界面：现在实际的用户（压过上限的按比例） */
export const usersNow = (s, p, t) => Math.round(usersAt(p, t) * capFactor(s, t));
/** 止损：关掉，不再进钱；研发费是沉没成本 */
export function closeProduct(s, id, t) { const p = tech(s).products.find((x) => x.id === id); if (!p || p.stage === 'closed') return false; p.stage = 'closed'; p.closedAt = t; return true; }
/** 有科技：所有产业管理效率 +3%（数字化） */
export const techLink = (s) => (s.inds && s.inds.tech ? T.linkMgmt : 0);

/** 每秒 / 离线：研发到点上线；每个游戏月：研发费用加计扣除（有财务总监才做）、软件产品即征即退 */
export function tickTech(s, t) {
  if (!s.inds.tech) return [];
  const X = tech(s); const ev = []; s._now = t;
  for (const p of X.products) if (p.stage === 'dev' && t >= p.at) { p.stage = 'live'; p.launch = p.at; ev.push(`「${p.name}」上线了`); }
  // 软件产品收入累计（即征即退按月）
  const dt = X.lastT != null ? Math.max(0, Math.min(t - X.lastT, 8 * 3600e3)) / 1000 : 0; X.lastT = t;
  const cf = capFactor(s, t); for (const p of X.products) if (p.stage === 'live') { const r = productRev(s, p, t) * cf * dt; p.revTotal += r; if (T.directions[p.dir].software) X.swRev += r; }
  const m = monthIndex(s, t); if (X.month == null) X.month = m;
  while (X.month < m) {
    X.month += 1; const at = s.createdAt + X.month * MONTH_MS;
    const labor = Object.entries(establishment(s, 'tech')).reduce((a, [r, n]) => a + n * wage(r) * (1 + Object.values(PAY.social).reduce((x, y) => x + y, 0)), 0);
    const rnd = (s.period && s.period.rnd || 0) + labor * T.rndShare; // 研发费用：立项费 + 研发人员工资（按比例）
    if (cfo(s)) {
      const extra = r2(rnd * T.rndExtra); s.period = s.period || {}; s.period.other = (s.period.other || 0) + extra; s.period.rnd = 0;
      pay(s, { wallet: 'company', cat: 'rnd_extra', amount: extra, memo: true, by: isSec(cfo(s)) ? cfo(s) : '', note: '研发费用加计扣除 100%（只减应纳税所得额，不动钱）' }, at);
    } else if (rnd > 0 && !X.toldNoCfo) { X.toldNoCfo = true; addMsg(s, { kind: 'system', type: 'tech', title: '研发费用加计扣除没人申报', body: '没有财务总监，研发费用 100% 加计扣除享受不到（多交所得税）。任命一个财务总监或交给代账公司。' }, at); }
    // 软件产品增值税即征即退：电商工具按软件产品 13%，实际税负超 3% 的退回（这里游戏里统一按 6% 交，退 6% − 3%）
    if (X.swRev > 0 && cfo(s)) { const back = r2(X.swRev * (0.06 - T.softwareBurden)); receive(s, { wallet: 'company', cat: 'tax_refund', amount: back, party: '税务局', by: isSec(cfo(s)) ? cfo(s) : '', note: '软件产品增值税即征即退（实际税负超 3% 部分）' }, at); }
    X.swRev = 0;
  }
  return ev;
}
