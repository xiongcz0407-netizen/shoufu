// 名表 / 高定西装 / 名包（第 2-12 项，设计10 清单、设计09 第三节渠道、设计14 第二节 2 发票、设计16 商务总监）
// 渠道：现货 / 配货（品牌配货额度，买了扣掉）/ 订单配额（排队）/ 邀请（等品牌来电）/ 定制委托（定金 30%，全定制西装两次试衣）/ 拍卖
// 表、西装：老板自己的，算身价（卖回价），加气场（全定制西装加人脉），戴着的表、穿着的西装再加一半；能卖回（配货表马上卖 → 配货变差一档；邀请 / 定制的卖了 → 拉黑）
// 名包：只能送秘书（喜欢的牌子翻倍、进她的记录），不算身价、不画在立绘上；爱马士配货包每天最多 2 个，香奈尔 CF 每天 1 个
// 商务总监（秘书）：配货额度攒得快；被拉黑 / 变差后去品牌「求情」
import { MONTH_MS } from './gametime.js?v=691ed83a'; // V0.2.10
import CFG from '../config/luxury.json?v=691ed83a' with { type: 'json' };
import { pay } from './ledger.js?v=691ed83a';
import { receive } from './ledger.js?v=691ed83a';
import { addContract } from './contracts.js?v=691ed83a';
import { invoice, dayKey } from './affection.js?v=691ed83a';
import { ensureSec } from './secretary.js?v=691ed83a';
import { stewardSellRate, stewardQueueMult, holder, isSec, attrs as secAttrs } from './posts.js?v=691ed83a';
import { addAssetHook, recalc, premium } from './assets.js?v=691ed83a';
import { addAttrHook, bossAttrs } from './boss.js?v=691ed83a';
import { SEC_BY_ID } from '../config/secretaries.js?v=691ed83a';
import { taxRec } from './fiscal.js?v=691ed83a';

export const LCFG = CFG;
export const WATCHES = CFG.watches, SUITS = CFG.suits, BAGS = CFG.bags;
export const L = Object.fromEntries([...WATCHES, ...SUITS, ...BAGS].map((x) => [x.id, x]));
export const label = (x) => `${x.brand} ${x.model}`;
export const CH_NAME = { spot: '现货', alloc: '配货', order: '订单配额', invite: '邀请', custom: '定制委托', auction: '拍卖' };
export const rarityOf = (x) => (x.limit === 1 ? 'unique' : x.limit ? 'limited' : 'normal');
export const BRANDS = (kind) => [...new Map((kind === 'watch' ? WATCHES : kind === 'suit' ? SUITS : BAGS).map((x) => [x.brandKey, x.brand])).entries()];
const fmt = (n) => (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : n >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);
const freeCash = (s) => s.cash - (s.freezes || []).reduce((a, f) => a + f.amount, 0);
const CAT = { watch: 'watch', suit: 'suit', bag: 'bag' };

/** 存档 s.lux */
export function lx(s) {
  const d = (s.lux = s.lux || {});
  if (Array.isArray(d.orders) && d.orders.some((o) => L[o.id] && L[o.id].kind === 'bag')) dropBagOrders(s, d);
  for (const [k, v] of Object.entries({ own: [], meta: {}, spend: {}, quota: {}, penalty: {}, black: {}, allocBags: 0, day: '', cf: 0, alloc: 0, suitSlot: {}, orders: [], worn: {}, pleadAt: 0, given: [] })) if (d[k] == null) d[k] = structuredClone(v);
  return d;
}
/** 设计56 老存档：排着队的名包订单（配货 / 邀请，都没交定金）直接撤掉，写一条系统消息：现在去「奢侈品」直接买（交过定金的退回） */
function dropBagOrders(s, d) {
  const bags = d.orders.filter((o) => L[o.id] && L[o.id].kind === 'bag'); d.orders = d.orders.filter((o) => !bags.includes(o));
  for (const o of bags) if (o.deposit > 0) receive(s, { wallet: 'personal', cat: 'bag', amount: o.deposit, party: L[o.id].brand, note: `${label(L[o.id])} 订单撤了，定金退回` });
  (s.inbox = s.inbox || []); d.bagOrdersDropped = (d.bagOrdersDropped || 0) + bags.length;
}
function today(s, t) { const d = lx(s); const k = dayKey(t); if (d.day !== k) { d.day = k; d.cf = 0; d.alloc = 0; d.suitSlot = {}; } return d; }
export const owns = (s, id) => lx(s).own.includes(id);
export const mine = (s, kind) => lx(s).own.filter((id) => L[id] && (!kind || L[id].kind === kind));
export const spendOf = (s, b) => lx(s).spend[b] || 0;
export const quotaOf = (s, b) => lx(s).quota[b] || 0;
/** 配货要的额度 = 价格 ×（倍数 + 变差的档） */
export const quotaNeed = (s, x) => x.price * ((x.quotaX || 0) + (lx(s).penalty[x.brandKey] || 0));
const bizWho = (s) => { const w = holder(s, 'biz'); return isSec(w) ? w : null; };
/** 买东西攒配货额度：有商务总监（秘书）攒得快 */
export const quotaMult = (s) => { const w = bizWho(s); return w ? 1 + secAttrs(s, w).social / 100 * CFG.quotaBiz : 1; };
let networkOf = (s) => bossAttrs(s).network; export const setNetworkFn = (fn) => { networkOf = fn; };

/** 差什么（null = 能买 / 能下单）。forQueue：下单排队时只看门槛，不看全款 */
export function whyNot(s, id, t = Date.now(), { forQueue = false } = {}) {
  const x = L[id]; if (!x) return '没有这件';
  const d = today(s, t); const b = x.brandKey;
  if (x.kind === 'bag') return x.retired ? '这件不卖了' : freeCash(s) < x.price ? `个人现金还差 ${fmt(x.price - freeCash(s))}` : null;   // 设计56：名包全部现货直接买（没有限量、配货、邀请）
  if (owns(s, id)) return '已经有了';
  if (orderOf(s, id)) return null;   // 已经在排队：到点直接签
  if (d.black[b]) return `你转卖过${x.brand}的东西，被拉黑了（商务总监可以去求情）`;
  if (x.spend && spendOf(s, b) < x.spend) return `${x.brand}累计消费要到 ${fmt(x.spend)}（还差 ${fmt(x.spend - spendOf(s, b))}）`;
  if (x.own) { const n = mine(s, x.kind).filter((i) => L[i].brandKey === b).length; if (n < x.own) return `${CH_NAME[x.channel]}：要先有 ${x.own} 块${x.brand}（现在 ${n}）`; }
  if (x.allocBags && d.allocBags < x.allocBags) return `${CH_NAME[x.channel]}：要先买过 ${x.allocBags} 个配货包（现在 ${d.allocBags}）`;
  if (x.network && networkOf(s) < x.network) return `${CH_NAME[x.channel]}：人脉 ≥ ${x.network}（现在 ${networkOf(s)}）`;
  if (x.channel === 'alloc') { const need = quotaNeed(s, x); if (quotaOf(s, b) < need) return `配货：${x.brand}配货额度要 ≥ ${fmt(need)}（现在 ${fmt(quotaOf(s, b))}，在${x.brand}买别的攒）`; }
  if (x.dailyMax && d.cf >= x.dailyMax) return `今天的 ${x.dailyMax} 个配额卖完了，明天再来`;
  if (x.allocDaily && d.alloc >= 2) return '爱马士配货包今天已经配了 2 个，明天再来';
  if (x.kind === 'suit' && x.channel === 'custom' && d.suitSlot[b]) return `${x.brand}今天的全定制预约满了（每天 1 个），明天再来`;
  if (forQueue) { const dep = x.channel === 'custom' ? x.price * 0.3 : 0; return freeCash(s) < dep ? `定金 30%：个人现金还差 ${fmt(dep - freeCash(s))}` : null; }
  if (freeCash(s) < x.price) return `个人现金还差 ${fmt(x.price - freeCash(s))}`;
  return null;
}

/** 发票明细（价格含税）：不含税价 + 增值税 13%；表 ≥ 1 万「其中含消费税 20%」；进口「其中含进口关税」 */
export function invoiceRows(x, price = x.price) {
  const T = CFG.tax; const r2 = (v) => Math.round(v * 100) / 100;
  const net = price / (1 + T.vat), vat = price - net;
  const rows = [['价款（不含税）', r2(net), ''], ['增值税', r2(vat), `${T.vat * 100}%`]];
  if (x.kind === 'watch' && price >= T.watchCtaxFrom) rows.push(['其中含消费税', r2(net / (1 + T.watchCtax) * T.watchCtax), `高档手表 ${T.watchCtax * 100}%（已含在价款里）`]);
  const duty = T.duty[x.kind]; if (duty) rows.push(['其中含进口关税', r2(net / (1 + duty) * duty * (x.kind === 'watch' && price >= T.watchCtaxFrom ? 1 / (1 + T.watchCtax) : 1)), `约 ${duty * 100}%（已含在价款里）`]);
  return { rows, total: price, vat: r2(vat) };
}

function payFor(s, x, amount, t, { paid = 0, by = '', party = '', note = '' } = {}) {
  const inv = invoice(s, { item: `${label(x)}${x.modelEn ? `（${x.modelEn}）` : ''}`, amount: amount, seller: `${x.brand}${x.kind === 'suit' ? '定制店' : '专柜'}`, t });
  { const ir = invoiceRows(x, amount); taxRec(s, { kind: `增值税等（含在价款里：${({ watch: '名表', suit: '西装', bag: '名包' })[x.kind]}）`, base: amount, amount: ir.vat + ir.rows.filter((r) => r[0].startsWith('其中')).reduce((a, r) => a + r[1], 0), t }); }
  if (amount - paid >= 0.01 && !pay(s, { wallet: 'personal', cat: CAT[x.kind], amount: amount - paid, tax: invoiceRows(x, amount).vat, ref: inv.no, party: party || x.brand, by, note: note || label(x) + (paid ? '（尾款）' : '') }, t)) return null;
  const d = lx(s); const b = x.brandKey;
  if (x.kind === 'bag') return inv;   // 设计56：买包不再攒品牌消费、配货额度
  d.spend[b] = (d.spend[b] || 0) + amount;
  if (x.channel === 'alloc') d.quota[b] = Math.max(0, (d.quota[b] || 0) - quotaNeed(s, x));
  else d.quota[b] = (d.quota[b] || 0) + amount * quotaMult(s);
  return inv;
}
/** 设计56：送秘书的奢侈品（名包）付钱、开发票（不攒额度） */
export const payBag = (s, x, t, opts) => payFor(s, x, x.price, t, opts);
function countDaily(s, x, t) { const d = today(s, t); if (x.dailyMax) d.cf++; if (x.allocDaily) d.alloc++; if (x.kind === 'bag' && (x.channel === 'alloc')) d.allocBags++; }

/** 买表 / 西装（签发票付钱）。price：拍卖成交价；paid：定金 */
export function buy(s, id, t = Date.now(), { price = null, paid = 0, channel = null, skipCheck = false } = {}) {
  const x = L[id]; if (x.kind === 'bag') return { ok: false, why: '名包要选送给谁' };
  if (!skipCheck) { const why = whyNot(s, id, t); if (why) return { ok: false, why }; }
  const p = price || x.price; let prem = 0, ct = null;
  if (channel === 'auction') {
    prem = Math.round(premium(p));
    ct = addContract(s, { prefix: 'PM', kind: 'auction', title: '拍卖成交确认书', parties: [['买受人', s.bossName || '老板'], ['拍卖人', '苏富笔拍卖行']], subject: label(x), rows: [['落槌价', p, ''], ['买家佣金', prem, '分段 28% / 22% / 15%']], total: p + prem, wallet: 'personal' }, t);
  }
  if (freeCash(s) < p + prem - paid - 1e-6) return { ok: false, why: '个人现金不够' };
  const inv = payFor(s, x, p, t, { paid }); if (!inv) return { ok: false, why: '个人现金不够' };
  if (prem) pay(s, { wallet: 'personal', cat: CAT[x.kind], amount: prem, ref: ct.no, party: '苏富笔拍卖行', note: `${label(x)} 买家佣金` }, t);
  if (x.channel === 'custom' && !ct) ct = addContract(s, { prefix: 'DZ', kind: 'custom', title: '定制委托协议', parties: [['委托人', s.bossName || '老板'], ['受托人', `${x.brand}${x.kind === 'suit' ? '定制工坊' : '复杂功能工坊'}`]], subject: `${label(x)}${x.limit === 1 ? '（全球唯一）' : ''}`, rows: [['价款（含税）', p, ''], ['已付定金 30%', -paid, '委托时付']], total: p - paid, wallet: 'personal' }, t);
  countDaily(s, x, t);
  const d = lx(s); d.own.push(id);
  const meta = { price: p, at: t, channel: channel || x.channel, inv: inv.no, contract: ct ? ct.no : '' };
  if (x.limit) meta.no = x.limit === 1 ? 1 : 1 + Math.floor(Math.random() * x.limit);
  d.meta[id] = meta;
  if (!d.worn[x.kind]) d.worn[x.kind] = id;   // 第一件自动戴上 / 穿上
  s.stats = s.stats || {}; s.stats.assetsBought = (s.stats.assetsBought || 0) + 1;
  recalc(s);
  return { ok: true, item: x, invoice: inv, contract: ct, rows: invoiceRows(x, p).rows };
}

// 名包送秘书（设计56）搬到 core/love.js giveLux：只加爱慕 = 价钱 ÷ 1 万

// ---------- 排队：订单配额 / 邀请 / 定制委托（全定制西装两次试衣）----------
export const orderOf = (s, id) => lx(s).orders.find((o) => o.id === id);
export const waitOf = (x) => (x.fittings ? x.fittings[0] : x.wait || CFG.inviteWait);
export const queues = (x) => ['order', 'invite', 'custom'].includes(x.channel) || (x.channel === 'alloc' && x.wait);
export function placeOrder(s, id, t = Date.now()) {
  const x = L[id]; if (!queues(x)) return { ok: false, why: '这件不用排队' };
  if (orderOf(s, id)) return { ok: false, why: '已经在排队了' };
  const why = whyNot(s, id, t, { forQueue: true }); if (why) return { ok: false, why };
  let deposit = 0;
  if (x.channel === 'custom') { deposit = Math.round(x.price * 0.3); if (!pay(s, { wallet: 'personal', cat: CAT[x.kind], amount: deposit, party: x.brand, note: `${label(x)} 定制定金 30%` }, t)) return { ok: false, why: '个人现金不够定金' }; }
  if (x.kind === 'suit' && x.channel === 'custom') today(s, t).suitSlot[x.brandKey] = true;
  const o = { id, ch: x.channel, from: t, at: t, deposit, stage: 0 }; // 设计35 第十一节：交付立刻（资格照旧）
  lx(s).orders.push(o);
  return { ok: true, at: o.at, deposit };
}
/** 全定制西装：第一次试衣好了 → 去试第二次（再等 10 分钟） */
export const needFitting = (s, id, t) => { const o = orderOf(s, id); const x = L[id]; return !!(o && x.fittings && o.stage < x.fittings.length - 1 && t >= o.at); };
export function nextFitting(s, id, t) {
  const o = orderOf(s, id); const x = L[id]; if (!needFitting(s, id, t)) return { ok: false, why: '还没到试衣的时候' };
  o.stage += 1; o.at = t; o.told = false; // 设计35 第十一节：试衣立刻改好
  return { ok: true, at: o.at, stage: o.stage };
}
export const orderReady = (s, id, t) => { const o = orderOf(s, id); const x = L[id]; return !!(o && t >= o.at && (!x.fittings || o.stage >= x.fittings.length - 1)); };
/** 到了：表、西装签发票付尾款；包要选送谁 */
export function buyQueued(s, id, t, secId = null) {
  if (!orderOf(s, id) || !orderReady(s, id, t)) return { ok: false, why: '还在等' };
  const o = orderOf(s, id); const x = L[id];
  if (x.kind === 'bag') return { ok: false, why: '名包不用排队了，去商场「奢侈品」直接买' };   // 设计56
  const r = buy(s, id, t, { paid: o.deposit, channel: o.ch, skipCheck: true });
  if (r.ok) lx(s).orders = lx(s).orders.filter((y) => y !== o);
  return r;
}
export function cancelOrder(s, id) { lx(s).orders = lx(s).orders.filter((o) => o.id !== id); }

// ---------- 拍卖（彩虹迪通拿）：起拍原价 × 1.5，几个 NPC 抢 ----------
export function auction(s, id, maxBid, rnd = Math.random) {
  const x = L[id]; const start = Math.round(x.price * CFG.auction.startX);
  let price = start; const steps = [`起拍 ${fmt(start)}`]; const npcs = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < 8; i++) {
    const npcMax = start * (1 + rnd()); const next = Math.round(price * (1.05 + rnd() * 0.1));
    if (i >= npcs || next > npcMax) break;
    if (next > maxBid) { steps.push(`对手举牌 ${fmt(next)}，超过你的上限`); return { won: false, price: next, steps }; }
    price = Math.round(next * 1.02); steps.push(`对手举牌 ${fmt(next)} → 你跟到 ${fmt(price)}`);
  }
  steps.push(`落槌：${fmt(price)}`);
  return { won: price <= maxBid, price, steps };
}

// ---------- 卖回、身价 ----------
export const sellPrice = (s, id) => Math.round(((lx(s).meta[id] || {}).price || L[id].price) * stewardSellRate(s));
export function sell(s, id, t = Date.now()) {
  const x = L[id]; const d = lx(s); if (!owns(s, id)) return { ok: false, why: '没有这件' };
  const amt = sellPrice(s, id); const m = d.meta[id] || {};
  d.own = d.own.filter((i) => i !== id); delete d.meta[id];
  if (d.worn[x.kind] === id) d.worn[x.kind] = mine(s, x.kind).sort((a, b) => L[b].price - L[a].price)[0] || null;
  receive(s, { wallet: 'personal', cat: 'sell', amount: amt, ref: m.inv || '', note: `卖回 ${label(x)}（不交税）` }, t);
  let black = false, worse = false;
  if (m.channel === 'invite' || m.channel === 'custom') { d.black[x.brandKey] = true; black = true; }
  else if (m.channel === 'alloc' && t - (m.at || 0) < CFG.allocResellMonths * MONTH_MS) /* 一个游戏月（V0.2.10 = 现实 12 小时） */ { d.penalty[x.brandKey] = (d.penalty[x.brandKey] || 0) + CFG.allocPenalty; worse = true; }
  recalc(s);
  return { ok: true, amount: amt, black, worse };
}
export const value = (s) => mine(s).reduce((a, id) => a + sellPrice(s, id), 0);

// ---------- 戴 / 穿、老板属性 ----------
export function wear(s, id) { const x = L[id]; if (!owns(s, id)) return { ok: false, why: '没有这件' }; lx(s).worn[x.kind] = id; return { ok: true }; }
export const worn = (s, kind) => { const id = lx(s).worn[kind]; return id && owns(s, id) ? L[id] : null; };
const RANK = [1, 0.6, 0.4, 0.2];
const lg = (p) => Math.log10(Math.max(1, p / 1e4));
function ranked(list, coef) { return list.sort((a, b) => b.price - a.price).reduce((a, x, i) => a + coef * RANK[Math.min(i, 3)] * lg(x.price), 0); }
export function attrs(s) {
  const A = CFG.attr; const W = mine(s, 'watch').map((i) => L[i]), S = mine(s, 'suit').map((i) => L[i]);
  let aura = ranked(W, A.watch.aura) + ranked(S, A.suit.aura);
  let network = ranked(S.filter((x) => x.channel === 'custom'), A.suitCustomNetwork);
  const w = worn(s, 'watch'), su = worn(s, 'suit');
  if (w) aura += A.watch.aura * lg(w.price) * A.wornBonus;
  if (su) aura += A.suit.aura * lg(su.price) * A.wornBonus;
  return { aura, network };
}

// ---------- 商务总监：品牌求情（解除拉黑 / 配货变差）----------
export function canPlead(s, b) { const d = lx(s); return !!(d.black[b] || d.penalty[b]); }
export function plead(s, b, t = Date.now(), rnd = Math.random) {
  const d = lx(s); const who = bizWho(s);
  if (!who) return { ok: false, why: '要有商务总监（秘书）才能去求情' };
  if (!canPlead(s, b)) return { ok: false, why: '这个品牌没跟你闹别扭' };
  if (t < d.pleadAt) return { ok: false, why: `${SEC_BY_ID[who].name}刚去过，${Math.ceil((d.pleadAt - t) / 60e3)} 分钟后再去` };
  const P = CFG.plead; const chance = Math.min(P.maxChance, Math.max(P.minChance, secAttrs(s, who).social / 100));
  const win = rnd() < chance;
  if (win) { delete d.black[b]; delete d.penalty[b]; } else d.pleadAt = t + P.cooldownMin * 60e3;
  return { ok: true, win, chance, who };
}

/** 每秒：排队到点出通知。返回 [{ order, text }] */
export function tick(s, t) {
  const out = [];
  for (const o of lx(s).orders) if (t >= o.at && !o.told) {
    o.told = true; const x = L[o.id];
    const fit = x.fittings && o.stage < x.fittings.length - 1;
    out.push({ order: o, text: fit ? `${x.brand}：第一次试衣准备好了，去试第二次` : `${o.ch === 'invite' ? `${x.brand}来电` : o.ch === 'custom' ? '定制做好了' : '排到了'}：${label(x)}` });
  }
  return out;
}

// 挂进资产（身价、件数）和老板属性
addAssetHook({ value, count: (s) => mine(s).length });
addAttrHook(attrs);
