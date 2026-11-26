// 古董藏品 + 收藏顾问 + 眼光（第 2-13 项，设计13 古董那一节、设计14 拍卖佣金和进口税、设计16 收藏顾问）
// 古玩市场：每 30 分钟换一批摊位，30% 是赝品；看穿概率 = max(老板眼光, 收藏顾问智慧) / 100，买到假的只值 5%
// 拍卖：跟车同一个拍卖会（core/auction.js）；这里算古董成交的佣金和海外进口税、收藏顾问代拍提成
// 私洽：达·芬奇 救世主只给大藏家（人脉 90 + 藏品 10 件），名额 1，等 30 分钟
// 估价每小时随机走；再拍卖卖出扣 10% 佣金，赚了交 20%；算身价（估价），加眼光 + 人脉；不送人
import { YEAR_MS } from './gametime.js?v=a24b4431'; // V0.2.10
import { profitMul } from './calib.js?v=a24b4431'; // 设计38
import CFG from '../config/antique.json?v=a24b4431' with { type: 'json' };
import { pay, receive } from './ledger.js?v=a24b4431';
import { addContract } from './contracts.js?v=a24b4431';
import { premium, addAssetHook } from './assets.js?v=a24b4431';
import { addAttrHook, bossAttrs } from './boss.js?v=a24b4431';
import { holder, isSec, attrs as secAttrs, OUT } from './posts.js?v=a24b4431';
import { SEC_BY_ID } from '../config/secretaries.js?v=a24b4431';
import { taxRec } from './fiscal.js?v=a24b4431';
import { payerOfPost } from './fiscal.js?v=a24b4431';

export const ACFG = CFG;
export const ITEMS = CFG.items.map((x) => ({ ...x, kind: 'antique' }));
export const AQ = Object.fromEntries(ITEMS.map((x) => [x.id, x]));
export const CH_NAME = { market: '古玩市场', auction: '拍卖', private: '私洽' };
export const rarityOf = (x) => (x.limit === 1 ? 'unique' : x.limit ? 'limited' : 'normal');
const fmt = (n) => (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : n >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);
const freeCash = (s) => s.cash - (s.freezes || []).reduce((a, f) => a + f.amount, 0);
const r2 = (v) => Math.round(v * 100) / 100;
/** 固定种子的随机（同一场拍卖、同一批摊位每次打开都一样） */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const seedOf = (s, k) => { let h = 2166136261; for (const c of String(s.gid || '') + '|' + k) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** 存档 s.antq：{ items: [{ uid, id, paid, est, fake, at, via, contract }], seq, market, done: { 拍卖场次: true }, orders, hourAt } */
export function aq(s) { const d = (s.antq = s.antq || {}); d.items = d.items || []; d.seq = d.seq || 0; d.done = d.done || {}; d.orders = d.orders || []; return d; }
export const pieces = (s) => aq(s).items;
export const realPieces = (s) => aq(s).items.filter((x) => !x.fake);
export const ownsUnique = (s, id) => aq(s).items.some((x) => x.id === id) && AQ[id].limit === 1;
let networkOf = (s) => bossAttrs(s).network; export const setNetworkFn = (fn) => { networkOf = fn; };
let visionOf = (s) => bossAttrs(s).vision; export const setVisionFn = (fn) => { visionOf = fn; };

// ---------- 收藏顾问 ----------
export const advisor = (s) => { const w = holder(s, 'collector'); return isSec(w) ? w : null; };
/** 掌眼：max(老板眼光, 收藏顾问智慧；外包按 50) / 100 */
export function eyeRate(s) {
  const w = holder(s, 'collector'); const wit = isSec(w) ? secAttrs(s, w).wit : w === OUT ? CFG.outsourceWit : 0;
  return Math.min(1, Math.max(visionOf(s), wit) / 100);
}

// ---------- 古玩市场 ----------
const slotOf = (t, min) => Math.floor(t / (min * 60e3));
export function market(s, t) {
  const d = aq(s); const slot = slotOf(t, CFG.market.slotMin);
  if (!d.market || d.market.slot !== slot) {
    const R = rng(seedOf(s, 'm' + slot)); const pool = ITEMS.filter((x) => x.channel === 'market'); const M = CFG.market;
    d.market = { slot, until: (slot + 1) * M.slotMin * 60e3, offers: Array.from({ length: M.offers }, (_, i) => { const x = pool[Math.floor(R() * pool.length)]; return { oid: `${slot}_${i}`, id: x.id, price: Math.round(x.est * (M.priceLo + R() * (M.priceHi - M.priceLo)) / 100) * 100, fake: R() < M.fakeRate, roll: R(), sold: false }; }) };
  }
  return d.market;
}
/** 鉴定：看出疑似赝品（真的不会看错） */
export const suspect = (s, o) => o.fake && o.roll < eyeRate(s);
export function buyMarket(s, oid, t) {
  const m = market(s, t); const o = m.offers.find((x) => x.oid === oid);
  if (!o || o.sold) return { ok: false, why: '这件已经卖掉了' };
  if (freeCash(s) < o.price) return { ok: false, why: `个人现金还差 ${fmt(o.price - freeCash(s))}` };
  const x = AQ[o.id]; const who = advisor(s);
  const inv = addContract(s, { prefix: 'GW', kind: 'antique', title: '古玩市场收据', parties: [['买方', s.bossName || '老板'], ['卖方', '潘家园摊主']], subject: x.name, rows: [['成交价', o.price, '现金交易，不开发票']], total: o.price, wallet: 'personal' }, t);
  pay(s, { wallet: 'personal', cat: 'antique', amount: o.price, ref: inv.no, party: '古玩市场摊主', by: who || '', note: x.name }, t);
  o.sold = true;
  const it = add(s, x, { paid: o.price, est: o.fake ? x.est * CFG.market.fakeValue : x.est, fake: o.fake, via: 'market', contract: inv.no, t });
  return { ok: true, item: it, fake: o.fake };
}
function add(s, x, { paid, est, fake = false, via, contract, t }) {
  const d = aq(s); d.seq += 1;
  const it = { uid: d.seq, id: x.id, paid: r2(paid), est: Math.round(est), fake, at: t, via, contract };
  d.items.push(it); s.stats = s.stats || {}; s.stats.assetsBought = (s.stats.assetsBought || 0) + 1;
  return it;
}

// ---------- 拍卖：场次、图录、举牌在 core/auction.js（车和古董同一个拍卖会）；这里只管古董成交付款 ----------
/** 进口税（海外拍回来）：关税 + 增值税，按落槌价 + 佣金 */
export function importTax(x, base) { if (!x.foreign) return { tariff: 0, vat: 0 }; const tariff = base * CFG.import.tariff; return { tariff: r2(tariff), vat: r2((base + tariff) * CFG.import.vat) }; }
export function bidQuote(x, hammer) { const prem = Math.round(premium(hammer)); const it = importTax(x, hammer + prem); return { hammer, prem, ...it, total: r2(hammer + prem + it.tariff + it.vat) }; }
/** 拍到了付款：落槌 + 买家佣金 + 海外进口税，出拍卖成交确认书；收藏顾问代拍的提成 1% 公司付 */
export function settle(s, id, hammer, t, { who = '' } = {}) {
  const x = AQ[id]; const q = bidQuote(x, hammer);
  if (freeCash(s) < q.total) return { ok: false, why: `个人现金还差 ${fmt(q.total - freeCash(s))}` };
  const ct = addContract(s, { prefix: 'PM', kind: 'auction', title: '拍卖成交确认书', parties: [['买受人', s.bossName || '老板'], ['拍卖人', x.foreign ? '佳仕得拍卖行（香港）' : '佳得拍卖']], subject: `${x.name}${x.limit === 1 ? '（孤品）' : ''}`,
    rows: [['落槌价', hammer, ''], ['买家佣金', q.prem, '分段 26% / 20% / 15%'], ...(x.foreign ? [['进口关税', q.tariff, `约 ${CFG.import.tariff * 100}%`], ['进口增值税', q.vat, `${CFG.import.vat * 100}%`]] : [])], total: q.total, wallet: 'personal' }, t);
  pay(s, { wallet: 'personal', cat: 'antique', amount: hammer + q.prem, ref: ct.no, party: '拍卖行', by: who || '', note: `${x.name}（落槌价 + 佣金）` }, t);
  taxRec(s, { kind: '进口关税、增值税（艺术品）', base: hammer + q.prem, amount: q.tariff + q.vat, t });
  if (q.tariff + q.vat > 0) pay(s, { wallet: 'personal', cat: 'tax_personal', amount: q.tariff + q.vat, tax: q.tariff + q.vat, ref: ct.no, party: '海关', note: `${x.name} 进口关税、增值税` }, t);
  if (who) pay(s, { wallet: payerOfPost(s, 'collector'), cat: payerOfPost(s, 'collector') === 'personal' ? 'family_office' : 'sec_salary', amount: hammer * CFG.advisor.commission, force: true, party: who, by: who, note: '收藏顾问代拍成交提成 1%' }, t);
  const it = add(s, x, { paid: q.total, est: x.est, via: who ? 'proxy' : 'auction', contract: ct.no, t });
  return { ok: true, item: it, quote: q, contract: ct, who };
}

// ---------- 私洽（定制委托）----------
export const orderOf = (s, id) => aq(s).orders.find((o) => o.id === id);
export function whyNotPrivate(s, id) {
  const x = AQ[id]; if (ownsUnique(s, id)) return '已经在你手里了';
  if (networkOf(s) < x.network) return `私洽：人脉 ≥ ${x.network}（现在 ${networkOf(s)}）`;
  if (realPieces(s).length < (x.minPieces || 0)) return `私洽：要先有 ${x.minPieces} 件藏品（现在 ${realPieces(s).length}）`;
  return null;
}
export function startPrivate(s, id, t) { const why = whyNotPrivate(s, id); if (why) return { ok: false, why }; if (orderOf(s, id)) return { ok: false, why: '已经在谈了' }; aq(s).orders.push({ id, at: t + AQ[id].wait * 60e3, from: t }); return { ok: true }; }
export function closePrivate(s, id, t) {
  const o = orderOf(s, id); const x = AQ[id]; if (!o || t < o.at) return { ok: false, why: '还在谈' };
  const price = x.est; const it0 = importTax(x, price); const total = r2(price + it0.tariff + it0.vat);
  if (freeCash(s) < total) return { ok: false, why: `个人现金还差 ${fmt(total - freeCash(s))}` };
  const ct = addContract(s, { prefix: 'SQ', kind: 'private', title: '艺术品私下洽购协议', parties: [['买方', s.bossName || '老板'], ['卖方', '欧洲私人藏家（拍卖行私洽部代理）']], subject: `${x.name}（孤品）`, rows: [['成交价', price, '私洽，不公开'], ['进口关税', it0.tariff, ''], ['进口增值税', it0.vat, '']], total, wallet: 'personal' }, t);
  pay(s, { wallet: 'personal', cat: 'antique', amount: price, ref: ct.no, party: '私人藏家', note: x.name }, t);
  taxRec(s, { kind: '进口关税、增值税（艺术品）', base: price, amount: it0.tariff + it0.vat, t });
  pay(s, { wallet: 'personal', cat: 'tax_personal', amount: it0.tariff + it0.vat, tax: it0.tariff + it0.vat, ref: ct.no, party: '海关', note: `${x.name} 进口关税、增值税` }, t);
  aq(s).orders = aq(s).orders.filter((y) => y !== o);
  return { ok: true, item: add(s, x, { paid: total, est: x.est, via: 'private', contract: ct.no, t }), contract: ct };
}

// ---------- 估价、卖出、身价、属性 ----------
/** 每小时（离线回来一次补）：估价随机走 −1%～+2% */
export function drift(s, t, rnd = Math.random) {
  const d = aq(s); if (d.hourAt == null) { d.hourAt = t; return 0; }
  const n = Math.min(24 * 30, Math.floor((t - d.hourAt) / 3600e3)); if (n <= 0) return 0;
  d.hourAt += n * 3600e3;
  const sh = (CFG.drift.lo + CFG.drift.hi) / 2 * (profitMul() / (CFG.drift.refPM || 10) * (CFG.drift.refHours || 200) / (YEAR_MS / 3600e3) - 1); /* V0.2.10：配置按一年 200 小时写的，一年变短每小时多走一点，每游戏年还是一样 */ /* 设计38：均值跟 profitMul 走（配置按 10 写的） */
  for (const it of d.items) if (!it.fake) for (let i = 0; i < n; i++) it.est = Math.round(it.est * (1 + sh + CFG.drift.lo + rnd() * (CFG.drift.hi - CFG.drift.lo)));
  return n;
}
/** 再拍卖卖出：成交 = 估价 × 0.9～1.3；扣卖家佣金 10%；赚了交 20%。赝品拍卖行不收 */
export function sell(s, uid, t, rnd = Math.random) {
  const d = aq(s); const it = d.items.find((x) => x.uid === uid); if (!it) return { ok: false, why: '没有这件' };
  if (it.pledged) return { ok: false, why: '质押在瑞鑫私行，不能卖、不能借展' }; // 3-01 艺术品质押（开发1 加的挂钩）
  if (it.fake) return { ok: false, why: '拍卖行鉴定是仿品，不收' };
  const A = CFG.auction; const x = AQ[it.id];
  const hammer = Math.round(it.est * (A.sellLo + rnd() * (A.sellHi - A.sellLo))); const fee = r2(hammer * A.sellerFee);
  const gain = Math.max(0, hammer - fee - it.paid); const tax = r2(gain * A.gainTax);
  d.items = d.items.filter((y) => y !== it);
  taxRec(s, { kind: '财产转让所得个税', base: gain, rate: A.gainTax, amount: tax, t });
  receive(s, { wallet: 'personal', cat: 'sell', amount: hammer - fee - tax, tax, ref: it.contract || '', party: '拍卖行', note: `拍卖卖出 ${x.name}（落槌 ${fmt(hammer)}，卖家佣金 10%${tax ? '，财产转让所得个税 20%' : ''}）` }, t);
  return { ok: true, hammer, fee, tax, net: r2(hammer - fee - tax) };
}
export const value = (s) => pieces(s).reduce((a, x) => a + x.est, 0);
const lg = (p) => Math.log10(Math.max(1, p / 1e4)); const RANK = [1, 0.6, 0.4, 0.2];
export function attrs(s) {
  const list = realPieces(s).slice().sort((a, b) => b.est - a.est);
  return list.reduce((a, it, i) => { const k = RANK[Math.min(i, 3)] * lg(it.est); a.vision += CFG.attr.vision * k; a.network += CFG.attr.network * k; return a; }, { vision: 0, network: 0 });
}
/** 收藏顾问的建议：涨了 30% 以上的 */
export const advice = (s) => (advisor(s) ? realPieces(s).filter((it) => it.est >= it.paid * (1 + CFG.advisor.adviceUp)) : []);
export const cabinets = (s) => CFG.cabinets.filter((n) => pieces(s).length >= n).length;

/** 每秒：估价走、私洽到点。返回要提示的话 */
export function tick(s, t) {
  drift(s, t); const out = [];
  for (const o of aq(s).orders) if (t >= o.at && !o.told) { o.told = true; out.push(`私洽谈好了：${AQ[o.id].name}，去签协议`); }
  return out;
}

addAssetHook({ value, count: (s) => pieces(s).length });
addAttrHook(attrs);
