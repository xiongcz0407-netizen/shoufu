// 真实经济（设计21 第三节）：门店三条线的「真实单店经营」→ 游戏里每家店的营收
// 成本照真实（进货占比、编制工资 + 社保、房租），营收反推到「月净利 = 真实净利 × profitMul」
//   游戏月营收 = (profitMul × 真实营收 × 真实净利率 + 每店工资社保 + 房租 + 其他经营费用) ÷ (1 − 进货占比 − calibVat)
// 只用配置（industries.js real、payroll.json、economy.json），不 import economy / staff（避免循环）
import ECO from '../config/economy.json?v=c60d881c' with { type: 'json' };
import PAY from '../config/payroll.json?v=c60d881c' with { type: 'json' };
import { IND_BY_ID } from '../config/industries.js?v=c60d881c';
export { ECO };

const sumv = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
export const SOCIAL = sumv(PAY.social);
export const profitMul = () => ECO.profitMul;

/** 等级 → 第几个样子 */
export function lookAt(cfg, level) { let i = 0; cfg.looks.forEach((lv, k) => { if (level >= lv) i = k; }); return i; }
/** 这一级在样子里的位置 0～1（样子最低级 0、最高级 1） */
export function posInLook(cfg, level) {
  const j = lookAt(cfg, level); const a = cfg.looks[j]; const b = (cfg.looks[j + 1] ?? (cfg.maxLevel + 1)) - 1;
  return b > a ? (level - a) / (b - a) : 0;
}
const lerp = ([a, b], f) => a + (b - a) * f;
/** 真实月营收、真实净利率、进货占比（上海系数 1.0） */
export function realAt(cfg, level) {
  const r = cfg.real[lookAt(cfg, level)]; const f = posInLook(cfg, level);
  return { rev: lerp(r.rev, f), margin: lerp(r.margin, f), cogs: r.cogs, invest: r.invest };
}
/** 每家店每月的固定成本（满编工资 × (1 + 社保) + 房租），上海系数 1.0 */
export function storeFixed(cfg, level) {
  const j = lookAt(cfg, level); const tpl = PAY.staffing[cfg.id][j];
  let w = 0; for (const [r, n] of Object.entries(tpl)) w += n * PAY.roles[r].wage;
  return w * (1 + SOCIAL) + cfg.rent[j];
}
/** 其他经营费用（水电、物业、营销、损耗、杂费）：真实营收 ×（1 − 进货 − 净利率）里，工资社保和房租以外剩下的那部分（照真实，不 ×3） */
export function storeOther(cfg, level) { const x = realAt(cfg, level); return Math.max(0, x.rev * (1 - x.cogs - x.margin) - storeFixed(cfg, level)); }
/** 游戏里每家店的月净利（目标）= 真实净利 × profitMul */
export const gameNet = (cfg, level) => { const x = realAt(cfg, level); return profitMul() * x.rev * x.margin; };
/** 游戏里每家店的月营收（满编、上海、没有店长和加成） */
export function gameRev(cfg, level) {
  const x = realAt(cfg, level);
  return (gameNet(cfg, level) + storeFixed(cfg, level) + storeOther(cfg, level)) / (1 - x.cogs - ECO.calibVat);
}
/** 按样子取进货占比 */
export const cogsAt = (cfg, level) => cfg.real[lookAt(cfg, level)].cogs;
/** 升一级的价钱（每家店）：同一个样子 = 多出来的月净利 × upPaybackMonths；换样子 = 两个样子单店投资的差价 */
export function upCostPerStore(cfg, level) {
  const j = lookAt(cfg, level), k = lookAt(cfg, level + 1);
  if (k !== j) return cfg.real[k].invest - cfg.real[j].invest;
  return Math.max(0, gameNet(cfg, level + 1) - gameNet(cfg, level)) * ECO.upPaybackMonths;
}
/** 开分店费：单店投资（按现在的样子）× 城市系数 × branchGrow^已有家数 */
export const branchCostAt = (cfg, level, branches, cityK = 1) => cfg.real[lookAt(cfg, level)].invest * cityK * Math.pow(ECO.branchGrow, branches);
/** 人效上限（科技、传媒按人头的线，设计21 复核）：每人每月最多做多少营收，使「满编做满」时人均月净利 = 真实人均净利 × profitMul
 *  real：{ revPerHead 真实人均月营收, margin 真实净利率, vat 增值税实际税负 }；成本照真实：进货占比、按样子的人均工资社保、房租摊到人头 */
export function headCap(id, look, real) {
  const cfg = IND_BY_ID[id]; const tpl = PAY.staffing[id][look]; let n = 0, w = 0;
  for (const [r, k] of Object.entries(tpl)) { n += k; w += k * PAY.roles[r].wage; }
  return (profitMul() * real.revPerHead * real.margin + w / n * (1 + SOCIAL) + cfg.rent[look] / n) / (1 - cfg.cogs - real.vat);
}
/** 项目周期（设计21 第九节）：游戏月 = 现实月 ÷ profitMul，每一段最少 1 个游戏月（0 表示没有这一段） */
export const gm = (realMonths) => (realMonths ? Math.max(1, realMonths / profitMul()) : 0);
export const isRetail = (id) => !!(IND_BY_ID[id] && IND_BY_ID[id].retail);
