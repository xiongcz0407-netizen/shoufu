// 经济：产钱、升级、分店、派驻、身价、离线收益（纯函数，node 测试能跑）
import { YEAR_MS } from './gametime.js?v=701a82d3'; // V0.2.10 一个月 = 现实 12 小时
import { whyCushion } from './cashflow.js?v=701a82d3'; // V0.2.3 留够两个月工资（设计35）
import { INDUSTRIES, IND_BY_ID, SEC_BONUS_PER_POINT, BRANCH_CAP, LOOK3_TITLE } from '../config/industries.js?v=701a82d3';
import * as CB from './calib.js?v=701a82d3';
import CAP from '../config/capital.json?v=701a82d3' with { type: 'json' };
import { TITLES } from '../config/titles.js?v=701a82d3';
import { pay, receive, accrue, canPay } from './ledger.js?v=701a82d3';
import { staffFactor, staffUp, PAY, estTotal } from './staff.js?v=701a82d3';
import { track } from './companytax.js?v=701a82d3';
import { payables } from './accrual.js?v=701a82d3';
import { visionIncome } from './boss.js?v=701a82d3';
import { managerRevMult, managerCostMult, stat } from './posts.js?v=701a82d3';
import { reValue } from './realestate.js?v=701a82d3';
import { logiRevPerSec, linkCogsMult, fleetValue } from './logistics.js?v=701a82d3';
import { techRevPerSec, techLink } from './tech.js?v=701a82d3';
import { liveRevPerSec, mediaLink } from './media.js?v=701a82d3';
import { lineK, lineCities, cityOpen, cityK, cityName, CITY_CFG, canOpenIn, roomCities, pickCity, registerCity, cityCap, cityCount } from './cities.js?v=701a82d3';
import { revK, debt } from './rivalry.js?v=701a82d3';
import { depositTotal, loanDebt, setNW } from './bank.js?v=701a82d3';
import { equityOwed } from './equity.js?v=701a82d3';

/** 存档里的产业：{ store: { level, branches, spent, sec, staff, agency, openedAt } } */
export function newIndustry(t = Date.now()) { return { level: 1, branches: 1, spent: 0, sec: null, staff: {}, agency: {}, openedAt: t }; }

const MONTH_SEC = YEAR_MS / 12 / 1000; // 游戏一个月的秒数（跟 gametime.json yearHours 走）
/** 升级费：门店三条线按真实经济（core/calib.js，升级是每家店都升，乘家数）；别的线照旧 */
export const upgradeCost = (cfg, level, branches = 1) => cfg.retail ? Math.ceil(CB.upCostPerStore(cfg, level) * Math.max(1, branches)) : Math.ceil(cfg.upCost * Math.pow(cfg.upGrow, level - 1));
/** 开分店费：门店 = 单店投资（现在的样子）× 城市系数（设计92 起不随家数涨）；物流照旧 */
export const branchCost = (cfg, branches, city, level = 1) => branches === 0 && cfg.firstCost ? cfg.firstCost /* V0.2.1 第一家摊位 1 万 */ : cfg.retail ? Math.ceil(CB.branchCostAt(cfg, level, branches, city ? cityK(city) : 1)) : Math.ceil(cfg.branchCost * Math.pow(cfg.branchGrow, branches - 1) * (city ? cityK(city) : 1)); // 开店费乘城市系数
export const upCostOf = (s, id) => upgradeCost(IND_BY_ID[id], s.inds[id].level, s.inds[id].branches);
export const brCostOf = (s, id, city) => Math.ceil(branchCost(IND_BY_ID[id], s.inds[id].branches, city === undefined && IND_BY_ID[id].retail ? pickCity(s, id) : city, s.inds[id].level) * meetBr(s, id)); // V2-13 经营会「扩张」打折；设计92：门店不指定城市 = 自动挑的那个城市
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
/** V2-08 选址（开发2，core/sites.js 挂进来）：每家分店按铺位的营业额系数（整条线平均）；开分店成功后记铺位 */
let siteRev = () => 1, siteOpen = null;
/** V2-05 商战抢份额（core/war.js 挂进来）：这条线这个月营收 +2% × 赢的回合数；估值不算 */
let warRev = () => 1; export const setWarHook = (fn) => { warRev = fn; }; const warK = (s, id) => (VALUE_MODE ? 1 : warRev(s, id));
/** V2-13 每周经营会（开发2，core/meeting.js 挂进来）：这一周的营业额加成（估值时 VALUE_MODE 不算）、开分店的钱打折 */
let meetRev = () => 1, meetBr = () => 1;
export const setMeetingHooks = (rev, br) => { meetRev = rev; meetBr = br; };
export const setSiteHooks = (rev, open) => { siteRev = rev; siteOpen = open; };
/** 一个产业每秒的营业收入（毛的，按在岗 / 编制打折） */
let lateRev = () => 1; export const setLateHook = (fn) => { lateRev = fn; }; // V3-01 后期不挂机（core/late.js）：老板起全公司经营倍数
/** 经营倍数作用在利润上：营业额加 (倍数 − 1) × 净利 ÷ (1 − 进货占比)，这样净利正好 × 倍数（门店按真实经济的净利率，别的线按 0.3 估） */
function lateK(s, id) { const m = lateRev(s, VALUE_MODE); if (m === 1) return 1; const cfg = IND_BY_ID[id]; const ind = s.inds[id]; let share = 0.3;
  if (cfg.retail && ind) { const rv = CB.gameRev(cfg, ind.level), c = CB.cogsAt(cfg, ind.level); if (rv > 0 && c < 1) share = Math.max(0.05, Math.min(1, CB.gameNet(cfg, ind.level) / (rv * (1 - c)))); }
  else { const sh = s.late && s.late.share && s.late.share[id]; share = sh != null ? sh : 0.05; } /* 别的线按实际净利率（core/late.js 每天算一次），没算过按 5% 保守 */
  return Math.max(0, 1 + (m - 1) * share); }
export function industryRevenue(s, id, secCfgById) { const r = industryRevenue0(s, id, secCfgById); return r ? r * meetRev(s, id, VALUE_MODE) * lateK(s, id) : r; } // V2-13 经营会加成
function industryRevenue0(s, id, secCfgById) {
  const ind = s.inds[id]; const cfg = IND_BY_ID[id];
  if (!ind || !cfg) return 0;
  const boost = ((s.flags && s.flags.indBoost && s.flags.indBoost[id]) || 0) + visionIncome(s) + techLink(s) + mediaLink(s, id); // 有科技：管理效率 +3%；有传媒：服装餐饮广告 +5% // 收购对手给的加成 + 老板眼光（替换原来的豪宅加成）
  if (cfg.kind === 'media') return liveRevPerSec(s) * (managerRevMult(s, id) + boost) * (staffFactor(s, id) > 0 ? 1 : 0); // 传媒：直播按主播人头（投拍另结）
  if (cfg.kind === 'product') return techRevPerSec(s) * (managerRevMult(s, id) + boost) * (staffFactor(s, id) > 0 ? 1 : 0) * warK(s, id); // 科技：按上线产品；人手已经算在人效上限里，只留缺一半停业
  if (cfg.kind === 'scale') return logiRevPerSec(s) * revK(s, id, lineCities(s, id)) * (managerRevMult(s, id) + boost) * staffFactor(s, id) * warK(s, id); // 物流：按人头和车，乘城市系数
  if (!cfg.retail) return 0; // 地产：项目制，回款另算
  return CB.gameRev(cfg, ind.level) / MONTH_SEC * ind.branches * revK(s, id, lineCities(s, id)) * (managerRevMult(s, id) + boost) * staffFactor(s, id) * mgRev(s, id) * siteRev(s, id) * warK(s, id); // 真实经济（core/calib.js）；城市系数：广州客单价低
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
/** V0.2.5 广告价格用：这条线现在每秒营业额的底子（不算当天临时加成，估值口径） */
export function steadyRevenue(s, id) { VALUE_MODE = true; try { return industryRevenue(s, id); } finally { VALUE_MODE = false; } }
export function steadyCogs(s, id) { VALUE_MODE = true; try { return cogsRate(s, id); } finally { VALUE_MODE = false; } }
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

// ---------- V2-12 前置条件（设计31）：按现在的分店数现算，只管新开；老档已开的线、分店不收回 ----------
const RETAIL = INDUSTRIES.filter((c) => c.retail).map((c) => c.id);
export const branchesOf = (s, id) => (s.inds[id] ? s.inds[id].branches || 0 : 0);
export const retailTotal = (s) => RETAIL.reduce((a, id) => a + branchesOf(s, id), 0);
/** 条件现在的数和要的数 */
export function needProgress(s, need) {
  if (!need) return null;
  return need.retailTotal ? { cur: retailTotal(s), n: need.retailTotal } : { cur: branchesOf(s, need.line), n: need.n };
}
export const needMet = (s, need) => { if (s.flags && s.flags.noNeed) return true; /* 只给老测试用：跳过前置条件 */ const p = needProgress(s, need); return !p || p.cur >= p.n; };
const unit = (need) => (need.line === 'logistics' ? '个网点' : '家');
/** 条件的说法：「便利店开到 3 家」「三种门店加起来 20 家」 */
export const needName = (need) => (need.retailTotal ? `三种门店加起来 ${need.retailTotal} 家` : `${IND_BY_ID[need.line].name}开到 ${need.n} ${unit(need)}`);
/** 设计58：条件现在几家、要几家，主语放前面：{ who: '便利店现在 1 家', n: '3 家' } */
export function needNow(s, need) {
  const p = needProgress(s, need); const u = need.retailTotal ? '家' : unit(need);
  return { who: `${need.retailTotal ? '三种门店加起来' : IND_BY_ID[need.line].name}现在 ${p.cur} ${u}`, n: `${p.n} ${u}`, total: !!need.retailTotal };
}
/** 不够时的提示（设计58）：「便利店现在 1 家，开到 3 家才能开第一家服装店」「三种门店加起来现在 12 家，到 20 家才能开物流」 */
export function whyNeed(s, id, which) {
  const cfg = IND_BY_ID[id]; const need = cfg[which]; if (needMet(s, need)) return null; const w = needNow(s, need);
  const what = which === 'needBranch' ? `开${cfg.name}分店` : cfg.retail ? `开第一家${cfg.name}店` : `开${cfg.name}`;
  return `${w.who}，${w.total ? '到' : '开到'} ${w.n}才能${what}`;
}
/** 设计58：还没开的线（餐饮、服装这种空着起步的，0 家） */
export const notOpened = (s, id) => !!(IND_BY_ID[id] && IND_BY_ID[id].startEmpty && s.inds[id] && !(s.inds[id].branches > 0));
export const isUnlocked = (s, id) => s.title >= IND_BY_ID[id].unlockTitle || !!(s.flags && s.flags.earlyUnlock && s.flags.earlyUnlock[id]);

export function unlockIfReady(s) {
  for (const cfg of INDUSTRIES) if (!s.inds[cfg.id] && isUnlocked(s, cfg.id) && (cfg.startEmpty || needMet(s, cfg.needFirst) || (s.flags && s.flags.earlyUnlock && s.flags.earlyUnlock[cfg.id]))) { /* V2-12：物流、地产、科技、传媒要前置条件才出现（收购提前解锁的不管）；餐饮、服装是空的线，开第一家时再看 */ s.inds[cfg.id] = newIndustry(s._t); if (cfg.kind === 'project' || cfg.startEmpty) s.inds[cfg.id].branches = 0; else staffUp(s, cfg.id); if (cfg.needFirst && !cfg.startEmpty) s.inds[cfg.id].fresh = true; /* V2-12：前置条件刚满足出现的，秘书说一句后清掉 */ } // 摆摊：0 家，自己花钱开第一家 // 地产：拿到地才组项目公司
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
export function whyNotBranch(s, id) { const ind = s.inds[id]; if (!ind || ['project', 'product', 'media'].includes(IND_BY_ID[id].kind)) return '这条线不开分店'; if (ind.branches >= maxBranches(s, id)) return ind.branches >= IND_BY_ID[id].maxBranch ? '分店满了' : `现在最多 ${maxBranches(s, id)} 家（升称号能多开）`; if (IND_BY_ID[id].retail && !roomCities(s, id).length) return '每个城市都开满了'; /* 设计92 */ return whyNeed(s, id, ind.branches ? 'needBranch' : 'needFirst'); }
/** V0.2.3 升级带口碑（core/manage.js 挂进来） */
/** V0.2.5 升级框（core/upbuild.js 挂进来）：升之前拍一张快照，升完按快照写「前 → 后」 */
let upSnap = () => null, upDone = () => {}; export const setUpNoteHooks = (snap, done) => { upSnap = snap; upDone = done; };
let upHook = () => {}; export const setUpgradeHook = (fn) => { upHook = fn; };
export function upgrade(s, id, t = Date.now(), by = '') {
  const ind = s.inds[id]; if (!ind || whyNotUpgrade(s, id)) return false; // 项目制另有玩法；第 3 个样子要老板
  if (whyCushion(s, upCostOf(s, id))) return false; /* V0.2.3 留够两个月工资（设计35） */
  const snap = upSnap(s, id); if (!payInd(s, ind, upCostOf(s, id), id, `升到 ${ind.level + 1} 级`, t, by)) return false;
  ind.level += 1; upHook(s, id); upDone(s, id, 'lv', snap, by, t); return true; /* V0.2.5 升级框（设计37 第三节） */
}
/** 设计92：门店线在这个城市不能开的原因（开满了）；不是门店线 / 能开 = null */
export function whyNotCity(s, id, city) {
  if (!IND_BY_ID[id] || !IND_BY_ID[id].retail || canOpenIn(s, id, city)) return null;
  return `${cityName(city)}已开满 ${cityCap(city)} 家`;
}
/** 开分店。city 不给：门店线自动挑没开满、系数高的城市（托管、秘书、自动玩都走这里；那个城市还没分公司就先注册），别的线开在总部 */
export function openBranch(s, id, t = Date.now(), by = '', city = null) {
  const ind = s.inds[id]; const cfg = IND_BY_ID[id];
  if (!ind || whyNotBranch(s, id)) return false;
  const auto = city == null; if (auto) city = cfg.retail ? pickCity(s, id, t) : CITY_CFG.hq;
  if (!city || whyNotCity(s, id, city)) return false; /* 设计92：这个城市开满了 */
  const cost = Math.ceil(branchCost(cfg, ind.branches, city, ind.level) * meetBr(s, id)); // V2-13 扩张打折；V2-08：开店费记进分店记录
  if (whyCushion(s, cost)) return false; /* V0.2.3 留够两个月工资 */
  if (!cityOpen(s, city, t)) { if (!auto || !registerCity(s, city, t, by).ok || !cityOpen(s, city, t)) return false; } // 新城市先注册分公司（手动开要先在界面上注册）
  const cs = lineCities(s, id);
  const snap = upSnap(s, id); if (!payInd(s, ind, cost, id, `开第 ${ind.branches + 1} 家店（${cityName(city)}）`, t, by)) return false;
  ind.branches += 1; cs[city] = (cs[city] || 0) + 1; s.stats.maxStoreBranches = Math.max(s.stats.maxStoreBranches || 0, s.inds.store ? s.inds.store.branches : 0);
  if (siteOpen) siteOpen(s, id, city, t, cost); // V2-08 记铺位（core/sites.js）
  upDone(s, id, 'br', snap && { ...snap, city: cityName(city), cityCode: city }, by, t); /* V0.2.5 升级框 */
  return true;
}
/** 第一轮的派驻：现在就是任命店长 */
export function assign(s, id, secId) {
  if (secId && notOpened(s, id)) return false; /* 设计58：还没开店不能派店长 */
  s.positions = s.positions || {};
  for (const [k, v] of Object.entries(s.positions)) if (v === secId) delete s.positions[k];
  if (secId) s.positions['manager_' + id] = secId; else delete s.positions['manager_' + id];
  for (const x of Object.values(s.inds)) if (x.sec === secId) x.sec = null;
  if (s.inds[id]) s.inds[id].sec = secId || null;
}

/** 在线每秒 */
/** 设计40 收益流水（开发2 core/flow.js 挂）：在线每秒每条线 fn(s, id, rev, cogs, sec)；离线结算不调 */
let INCOME_HOOK = null;
export const setIncomeHook = (fn) => { INCOME_HOOK = fn; };
export function tickIncome(s, dt, secCfgById) {
  return runIncome(s, dt, secCfgById, INCOME_HOOK);
}
// 营收进公司账户、进货成本同时扣（都按秒攒着，定时写成流水），记进本月 / 本季累计
function runIncome(s, sec, secCfgById, hook = null) {
  let g = 0;
  for (const id of Object.keys(s.inds)) {
    const rev = industryRevenue(s, id, secCfgById) * sec; const cogs = rev * cogsRate(s, id);
    // 店长这个月为你赚的（多出来的营收）和省的（少花的进货）
    const m = managerRevMult(s, id); if (m > 1) { const boost = ((s.flags && s.flags.indBoost && s.flags.indBoost[id]) || 0) + visionIncome(s); const st = stat(s, 'manager_' + id); st.gain += rev * (m - 1) / (m + boost); st.save += rev * baseCogs(s, id) - cogs; }
    accrue(s, 'rev_' + id, 'company', 'revenue', rev, `${IND_BY_ID[id].name}营业收入`);
    accrue(s, 'cogs_' + id, 'company', 'cogs', cogs, `${IND_BY_ID[id].name}进货`, 'out');
    track(s, id, rev, cogs); g += rev - cogs;
    if (hook) hook(s, id, rev, cogs, sec); // 设计40 收益流水（开发2）
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

/** 能不能升称号：身价到线 + 收购了 TITLES[下一个].rival（每档不同：小老板 = 味道工坊、老板 = 恒远、企业家 = 华荣、商界名流 = 天穹，设计21 第九节）
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
import { setNetWorthFn } from './assets.js?v=701a82d3';
setNetWorthFn(netWorth); setNW(netWorth);
