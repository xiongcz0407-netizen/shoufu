// 分店记录（V2-08；设计35 第十二节取消地段；设计82 取消关店）：开分店只选城市，不再有候选铺位、踩点、铺位系数、口碑起点，也不能关店。
// 每家店基础营业额、租金一样（按城市系数，economy / accrual 里算）；这里只记每家开在哪个城市、花了多少开店费（flow.js shopsOf 按开店顺序排店用）。
// 存档：s.sites = { lines: { 产业id: [{ city, cost, at }] } }；老存档里记的 type / k / rentK 一律不再用（系数按 1）
import { IND_BY_ID } from '../config/industries.js?v=701a82d3';
import { setSiteHooks } from './economy.js?v=701a82d3';
import { setRentHook } from './accrual.js?v=701a82d3';

export const st = (s) => { const x = (s.sites = s.sites || { lines: {} }); x.lines = x.lines || {}; if (x.pick) x.pick = null; if (x.busy) delete x.busy; return x; };
export const isSiteLine = (id) => !!(IND_BY_ID[id] && IND_BY_ID[id].retail);

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
