// 游艇 + 码头（第 2-11 项，设计13 第一节、设计14 第二节 3、设计16 资产管家）
// 只能个人现金全款；渠道：现货 / 订单配额（称号 + 10% 定金排队）/ 邀请（拥有艘数 + 人脉，等品牌来电）/ 定制委托（孤品）
// 凭证：买卖合同 + 进口货物报关单 + 船舶登记证书；税：关税 10%、消费税 10%（8～90 米）、进口增值税 13%、登记检验费
// 持有：每年维护、船员、泊位托管约船价 10%（资产管家打折）；交给资产管家包租，每游戏月收租（代扣 20% 个税）
// 老板属性：气场 + 人脉；约会「游艇」去自己的（不花钱，按档次加成）
import CFG from '../config/yacht.json?v=b846574c' with { type: 'json' };
import { pay, receive, accrue } from './ledger.js?v=b846574c';
import { YEAR_MS, monthIndex } from './gametime.js?v=b846574c';
import { addContract } from './contracts.js?v=b846574c';
import { stewardSellRate, stewardUpkeepMult, stewardQueueMult, holder, isSec } from './posts.js?v=b846574c';
import { isRented, setRent } from './postwork.js?v=b846574c';

export const YCFG = CFG;
export const YACHTS = CFG.yachts.map((y) => ({ ...y, kind: 'yacht' }));
export const Y = Object.fromEntries(YACHTS.map((y) => [y.id, y]));
export const label = (y) => `${y.brand} ${y.model}`;
export const rarityOf = (y) => (y.limit === 1 ? 'unique' : y.limit ? 'limited' : 'normal');
export const CH_NAME = { spot: '现货', order: '订单配额', invite: '邀请', custom: '定制委托' };
const TITLE_NAME = ['打工人', '小老板', '老板', '企业家', '商界名流'];
const fmt = (n) => (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : n >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);

function g(s) { s.garage = s.garage || { cars: [], planes: [], houses: [] }; s.garage.meta = s.garage.meta || {}; s.garage.yachts = s.garage.yachts || []; return s.garage; }
export const mine = (s) => g(s).yachts.filter((id) => Y[id]);
export const owns = (s, id) => g(s).yachts.includes(id);
const freeCash = (s) => s.cash - (s.freezes || []).reduce((a, f) => a + f.amount, 0);
let networkOf = (s) => 0; export const setNetworkFn = (fn) => { networkOf = fn; };   // 老板人脉（boss.js 算，含游艇自己的）

/** 有几辆这个品牌的车（车的 brandKey） */
export const brandCars = (s, key) => (g(s).cars || []).filter((id) => ITEM[id] && ITEM[id].brandKey === key).length;
/** 买之前差什么（null = 能下单 / 能签合同） */
export function whyNot(s, id, t = Date.now(), { forOrder = false } = {}) {
  const y = Y[id]; if (!y) return '没有这艘';
  if (owns(s, id)) return '已经有了';
  const n = mine(s).length, net = networkOf(s);
  if (y.title != null && (s.title || 0) < y.title) return `订单配额：称号要「${TITLE_NAME[y.title]}」`;
  if (y.own && n < y.own) return `${CH_NAME[y.channel]}：要先有 ${y.own} 艘游艇（现在 ${n}）`;
  if (y.needBrand && s.blacklist && s.blacklist[y.needBrand]) return `你转卖过${y.brand}，被拉黑了`;
  if (y.needBrand && brandCars(s, y.needBrand) < 1) return `${CH_NAME[y.channel]}：要先有一辆${y.brand}的车`;
  if (y.needId && !owns(s, y.needId)) return `${CH_NAME[y.channel]}：要先有${label(Y[y.needId])}`;
  if (y.network && net < y.network) return `${CH_NAME[y.channel]}：人脉 ≥ ${y.network}（现在 ${net}）`;
  if (forOrder && y.channel === 'order') { const dep = y.price * CFG.orderDeposit; return freeCash(s) < dep ? `定金 10%：个人现金还差 ${fmt(dep - freeCash(s))}` : null; }
  if (forOrder) return null;
  const q = quote(id); if (freeCash(s) < q.total) return `个人现金还差 ${fmt(q.total - freeCash(s))}（只能个人现金全款，不能贷款）`;
  return null;
}

/** 报价：船价（到岸价）+ 进口环节的税 + 登记费。tax：报关单上那几行 */
export function quote(id) {
  const y = Y[id], T = CFG.tax, p = y.price;
  const tariff = p * T.tariff;
  const ctaxOn = y.len > T.consumptionLen[0] && y.len < T.consumptionLen[1];
  const ctax = ctaxOn ? (p + tariff) / (1 - T.consumption) * T.consumption : 0;
  const vat = (p + tariff + ctax) * T.importVat;
  const r2 = (x) => Math.round(x * 100) / 100;
  const tax = [['进口关税', r2(tariff), `完税价格 × ${T.tariff * 100}%`],
    ['进口消费税', r2(ctax), ctaxOn ? `（完税价格 + 关税）÷ 90% × ${T.consumption * 100}%（游艇税目）` : `${y.len} 米，超过 90 米不在游艇消费税范围`],
    ['进口增值税', r2(vat), `（完税价格 + 关税 + 消费税）× ${T.importVat * 100}%`]];
  const rows = [['船价（到岸价）', p, '个人现金全款'], ...tax, ['船舶登记 + 检验费', T.registerFee, '海事局']];
  return { rows, tax, total: r2(rows.reduce((a, r) => a + r[1], 0)) };
}

/** 签合同付款：买卖合同 + 进口货物报关单 + 船舶登记证书 */
export function buy(s, id, t = Date.now(), { paid = 0, channel = null, skipCheck = false } = {}) {
  const y = Y[id];
  if (!skipCheck) { const why = whyNot(s, id, t); if (why) return { ok: false, why }; }
  const q = quote(id); const due = q.total - paid;
  if (freeCash(s) < due - 1e-6) return { ok: false, why: '个人现金不够' };
  const subject = `${label(y)}（${y.len} 米${y.limit === 1 ? '，全球唯一' : y.limit ? `，限量 ${y.limit} 艘` : ''}）`;
  const rows = paid ? [...q.rows, ['已付定金（抵船价）', -paid, '下单时付的 10%']] : q.rows;
  const ct = addContract(s, { prefix: 'YT', kind: 'yacht', title: channel === 'custom' ? '游艇定制委托协议' : '游艇买卖合同', parties: [['买方', s.bossName || '老板'], ['卖方', `${y.brand}船厂（${y.origin}）`]], subject, rows, total: Math.round(due * 100) / 100, wallet: 'personal' }, t);
  const bg = addContract(s, { prefix: 'BG', kind: 'customs', title: '中华人民共和国海关进口货物报关单', parties: [['收货人', s.bossName || '老板'], ['申报口岸', '上海海关']], subject: `${subject}，原产国 ${y.origin}，商品编号 8903（游艇）`, rows: [['完税价格', y.price, 'CIF'], ...q.tax], total: Math.round(q.tax.reduce((a, r) => a + r[1], 0) * 100) / 100, wallet: 'personal' }, t);
  const dj = addContract(s, { prefix: 'DJ', kind: 'register', title: '船舶所有权登记证书', parties: [['船舶所有人', s.bossName || '老板'], ['登记机关', '上海海事局']], subject, rows: [['船舶登记 + 检验费', CFG.tax.registerFee, '']], total: CFG.tax.registerFee, wallet: 'personal' }, t);
  if (y.price - paid >= 0.01) pay(s, { wallet: 'personal', cat: 'yacht', amount: y.price - paid, ref: ct.no, party: `${y.brand}船厂`, note: paid ? `${label(y)}（尾款，定金已付）` : label(y) }, t);
  const taxSum = q.tax.reduce((a, r) => a + r[1], 0);
  taxRec(s, { kind: '进口关税、消费税、增值税（游艇）', base: y.price, amount: taxSum, t });
  if (taxSum >= 0.01) pay(s, { wallet: 'personal', cat: 'tax_personal', amount: taxSum, tax: taxSum, ref: bg.no, party: '海关', note: `${label(y)} 进口关税、消费税、增值税` }, t);
  pay(s, { wallet: 'personal', cat: 'yacht', amount: CFG.tax.registerFee, ref: dj.no, party: '海事局', note: `${label(y)} 船舶登记 + 检验` }, t);
  g(s).yachts.push(id);
  const meta = { price: y.price, at: t, contract: ct.no, customs: bg.no, reg: dj.no, channel: channel || y.channel };
  if (y.limit) meta.no = y.limit === 1 ? 1 : 1 + Math.floor(Math.random() * y.limit);
  g(s).meta[id] = meta;
  recalc(s);
  s.stats = s.stats || {}; s.stats.assetsBought = (s.stats.assetsBought || 0) + 1;
  return { ok: true, item: y, contract: ct, customs: bg, reg: dj, quote: q };
}

// ---------- 订单配额 / 邀请 / 定制委托：排队，到点签合同 ----------
export const waitMin = (y) => y.wait || 0;
export const orderOf = (s, id) => (s.yachtOrders || []).find((o) => o.id === id);
export function placeOrder(s, id, t = Date.now()) {
  const y = Y[id]; if (y.channel === 'spot') return { ok: false, why: '现货不用排队' };
  const why = whyNot(s, id, t, { forOrder: true }); if (why) return { ok: false, why };
  if (orderOf(s, id)) return { ok: false, why: '已经在排队了' };
  const at = t; // 设计35 第十一节：交付立刻（订单配额 / 邀请 / 定制的资格照旧）
  let deposit = 0;
  if (y.channel === 'order') { deposit = Math.round(y.price * CFG.orderDeposit); if (!pay(s, { wallet: 'personal', cat: 'yacht', amount: deposit, party: `${y.brand}船厂`, note: `${label(y)} 订单定金 10%` }, t)) return { ok: false, why: '个人现金不够定金' }; }
  (s.yachtOrders = s.yachtOrders || []).push({ id, ch: y.channel, at, from: t, deposit });
  return { ok: true, at, deposit };
}
export function buyQueued(s, id, t) {
  const o = orderOf(s, id); if (!o || t < o.at) return { ok: false, why: '还在排队' };
  const r = buy(s, id, t, { channel: o.ch, paid: o.deposit || 0, skipCheck: true });
  if (r.ok) s.yachtOrders = s.yachtOrders.filter((x) => x.id !== id);
  return r;
}
/** 放弃排队：订单定金不退（违约），邀请 / 定制没付钱 */
export function cancelOrder(s, id) { s.yachtOrders = (s.yachtOrders || []).filter((x) => x.id !== id); }

// ---------- 卖回、身价、持有成本 ----------
export const sellPrice = (s, id) => Math.round(((g(s).meta[id] || {}).price || Y[id].price) * stewardSellRate(s));
export function sell(s, id, t = Date.now()) {
  const y = Y[id]; if (!owns(s, id)) return { ok: false, why: '没有这艘' };
  if (isRented(s, id)) return { ok: false, why: '包租中，先收回' };
  const amt = sellPrice(s, id); const m = g(s).meta[id] || {};
  g(s).yachts = g(s).yachts.filter((x) => x !== id); delete g(s).meta[id];
  receive(s, { wallet: 'personal', cat: 'sell', amount: amt, ref: m.contract || '', note: `卖回 ${label(y)}（不交税）` }, t);
  let black = false; if (y.noResale && y.needBrand) { s.blacklist = s.blacklist || {}; s.blacklist[y.needBrand] = true; black = true; }   // 违反不转卖协议：品牌拉黑（车也买不了）
  recalc(s);
  return { ok: true, amount: amt, black };
}
/** 身价里的游艇 = 卖回价之和（assets.recalc 加进 assetValue） */
export const value = (s) => mine(s).reduce((a, id) => a + sellPrice(s, id), 0);
export const upkeepYear = (s, id) => ((g(s).meta[id] || {}).price || Y[id].price) * CFG.upkeepYear * stewardUpkeepMult(s);
export const upkeepYearAll = (s) => mine(s).reduce((a, id) => a + upkeepYear(s, id), 0);
/** 包租年收入 = 船价 × 真实租金率 × profitMul（维护、托管费照真实不乘；跟豪宅出租、包机一个口径） */
export const charterYear = (s, id) => ((g(s).meta[id] || {}).price || Y[id].price) * CFG.charterYear * profitMul();
export function setCharter(s, id, on) { if (!owns(s, id)) return { ok: false, why: '没有这艘' }; return setRent(s, id, on); }

/** 每秒：维护托管费由 assets.tickUpkeep 按挂钩一起扣（在线、离线都走它）；这里跨了游戏月结包租；排队到点出通知。返回要提示的话 */
export function tick(s, t) {
  const out = []; const ids = mine(s);
  const last = s.yachtAt == null ? t : s.yachtAt; s.yachtAt = t;
  const dt = Math.max(0, t - last);
  const mi = monthIndex(s, t);
  if (s.yachtMonth == null) s.yachtMonth = mi;
  if (mi > s.yachtMonth) {
    const months = mi - s.yachtMonth; s.yachtMonth = mi;
    const who = holder(s, 'steward'); const rented = ids.filter((id) => isRented(s, id));
    if (rented.length && isSec(who)) {
      let rent = 0;
      for (const id of rented) {
        const amt = charterYear(s, id) / 12 * months; rent += amt; const tax = amt * 0.2;
        taxRec(s, { kind: '财产租赁所得个税', base: amt, rate: 0.2, amount: tax, t });
        receive(s, { wallet: 'personal', cat: 'rent_income', amount: amt - tax, tax, by: who, party: '游艇包租公司', note: `${label(Y[id])}包租（代扣 20% 个税）` }, t);
      }
      pay(s, { wallet: payerOfPost(s, 'steward'), cat: payerOfPost(s, 'steward') === 'personal' ? 'family_office' : 'sec_salary', amount: rent * 0.05, force: true, party: who, by: who, note: '资产管家游艇包租提成 5%' }, t);
      out.push(`游艇包租收了 ${fmt(rent * 0.8)}（已代扣个税）`);
    }
  }
  for (const o of s.yachtOrders || []) if (t >= o.at && !o.told) { o.told = true; out.push({ order: o, text: `${o.ch === 'invite' ? '船厂来电' : o.ch === 'custom' ? '定制委托接受了' : '订单配额到了'}：${label(Y[o.id])}` }); }
  return out;
}

/** 老板属性：每艘加 系数 × log10(价格万元)，按价格从高到低 100% / 60% / 40% / 20% */
export function attrs(s) {
  const list = mine(s).map((id) => Y[id]).sort((a, b) => b.price - a.price); const rank = [1, 0.6, 0.4, 0.2];
  let aura = 0, network = 0;
  list.forEach((y, i) => { const k = rank[Math.min(i, 3)] * Math.log10(Math.max(1, y.price / 1e4)); aura += CFG.attr.aura * k * (y.auraX || 1); network += CFG.attr.network * k; });
  return { aura, network };
}
/** 约会用的游艇：没包租出去的里面档次最高、同档最贵 */
export function dateYacht(s) {
  { const r = s.ride && s.ride.yacht; if (r && Y[r] && owns(s, r) && !isRented(s, r)) return Y[r]; }   // 设计71：座驾游艇（没包租出去）优先
  const list = mine(s).filter((id) => !isRented(s, id)).map((id) => Y[id]).sort((a, b) => b.tier - a.tier || b.price - a.price);
  return list[0] || null;
}
export function dateAdj(s) {
  const y = dateYacht(s); if (!y) return null;
  return { price: 0, love: CFG.date.love[y.tier] || 0, favor: CFG.date.favor[y.tier] || 0, name: label(y), note: `开自己的${label(y)}` };
}

// ---------- 挂进资产、老板属性、约会（这几个文件只开了挂钩，游艇的东西都在这里） ----------
import { addAssetHook, recalc, ITEM } from './assets.js?v=b846574c';
import { addAttrHook, bossAttrs } from './boss.js?v=b846574c';
import { addPlaceAdj } from './dates.js?v=b846574c';
import { taxRec, payerOfPost } from './fiscal.js?v=b846574c';
import { profitMul } from './calib.js?v=b846574c';
addAssetHook({ value, upkeep: upkeepYearAll, count: (s) => mine(s).length });
addAttrHook(attrs);
setNetworkFn((s) => bossAttrs(s).network);
addPlaceAdj((s, placeId) => (placeId === 'yacht' ? dateAdj(s) : null));
export { recalc };
