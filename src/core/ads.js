// V0.2.5 广告 = 人流、口碑的永久升级（设计37 第二节定稿；作废 V0.2.3 / V0.2.4 的投放）。
// 每条门店线：人流等级 trafLv（每级营业额 +5%，最多 20 级）、口碑等级 repLv（每级口碑底线 +5，50 → 100）；存在 manage 的 line 上，分店共享，永久不掉。
// 每个称号能升到多高：人流 5 / 10 / 15 / 20 级，口碑 2 / 4 / 7 / 10 级。价格 = 这一级每月多赚的 ×（1 + 0.1 × 第几级），没有折扣。
// 店长托管「自动升级广告」（默认开）：钱够（留够两个月工资）就升，先升便宜的；外包经理人只升到 5 / 2 级。
import C from '../config/ads.json?v=ab0bf094' with { type: 'json' };
import { IND_BY_ID } from '../config/industries.js?v=ab0bf094';
import { TITLES } from '../config/titles.js?v=ab0bf094';
import { YEAR_MS } from './gametime.js?v=ab0bf094';
import * as MG from './manage.js?v=ab0bf094';
import { steadyRevenue, steadyCogs } from './economy.js?v=ab0bf094';
import { pay, canPay } from './ledger.js?v=ab0bf094';
import { holder, isSec, OUT } from './posts.js?v=ab0bf094';
import { cushionShort } from './cashflow.js?v=ab0bf094';
import { setAdsPayHook } from './accrual.js?v=ab0bf094';
import { addMsg } from './inbox.js?v=ab0bf094';
import { fmtMoney } from './format.js?v=ab0bf094';
import { noteUp, noteAuto } from './upnote.js?v=ab0bf094';
import { dayRevOf } from './upbuild.js?v=ab0bf094'; // V0.2.5 店铺升级、开分店的升级框挂进 economy

export { C as ADS_CFG };
export const CATS = ['traffic', 'rep'];
export const CAT_NAME = { traffic: '人流', rep: '口碑' };
const MONTH_SEC = YEAR_MS / 12 / 1000;
const tIdx = (s) => Math.min(3, s.title || 0);
export const isAdLine = (s, id) => MG.isShop(id) && !!s.inds[id] && s.inds[id].branches > 0;

/** s.ads = { v26, autoOff: { 线: true }, m: { 线: { traffic, rep, spent } } }；老存档（投放那套）进来先换算（等级换算在 manage.line 里做） */
export function ads(s) {
  if (s.ads && s.ads.v26) return s.ads;
  const old = (s.ads && s.ads.lines) || {}; for (const id of new Set([...Object.keys(old), ...Object.keys((s.mg && s.mg.lines) || {})])) if (MG.isShop(id)) MG.line(s, id);
  s.ads = { v26: true, autoOff: {}, m: {} }; return s.ads;
}
/** 现在的等级 */
export const lv = (s, id, cat) => { ads(s); const L = MG.line(s, id); return (cat === 'traffic' ? L.trafLv : L.repLv) || 0; };
export const trafPct = (s, id) => lv(s, id, 'traffic') * C.traffic.step;
export const repLevelVal = (s, id) => C.rep.start + lv(s, id, 'rep') * C.rep.step;
/** 值的写法：人流「+35%」、口碑「75」 */
export const valText = (cat, n) => (cat === 'traffic' ? `+${Math.round(n * C.traffic.step * 100)}%` : `${C.rep.start + n * C.rep.step}`);
export const chName = (s, cat) => C[cat].names[tIdx(s)];
/** 营业额挂钩：人流（永久，估值也算） */
export function adsMult(s, id) { const L = s.mg && s.mg.lines && s.mg.lines[id]; return 1 + ((L && L.trafLv) || 0) * C.traffic.step; }
MG.setAdsHook(adsMult);
setAdsPayHook(() => 0); /* 没有应付广告费了 */

/** 这条线每月营业额底子（不含人流）、毛利率 */
export const baseMonth = (s, id) => steadyRevenue(s, id) / adsMult(s, id) * MONTH_SEC;
const gm = (s, id) => Math.max(0.01, 1 - steadyCogs(s, id));
const nice = (x) => (x >= 1e4 ? Math.round(x / 1000) * 1000 : Math.max(100, Math.round(x / 100) * 100));
let meetAd = () => 0; export const setMeetAdHook = (fn) => { meetAd = fn; }; // 经营会「广告」方向：这周广告升级打八折
/** 下一级的价格 */
export function price(s, id, cat) {
  const step = cat === 'traffic' ? C.traffic.step : C.rep.revStep; const n = lv(s, id, cat) + 1;
  return nice(baseMonth(s, id) * step * gm(s, id) * (1 + C.payK * n) * (meetAd(s) > 0 ? 1 - C.meetOff : 1));
}
/** 这个人（null = 老板自己；OUT = 外包）能升到几级 */
export const capOf = (s, cat, who = null) => Math.min(C[cat].caps[tIdx(s)], who === OUT ? C.outCaps[cat] : Infinity);
const nextTitleFor = (s, cat) => { const n = lvCap(s, cat); for (let i = tIdx(s) + 1; i < 4; i++) if (C[cat].caps[i] > n) return i; return -1; };
const lvCap = (s, cat) => C[cat].caps[tIdx(s)];
/** 不能升的原因（钱不够 / 到顶 / 已满） */
export function whyNotUp(s, id, cat, who = null) {
  if (!isAdLine(s, id)) return '这条线还没开店';
  const n = lv(s, id, cat); if (n >= C[cat].max) return '已满';
  if (n >= capOf(s, cat, who)) { if (who === OUT) return '职业经理人只会发传单、点评运营'; const i = nextTitleFor(s, cat); return `到顶了，升到「${TITLES[i].name}」开放${C[cat].names[i]}，能升到 ${valText(cat, C[cat].caps[i])}`; }
  const p = price(s, id, cat); if (!canPay(s, 'company', p)) return '钱不够'; if (cushionShort(s, p) > 0) return '钱不够（要留工资）'; /* V0.2.9 */
  return null;
}
/** 按钮上写的：「升级：花 ¥X，营业额 +5%」「升级：花 ¥X，口碑 +5」 */
export const btnText = (s, id, cat) => `升级：花 ${fmtMoney(price(s, id, cat))}，${cat === 'traffic' ? `营业额 +${Math.round(C.traffic.step * 100)}%` : `口碑 +${C.rep.step}`}`;
const dayRevNow = (s, id) => dayRevOf(s, id); /* 按人招满算，跟店铺升级框一个口径 */
/** 升一级。by：'' 自己点；秘书 id / OUT 托管。返回 { ok, why, cost, from, to } */
export function upgrade(s, id, cat, t, by = '') {
  const who = by ? by : null; const why = whyNotUp(s, id, cat, who); if (why) return { ok: false, why };
  const cost = price(s, id, cat); const L = MG.line(s, id); const n = lv(s, id, cat); const r0 = dayRevNow(s, id);
  if (!pay(s, { wallet: 'company', cat: 'ads', amount: cost, by: isSec(by) ? by : '', note: `${IND_BY_ID[id].name}${CAT_NAME[cat]}广告升级（${chName(s, cat)}）：${CAT_NAME[cat]} ${valText(cat, n)} → ${valText(cat, n + 1)}` }, t)) return { ok: false, why: '钱不够' };
  if (cat === 'traffic') L.trafLv = n + 1; else { L.repLv = n + 1; MG.addRep(s, id, C.rep.step); }
  const r1 = dayRevNow(s, id); const item = { kind: 'ad', id, cat, from: n, to: n + 1, rev0: r0, rev1: r1, cost };
  if (by) { const m = (ads(s).m[id] = ads(s).m[id] || { traffic: 0, rep: 0, spent: 0 }); m[cat] += 1; m.spent += cost; noteAuto(s, { ...item, by }, t); }
  else noteUp(s, adNote(s, item), t);
  return { ok: true, cost, from: n, to: n + 1 };
}
/** 升级框内容（设计37 第三节）：升了什么 / 带来什么 / 下一步 */
export function adNote(s, it) {
  const name = IND_BY_ID[it.id].name; const cat = it.cat;
  const what = cat === 'traffic' ? `${name} 人流 ${valText(cat, it.from)} → ${valText(cat, it.to)}（${chName(s, cat)}）` : `${name} 口碑 ${valText(cat, it.from)} → ${valText(cat, it.to)}（${chName(s, cat)}）`;
  const fx = [`营业额每天 ${fmtMoney(it.rev0)} → ${fmtMoney(it.rev1)}`];
  const w = whyNotUp(s, it.id, cat); const next = !w || w === '钱不够' ? `下一级 ${fmtMoney(price(s, it.id, cat))}` : w;
  return { title: '广告升级', what, fx, next };
}

// ---------- 店长托管：自动升级广告（默认开） ----------
export const autoWho = (s, id) => { const w = holder(s, 'manager_' + id); return isSec(w) ? w : w === OUT ? OUT : null; };
export const autoOn = (s, id) => !ads(s).autoOff[id];
export function setAuto(s, id, on) { const A = ads(s); if (on) delete A.autoOff[id]; else A.autoOff[id] = true; }
/** 每个游戏天：有店长、开着，就把钱够的先升便宜的那个，一直升到钱不够或到顶 */
export function autoRun(s, id, t) {
  const who = autoWho(s, id); if (!who || !autoOn(s, id) || !isAdLine(s, id)) return 0; let k = 0;
  for (let i = 0; i < 40; i++) {
    const c = CATS.filter((cat) => !whyNotUp(s, id, cat, who)).sort((a, b) => price(s, id, a) - price(s, id, b))[0]; if (!c) break;
    if (!upgrade(s, id, c, t, who).ok) break; k += 1;
  }
  return k;
}
export function adsDay(s, day, at) { if (!s.inds) return []; for (const id of Object.keys(s.inds)) if (isAdLine(s, id)) autoRun(s, id, at); return []; }
/** 月底：托管这个月升了几级、花了多少，写进月报 */
export function adsMonth(s, t) {
  const A = ads(s);
  for (const [id, m] of Object.entries(A.m)) { if (!m || !(m.traffic + m.rep)) continue; const who = autoWho(s, id);
    addMsg(s, { kind: 'report', type: 'ads_auto', from: isSec(who) ? who : '', title: `${IND_BY_ID[id].name}广告月报`, body: `这个月${isSec(who) ? '她' : '职业经理人'}帮你升了 ${m.traffic + m.rep} 级广告（${m.traffic ? `人流 ${m.traffic} 级` : ''}${m.traffic && m.rep ? '、' : ''}${m.rep ? `口碑 ${m.rep} 级` : ''}），花了 ${fmtMoney(m.spent)}。现在人流 ${valText('traffic', lv(s, id, 'traffic'))}、口碑 ${repLevelVal(s, id)}。` }, t); }
  A.m = {};
}
MG.onDay((s, day, at) => adsDay(s, day, at));
