// 设计71 座驾：s.ride = { car, plane, yacht }（资产 id）。没设过 / 设过的那台卖掉了 = 用这一类里最贵的那台（跟以前一样）
// 设计83 私密约会：座驾不符合条件（敞篷车、直升机 / 2 座以下）→ 这一类里符合条件的最贵那台；一台都没有 → null
import { ITEM, bestCar } from './assets.js?v=a184462c';
import * as YT from './yacht.js?v=a184462c';
import { isRented } from './postwork.js?v=a184462c';

export const KINDS = ['car', 'plane', 'yacht'];
export const KIND_NAME = { car: '车', plane: '飞机', yacht: '游艇' };
const item = (kind, id) => (!id ? null : kind === 'yacht' ? YT.Y[id] || null : ITEM[id] || null);
export const rideItem = item;
export const nameOf = (kind, id) => { const it = item(kind, id); return !it ? '' : `${it.brand} ${it.model}`; };
/** 这一类买过、现在还在手上的 id，最贵的在前 */
export function owned(s, kind) {
  const g = s.garage || {};
  const ids = kind === 'yacht' ? YT.mine(s) : (g[kind === 'car' ? 'cars' : 'planes'] || []).filter((id) => ITEM[id]);
  return ids.slice().sort((a, b) => item(kind, b).price - item(kind, a).price);
}
function dflt(s, kind) {
  if (kind === 'car') { const c = bestCar(s); return c ? c.id : null; }   // 车：跟以前约会开的一样（档最高、同档最贵）
  if (kind === 'yacht') { const l = YT.mine(s).map((id) => YT.Y[id]).sort((a, b) => b.tier - a.tier || b.price - a.price); return l[0] ? l[0].id : null; }   // 游艇：档最高、同档最贵（跟约会挑的一样）
  return owned(s, kind)[0] || null;
}
/** 现在的座驾 id（没有这一类 → null）；设过的那台已经不在手上 → 清掉，回到默认 */
export function rideId(s, kind) {
  const r = s.ride && s.ride[kind];
  if (r && owned(s, kind).includes(r)) return r;
  if (r) delete s.ride[kind];
  return dflt(s, kind);
}
export const isSet = (s, kind) => !!(s.ride && s.ride[kind] && owned(s, kind).includes(s.ride[kind]));
export function setRide(s, kind, id) {
  if (!KINDS.includes(kind) || !owned(s, kind).includes(id)) return { ok: false, why: '没有这一台' };
  s.ride = s.ride || {}; s.ride[kind] = id;
  return { ok: true, name: nameOf(kind, id) };
}
/** 约会开的游艇：座驾没包租出去就用座驾，否则照旧挑没包租的里最好的（core/yacht.js dateYacht） */
export const dateYachtId = (s) => { const y = YT.dateYacht(s); return y ? y.id : null; };

// —— 设计83 私密约会用哪台 ——
export const PRIV_OK = {
  car: (it) => it.roof !== false,                       // 有顶棚
  plane: (it) => !it.heli && (it.seats || 0) > 2,       // 不是直升机、多于 2 座
  yacht: () => true,                                    // 自己的（租的不算）
};
export function privRideId(s, kind) {
  const ok = (id) => PRIV_OK[kind](item(kind, id)) && !(kind === 'yacht' && isRented(s, id));
  const cur = rideId(s, kind); if (cur && ok(cur)) return cur;
  return owned(s, kind).find(ok) || null;
}
