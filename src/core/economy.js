// 经济：产钱、升级、分店、派驻、身价、离线收益（纯函数，node 测试能跑）
import { INDUSTRIES, IND_BY_ID, SEC_BONUS_PER_POINT, BRANCH_CAP, LOOK3_TITLE } from '../config/industries.js?v=1236a42d';
import * as CB from './calib.js?v=1236a42d';
import CAP from '../config/capital.json?v=1236a42d' with { type: 'json' };
import { TITLES } from '../config/titles.js?v=1236a42d';
import { pay, receive, accrue, canPay } from './ledger.js?v=1236a42d';
import { staffFactor, staffUp, PAY, estTotal } from './staff.js?v=1236a42d';
import { track } from './companytax.js?v=1236a42d';
import { payables } from './accrual.js?v=1236a42d';
import { visionIncome } from './boss.js?v=1236a42d';
import { managerRevMult, managerCostMult, stat } from './posts.js?v=1236a42d';
import { reValue } from './realestate.js?v=1236a42d';
import { logiRevPerSec, linkCogsMult, fleetValue } from './logistics.js?v=1236a42d';
import { techRevPerSec, techLink } from './tech.js?v=1236a42d';
import { liveRevPerSec, mediaLink } from './media.js?v=1236a42d';
import { lineK, lineCities, cityOpen, cityK, cityName, CITY_CFG } from './cities.js?v=1236a42d';
import { revK, debt } from './rivalry.js?v=1236a42d';
import { depositTotal, loanDebt, setNW } from './bank.js?v=1236a42d';
import { equityOwed } from './equity.js?v=1236a42d';

/** 存档里的产业：{ store: { level, branches, spent, sec, staff, agency, openedAt } } */
export function newIndustry(t = Date.now()) { return { level: 1, branches: 1, spent: 0, sec: null, staff: {}, agency: {}, openedAt: t }; }

const MONTH_SEC = 200 * 3600 / 12; // 游戏一个月的秒数（gametime.json yearHours 200）
/** 升级费：门店三条线按真实经济（core/calib.js，升级是每家店都升，乘家数）；别的线照旧 */
export const upgradeCost = (cfg, level, branches = 1) => cfg.retail ? Math.ceil(CB.upCostPerStore(cfg, level) * Math.max(1, branches)) : Math.ceil(cfg.upCost * Math.pow(cfg.upGrow, level - 1));
/** 开分店费：门店 = 单店投资（现在的样子）× 城市系数 × 1.12^已有家数（设计21）；物流照旧 */
export const branchCost = (cfg, branches, city, level = 1) => cfg.retail ? Math.ceil(CB.branchCostAt(cfg, level, branches, city ? cityK(city) : 1)) : Math.ceil(cfg.branchCost * Math.pow(cfg.branchGrow, branches - 1) * (city ? cityK(city) : 1)); // 开店费乘城市系数
export const upCostOf = (s, id) => upgradeCost(IND_BY_ID[id], s.inds[id].level, s.inds[id].branches);
export const brCostOf = (s, id, city) => branchCost(IND_BY_ID[id], s.inds[id].branches, city, s.inds[id].level);
export function lookIndex(cfg, level) { let i = 0; cfg.looks.forEach((lv, k) => { if (level >= lv) i = k; }); return i; }

/** 秘书属性（培养后的）；s.secs[id].attrs 有就用，没有用配置起点 */
export function secAttr(s, secId, key, secCfgById) {
  const rec = s.secs[secId];
  if (rec && rec.attrs && key in rec.attrs) return rec.attrs[key];
  const cfg = secCfgById && secCfgById[secId];
  const idx = ['charm', 'wit', 'social', 'manage'].indexOf(key);
  return cfg ? cfg.attrs[idx] : 0;
}

/** 第一轮的派驻加成：第 7 项起换成店长职位（core/posts.js），这里只给旧界面显示用 */
export function secBonus(s, ind, secCfgById) {
  const id = Object.keys(s.inds).find((k) => s.inds[k] === ind);
  return id ? managerRevMult(s, id) - 1 : 0;
}

/** P-05 亲自经营 / 口碑 / 事件 / 大盘：营业额倍数、进货成本倍数 + 毛利点（core/manage.js 挂进来）；算估值时（VALUE_MODE）不算当天的临时加成 */
let revHook = () => 1, cogsHook = () => [1, 0]; let VALUE_MODE = false;
export const setManageHooks = (rev, cogs) => { revHook = rev; cogsHook = cogs; };
const mgRev = (s, id) => (IND_BY_ID[id].retail ? revHook(s, id, VALUE_MODE) : 1);
/** 一个产业每秒的营业收入（毛的，按在岗 / 编制打折） */
export function industryRevenue(s, id, secCfgById) {
  const ind = s.inds[id]; const cfg = IND_BY_ID[id];
  if (!ind || !cfg) return 0;
  const boost = ((s.flags && s.flags.indBoost && s.flags.indBoost[id]) || 0) + visionIncome(s) + techLink(s) + mediaLink(s, id); // 有科技：管理效率 +3%；有传媒：服装餐饮广告 +5% // 收购对手给的加成 + 老板眼光（替换原来的豪宅加成）
  if (cfg.kind === 'media') return liveRevPerSec(s) * (managerRevMult(s, id) + boost) * (staffFactor(s, id) > 0 ? 1 : 0); // 传媒：直播按主播人头（投拍另结）
  if (cfg.kind === 'product') return techRevPerSec(s) * (managerRevMult(s, id) + boost) * (staffFactor(s, id) > 0 ? 1 : 0); // 科技：按上线产品；人手已经算在人效上限里，只留缺一半停业
  if (cfg.kind === 'scale') return logiRevPerSec(s) * revK(s, id, lineCities(s, id)) * (managerRevMult(s, id) + boost) * staffFactor(s, id); // 物流：按人头和车，乘城市系数
  if (!cfg.retail) return 0; // 地产：项目制，回款另算
  return CB.gameRev(cfg, ind.level) / MONTH_SEC * ind.branches * revK(s, id, lineCities(s, id)) * (managerRevMult(s, id) + boost) * staffFactor(s, id) * mgRev(s, id); // 真实经济（core/calib.js）；城市系数：广州客单价低
}
/** 一个产业每秒的毛利（营收 − 进货），给界面和 econsim 看 */
export const baseCogs = (s, id) => { const c = IND_BY_ID[id]; return c.retail && s.inds[id] ? CB.cogsAt(c, s.inds[id].level) : c.cogs; }; // 门店按样子
export const cogsRate = (s, id) => { const [k, add] = IND_BY_ID[id].retail ? cogsHook(s, id, VALUE_MODE) : [1, 0]; return Math.min(0.98, baseCogs(s, id) * managerCostMult(s, id) * linkCogsMult(s, id) * k + add); }; // 有物流：便利店、服装自己配送，进货 −2%
export function industryIncome(s, id, secCfgById) { return industryRevenue(s, id, secCfgById) * (1 - cogsRate(s, id)); }
export function totalIncome(s, secCfgById) {
  let t = 0; for (const id of Object.keys(s.inds)) t += industryIncome(s, id, secCfgById);
  return t;
}
/** 这条线一个月的净利（按满编估：营收 − 进货 − 增值税 − 满编工资社保 − 房租 − 水电杂费），给产业估值用 */
export function lineNetMonth(s, id) { VALUE_MODE = true; try { return lineNetMonth0(s, id); } finally { VALUE_MODE = false; } }
function lineNetMonth0(s, id) {
  const ind = s.inds[id]; const cfg = IND_BY_ID[id]; if (!ind || cfg.kind === 'project' || !ind.branches) return 0;
  const k = lineK(s, id); const sf = staffFactor(s, id) || 1;
  const rev = industryRevenue(s, id) / sf * MONTH_SEC; // 按满编的营收
  if (cfg.retail) return rev * (1 - cogsRate(s, id) - CB.ECO.calibVat) - (CB.storeFixed(cfg, ind.level) + CB.storeOther(cfg, ind.level)) * ind.branches * k;
  let w = 0; for (const [r, n] of Object.entries(PAY.staffing[id][lookIndex(cfg, ind.level)])) w += n * PAY.roles[r].wage;
  const heads = estTotal(s, id); const per = Object.values(PAY.staffing[id][lookIndex(cfg, ind.level)]).reduce((a, b) => a + b, 0) || 1;
  const labor = w / per * heads * (1 + CB.SOCIAL) * k; const rent = (cfg.rentPerHead ? cfg.rentPerHead * heads : cfg.rent[lookIndex(cfg, ind.level)]) * k;
  return rev * (1 - cogsRate(s, id) - CB.ECO.calibVat) - labor - rent;
}
/** 一条线的价值 = max（累计投入 × 70%，年净利 × 3）（设计21 第八节 1） */
export const lineValue = (s, id) => { const V = CB.ECO.industryValue; return Math.max((s.inds[id].spent || 0) * V.costRate, lineNetMonth(s, id) * 12 * V.profitYears); };
export const industryValue = (s) => Object.keys(s.inds).reduce((a, id) => a + lineValue(s, id), 0);
/** 身价 = 个人现金 + 公司账户 + 产业价值 + 资产（衣服不算；车房飞机 s.assetValue）+ 收购来的公司估值 − 公司应付（计提的工资房租税、拖欠工资） */
// ---------- 公司估值和持股（设计23 第一节，3-02）----------
/** 近 12 个游戏月的净利 / 营收（不满 12 个月按月均 × 12） */
export const profit12 = (s) => { const m = (s.monthly || []).slice(-12); return m.length ? m.reduce((a, x) => a + (x.profit || 0), 0) / m.length * 12 : 0; };
export const rev12 = (s) => { const m = (s.monthly || []).slice(-12); return m.length ? m.reduce((a, x) => a + (x.rev || 0), 0) / m.length * 12 : 0; };
/** 经营估值（设计23 第一节）：每条线按现在的月净利年化 × 行业市盈率（多条线自然按利润加权）；整体亏损按营收 × 市销率；不低于产业投入 × 70%
 *  用「现在的月净利」而不是近 12 个月流水：开店、并店马上反映，收购估值也好扣，不会算两遍（结果文档写了） */
export function earningsValue(s) {
  let pe = 0, net = 0, ps = 0;
  for (const id of Object.keys(s.inds)) { const n = lineNetMonth(s, id) * 12; net += n; if (n > 0) pe += n * (CAP.pe[id] ?? 12); ps += lineRevMonth(s, id) * 12 * (CAP.ps[id] ?? 0.5); }
  const floor = Object.values(s.inds).reduce((a, x) => a + (x.spent || 0), 0) * CB.ECO.industryValue.costRate;
  return Math.max(floor, net > 0 ? pe * scaleK(s, net) : ps);
}
/** 规模折价（非上市）：年净利越小市盈率打得越狠；上市（s.cap.listed）不打折 */
export const scaleK = (s, net) => (s.cap && s.cap.listed ? 1 : CAP.scale.find(([up]) => net < up)[1]);
export const lineRevMonth = (s, id) => industryRevenue(s, id) * MONTH_SEC;
/** 经营估值怎么算的（资本页显示，P-00 验收）：pe = 按利润加权的行业市盈率、k = 规模系数；亏损按市销率；不够投入 × 70% 就按投入 */
export function valueBasis(s) {
  let pe = 0, net = 0;
  for (const id of Object.keys(s.inds)) { const n = lineNetMonth(s, id) * 12; net += n; if (n > 0) pe += n * (CAP.pe[id] ?? 12); }
  const pos = Object.keys(s.inds).reduce((a, id) => a + Math.max(0, lineNetMonth(s, id) * 12), 0);
  const floor = Object.values(s.inds).reduce((a, x) => a + (x.spent || 0), 0) * CB.ECO.industryValue.costRate;
  const mode = net <= 0 ? 'ps' : 'pe'; const k = net > 0 ? scaleK(s, net) : 1; const raw = net > 0 ? pe * k : null;
  return { mode: earningsValue(s) <= floor + 1e-6 && (raw == null || raw < floor) ? 'floor' : mode, pe: pos > 0 ? pe / pos : 0, k };
}
/** 估值用的市盈率（显示）= 经营估值 ÷ 年净利 */
export const peShown = (s) => { const n = Object.keys(s.inds).reduce((a, id) => a + lineNetMonth(s, id) * 12, 0); return n > 0 ? earningsValue(s) / n : 0; };
/** 公司估值（股权价值）= 经营估值 + 公司账户 + 公司存款 + 地产项目 / 物业 + 车队 + 收购来的公司 − 公司负债（瑞霖、银行贷款、应付股权转让款、应付） */
/** 公司名下别的资产挂进公司估值（地标等，第 3-07 项；开发2 各自的文件）：fn(s) → 金额 */
const CO_HOOKS = []; export const addCompanyAssetHook = (fn) => { CO_HOOKS.push(fn); }; export const companyAssetHooks = (s) => CO_HOOKS.reduce((a, fn) => a + (fn(s) || 0), 0);
export const companyEquity = (s) => companyAssetHooks(s) + earningsValue(s) + (s.company || 0) + depositTotal(s, 'company') + reValue(s) + fleetValue(s) + (s.acquiredValue || 0) - debt(s) - loanDebt(s) - equityOwed(s) - payables(s).total;
/** 你的持股（开局 100%；融资、对赌、激励池会变） */
export const stakeOf = (s) => (s.cap && s.cap.stake != null ? s.cap.stake : 1);
/** 身价 = 个人现金 + 个人资产 + 个人存款 + 公司估值 × 你的持股（设计23：产业价值并进公司估值，不再单独算） */
export const netWorth = (s) => s.cash + (s.assetValue || 0) + depositTotal(s, 'personal') + companyEquity(s) * stakeOf(s) + nwExtra(s);
const NW_HOOKS = []; export const addNetWorthHook = (fn) => NW_HOOKS.push(fn); const nwExtra = (s) => NW_HOOKS.reduce((a, f) => a + (f(s) || 0), 0); // 开发2：上市市值等挂这里 // 应付股权转让款（收购分期）算负债 // 存款算资产；瑞霖过桥、银行贷款本金算负债 // reValue：地产项目和持有物业（core/realestate.js）

export const isUnlocked = (s, id) => s.title >= IND_BY_ID[id].unlockTitle || !!(s.flags && s.flags.earlyUnlock && s.flags.earlyUnlock[id]);

export function unlockIfReady(s) {
  for (const cfg of INDUSTRIES) if (!s.inds[cfg.id] && isUnlocked(s, cfg.id)) { s.inds[cfg.id] = newIndustry(s._t); if (cfg.kind === 'project' || cfg.startEmpty) s.inds[cfg.id].branches = 0; else staffUp(s, cfg.id); } // 摆摊：0 家，自己花钱开第一家 // 地产：拿到地才组项目公司
}

// 升级 / 开分店从公司账户扣，记流水
function payInd(s, ind, cost, id, what, t, by = '') {
  if (!pay(s, { wallet: 'company', cat: 'expand', amount: cost, by, note: `${IND_BY_ID[id].name}${what}` }, t)) return false;
  ind.spent = (ind.spent || 0) + cost; return true;
}
/** 这条线最多开几家：配置上限和称号上限取小的 */
export const maxBranches = (s, id) => Math.min(IND_BY_ID[id].maxBranch, BRANCH_CAP[s.title] ?? Infinity);
/** 不能升级的原因（第 3 个样子要老板） */
export function whyNotUpgrade(s, id) {
  const cfg = IND_BY_ID[id]; const ind = s.inds[id]; if (!ind || cfg.kind === 'project') return '这条线不升级';
  if (cfg.maxLevel && ind.level >= cfg.maxLevel) return '已经是最高级';
  if (cfg.retail && !ind.branches) return '先开一家';
  const lt = cfg.lookTitle || [0, 0, LOOK3_TITLE];
  for (let j = cfg.looks.length - 1; j > 0; j--) if (ind.level + 1 >= cfg.looks[j] && s.title < (lt[j] || 0)) return `升到 ${cfg.looks[j]} 级（${cfg.lookNames[j]}）要「${TITLES[lt[j]].name}」称号`;
  return null;
}
export function whyNotBranch(s, id) { const ind = s.inds[id]; if (!ind || ['project', 'product', 'media'].includes(IND_BY_ID[id].kind)) return '这条线不开分店'; if (ind.branches >= maxBranches(s, id)) return ind.branches >= IND_BY_ID[id].maxBranch ? '分店满了' : `现在最多 ${maxBranches(s, id)} 家（升称号能多开）`; return null; }
export function upgrade(s, id, t = Date.now(), by = '') {
  const ind = s.inds[id]; if (!ind || whyNotUpgrade(s, id)) return false; // 项目制另有玩法；第 3 个样子要老板
  if (!payInd(s, ind, upCostOf(s, id), id, `升到 ${ind.level + 1} 级`, t, by)) return false;
  ind.level += 1; return true;
}
export function openBranch(s, id, t = Date.now(), by = '', city = CITY_CFG.hq) {
  const ind = s.inds[id]; const cfg = IND_BY_ID[id];
  if (!ind || whyNotBranch(s, id) || !cityOpen(s, city, t)) return false; // 新城市先注册分公司
  const cs = lineCities(s, id);
  if (!payInd(s, ind, branchCost(cfg, ind.branches, city, ind.level), id, `开第 ${ind.branches + 1} 家店（${cityName(city)}）`, t, by)) return false;
  ind.branches += 1; cs[city] = (cs[city] || 0) + 1; s.stats.maxStoreBranches = Math.max(s.stats.maxStoreBranches || 0, s.inds.store ? s.inds.store.branches : 0);
  return true;
}
/** 第一轮的派驻：现在就是任命店长 */
export function assign(s, id, secId) {
  s.positions = s.positions || {};
  for (const [k, v] of Object.entries(s.positions)) if (v === secId) delete s.positions[k];
  if (secId) s.positions['manager_' + id] = secId; else delete s.positions['manager_' + id];
  for (const x of Object.values(s.inds)) if (x.sec === secId) x.sec = null;
  if (s.inds[id]) s.inds[id].sec = secId || null;
}

/** 在线每秒 */
export function tickIncome(s, dt, secCfgById) {
  return runIncome(s, dt, secCfgById);
}
// 营收进公司账户、进货成本同时扣（都按秒攒着，定时写成流水），记进本月 / 本季累计
function runIncome(s, sec, secCfgById) {
  let g = 0;
  for (const id of Object.keys(s.inds)) {
    const rev = industryRevenue(s, id, secCfgById) * sec; const cogs = rev * cogsRate(s, id);
    // 店长这个月为你赚的（多出来的营收）和省的（少花的进货）
    const m = managerRevMult(s, id); if (m > 1) { const boost = ((s.flags && s.flags.indBoost && s.flags.indBoost[id]) || 0) + visionIncome(s); const st = stat(s, 'manager_' + id); st.gain += rev * (m - 1) / (m + boost); st.save += rev * baseCogs(s, id) - cogs; }
    accrue(s, 'rev_' + id, 'company', 'revenue', rev, `${IND_BY_ID[id].name}营业收入`);
    accrue(s, 'cogs_' + id, 'company', 'cogs', cogs, `${IND_BY_ID[id].name}进货`, 'out');
    track(s, id, rev, cogs); g += rev - cogs;
  }
  s.stats.earned = (s.stats.earned || 0) + g;
  return g;
}
/** 离线一段（不封顶，设计21）；长时间离开用 core/away.js 按游戏日一段段补算。返回 { sec, gain } */
export function offlineIncome(s, awaySec, secCfgById, t1 = s._now || Date.now()) {
  s._win = [t1 - awaySec, t1]; // 科技 / 传媒按时间一段段算（S 曲线、上映）
  const gain = runIncome(s, awaySec, secCfgById); delete s._win;
  return { sec: awaySec, gain, capped: false };
}

/** 能不能升称号：身价到线 + 收购了 TITLES[下一个].rival（每档不同：小老板 = 味道工坊、老板 = 恒远、企业家 = 华荣、大亨 = 天穹，设计21 第九节）
 *  旧档：第 10 项写的 s.flags.finalBeaten[title] 也算 */
export function promoteRival(s) { const next = TITLES[s.title + 1]; return next ? next.rival : null; }
export function canPromote(s) {
  const next = TITLES[s.title + 1];
  if (!next || next.rival === null) return false;
  const acq = s.flags.acquired || {};
  const beaten = next.rival ? !!acq[next.rival] : false;
  const old = !!(s.flags.finalBeaten && s.flags.finalBeaten[s.title]);
  return netWorth(s) >= next.need && (beaten || old);
}

// 资产的验资要看身价（避免互相 import）
import { setNetWorthFn } from './assets.js?v=1236a42d';
setNetWorthFn(netWorth); setNW(netWorth);
