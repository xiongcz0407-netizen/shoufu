// 设计27：车行 / 车库的分类和筛选（纯函数，界面在 ui/assets.js）
// 类型 body：sedan 轿车 / suv SUV / sports 跑车 / hyper 超跑；品牌按国家分组；渠道 spot / order / invite / auction / custom
import * as AS from './assets.js?v=8c602723';

/** 车行里的全部车（带 carmeta 的限量台数和渠道） */
export const allCars = () => Object.values(AS.ITEM).filter((it) => it.kind === 'car');
export const BODY_NAME = { sedan: '轿车', suv: 'SUV', sports: '跑车', hyper: '超跑' };
export const BODIES = Object.keys(BODY_NAME);
export const COUNTRY_ORDER = ['德国', '英国', '意大利', '法国', '日本', '美国', '瑞典', '克罗地亚', '中国'];
const cIdx = (c) => { const i = COUNTRY_ORDER.indexOf(c); return i < 0 ? 99 : i; };

/** 筛选条件（存档 s.ui 里，下次打开还是上次的） */
export const SHOP_DEF = { body: 'all', brand: 'all', ch: 'all', sort: 'asc', afford: false };
export const GARAGE_DEF = { body: 'all', brand: 'all', sort: 'time' };
export function shopPrefs(s) { s.ui = s.ui || {}; return (s.ui.carShop = { ...SHOP_DEF, ...(s.ui.carShop || {}) }); }
export function garagePrefs(s) { s.ui = s.ui || {}; return (s.ui.carGarage = { ...GARAGE_DEF, ...(s.ui.carGarage || {}) }); }

/** 一辆车过不过筛选（类型 × 品牌 × 渠道，all 不限） */
export const match = (it, f) => (f.body === 'all' || it.body === f.body) && (f.brand === 'all' || it.brandKey === f.brand) && (!f.ch || f.ch === 'all' || AS.channelOf(it) === f.ch);
/** 买得起：没有、条件够（whyNotBuy 为空）、个人现金够全款含税 */
export function affordable(s, it, t = Date.now()) {
  if (AS.owns(s, it.id)) return false;
  if (AS.whyNotBuy(s, it.id, t, { forOrder: AS.channelOf(it) === 'order' })) return false;
  return AS.freeCash(s) >= AS.quote(s, it.id).total;
}
/** 车行列表：叠加筛选 + 只看买得起的 + 价格排序 */
export function shopList(s, f, t = Date.now(), list = allCars()) {
  const r = list.filter((it) => match(it, f) && (!f.afford || affordable(s, it, t)));
  return r.sort((a, b) => (f.sort === 'desc' ? b.price - a.price : a.price - b.price));
}
/** 某个类型（不看品牌）下有车的品牌，按国家分组排：[{ key, name, country, n }] */
export function brands(list, body = 'all') {
  const m = new Map();
  for (const it of list) if (body === 'all' || it.body === body) { const x = m.get(it.brandKey) || { key: it.brandKey, name: it.brand, country: it.origin, n: 0, min: it.price }; x.n++; x.min = Math.min(x.min, it.price); m.set(it.brandKey, x); }
  return [...m.values()].sort((a, b) => cIdx(a.country) - cIdx(b.country) || a.min - b.min);
}
/** 每个类型有几辆（数字给按钮用） */
export function bodyCount(list) { const c = { all: list.length }; for (const b of BODIES) c[b] = list.filter((x) => x.body === b).length; return c; }

/** 车库：自己的车，筛选 + 排序（买入时间新的在前 / 价格高的在前） */
export function garageList(s, f) {
  const meta = (s.garage && s.garage.meta) || {};
  const mine = ((s.garage && s.garage.cars) || []).map((id) => AS.ITEM[id]).filter(Boolean);
  const r = mine.filter((it) => match(it, { ...f, ch: 'all' }));
  return r.sort((a, b) => (f.sort === 'price' ? ((meta[b.id] || {}).price || b.price) - ((meta[a.id] || {}).price || a.price) : ((meta[b.id] || {}).at || 0) - ((meta[a.id] || {}).at || 0)));
}
/** 车库统计：一共 N 辆，各类型几辆，总价值（卖回价） */
export function garageStats(s) {
  const mine = ((s.garage && s.garage.cars) || []).map((id) => AS.ITEM[id]).filter(Boolean);
  return { n: mine.length, ...Object.fromEntries(BODIES.map((b) => [b, mine.filter((x) => x.body === b).length])), value: mine.reduce((a, it) => a + AS.sellPrice(s, it.id), 0) };
}
