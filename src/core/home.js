// 设计94 / 95「住哪套」：s.home = 房子 id。只有国内 / 香港的能住（海外要飞过去）；出租中的不能住
// homeId：选了的那套还在手上、国内 / 香港、没出租 → 用它；否则国内 / 香港没出租的最贵那套；都没有 → null
import { ITEM } from './assets.js?v=5f2b1b8c';
import { isRented } from './postwork.js?v=5f2b1b8c';

export const HOME_REGIONS = ['china', 'hk'];
export const BIG_AREA = 400;   // 面积 ≥ 400 ㎡ 算大房子（大平层、顶层、别墅）
const ok = (id) => !!(ITEM[id] && ITEM[id].kind === 'house' && HOME_REGIONS.includes(ITEM[id].region));
/** 国内 / 香港、还在手上的房子（出租的也在里面），最贵的在前 */
export const homesOwned = (s) => ((s.garage && s.garage.houses) || []).filter(ok).sort((a, b) => ITEM[b].price - ITEM[a].price);
export const canLive = (s, id) => homesOwned(s).includes(id) && !isRented(s, id);
export function homeId(s) {
  if (s.home && canLive(s, s.home)) return s.home;
  return homesOwned(s).find((id) => !isRented(s, id)) || null;
}
export function setHome(s, id) {
  if (!homesOwned(s).includes(id)) return { ok: false, why: '没有这套房子' };
  if (isRented(s, id)) return { ok: false, why: '出租中，先收回' };
  s.home = id; return { ok: true, name: homeName(id) };
}
/** 名字去掉括号里的楼盘名：「陆家嘴江景大平层（汤辰一品）」→「陆家嘴江景大平层」 */
export const homeName = (id) => (ITEM[id] ? ITEM[id].name.replace(/[（(][^）)]*[）)]/g, '').trim() : '');
/** 私密约会「家里」用：{ id, name, city, big } 或 null */
export function homeInfo(s) {
  const id = homeId(s); if (!id) return null; const it = ITEM[id];
  return { id, name: homeName(id), city: it.city, big: (it.area || 0) >= BIG_AREA };
}
