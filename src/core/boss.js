// 老板属性（设计09 第一节）：气场（车）、人脉（豪宅、收购）、眼光（飞机、分店、称号）。只靠「拥有」和「做成事」涨
import B from '../config/boss.json?v=a184462c' with { type: 'json' };
import { CARS, PLANES } from '../config/vehicles.js?v=a184462c';
import { HOUSES } from '../config/estates.js?v=a184462c';
export { B as BOSS_CFG };

const BY = {}; for (const x of CARS) BY[x.id] = { ...x, kind: 'car' }; for (const x of PLANES) BY[x.id] = { ...x, kind: 'plane' }; for (const x of HOUSES) BY[x.id] = { ...x, kind: 'house' };
const gain = (kind, attr, price) => (B.coef[kind][attr] || 0) * Math.log10(Math.max(1, price / 1e4));
function fromItems(ids, kind, attr) {
  const list = ids.map((id) => BY[id]).filter(Boolean).sort((a, b) => b.price - a.price);
  const seenCity = new Set(); let v = 0;
  list.forEach((it, i) => {
    let g = gain(kind, attr, it.price) * (B.rank[Math.min(i, B.rank.length - 1)]);
    if (kind === 'house' && it.city && !seenCity.has(it.city)) { seenCity.add(it.city); g *= B.houseFirstInCity; }
    v += g;
  });
  return v;
}
/** 别的东西加的属性（游艇、表、古董……开发2 各自的文件）挂进来：fn(s) → { aura, network, vision } */
const HOOKS = [];
export const addAttrHook = (fn) => { HOOKS.push(fn); };
const hk = (s, k) => HOOKS.reduce((a, fn) => a + (fn(s)[k] || 0), 0);
/** { aura 气场, network 人脉, vision 眼光 }（取一位小数） */
export function bossAttrs(s) {
  const g = s.garage || {}; const r1 = (x) => Math.round(x * 10) / 10;
  const acq = Object.values(s.rivals || {}).filter((x) => x.acquired).length;
  const branches = Object.values(s.inds || {}).reduce((a, x) => a + (x.branches || 0), 0);
  return {
    aura: r1(fromItems(g.cars || [], 'car', 'aura') + hk(s, 'aura')),
    network: r1(fromItems(g.houses || [], 'house', 'network') + acq * B.networkPerAcquire + hk(s, 'network')),
    vision: r1(fromItems(g.planes || [], 'plane', 'vision') + branches * B.visionPerBranch + (s.title || 0) * B.visionPerTitle + hk(s, 'vision')),
  };
}
const E = B.effects;
export const auraBattle = (s) => Math.min(E.battleAuraMax, bossAttrs(s).aura * E.battlePerAura);
export const networkAcquire = (s) => Math.min(E.acquireNetworkMax, bossAttrs(s).network * E.acquirePerNetwork);
const vx = (s) => Math.max(0, bossAttrs(s).vision - E.visionFrom);
/** 眼光：商战看穿对方底牌（第 2-13 项） */
export const visionBattle = (s) => Math.min(E.battleVisionMax || 0, bossAttrs(s).vision * (E.battlePerVision || 0));
export const visionIncome = (s) => Math.min(E.incomeVisionMax, vx(s) * E.incomePerVision);
export const visionOfflineH = (s) => Math.min(E.offlineVisionMaxH, vx(s) * E.offlinePerVision);
