// P-05 前期核心玩法·经营（设计25 第一、三节）：老板精力、每家店四个亲自经营动作（可带秘书）、口碑、店长 / 秘书自动经营、大盘行情、老板以后的大事
// 「店」= 一条门店线（便利店 / 餐饮 / 服装）；营业额、进货的加成通过 economy.setManageHooks 挂进去
import { credit } from './credit.js?v=d69b03f5'; // V3-01 亲自拍板攒投入度
import M from '../config/manage.json?v=d69b03f5' with { type: 'json' };
import AD from '../config/ads.json?v=d69b03f5' with { type: 'json' }; // V0.2.5 口碑底线 = 广告升的口碑
import { IND_BY_ID } from '../config/industries.js?v=d69b03f5';
import { SEC_BY_ID } from '../config/secretaries.js?v=d69b03f5';
import { YEAR_MS, MONTH_MS } from './gametime.js?v=d69b03f5';
import { industryRevenue, setManageHooks } from './economy.js?v=d69b03f5';
import { setRateAdjFn } from './bank.js?v=d69b03f5';
import { pay, receive, canPay } from './ledger.js?v=d69b03f5';
import { holder, isSec, attrs } from './posts.js?v=d69b03f5';
import { bossAttrs } from './boss.js?v=d69b03f5';
import { addFavor, dayKey } from './affection.js?v=d69b03f5';
import { isTraining } from './training.js?v=d69b03f5';
import { mark, energyBonus, onReward } from './goals.js?v=d69b03f5'; // P-06 目标链（开发2）：做到了打勾、精力上限、奖励
import { wage } from './staff.js?v=d69b03f5';

export { M as MANAGE_CFG };
export const DAY_MS = YEAR_MS / M.daysPerYear;
const DAY_SEC = DAY_MS / 1000;
const r2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const dayIndex = (s, t) => Math.floor((t - s.createdAt) / DAY_MS);
const dayEnd = (s, t) => s.createdAt + (dayIndex(s, t) + 1) * DAY_MS;

/** s.mg = { e 精力, eAt, t（最近一次的时间，给营业额挂钩用）, lines: { id: { rep, act: { 动作: 第几天 }, fx: [{ rev, cogs, margin, until }], care, decay } }, prepaid: [], rate, big: {}, day } */
export function mg(s, t) {
  const g = (s.mg = s.mg || { e: M.energy.max, eAt: t != null ? t : s.createdAt, lines: {}, prepaid: [], big: {}, extraMax: 0 });
  if (t != null && (!g.t || t > g.t)) g.t = t;
  return g;
}
export const isShop = (id) => !!(IND_BY_ID[id] && IND_BY_ID[id].retail);
export function line(s, id) {
  const g = mg(s); const L = (g.lines[id] = g.lines[id] || { rep: M.rep.start, act: {}, fx: [], care: null, decay: null, trafLv: 0, repLv: 0 });
  if (L.repLv == null) migrateLv(s, id, L); return L;
}
/** V0.2.5 老存档（设计37 第二节 7）：口碑按 5 往下取整当口碑等级（最低 50）；知名度 X → 人流 X ÷ 100 × 25% 往下取到 5% */
function migrateLv(s, id, L) {
  L.repLv = Math.max(0, Math.min(AD.rep.max, Math.floor((L.rep || 0) / AD.rep.step) - AD.rep.start / AD.rep.step)); L.rep = Math.max(L.rep || 0, AD.rep.start + L.repLv * AD.rep.step);
  const aw = (s.ads && !s.ads.v26 && s.ads.lines && s.ads.lines[id] && s.ads.lines[id].aware) || 0; L.trafLv = Math.min(AD.traffic.max, Math.floor(aw / 100 * 5 + 1e-9));
}
// ---------- 精力 ----------
/** 设计39 第一节：每天的精力按称号（150 / 200 / 250）+ 目标链永久加的 */
export const energyMax = (s) => M.energy.byTitle[Math.min(M.energy.byTitle.length - 1, s.title || 0)] + ((s.mg && s.mg.extraMax) || 0) + energyBonus(s);
export const E_COST = M.energy;
/** 现在的精力：每天 0 点（手机本地时间）回满到上限，中间不回复；喝药水多出来的不清掉 */
export function energy(s, t) {
  const g = mg(s, t); const k = dayKey(t != null ? t : Date.now());
  if (g.eDay !== k) { g.eDay = k; g.e = Math.max(g.e || 0, energyMax(s)); }
  return g.e;
}
function spend(s, n, t) { const e = energy(s, t); if (e < n - 1e-9) return false; const g = mg(s, t); g.e = e - n; g.eAt = t; return true; }
/** 精力药水（开发2 的道具挂这里）：+n，可以超过上限 */
export const addEnergy = (s, n, t) => { energy(s, t); mg(s, t).e += n; };
/** 精力不够就写「精力不够」（Arvin：不写要多少、还剩多少）；够就 null */
export const whyEnergy = (s, n, t) => (energy(s, t) < n - 1e-9 ? '精力不够' : null);
/** 事件选项要花精力：够就花 */
export const doEnergy = (s, n, t) => spend(s, n, t);
export const addEnergyMax = (s, n) => { mg(s).extraMax = (mg(s).extraMax || 0) + n; };

// ---------- 口碑、加成（营业额挂钩） ----------
export const repK = (rep) => 1 + clamp((rep - 50) * M.rep.per, -M.rep.maxK, M.rep.maxK);
export const stars = (rep) => Math.max(0, Math.min(5, Math.round(rep / 20)));
const active = (s, f) => f.until > ((s.mg && s.mg.t) || 0);
/** 大盘：牛市 +3%、熊市 −3% */
export const marketK = (s) => { const k = s.mkt && s.mkt.regime && s.mkt.regime.kind; return 1 + (M.market[k] || 0); };
export const marketText = (s) => { const k = s.mkt && s.mkt.regime && s.mkt.regime.kind; return k === 'bull' ? '最近行情好，大家舍得花钱（营业额 +3%）' : k === 'bear' ? '最近行情差，大家捂紧钱包（营业额 −3%）' : ''; };
/** V0.2.5 广告人流（core/ads.js 挂进来，永久，估值也算） */
let adsHook = () => 1; export const setAdsHook = (fn) => { adsHook = fn; };
export function revMult(s, id, valueMode = false) {
  const L = s.mg && s.mg.lines[id]; let k = repK(L ? L.rep : M.rep.start) * marketK(s);
  if (L && !valueMode) for (const f of L.fx) if (f.rev && active(s, f)) k *= 1 + f.rev;
  return k * adsHook(s, id, valueMode); /* V0.2.5 广告人流 */
}
export function cogsAdj(s, id, valueMode = false) {
  const L = s.mg && s.mg.lines[id]; let k = 1, add = 0; if (!L) return [1, 0];
  for (const f of L.fx) { if (!active(s, f) || (valueMode && !f.perm)) continue; if (f.cogs) k *= 1 + f.cogs; if (f.margin) add += f.margin; }
  return [k, add];
}
setManageHooks(revMult, cogsAdj);
setRateAdjFn((s) => (s.mg && s.mg.rate && s.mg.rate.until > (s.mg.t || 0) ? s.mg.rate.adj : 0));
/** 这条线一天的营业额（按现在的样子，给动作、事件算金额） */
export const dayRev = (s, id) => industryRevenue(s, id) * DAY_SEC;
/** 设计39 第二节：亲自上阵 / 老板大事的效果管 6 小时（现实时间） */
export const ACT_MS = M.energy.actHours * 3600e3;
export function addFxFor(s, id, fx, t, ms) { const L = line(s, id); L.fx.push({ ...fx, until: t + ms, perm: false }); mg(s, t); }
export function addFx(s, id, fx, t, days = 0) {
  const L = line(s, id); const until = days >= 9999 ? Infinity : days ? s.createdAt + (dayIndex(s, t) + days) * DAY_MS : dayEnd(s, t);
  L.fx.push({ ...fx, until, perm: days >= 9999 }); mg(s, t);
}
/** V0.2.5（设计37 第二节 4）口碑底线 = 广告升上去的口碑（50 + 每级 5），永远不掉；店铺升级不再加口碑 */
export const repFloor = (s, id) => AD.rep.start + (line(s, id).repLv || 0) * AD.rep.step;
export const addRep = (s, id, n) => { const L = line(s, id); L.rep = clamp(L.rep + n, repFloor(s, id), 100); /* 扣口碑最多扣到底线 */ if (L.rep >= 60) mark(s, 'rep60'); };

// ---------- 亲自经营 ----------
export const personalMax = (s) => M.personalLines[Math.min(M.personalLines.length - 1, s.title || 0)];
export const halfK = (s) => ((s.title || 0) >= M.bigHalfFrom ? 0.5 : 1);   // 老板以后效果减半
const todayLines = (s, t) => Object.entries((s.mg && s.mg.lines) || {}).filter(([, L]) => Object.values(L.act).includes(dayIndex(s, t))).map(([id]) => id);
export function whyNot(s, id, act, t, secId = null) {
  const A = M.actions[act]; if (!A) return '没有这个动作';
  if (!isShop(id) || !s.inds[id] || !s.inds[id].branches) return '只有门店能亲自上阵';
  const left = actLeft(s, id, act, t); if (left > 0) return `生效中 · 还剩 ${durText(left)}`; /* 设计39：去掉「每个动作一天一次」，生效中到期才能再点 */
  { const w = whyEnergy(s, A.energy, t); if (w) return w; }
  if (secId && (!s.secs[secId] || isTraining(s, secId))) return '上课中的秘书不能带';
  return null;
}
/** 这个动作还生效多久（毫秒，0 = 没在生效） */
export const actLeft = (s, id, act, t) => { const L = s.mg && s.mg.lines[id]; const u = L && L.on && L.on[act]; return u && u > t ? u - t : 0; };
const durText = (ms) => { const m = Math.ceil(ms / 60e3); const hh = Math.floor(m / 60); return hh ? `${hh} 小时${m % 60 ? ` ${m % 60} 分` : ''}` : `${m} 分`; };
export const ACT_KEYS = Object.keys(M.actions);
/** 按钮上写的：「搞促销 · 6 小时 · 5 精力」 */
export const actBtnText = (act) => `${M.actions[act].name} · ${M.energy.actHours} 小时 · ${M.actions[act].energy} 精力`;
/** 做一个动作：返回 { ok, text, ... }。secId 陪同的秘书（她的对应属性加成、好感 +1）；rnd 给测试 */
export function doAct(s, id, act, t, secId = null, rnd = Math.random) {
  const why = whyNot(s, id, act, t, secId); if (why) return { ok: false, why };
  const A = M.actions[act]; const L = line(s, id); spend(s, A.energy, t); L.act[act] = dayIndex(s, t); L.care = dayIndex(s, t);
  if (secId) addFavor(s, secId, 1);
  const r = applyAct(s, id, act, t, secId, rnd); if (!r.ok) { mg(s, t).e += A.energy; return r; }
  mark(s, 'act'); credit(s, 'act', 1, t); return r;
}
/** 动作的效果（亲自做、自动上阵共用）：管 6 小时 */
function applyAct(s, id, act, t, secId, rnd = Math.random) {
  const A = M.actions[act]; const L = line(s, id); const K = M.actK != null ? M.actK : 1;
  const sa = secId ? (attrs(s, secId)[A.attr] || 0) : 0; const nb = Math.max(1, s.inds[id].branches); const h = halfK(s) / nb * K; /* 亲自上阵管的是其中一家店：这条线开了 N 家，效果按 1/N 摊到整条线上 */ const name = IND_BY_ID[id].name; const dr = dayRev(s, id);
  const q = clamp(0.5 * rnd() + 0.5 * Math.min(1, sa / 100), 0, 1); const who = secId ? `${SEC_BY_ID[secId].name}陪着去的，` : '';
  const fx = (f) => addFxFor(s, id, { ...f, act }, t, ACT_MS); const hrs = `${M.energy.actHours} 小时`;
  let text = '';
  if (act === 'bargain') {
    const v = bossAttrs(s).vision || 0; const qq = clamp((v + sa) / 150, 0, 1); const pct = (A.cogs[0] + (A.cogs[1] - A.cogs[0]) * qq) * h;
    fx({ cogs: -pct }); text = `${who}凌晨去了批发市场，${name}之后 ${hrs}进货砍下来 ${(pct * 100).toFixed(1)}%。${pct > 0.06 ? '老王说下次别来了。' : '老王说老板实在人。'}`;
  } else if (act === 'promo') {
    const k = (A.rev[0] + (A.rev[1] - A.rev[0]) * q) * h; fx({ rev: k, margin: A.margin * h }); addRep(s, id, A.rep);
    text = `${who}${name}${nb > 1 ? `（${nb} 家里你亲自盯的那家）` : ''}第二件半价，之后 ${hrs}整条线营业额 +${(k * 100).toFixed(1)}%，毛利少 ${(A.margin * h * 100).toFixed(1)} 个点，口碑 +${+(A.rep / nb).toFixed(2)}。`;
  } else if (act === 'newitem') {
    const cost = r2(dr * A.pay); if (cost > 0 && !canPay(s, 'company', cost)) return { ok: false, why: `公司账户不够付进货款 ${Math.round(cost)}` };
    if (cost > 0) pay(s, { wallet: 'company', cat: 'cogs', amount: cost, party: '供应商', note: `亲自上阵：${name}上新品进货款` }, t);
    const hit = rnd() < A.hitP; const k = ((hit ? A.hitRev : A.rev[0] + (A.rev[1] - A.rev[0]) * q)) * h; fx({ rev: k });
    text = hit ? `${who}${name}上的网红零食成了爆款！之后 ${hrs}营业额 +${(k * 100).toFixed(1)}%。` : `${who}${name}换了货架、上了新品，之后 ${hrs}营业额 +${(k * 100).toFixed(1)}%。`;
  } else if (act === 'member') {
    addRep(s, id, A.rep / nb); fx({ rev: A.rev[0] * h });
    const amt = r2(dr * A.prepaid * h); if (amt > 0) prepaidIn(s, id, amt, t, '会员卡');
    text = `${who}${name}拉了个熟客群、发了会员卡，口碑 +${+(A.rep / nb).toFixed(2)}，预收 ${Math.round(amt)} 元（之后 ${A.prepaidDays} 天消费冲掉）。`;
  }
  (L.on = L.on || {})[act] = t + ACT_MS;
  return { ok: true, text, act, line: id };
}
/** 设计39 第二节 自动上阵（金券买，开发2 扣金券以后调这个）：这条线 4 个动作到期自动续、不花精力，按当店长的秘书算效果 */
export function buyAutoAct(s, id, days, t) { const L = line(s, id); if (!(L.autoUntil > t)) L.autoFrom = t; L.autoUntil = Math.max(t, L.autoUntil || 0) + days * 86400e3; L.autoWarned = L.autoUntil - t <= 86400e3 + 1; /* 只买 1 天的不用提醒 */ return L.autoUntil; }
/** 设计39：自动券存在 s.items.auto（开发2 卖、送）；用一张 = 这条线自动上阵 1 天，生效中再用接在后面 */
export const autoTickets = (s) => (s.items && s.items.auto) || 0;
export function useAutoTicket(s, id, t) { if (!autoTickets(s)) return { ok: false, why: '没有自动券' }; if (!isShop(id) || !s.inds[id] || !s.inds[id].branches) return { ok: false, why: '只有门店能自动上阵' }; s.items.auto -= 1; buyAutoAct(s, id, 1, t); tickAutoAct(s, t); return { ok: true, left: autoActLeft(s, id, t) }; }
/** 「1 天 5 小时」「5 小时」 */
export const leftText = (ms) => { const h = Math.ceil(ms / 3600e3); const d = Math.floor(h / 24); return d ? `${d} 天${h % 24 ? ` ${h % 24} 小时` : ''}` : `${h} 小时`; };
export const autoActLeft = (s, id, t) => { const L = s.mg && s.mg.lines[id]; return L && L.autoUntil > t ? L.autoUntil - t : 0; };
/** 到期的动作补上（离线也按到期那一刻补）；到期前一天提醒一次 */
export function tickAutoAct(s, t) {
  for (const id of Object.keys((s.mg && s.mg.lines) || {})) {
    const L = s.mg.lines[id]; if (!L.autoUntil || !s.inds[id] || !s.inds[id].branches) continue;
    const who = holder(s, 'manager_' + id); const sec = isSec(who) && !isTraining(s, who) ? who : null;
    for (const act of ACT_KEYS) { let at = Math.max((L.on && L.on[act]) || 0, L.autoFrom || 0); if (!at || at < t - 400 * ACT_MS) at = t; for (let k = 0; k < 400 && at <= t && at < L.autoUntil; k++) { applyAct(s, id, act, at, sec); at = L.on[act]; } }
    if (!L.autoWarned && L.autoUntil > t && L.autoUntil - t < 86400e3) { L.autoWarned = true; AUTO_WARN(s, id, L.autoUntil, t); }
    if (L.autoUntil <= t) { delete L.autoUntil; delete L.autoFrom; }
  }
}
/** 今日日常（开发2 setRoutineHooks.actions）：「便利店 4 个生效中、餐饮自动上阵中、服装 2 个已到期」 */
export function actionsText(s, t) {
  const out = [];
  for (const id of Object.keys(s.inds || {})) { if (!isShop(id) || !s.inds[id].branches) continue; const nm = IND_BY_ID[id].name;
    if (autoActLeft(s, id, t)) { out.push(`${nm}自动上阵中`); continue; }
    const on = ACT_KEYS.filter((k) => actLeft(s, id, k, t) > 0).length; out.push(on === ACT_KEYS.length ? `${nm} ${on} 个生效中` : on ? `${nm} ${on} 个生效中、${ACT_KEYS.length - on} 个已到期` : `${nm} 没上阵`); }
  return out.join('、');
}
let AUTO_WARN = () => {}; export const setAutoActWarn = (fn) => { AUTO_WARN = fn; }; // 首页提醒（开发2 / main.js 挂）
/** 预收账款：现在收钱，之后 N 天按消费冲掉（那几天这部分营业额没有现金进来） */
export function prepaidIn(s, id, amt, t, what) {
  receive(s, { wallet: 'company', cat: 'prepaid', amount: amt, party: '顾客', note: `${IND_BY_ID[id].name}${what}预收（之后 ${M.actions.member.prepaidDays} 个游戏天按消费冲掉）` }, t);
  mg(s).prepaid.push({ id, left: amt, per: r2(amt / M.actions.member.prepaidDays), day: dayIndex(s, t) });
}

/** 提前备货（经营事件「多订一批」「备货」）：现在付货款，之后 N 天这批货卖掉，那几天少进同样多的货（进货成本冲回） */
export function stockIn(s, id, amt, t, days = 3) {
  if (!id || !(amt > 0)) return; (mg(s).stock = mg(s).stock || []).push({ id, left: r2(amt), per: r2(amt / days), day: dayIndex(s, t) });
}
/** 每个游戏天开始时要做的（进货挑品 core/pick.js 挂进来）：fn(s, 第几天, 那天开始的时间) → 结果句子 */
const DAY_HOOKS = []; export const onDay = (fn) => DAY_HOOKS.push(fn);
// ---------- 老板以后：精力花在大事上 ----------
export function whyNotBig(s, key, t, id = null) {
  const B = M.big[key]; if (!B) return '没有这件事';
  { const w = whyEnergy(s, B.energy, t); if (w) return w; }
  if ((key === 'battle' || key === 'deal') && mg(s).big[key]) return '已经准备好了，等下一次用上';
  if ((key === 'inspect' || key === 'supplier') && (!id || !s.inds[id] || !s.inds[id].branches)) return '选一条产业线';
  if (key === 'inspect' && actLeft(s, id, 'big_inspect', t) > 0) return `生效中 · 还剩 ${durText(actLeft(s, id, 'big_inspect', t))}`;
  if (key === 'supplier' && line(s, id).act.big_supplier === dayIndex(s, t)) return '今天去过了';
  return null;
}
export function doBig(s, key, t, id = null) {
  const why = whyNotBig(s, key, t, id); if (why) return { ok: false, why }; const B = M.big[key]; spend(s, B.energy, t);
  if (key === 'battle' || key === 'deal') { mg(s).big[key] = true; return { ok: true, text: key === 'battle' ? `下一场商战你亲自带队，胜率 +${B.win * 100}%` : `下一次收购或融资你亲自谈，价钱好 ${B.better * 100}%` }; }
  const L = line(s, id); L.act['big_' + key] = dayIndex(s, t); L.care = dayIndex(s, t); if (key === 'inspect') (L.on = L.on || {}).big_inspect = t + ACT_MS;
  if (key === 'inspect') { addFxFor(s, id, { rev: B.profit * (M.actK != null ? M.actK : 1) }, t, ACT_MS); /* 设计39：到游戏天结束 → 6 小时 */ return { ok: true, text: `你去${IND_BY_ID[id].name}视察了一圈，大家干劲足，之后 ${M.energy.actHours} 小时营业额 +${+(B.profit * (M.actK != null ? M.actK : 1) * 100).toFixed(1)}%` }; }
  addFx(s, id, { cogs: -B.cogs }, t, B.days); return { ok: true, text: `你亲自见了${IND_BY_ID[id].name}的大供应商，${B.days} 天进货 −${B.cogs * 100}%` };
}
/** 商战 / 谈判用掉准备好的加成（battle.js、capital.js 调） */
export const bigBonus = (s, key) => (s.mg && s.mg.big && s.mg.big[key] ? (key === 'battle' ? M.big.battle.win : M.big.deal.better) : 0);
export const useBig = (s, key) => { if (s.mg && s.mg.big) delete s.mg.big[key]; };

// ---------- 店长 / 秘书自动经营、口碑掉、预收冲掉、利率新闻（每秒 / 离线按游戏天） ----------
/** 自动经营效果：店长（员工里的店长，或者这条线的店长职位）= 30% + 管理 / 200；店长是秘书再 +（她的管理 / 2）% */
export function autoEff(s, id) {
  const who = holder(s, 'manager_' + id); const hasMgr = who || ((s.inds[id].staff || {}).manager || 0) > 0; if (!hasMgr) return 0;
  const A = M.auto; const man = isSec(who) ? (attrs(s, who).manage || 0) : A.mgrManage;
  return (A.base + man / A.per) * (isSec(who) ? 1 + man / A.secPer : 1);
}
export function tickManage(s, t) {
  tickAutoAct(s, t); /* 设计39 自动上阵 */
  const g = mg(s, t); const d = dayIndex(s, t); const out = [];
  if (!(s.goals && s.goals.marks && s.goals.marks.manager) && Object.keys(s.inds).some((id) => holder(s, 'manager_' + id) || ((s.inds[id].staff || {}).manager || 0) > 0)) mark(s, 'manager');
  if (g.day == null) g.day = d;
  while (g.day < d) {
    g.day += 1; const at = s.createdAt + g.day * DAY_MS; g.t = at;
    for (const id of Object.keys(s.inds)) {
      if (!isShop(id) || !s.inds[id].branches) continue; const L = line(s, id); L.fx = L.fx.filter((f) => f.until > at);
      L.nb = s.inds[id].branches; /* V0.2.5：分店共享这条线的人流、口碑 */
      const e = autoEff(s, id);
      if (e > 0) addFx(s, id, { cogs: -(M.actions.bargain.cogs[0] + M.actions.bargain.cogs[1]) / 2 * e }, at); /* V0.2.5：店长不再加口碑（口碑交给广告） */
      const fl = repFloor(s, id); if (L.rep < fl) L.rep = fl;
      if (L.rep > fl && g.day - Math.max(L.care == null ? -Infinity : L.care, L.decay == null ? -Infinity : L.decay) >= M.rep.decayDays) { L.decay = g.day; L.rep = Math.max(fl, L.rep - 1); } /* 临时加的口碑每 3 天 −1 掉回底线 */
    }
    for (const p of g.prepaid) { if (p.left <= 0.01 || p.day >= g.day) continue; const a = Math.min(p.left, p.per); p.left = r2(p.left - a); pay(s, { wallet: 'company', cat: 'prepaid_used', amount: a, force: true, party: '顾客', note: `${IND_BY_ID[p.id].name}会员卡 / 储值卡消费冲预收（这部分营业额已经预收过）` }, at); }
    g.prepaid = g.prepaid.filter((p) => p.left > 0.01);
    for (const p of g.stock || []) { if (p.left <= 0.01 || p.day >= g.day) continue; const a = Math.min(p.left, p.per); p.left = r2(p.left - a); receive(s, { wallet: 'company', cat: 'cogs', amount: a, party: '库存', note: `${IND_BY_ID[p.id].name}提前备的货卖掉了，少进货（冲回进货成本）` }, at); }
    if (g.stock) g.stock = g.stock.filter((p) => p.left > 0.01);
    for (const fn of DAY_HOOKS) { const r = fn(s, g.day, at) || []; if (g.day === d) out.push(...r); } /* 离线补算的天不出提示，只出最后一天的 */
  }
  g.t = t;
  // 大盘降息 / 加息新闻 → 1 个游戏月贷款利率 ∓0.25 点
  const news = (s.mkt && s.mkt.news) || []; const seen = g.newsT || 0;
  for (const n of news) if ((n.t || 0) > seen) { if (/降息/.test(n.title)) { g.rate = { adj: -M.market.rateCut, until: t + M.market.rateDays * DAY_MS }; out.push('央行降息：之后 1 个游戏月贷款利率低 0.25 点'); } else if (/加息/.test(n.title)) { g.rate = { adj: M.market.rateCut, until: t + M.market.rateDays * DAY_MS }; out.push('央行加息：之后 1 个游戏月贷款利率高 0.25 点'); } }
  if (news.length) g.newsT = Math.max(seen, ...news.map((n) => n.t || 0));
  return out;
}
// 目标链奖励（P-06）：口碑 +n 给最近亲自经营的店；店长第一个月工资减半（退回半个月店长工资）
onReward('rep', (s, n, t) => { const ids = Object.keys(s.inds).filter((id) => isShop(id) && s.inds[id].branches); if (!ids.length) return; const id = ids.sort((a, b) => ((line(s, b).care ?? -1) - (line(s, a).care ?? -1)))[0]; addRep(s, id, n); });
onReward('mgrHalf', (s, n, t) => { mg(s).mgrHalf = t; const k = Object.values(s.inds).reduce((a, x) => a + ((x.staff || {}).manager || 0), 0); const amt = Math.round(k * wage('manager') / 2); if (amt > 0) receive(s, { wallet: 'company', cat: 'refund', amount: amt, party: '新手目标', note: '新手奖励：店长第一个月工资减半（退回半个月）' }, t); });
export const tip = (s) => M.tips[Math.min(M.tips.length - 1, s.title || 0)];
