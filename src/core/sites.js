// 分店记录 + 关店转让（V2-08；设计35 第十二节取消地段）：开分店只选城市，不再有候选铺位、踩点、铺位系数、口碑起点。
// 每家店基础营业额、租金一样（按城市系数，economy / accrual 里算）；这里只记每家开在哪个城市、花了多少开店费，用来关店转让（拿回 30%）。
// 存档：s.sites = { lines: { 产业id: [{ city, cost, at }] } }；老存档里记的 type / k / rentK 一律不再用（系数按 1）
import C from '../config/sites.json?v=598ef1ae' with { type: 'json' };
import { IND_BY_ID } from '../config/industries.js?v=598ef1ae';
import { setSiteHooks } from './economy.js?v=598ef1ae';
import { setRentHook } from './accrual.js?v=598ef1ae';
import { lineCities, cityName, cityK } from './cities.js?v=598ef1ae';
import { receive } from './ledger.js?v=598ef1ae';
import { estTotal, onDuty } from './staff.js?v=598ef1ae';
import { line as mgLine } from './manage.js?v=598ef1ae';
import * as CB from './calib.js?v=598ef1ae';
export { C as SITE_CFG };

export const st = (s) => { const x = (s.sites = s.sites || { lines: {} }); x.lines = x.lines || {}; if (x.pick) x.pick = null; if (x.busy) delete x.busy; return x; };
export const isSiteLine = (id) => !!(IND_BY_ID[id] && IND_BY_ID[id].retail);
const lookAt = (s, id) => CB.lookAt(IND_BY_ID[id], s.inds[id].level);

// —— 开店的挂钩（core/economy.js openBranch 成功后叫）：只记城市和开店费 ——
function onOpen(s, id, city, t, cost) {
  if (!isSiteLine(id)) return;
  (st(s).lines[id] = st(s).lines[id] || []).push({ city, cost: Math.round(cost || 0), at: t });
}
/** 设计35 第十二节：没有铺位系数了，营业额、租金一律 ×1（老存档也是） */
export const revMult = () => 1;
export const rentMult = () => 1;
setSiteHooks(revMult, onOpen);
setRentHook(rentMult);

/** 线详情：每家记了开店费的分店（i 是下标） */
export function branchesOf(s, id) {
  const cfg = IND_BY_ID[id]; const ind = s.inds[id]; if (!ind) return [];
  return (st(s).lines[id] || []).map((x, i) => ({ i, city: x.city, cost: x.cost, at: x.at, cityName: cityName(x.city), monthRev: Math.round(CB.gameRev(cfg, ind.level) * cityK(x.city)), rent: Math.round(cfg.rent[lookAt(s, id)] * cityK(x.city)), back: Math.round(x.cost * C.sellBack) }));
}
export function whyClose(s, id, i) {
  const xs = st(s).lines[id]; const ind = s.inds[id];
  if (!ind || !xs || !xs[i]) return '没有这家店';
  if (ind.branches <= 1) return '只剩一家，不能关';
  return null;
}
/** 关店转让：拿回开店费的 30%（转让费，走公司账户），家数 −1，城市家数 −1；over = 这家店超编出来的人数（不自动裁） */
export function close(s, id, i, t) {
  const why = whyClose(s, id, i); if (why) return { ok: false, why };
  const xs = st(s).lines[id]; const x = xs[i]; const back = Math.round(x.cost * C.sellBack); const ind = s.inds[id];
  if (back > 0) receive(s, { wallet: 'company', cat: 'branch_sell', amount: back, party: '接手的老板', note: `${IND_BY_ID[id].name}${cityName(x.city)}一家关店转让（拿回开店费 ${Math.round(C.sellBack * 100)}%）` }, t);
  const est0 = estTotal(s, id); const cs = lineCities(s, id); ind.branches -= 1; cs[x.city] = Math.max(0, (cs[x.city] || 0) - 1);
  xs.splice(i, 1); const L = mgLine(s, id); L.nb = ind.branches;
  const est1 = estTotal(s, id); const over = Math.max(0, Math.min(est0 - est1, onDuty(s, id) - est1)); // 这家店的人超编了（不自动裁，去人事裁员）
  return { ok: true, back, over };
}
