// 城市和分公司（设计20 第二节 5）：总部上海；新城市先注册分公司（5 分钟 + 代办费）；门店按城市分，工资、房租、收入、开店费乘城市系数
// 只依赖 ledger（staff / economy / realestate 都要用这里）
import C from '../config/cities.json?v=385b5781' with { type: 'json' };
import { pay, canPay } from './ledger.js?v=385b5781';
export { C as CITY_CFG };
export const CITY_IDS = Object.keys(C.cities);
export const cityName = (c) => C.cities[c].name;
export const cityK = (c) => (C.cities[c] || C.cities[C.hq]).k;

const reg = (s) => (s.cities = s.cities || { [C.hq]: { status: 'hq' } });
/** 'hq' 总部 / 'ok' 注册好了 / 'pending' 办理中 / null 没注册 */
export function cityStatus(s, c, t = Date.now()) {
  const x = reg(s)[c]; if (!x) return null;
  if (x.status === 'pending' && t >= x.at) x.status = 'ok';
  return x.status;
}
export const cityOpen = (s, c, t) => ['hq', 'ok'].includes(cityStatus(s, c, t));
export function whyNotRegister(s, c, t) {
  if (!C.cities[c]) return '没有这个城市';
  if (cityStatus(s, c, t)) return cityStatus(s, c, t) === 'pending' ? '分公司正在办' : '已经有了';
  if (!canPay(s, 'company', C.registerFee)) return '公司账户不够';
  return null;
}
/** 注册分公司：代办费走公司账户，5 分钟后能开业 */
export function registerCity(s, c, t, by = '') {
  const why = whyNotRegister(s, c, t); if (why) return { ok: false, why };
  pay(s, { wallet: 'company', cat: 'filing', amount: C.registerFee, party: '代办公司', by, note: `注册${cityName(c)}分公司（营业执照、税务登记、刻章、开户）` }, t);
  reg(s)[c] = { status: 'pending', at: t + C.registerMin * 60e3, since: t };
  s.period = s.period || {}; s.period.other = (s.period.other || 0) + C.registerFee;
  return { ok: true, at: reg(s)[c].at };
}
/** 一条门店线在各城市的家数（旧档：全在总部） */
export function lineCities(s, id) {
  const x = s.inds[id]; if (!x) return {};
  if (!x.cities) x.cities = { [C.hq]: x.branches };
  const sum = Object.values(x.cities).reduce((a, b) => a + b, 0);
  if (sum !== x.branches) x.cities[C.hq] = Math.max(0, (x.cities[C.hq] || 0) + x.branches - sum); // 收购并进来、旧逻辑加的店算总部
  return x.cities;
}
/** 这条线的平均城市系数（按家数加权）：收入、工资、房租都乘它 */
export function lineK(s, id) {
  const x = s.inds[id]; if (!x || !x.branches) return 1;
  let a = 0; for (const [c, n] of Object.entries(lineCities(s, id))) a += n * cityK(c);
  return a / x.branches;
}
