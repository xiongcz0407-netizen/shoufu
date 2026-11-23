// 亲自站柜台（V2-04，设计28 第一节）：不花精力，在线就能一直做；只在店少、店小的时候有用
// 顾客排队结账 → 照现实记账：营业额 = 客单价（加购 +30%），赚的（进账）= 客单价 × mul[线][档]，进货成本 = 营业额 − 进账（都走记账，按秒攒成流水）；
// 柜台小事件（加购、熟客、小偷、找零）、秘书陪站、每天上限（这条线挂机一天营业额的 50%）、请了店长 ×0.5、第三档店不能站；不算进估值（估值看 lineNetMonth，不看流水）
import C from '../config/counter.json?v=47e8f1b5' with { type: 'json' };
import { IND_BY_ID } from '../config/industries.js?v=47e8f1b5';
import { SEC_BY_ID } from '../config/secretaries.js?v=47e8f1b5';
import { lookIndex } from './economy.js?v=47e8f1b5';
import { accrue } from './ledger.js?v=47e8f1b5';
import { track } from './companytax.js?v=47e8f1b5';
import { holder, attrs } from './posts.js?v=47e8f1b5';
import { isTraining } from './training.js?v=47e8f1b5';
import { isScouting } from './busy.js?v=47e8f1b5';
import { addFavor } from './affection.js?v=47e8f1b5';
import { mark } from './goals.js?v=47e8f1b5';
import { dayIndex, dayRev, addRep, isShop } from './manage.js?v=47e8f1b5';
import * as PK from './pick.js?v=47e8f1b5';

export { C as COUNTER_CFG };
const r2 = (x) => Math.round(x * 100) / 100;
const pick = (a, rnd) => a[Math.floor(rnd() * a.length) % a.length];
const between = ([a, b], rnd) => a + (b - a) * rnd();

// ---------- 开发1 的挂钩：今天主推选对了没有、天气（设计28 第二节）----------
let pickHook = () => null;   // (s, id, t) → { right: bool, text: '冷饮饮料' } 或 null
let weatherHook = () => '';  // (s, t) → '晴' 之类
export const setPickHook = (fn) => { pickHook = fn; };
export const setWeatherHook = (fn) => { weatherHook = fn; };
export const pickOf = (s, id, t) => pickHook(s, id, t) || null;
// 开发1 的进货挑品（V2-03，core/pick.js）已经有了：默认接上——今天这家店的主推对路就来客快 15%；顶上写今天的天气 / 节日
setPickHook((s, id, t) => { const x = PK.current(s, id, t); if (!x) return null; const o = PK.optOf(id, x.key); return { right: x.fit === 'good', text: o ? o.name : x.key }; });
setWeatherHook((s, t) => PK.todayText(PK.today(s, t)));
export const weatherOf = (s, t) => weatherHook(s, t) || '';

/** 存档 s.counter：{ day, d: { 线: { rev 营业额, earn 赚的, n, lost, up, upTry, chat, thief, repHit } }, last, total: { n, rev, earn }, sec: { 秘书: 已加好感 } } */
export function cs(s, t) {
  const c = (s.counter = s.counter || { day: -1, d: {}, last: null, total: { n: 0, rev: 0, earn: 0 }, sec: {} });
  const d = t == null ? c.day : dayIndex(s, t);
  if (t != null && d !== c.day) { c.day = d; c.d = {}; c.sec = {}; }
  return c;
}
const today = (s, id, t) => { const c = cs(s, t); return (c.d[id] = c.d[id] || { rev: 0, earn: 0, n: 0, lost: 0, up: 0, upTry: 0, chat: 0, thief: 0, repHit: false }); };
export const lookOf = (s, id) => lookIndex(IND_BY_ID[id], s.inds[id].level);
export const hasManager = (s, id) => !!(holder(s, 'manager_' + id) || ((s.inds[id].staff || {}).manager || 0) > 0);

/** 能不能站：只有门店；第三档（超市、大酒楼、旗舰店）不能站 */
export function whyNot(s, id) {
  if (!isShop(id) || !s.inds[id] || !s.inds[id].branches) return '只有开了的门店能站柜台';
  if (lookOf(s, id) > C.maxLook) return '店太大了，交给店员吧';
  return null;
}
/** 换算系数（每单赚的 = 客单价 × 它）：mul[线][档] × 店长 0.5 */
export const mulOf = (s, id) => C.mul[id][Math.min(C.maxLook, lookOf(s, id))] * (hasManager(s, id) ? C.managerK : 1);
/** 今天这家店站柜台最多赚（进账）：挂机一天营业额 × 50% */
export const capOf = (s, id) => r2(dayRev(s, id) * C.dayCap);
export const leftToday = (s, id, t) => Math.max(0, r2(capOf(s, id) - (today(s, id, t).earn || 0)));
export const statToday = (s, id, t) => ({ ...today(s, id, t) });

// ---------- 一次站柜台（不进存档，界面拿着）----------
/** 开始站：返回会话；记下「上次站的店」 */
export function startSession(s, id, t, rnd = Math.random) {
  const why = whyNot(s, id); if (why) return { ok: false, why };
  cs(s, t).last = id;
  return { ok: true, sess: { id, seq: 0, untilEvent: Math.round(between(C.eventEvery, rnd)), secMin: 0, secLines: 0 } };
}
/** 下一位顾客几秒后来：第一档 4～8 秒、第二档 3～6 秒；主推选对了快 15% */
export function nextGap(s, id, t, rnd = Math.random) {
  const g = between(C.gap[Math.min(C.maxLook, lookOf(s, id))], rnd); const p = pickOf(s, id, t);
  return g * (p && p.right ? 1 - C.pickFaster : 1);
}
/** 来一位顾客：{ seq, price（客单价，元）, say, kind: normal / upsell / chat / thief / change, who?, item?, at } */
export function newCustomer(s, sess, t, rnd = Math.random) {
  const id = sess.id; const lk = Math.min(C.maxLook, lookOf(s, id)); const big = lk === 1 && C.sayBig[id];
  const price = Math.round(between(C.ticket[id][lk], rnd)); const say = pick(big ? C.sayBig[id] : C.say[id], rnd);
  const c = { seq: ++sess.seq, price, say, kind: 'normal', at: t };
  if (--sess.untilEvent <= 0) {
    sess.untilEvent = Math.round(between(C.eventEvery, rnd));
    const ks = Object.keys(C.events); const tot = ks.reduce((a, k) => a + C.events[k].w, 0); let u = rnd() * tot;
    c.kind = ks.find((k) => (u -= C.events[k].w) < 0) || ks[0];
    if (c.kind === 'upsell') c.item = pick(C.upsellItem[id], rnd);
    if (c.kind === 'chat') { c.who = pick(C.regulars, rnd); c.say = pick(C.regularSay, rnd); }
    if (c.kind === 'thief') c.say = '有人把东西塞进口袋';
    if (c.kind === 'change') c.say = '顾客说你少找了 10 块';
  }
  return c;
}
/** 小偷：几秒内点「抓住」（秘书陪着多 1 秒） */
export const thiefWindow = (secId) => C.events.thief.sec + (secId ? C.events.thief.secBonus : 0);
/** 加购成功率：60% + 秘书魅力 / 5 % */
export const upsellP = (s, secId) => Math.min(0.95, C.events.upsell.p + (secId ? (attrs(s, secId).charm || 0) / C.sec.charmPer / 100 : 0));
export function whySec(s, secId) { if (!secId) return null; if (!s.secs[secId]) return '没有这个秘书'; if (isTraining(s, secId)) return '上课中的秘书不能带'; if (isScouting(s, secId)) return '她在踩点'; return null; }

/** 记一单：营业额 sale（客单价），赚 amt（= 客单价 × 换算）；进货成本 = 营业额 − 赚的。到上限就少记或不记。返回 { got 赚的, sale 记的营业额 } */
function book(s, id, sale, amt, t) {
  const left = leftToday(s, id, t); const got = r2(Math.min(amt, left)); if (got <= 0) return { got: 0, sale: 0 };
  // V0.2.1：mul ×5 以后小吃摊赚的会超过客单价，营业额按赚的记、进货 0
  const rev = r2(Math.max(sale, amt) * got / amt); const cg = r2(rev - got); const name = IND_BY_ID[id].name;
  accrue(s, 'counter_' + id, 'company', 'counter', rev, `${name}老板站柜台营业额`);
  if (cg > 0) accrue(s, 'counter_cogs_' + id, 'company', 'cogs', cg, `${name}站柜台卖掉的货（进货成本）`, 'out');
  track(s, id, rev, cg); const d = today(s, id, t); d.rev = r2(d.rev + rev); d.earn = r2((d.earn || 0) + got);
  const c = cs(s); c.total.rev = r2(c.total.rev + rev); c.total.earn = r2((c.total.earn || 0) + got); return { got, sale: rev };
}
/** 结账：upsell = 点了加购（成功率见 upsellP）。返回 { ok, sale 营业额, amount 赚的, capped, upsold } */
export function checkout(s, cust, sess, t, { secId = null, upsell = false, rnd = Math.random } = {}) {
  const id = sess.id; const why = whyNot(s, id); if (why) return { ok: false, why };
  if (cust.kind === 'thief') return { ok: false, why: '这位不是来买东西的' };
  let upsold = false; const d = today(s, id, t);
  if (upsell && cust.kind === 'upsell') { d.upTry += 1; upsold = rnd() < upsellP(s, secId); if (upsold) d.up += 1; }
  sess.combo = (sess.combo || 0) + 1; const comboHit = C.combo && sess.combo % C.combo.every === 0; // V0.2.1 连击：连续结账不让人跑掉，每 N 连击那一单 +20%
  const sale = r2(cust.price * (upsold ? 1 + C.events.upsell.add : 1) * (comboHit ? 1 + C.combo.bonus : 1)); const amt = r2(sale * mulOf(s, id));
  const { got, sale: rev } = book(s, id, sale, amt, t);
  d.n += 1; cs(s).total.n += 1; mark(s, 'act');   // 目标链第 1 个：第一次亲自上阵或站柜台
  return { ok: true, sale: rev, amount: got, capped: got < amt - 0.005, upsold, combo: sess.combo, comboHit: !!comboHit };
}
/** 顾客等太久走了：当天跑掉超过 10 位，这家店口碑 −1（一天一次） */
export function walkout(s, sess, t) {
  const id = sess.id; const d = today(s, id, t); d.lost += 1; sess.combo = 0; // 跑了一个，连击断
  if (d.lost > C.lostRepAt && !d.repHit) { d.repHit = true; addRep(s, id, -C.lostRep); return { rep: -C.lostRep }; }
  return { rep: 0 };
}
/** 熟客聊两句：口碑 +0.2（一天最多 +2） */
export function chat(s, sess, t) {
  const E = C.events.chat; const d = today(s, sess.id, t); const max = Math.round(E.dayMax / E.rep);
  if (d.chat >= max) return { rep: 0 };
  d.chat += 1; addRep(s, sess.id, E.rep); return { rep: E.rep };
}
/** 小偷：抓到没损失、口碑 +0.5；没抓到损失一单货（客单价 × 3 × 换算，记进货成本） */
export function thief(s, cust, sess, t, caught) {
  const E = C.events.thief; const id = sess.id; today(s, id, t).thief += 1;
  if (caught) { addRep(s, id, E.rep); return { rep: E.rep, loss: 0 }; }
  const loss = r2(cust.price * E.lossX * mulOf(s, id));
  accrue(s, 'counter_loss_' + id, 'company', 'cogs', loss, `${IND_BY_ID[id].name}站柜台被偷了货（按进货成本记）`, 'out'); track(s, id, 0, loss);
  return { rep: 0, loss };
}
/** 找零出错：「赔给他」赔 10 元 × 换算；「查监控」50% 他记错（口碑 +0.3）、50% 真是你错（口碑 −0.5） */
export function change(s, sess, t, choice, rnd = Math.random) {
  const E = C.events.change; const id = sess.id;
  if (choice === 'pay') { const amt = r2(E.pay * mulOf(s, id)); accrue(s, 'counter_' + id + '_refund', 'company', 'counter', amt, `${IND_BY_ID[id].name}站柜台找零赔给顾客`, 'out'); return { paid: amt, rep: 0 }; }
  const his = rnd() < E.p; const rep = his ? E.repUp : -E.repDown; addRep(s, id, rep);
  return { paid: 0, rep, his };
}
/** 秘书陪站：界面每过 1 分钟叫一次。每 10 分钟好感 +1（一天最多 +2）、说一句（按性格）。返回要说的话或 null */
export function secMinute(s, sess, secId, t, rnd = Math.random) {
  if (!secId || whySec(s, secId)) return null;
  sess.secMin += 1; const S = C.sec; const c = cs(s, t);
  if (sess.secMin % S.favorEveryMin === 0 && (c.sec[secId] || 0) < S.favorDayMax) { c.sec[secId] = (c.sec[secId] || 0) + 1; addFavor(s, secId, 1); }
  if (sess.secMin % S.lineEveryMin !== 0) return null;
  const ls = S.lines[SEC_BY_ID[secId].type] || S.lines['知性']; return pick(ls, rnd);
}
/** 首页快捷入口：打工人、小老板才显示；进上次站的店，没有就第一家能站的 */
export const homeShow = (s) => (s.title || 0) <= C.homeMaxTitle && !!homeShop(s);
export function homeShop(s) {
  const last = s.counter && s.counter.last; if (last && s.inds[last] && !whyNot(s, last)) return last;
  return Object.keys(s.inds).find((id) => !whyNot(s, id)) || null;
}
/** 老板页统计 */
export const totals = (s) => ({ n: 0, rev: 0, earn: 0, ...((s.counter && s.counter.total) || {}) });
