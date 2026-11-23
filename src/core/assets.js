// 资产（第 12 项）：车库 / 房产 / 机库。只能个人现金全款，不能贷款、不能抵押
// 渠道（设计09 第三节）：现货 / 订单（排队）/ 邀请（品牌来电）/ 拍卖 / 定制委托；房子按设计19（验资冻结、四合院拍卖、境外锁）
// 税费（设计14、设计19）：车辆购置税 + 超豪华车附加 + 上牌；房子契税；飞机关税 + 进口增值税；每年维护 / 物业 / 房产税按秒扣
import { CARS, PLANES } from '../config/vehicles.js?v=598ef1ae';
import EST from '../config/estates.json?v=598ef1ae' with { type: 'json' };
import { CAR_META, TIER_SPEC } from '../config/carmeta.js?v=598ef1ae';
import { TAX } from './companytax.js?v=598ef1ae';
import { pay, receive, accrue } from './ledger.js?v=598ef1ae';
import { YEAR_MS } from './gametime.js?v=598ef1ae';
import { addContract } from './contracts.js?v=598ef1ae';
import { stewardSellRate, stewardUpkeepMult, stewardQueueMult } from './posts.js?v=598ef1ae';
import { bossAttrs } from './boss.js?v=598ef1ae';
import { taxRec } from './fiscal.js?v=598ef1ae';

export const HOUSES = EST.houses;
const ALL = {};
for (const x of CARS) ALL[x.id] = { ...x, kind: 'car', ...(CAR_META[x.id] || {}) };
for (const x of PLANES) ALL[x.id] = { ...x, kind: 'plane' };
for (const x of HOUSES) ALL[x.id] = { ...x, kind: 'house' };
export const ITEM = ALL;
const KEY = { car: 'cars', plane: 'planes', house: 'houses' };
export const label = (it) => (it.kind === 'house' ? `${it.city} · ${it.name}` : `${it.brand} ${it.model}`);
export const spec = (it) => (it.kind === 'car' ? TIER_SPEC[Math.min(6, it.tier)] : null);

function g(s) { s.garage = s.garage || { cars: [], planes: [], houses: [] }; s.garage.meta = s.garage.meta || {}; return s.garage; }
export const owns = (s, id) => g(s)[KEY[ALL[id].kind]].includes(id);
/** 冻结中的个人现金（验资认筹） */
export const frozen = (s) => (s.freezes || []).reduce((a, f) => a + f.amount, 0);
export const freeCash = (s) => s.cash - frozen(s);
/** 限量 / 孤品（设计11）：limit = 1 孤品；有 limit 或 6 档 = 限量 */
export const rarityOf = (it) => (!it ? 'normal' : it.limit === 1 ? 'unique' : it.limit || it.tier === 6 ? 'limited' : 'normal');
/** 渠道 */
export function channelOf(it) {
  if (it.kind === 'house') return it.check === 'auction' ? 'auction' : 'spot';
  if (it.kind === 'plane') return 'spot';
  if (it.channel) return it.channel;
  return it.price >= 2.1e6 ? 'order' : 'spot';
}
const brandCars = (s, it) => g(s).cars.map((id) => ALL[id]).filter((x) => x.brandKey === it.brandKey);
const brandSpend = (s, brandKey) => (s.brandSpend || {})[brandKey] || 0;
export const blacklisted = (s, it) => !!(s.blacklist && s.blacklist[it.brandKey]);

/** 买之前要先做的：返回差什么（null = 能直接签合同） */
export function whyNotBuy(s, id, t = Date.now(), { forOrder = false } = {}) {
  const it = ALL[id]; if (!it) return '没有这个';
  if (owns(s, id)) return '已经有了';
  const net = bossAttrs(s).network;
  if (it.kind === 'house') {
    if (it.region !== 'china') return '香港 / 海外房产在「去买房 → 海外」里买（到「老板」，个人现金付）';   // 设计30：没有境外账户了，走 core/offshore.js
    if (it.check === 'auction' && net < EST.verify.auctionNetwork) return `人脉 ≥ ${EST.verify.auctionNetwork} 才收到拍卖通知（现在 ${net}）`;
    if (it.check === 'proof' && E_netWorth(s) < it.price * EST.verify.proofNetWorthX) return `资产证明：身价要 ≥ 房价 3 倍（${fmt(it.price * 3)}）`;
  }
  if (it.kind === 'car') {
    if (blacklisted(s, it)) return `你转卖过${it.brand}的车，被拉黑了`;
    const ch = channelOf(it);
    // 订单不看称号（验收第六节）：付 10% 定金排队；500 万以上的要在这个品牌累计消费 ≥ 车价
    if (ch === 'order' && it.price >= ORDER.bigFrom && brandSpend(s, it.brandKey) < it.price) return `订单：在${it.brand}累计消费要到车价（还差 ${fmt(it.price - brandSpend(s, it.brandKey))}）`;
    if (ch === 'invite') {
      const need = it.brandKey === 'velocita' ? 5 : 3;
      if (brandCars(s, it).length < need) return `邀请：要有${it.brand} ${need} 辆车（现在 ${brandCars(s, it).length}）`;
      if (brandSpend(s, it.brandKey) < 2e7) return `邀请：在${it.brand}累计买满 2000 万（现在 ${fmt(brandSpend(s, it.brandKey))}）`;
      if (net < 40) return `邀请：人脉 ≥ 40（现在 ${net}）`;
      if (it.needModel && !brandCars(s, it).some((x) => x.model.includes(it.needModel))) return `邀请：要先有一辆 ${it.needModel}`;
    }
    if (ch === 'auction' && net < (it.network || 30)) return `拍卖：人脉 ≥ ${it.network || 30} 才收到图录（现在 ${net}）`;
    if (ch === 'custom') {
      if (net < 80) return `定制委托：人脉 ≥ 80（现在 ${net}）`;
      if (brandSpend(s, it.brandKey) < 1e8) return `定制委托：在${it.brand}累计买满 1 亿`;
    }
  }
  if (forOrder) { const dep = it.price * ORDER.deposit; return freeCash(s) < dep ? `定金 10%：个人现金还差 ${fmt(dep - freeCash(s))}` : null; }
  const q = quote(s, id);
  if (freeCash(s) < q.total) return `个人现金还差 ${fmt(q.total - freeCash(s))}（只能个人现金全款，不能贷款）`;
  return null;
}
let E_netWorth = (s) => 0; export const setNetWorthFn = (fn) => { E_netWorth = fn; };
const fmt = (n) => (n >= 1e8 ? `${(n / 1e8).toFixed(2)}亿` : n >= 1e4 ? `${(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}万` : `${Math.round(n)}`);

/** 第几套房（只算国内） */
const homeCount = (s) => g(s).houses.filter((id) => ALL[id] && ALL[id].region === 'china').length;
/** 报价：[[项目, 金额, 说明]]、合计（价款 + 税费） */
export function quote(s, id, price = null) {
  const it = ALL[id]; const p = price || it.price; const rows = [[it.kind === 'house' ? '房款' : '车款 / 机价', p, '个人现金全款']];
  if (it.kind === 'car') {
    const net = p / TAX.car.vatDiv;
    rows.push(['车辆购置税', net * TAX.car.purchaseTax, '不含税价 × 10%']);
    if (p >= TAX.car.luxuryFrom) rows.push(['超豪华小汽车消费税', net * TAX.car.luxuryRate, '130 万以上零售环节 10%']);
    rows.push(['上牌费', TAX.car.plateFee, '']);
  } else if (it.kind === 'plane') {
    const tariff = p * TAX.plane.tariff; rows.push(['进口关税', tariff, '5%']); rows.push(['进口增值税', (p + tariff) * TAX.plane.importVat, '13%']);
  } else {
    const n = homeCount(s) + 1; const big = (it.area || 0) > 140;
    const rate = n === 1 ? (big ? EST.deed.first[1][1] : EST.deed.first[0][1]) : n === 2 ? (big ? EST.deed.second[1][1] : EST.deed.second[0][1]) : EST.deed.third;
    rows.push(['契税', p * rate, `第 ${n} 套、${it.area} ㎡：${(rate * 100).toFixed(1)}%（个人买住宅免印花税）`]);
  }
  const total = rows.reduce((a, r) => a + r[1], 0);
  return { rows: rows.map((r) => [r[0], Math.round(r[1] * 100) / 100, r[2]]), total: Math.round(total * 100) / 100 };
}
/** 拍卖买家佣金（分段） */
export function premium(price) {
  let left = price, last = 0, fee = 0;
  for (const [cap, r] of TAX.auction.premium) { const part = Math.min(left, cap - last); if (part <= 0) break; fee += part * r; left -= part; last = cap; }
  return fee;
}

/** 签合同付款（合同在界面上签）；price：拍卖成交价；channel 记下来（卖的时候看要不要拉黑） */
export const ORDER = { deposit: 0.1, bigFrom: 5e6 };
export function buy(s, id, t = Date.now(), { price = null, channel = null, skipCheck = false, paid = 0 } = {}) {
  const it = ALL[id];
  if (!skipCheck) { const why = whyNotBuy(s, id, t); if (why) return { ok: false, why }; }
  const q = quote(s, id, price); const prem = channel === 'auction' ? premium(price || it.price) : 0;
  if (prem) { q.rows.push(['拍卖买家佣金', Math.round(prem), '按成交价分段']); q.total += Math.round(prem); }
  if (paid) { q.rows.push(['已付定金（抵车款）', -paid, '下单时付的 10%']); q.total -= paid; }
  if (freeCash(s) < q.total) return { ok: false, why: '个人现金不够' };
  const ct = addContract(s, { prefix: it.kind === 'house' ? 'FC' : it.kind === 'car' ? 'GC' : 'FJ', kind: it.kind, title: channel === 'auction' ? '拍卖成交确认书' : it.kind === 'house' ? '商品房买卖合同（网签）' : it.kind === 'car' ? '汽车买卖合同' : '航空器买卖合同', parties: [['买方', s.bossName || '老板'], ['卖方', it.kind === 'house' ? `${it.city}开发商` : `${it.brand}`]], subject: label(it), rows: q.rows, total: q.total, wallet: 'personal' }, t);
  const main = q.rows[0][1];
  if (main + prem - paid >= 0.01) pay(s, { wallet: 'personal', cat: it.kind, amount: main + prem - paid, ref: ct.no, note: paid ? `${label(it)}（尾款，定金已付）` : label(it) }, t);
  const tax = q.total + paid - main - prem; if (tax >= 0.01) taxRec(s, { kind: it.kind === 'house' ? '契税' : it.kind === 'car' ? '车辆购置税等' : '进口关税、增值税', base: main, amount: tax, t }); if (tax >= 0.01) pay(s, { wallet: 'personal', cat: 'tax_personal', amount: tax, ref: ct.no, party: '税务局', note: `${label(it)} ${q.rows.slice(1).filter((r) => !r[0].includes('佣金') && !r[0].includes('定金')).map((r) => r[0]).join('、')}` }, t);
  g(s)[KEY[it.kind]].push(id);
  const meta = { price: main, at: t, contract: ct.no, channel: channel || channelOf(it) };
  if (rarityOf(it) !== 'normal' && it.limit) meta.no = it.limit === 1 ? 1 : 1 + Math.floor(Math.random() * it.limit);
  g(s).meta[id] = meta;
  if (it.brandKey) { s.brandSpend = s.brandSpend || {}; s.brandSpend[it.brandKey] = (s.brandSpend[it.brandKey] || 0) + main; }
  recalc(s); s.stats.assetsBought = (s.stats.assetsBought || 0) + 1;
  return { ok: true, item: it, contract: ct, quote: q };
}
/** 卖回给系统：买价 × 70%（有资产管家最高 80%），不交税；邀请 / 定制买的车卖了 → 这个品牌拉黑 */
export const sellPrice = (s, id) => Math.round(((g(s).meta[id] || {}).price || ALL[id].price) * stewardSellRate(s));
export function sell(s, id, t = Date.now()) {
  const it = ALL[id]; if (!owns(s, id)) return { ok: false, why: '没有这个' };
  if (s.rented && s.rented[id]) return { ok: false, why: '出租中，先收回' };
  const amt = sellPrice(s, id); const m = g(s).meta[id] || {};
  g(s)[KEY[it.kind]] = g(s)[KEY[it.kind]].filter((x) => x !== id); delete g(s).meta[id];
  receive(s, { wallet: 'personal', cat: 'sell', amount: amt, ref: m.contract || '', note: `卖回 ${label(it)}（不交税）` }, t); // 设计30：海外房子卖了钱也回个人现金
  let black = false;
  if (it.kind === 'car' && (m.channel === 'invite' || m.channel === 'custom')) { s.blacklist = s.blacklist || {}; s.blacklist[it.brandKey] = true; black = true; }
  recalc(s);
  return { ok: true, amount: amt, black };
}
/** 身价里的资产价值 = 卖回价 */
export function recalc(s) {
  const gg = g(s); s.assetValue = [...gg.cars, ...gg.planes, ...gg.houses].filter((id) => ALL[id]).reduce((a, id) => a + sellPrice(s, id), 0) + HOOKS.reduce((a, x) => a + (x.value ? x.value(s) : 0), 0);
}
/** 别的资产（游艇、表、古董……开发2 各自的文件）挂进来：{ value(s) 卖回价合计, upkeep(s) 每年持有成本, count(s) 件数 } */
const HOOKS = [];
export const addAssetHook = (x) => { HOOKS.push(x); };
export const hookCount = (s) => HOOKS.reduce((a, x) => a + (x.count ? x.count(s) : 0), 0);
/** 每年持有成本：车保养保险 2%、飞机托管 6%、房子物业费 + 上海房产税（第二套起）；资产管家打折 */
export function upkeepYear(s, id) {
  const it = ALL[id]; const price = (g(s).meta[id] || {}).price || it.price; let y = 0;
  if (it.kind === 'car') y = price * TAX.car.upkeepYear;
  else if (it.kind === 'plane') y = price * TAX.plane.upkeepYear;
  else {
    const fee = it.price >= EST.propertyFee.luxuryFrom ? EST.propertyFee.luxury : EST.propertyFee.normal;
    y = fee * (it.area || 0) * 12;
    const sh = g(s).houses.filter((x) => ALL[x] && ALL[x].city === '上海');
    if (it.city === '上海' && sh.indexOf(id) >= 1) y += it.price * EST.shanghaiTax.base * (it.price < EST.shanghaiTax.lowBelow ? EST.shanghaiTax.low : EST.shanghaiTax.rate);
  }
  return y * stewardUpkeepMult(s);
}
export const upkeepYearAll = (s) => [...g(s).cars, ...g(s).planes, ...g(s).houses].filter((id) => ALL[id]).reduce((a, id) => a + upkeepYear(s, id), 0) + HOOKS.reduce((a, x) => a + (x.upkeep ? x.upkeep(s) : 0), 0);
/** 每秒扣持有成本（按游戏年摊，一年 = 现实 144 小时） */
export function tickUpkeep(s, dt) {
  const y = upkeepYearAll(s); if (!y) return;
  accrue(s, 'upkeep', 'personal', 'upkeep', y * dt * 1000 / YEAR_MS, '车房飞机维护 / 物业 / 房产税', 'out');
}

// ---------- 房子验资（冻结认筹）----------
/** 设计35 第十一节：验资立刻出结果（资格照旧：身价、人脉门槛还是要过） */
export function freezeMin() { return 0; }
export function startVerify(s, id, t = Date.now()) {
  const it = ALL[id]; const why = whyNotBuy(s, id, t); if (why) return { ok: false, why };
  if ((s.freezes || []).some((f) => f.id === id)) return { ok: false, why: '已经在认筹了' };
  const amt = quote(s, id).total; const until = t + freezeMin(it) * 60e3 * stewardQueueMult(s);
  (s.freezes = s.freezes || []).push({ id, amount: amt, until, at: t });
  addContract(s, { prefix: 'YZ', kind: 'proof', title: it.check === 'proof' ? '存款证明 + 资产证明（VIP 认筹书）' : '存款证明（认筹书）', parties: [['认筹人', s.bossName || '老板'], ['开发商', `${it.city}开发商`]], subject: label(it), rows: [['冻结资金', amt, `${freezeMin(it)} 分钟`]], total: amt, wallet: 'personal' }, t);
  return { ok: true, until };
}
export const freezeOf = (s, id) => (s.freezes || []).find((f) => f.id === id);
export const verifyReady = (s, id, t) => { const f = freezeOf(s, id); return !!f && t >= f.until; };
export function cancelVerify(s, id) { s.freezes = (s.freezes || []).filter((f) => f.id !== id); }
/** 认筹到期签合同：先解冻再买 */
export function buyAfterVerify(s, id, t) {
  if (!verifyReady(s, id, t)) return { ok: false, why: '认筹期还没到' };
  cancelVerify(s, id); return buy(s, id, t);
}

// ---------- 订单 / 邀请 / 定制：排队，到点了能签合同 ----------
export const QUEUE_MIN = { order: 10, invite: 20, custom: 30 };
export function placeOrder(s, id, t = Date.now()) {
  const it = ALL[id]; const ch = channelOf(it); const why = whyNotBuy(s, id, t, { forOrder: ch === 'order' }); if (why) return { ok: false, why };
  if (!QUEUE_MIN[ch]) return { ok: false, why: '这个不用排队' };
  if ((s.orders || []).some((o) => o.id === id)) return { ok: false, why: '已经在排队了' };
  const at = t; // 设计35 第十一节：订单交付立刻（订单配额 / 邀请 / 定制的资格照旧）
  let deposit = 0;
  if (ch === 'order') { deposit = Math.round(it.price * ORDER.deposit); pay(s, { wallet: 'personal', cat: 'car', amount: deposit, party: it.brand, note: `${label(it)} 订单定金 10%` }, t); }
  (s.orders = s.orders || []).push({ id, ch, at, from: t, deposit });
  return { ok: true, at, deposit };
}
export const orderOf = (s, id) => (s.orders || []).find((o) => o.id === id);
export function buyOrdered(s, id, t) {
  const o = orderOf(s, id); if (!o || t < o.at) return { ok: false, why: '还在排队' };
  const r = buy(s, id, t, { channel: o.ch, paid: o.deposit || 0, skipCheck: true }); if (r.ok) s.orders = s.orders.filter((x) => x.id !== id);
  return r;
}

// ---------- 拍卖（车的停产限量、四合院）----------
/** 起拍价 = 原价 × 1.5（房子按原价）；几个 NPC 跟你抢，返回成交过程 */
export function auction(s, id, maxBid, rnd = Math.random) {
  const it = ALL[id]; const start = Math.round(it.price * (it.kind === 'house' ? 1 : TAX.auction.startX));
  let price = start; const steps = [`起拍 ${fmt(start)}`]; const npcs = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < 8; i++) {
    const npcMax = start * (1 + rnd() * 1); // NPC 最多出到起拍价 1～2 倍
    const next = Math.round(price * (1 + TAX.auction.bidStepMin + rnd() * (TAX.auction.bidStepMax - TAX.auction.bidStepMin)));
    if (i >= npcs || next > npcMax) break;
    if (next > maxBid) { steps.push(`对手举牌 ${fmt(next)}，超过你的上限`); return { won: false, price: next, steps }; }
    price = Math.round(next * 1.02); steps.push(`对手举牌 ${fmt(next)} → 你跟到 ${fmt(price)}`);
  }
  steps.push(`落槌：${fmt(price)}`);
  return { won: price <= maxBid, price, steps };
}

/** 约会开的车：档最高、同档最贵 */
export function bestCar(s) {
  const list = g(s).cars.map((id) => ALL[id]).filter(Boolean);
  if (!list.length) return null;
  return list.sort((a, b) => b.tier - a.tier || b.price - a.price)[0];
}
export const carTierForDate = (s) => { const c = bestCar(s); return c ? Math.min(5, c.tier) : 0; };
