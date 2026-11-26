// 拍卖会（第 2-14b 项，设计09 第三节）：车和古董同一个按场次的拍卖会
// 每 30 分钟一场，每场 2～4 件（停产限量车、拍卖古董）；人脉够才收到图录；起拍价 车 = 原价 × 1.5～3、古董 = 估价 × 0.8；
// NPC 跟你抢（最高出到多少每场固定）；你设最高出价举牌，一场一件只能举一次；拍到了签成交确认书付款（设计35 第十节：不限时，一直挂着，签了才生效；老规矩 5 分钟违约作废）
// 古董可以交给收藏顾问代拍（她的交际让 NPC 少抬价）
import CFG from '../config/auction.json?v=5e43f185' with { type: 'json' };
import * as AS from './assets.js?v=5e43f185';
import * as AQ from './antique.js?v=5e43f185';
import { addAttrHook, bossAttrs } from './boss.js?v=5e43f185';
import { attrs as secAttrs } from './posts.js?v=5e43f185';

export const AUCFG = CFG;
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (n) => (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : n >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);
/** 存档 s.auc：{ done: { 场次件: true }, won: [{ lot, kind, id, name, hammer, deadline, who }], penalty } */
export function au(s) { const d = (s.auc = s.auc || {}); d.done = d.done || {}; d.won = d.won || []; d.penalty = d.penalty || 0; return d; }
let networkOf = (s) => bossAttrs(s).network; export const setNetworkFn = (fn) => { networkOf = fn; };

/** 能上拍的：停产限量车（没拥有的）+ 拍卖古董（孤品没拍走的） */
export function pool(s) {
  const cars = Object.values(AS.ITEM).filter((it) => it.kind === 'car' && AS.channelOf(it) === 'auction' && !AS.owns(s, it.id)).map((it) => ({ kind: 'car', id: it.id, name: AS.label(it), base: it.price, need: it.network || CFG.car.network }));
  const ants = AQ.ITEMS.filter((x) => x.channel === 'auction' && !AQ.ownsUnique(s, x.id)).map((x) => ({ kind: 'antique', id: x.id, name: x.name, base: x.est, need: x.network || 0 }));
  return [...cars, ...ants].sort((a, b) => (a.id < b.id ? -1 : 1));
}
const slotOf = (t) => Math.floor(t / (CFG.slotMin * 60e3));
/** 这一场的图录：lots（你收到图录、还没举过牌的）、hidden（人脉不够没收到的件数）、until（落幕时间） */
export function catalog(s, t) {
  const slot = slotOf(t); const R = AQ.rng(seedOf(s, 'auc' + slot)); const p = pool(s).slice();
  const [lo, hi] = CFG.lots; const n = Math.min(p.length, lo + Math.floor(R() * (hi - lo + 1)));
  const all = [];
  for (let i = 0; i < n; i++) {
    const x = p.splice(Math.floor(R() * p.length), 1)[0]; const C = CFG[x.kind];
    const start = Math.round(x.base * (C.startLo + R() * (C.startHi - C.startLo)) / 1e4) * 1e4;
    const npcMax = Math.round(start * (C.npcLo + R() * (C.npcHi - C.npcLo)));
    all.push({ ...x, lot: `${slot}_${x.id}`, start, npcMax });
  }
  const net = networkOf(s); const d = au(s);
  return { slot, until: (slot + 1) * CFG.slotMin * 60e3, lots: all.filter((l) => net >= l.need && !d.done[l.lot]), hidden: all.filter((l) => net < l.need).length };
}
function seedOf(s, k) { let h = 2166136261; for (const c of String(s.gid || '') + '|' + k) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

/** 举牌：最高出到 maxBid。proxy：古董交给收藏顾问代拍 */
export function bid(s, lotId, maxBid, t, { proxy = false } = {}) {
  const l = catalog(s, t).lots.find((x) => x.lot === lotId); if (!l) return { ok: false, why: '这件没在这一场的图录里（或者已经举过牌）' };
  if (maxBid < l.start) return { ok: false, why: `最高出价不能低于起拍价 ${fmt(l.start)}` };
  const who = proxy ? AQ.advisor(s) : null;
  if (proxy && (l.kind !== 'antique' || !who)) return { ok: false, why: '要有收藏顾问（秘书）才能代拍古董' };
  const npc = Math.round(l.npcMax * (who ? 1 - secAttrs(s, who).social / 100 * CFG.proxySocialK : 1));
  au(s).done[l.lot] = true;
  if (maxBid < npc) return { ok: true, won: false, npc, lot: l };
  const hammer = Math.max(l.start, Math.min(maxBid, Math.round(npc * 1.03)));
  const w = { lot: l.lot, kind: l.kind, id: l.id, name: l.name, hammer, deadline: t + CFG.payMin * 60e3, who: who || '' };
  au(s).won.push(w);
  return { ok: true, won: true, npc, lot: l, w, total: wonTotal(s, w) };
}
/** 拍到的要付多少：车 = 落槌 + 购置税等 + 买家佣金；古董 = 落槌 + 佣金 + 海外进口税 */
export function wonTotal(s, w) {
  if (w.kind === 'car') return r2(AS.quote(s, w.id, w.hammer).total + Math.round(AS.premium(w.hammer)));
  return AQ.bidQuote(AQ.AQ[w.id], w.hammer).total;
}
export const wonList = (s) => au(s).won;
/** 签成交确认书付款 */
export function pay(s, lot, t) {
  const d = au(s); const w = d.won.find((x) => x.lot === lot); if (!w) return { ok: false, why: '没有这一件' };
  const r = w.kind === 'car' ? AS.buy(s, w.id, t, { price: w.hammer, channel: 'auction', skipCheck: true }) : AQ.settle(s, w.id, w.hammer, t, { who: w.who });
  if (r.ok) d.won = d.won.filter((x) => x !== w);
  return r;
}
/** 设计35 第十节：拍到的不再限时付款、不再违约（老存档里的 deadline 不管）。留着接口，返回空 */
export function tick() { return []; }
addAttrHook((s) => ({ network: -((s.auc && s.auc.penalty) || 0) }));

// ---------- 拍卖私洽（V2-06，设计29 第二节）：开拍前直接找卖家谈 ----------
// 卖家开价 = NPC 最高出价 × askX；底线 = 开价 × range（藏家性格偏高）；谈成就不上拍，按谈成的价当落槌价（照样付佣金、税，5 分钟内付）；
// 谈崩了这件 30 分钟内不能再私洽，但拍卖会照样能举牌。筹码：有收藏顾问 = 有情报；带的秘书交际够 = 耐心 +1；准备了「亲自谈」= 看底线在哪个三分之一
import * as NG from './negotiate.js?v=5e43f185';
import { bigBonus } from './manage.js?v=5e43f185';
export function privateOpts(s, lotId, t, secId = null) {
  const l = catalog(s, t).lots.find((x) => x.lot === lotId); if (!l) return null; const P = NG.NEGO_CFG.auction;
  return { key: 'auc_' + l.id, kind: 'buy', base: Math.round(l.npcMax * P.askX / P.step) * P.step, range: P.range, step: P.step, persona: P.persona, chips: { intel: !!AQ.advisor(s), secId, boss: bigBonus(s, 'deal') > 0 }, lot: l };
}
export function privateStart(s, lotId, t, secId = null, rnd = Math.random) {
  const o = privateOpts(s, lotId, t, secId); if (!o) return { ok: false, why: '这件没在这一场的图录里（或者已经举过牌）' };
  const r = NG.start(s, o, t, rnd); if (r.ok) r.sess.coolMin = NG.NEGO_CFG.auction.cooldownMin; return r.ok ? { ...r, lot: o.lot } : r;
}
/** 私洽谈成：这件不上拍了，按谈成的价记成拍到的（5 分钟内签成交确认书付款） */
export function privateDeal(s, lotId, price, t) {
  const l = catalog(s, t).lots.find((x) => x.lot === lotId); if (!l) return { ok: false, why: '这件已经不在图录里了' };
  au(s).done[l.lot] = true;
  const w = { lot: l.lot, kind: l.kind, id: l.id, name: l.name, hammer: price, deadline: t + CFG.payMin * 60e3, who: '', private: true };
  au(s).won.push(w);
  return { ok: true, w, total: wonTotal(s, w) };
}
