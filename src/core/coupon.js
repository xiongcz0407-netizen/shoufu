// 金券和券（设计39 第五节，开发2）。一律「金券买券、在用的地方用券」；券都放 s.items[k]（k = potion / battle / auto / event / talk / invest，跟开发1 的 manage / bizevents / battle 读的是同一份；设计86 取消约会券），可以攒。
// 存档 s.coupon = { bal, log: [{ t, n, why }], seen: { title, goal, final: {}, favor: {}, win: {} }, day: { key, sign, tasks, refill, talks: { 秘书id: 用了几张 } } }
// 怎么得：全在 tick 里看（签到、每日任务全领完、目标链、升称号、收购最终对手、好感升阶、第一次赢对手），不改别的模块；新开局时把「已经有的」记成看过，不补发。
// 挂钩默认已经接开发1 的真函数；测试可以用 setCouponHooks 换掉：{ energyAdd, refill, refillState, auto }
import { capAdd } from './cap.js?v=a184462c';   // 设计79：有上限的列表（config/caps.js）
import C from '../config/coupon.json?v=a184462c' with { type: 'json' };
import { daily, dayKey, talkExtra } from './affection.js?v=a184462c';
import { tasksFor } from './daily.js?v=a184462c';
import { gl } from './goals.js?v=a184462c';
import { favorStage } from './secretary.js?v=a184462c';
import { RIVALS } from '../config/rivals.js?v=a184462c';
import { addEnergy, autoActLeft, useAutoTicket } from './manage.js?v=a184462c';
import { whyNotMore, more as bizMore, moreLeft } from './bizevents.js?v=a184462c';
import { addMsg } from './inbox.js?v=a184462c';
import { addLoadFix } from './loadfix.js?v=a184462c';
export { C as COUPON_CFG };
export const ITEMS = C.items;
export const ITEM_KEYS = C.order;

// 默认接开发1 设计39 的真函数（manage.addEnergy 能超上限、bizevents.more、manage.buyAutoAct 接在后面）；测试可以换掉
const H = { energyAdd: (s, n, t) => addEnergy(s, n, t), refill: (s, t) => bizMore(s, t), refillState: (s, t) => { const w = whyNotMore(s, t); return w && w !== '没有事件券' ? { can: false, why: w } : { can: true }; }, moreLeft: (s, t) => moreLeft(s, t), auto: (s, line, t) => useAutoTicket(s, line, t) }; // 自动券：开发1 manage.useAutoTicket（扣 1 张、接在后面）
export const setCouponHooks = (o) => Object.assign(H, o);
export const hooks = H;

export function cp(s) {
  if (s.coupon) return s.coupon;
  s.coupon = { bal: 0, log: [], day: { key: null }, seen: { title: s.title || 0, goal: s.goals ? s.goals.i || 0 : 0, final: {}, favor: {}, win: {} } };
  for (const [id, x] of Object.entries(s.rivals || {})) if (x.wins > 0) s.coupon.seen.win[id] = true;
  for (const r of RIVALS) if (r.final && s.rivals && s.rivals[r.id] && s.rivals[r.id].acquired) s.coupon.seen.final[r.id] = true;
  for (const [id, x] of Object.entries(s.secs || {})) s.coupon.seen.favor[id] = favorStage(x.favor || 0);
  return s.coupon;
}
const today = (s, t) => { const c = cp(s); const k = dayKey(t); if (c.day.key !== k) c.day = { key: k, sign: false, tasks: false, talks: {} }; return c.day; };
const log = (s, t, n, why) => { const c = cp(s); capAdd(s, 'coupon.log', c.log, { t, n, why }); };
export const balance = (s) => cp(s).bal;
export function earn(s, n, why, t = Date.now()) { if (n <= 0) return; cp(s).bal += n; log(s, t, n, why); }
export function spend(s, n, why, t = Date.now()) { const c = cp(s); if (c.bal < n) return false; c.bal -= n; log(s, t, -n, why); return true; }

// —— 券：有几张、加、减、买（只在卡包里买；1 / 10 / 50 张包，10 张九折、50 张八折，取整） ——
export const have = (s, k) => (s.items && s.items[k]) || 0;
const add = (s, k, n) => { s.items = s.items || {}; s.items[k] = Math.max(0, (s.items[k] || 0) + n); };
const take = (s, k) => { if (!(have(s, k) > 0)) return false; add(s, k, -1); return true; };
export const useItem = (s, k) => take(s, k);   // 设计53 投资券：跟一单扣一张
export const giftText = (g) => Object.entries(g || {}).filter(([, n]) => n > 0).map(([k, n]) => `${ITEMS[k].name} ×${n}`).join('、');
export function giveItems(s, g, why, t = Date.now()) { const txt = giftText(g); if (!txt) return ''; for (const [k, n] of Object.entries(g)) if (n > 0) add(s, k, n); log(s, t, 0, `${why}：送${txt}`); return txt; }
export const packPrice = (k, n) => { const p = C.packs.find((x) => x[0] === n); return Math.round(ITEMS[k].price * n * (p ? p[1] : 1)); };
export const PACKS = C.packs.map((x) => x[0]);
export function buy(s, k, n = 1, t = Date.now()) {
  const it = ITEMS[k]; if (!it) return { ok: false, why: '没有这种券' }; if (!PACKS.includes(n)) return { ok: false, why: '只能买 1 / 10 / 50 张' };
  const price = packPrice(k, n); if (!spend(s, price, `买${it.name} ×${n}`, t)) return { ok: false, why: `金券不够（要 ${price}）` };
  add(s, k, n); return { ok: true, k, n, price };
}
// 老名字（开发1 / 界面在用）
export const potions = (s) => have(s, 'potion');
export const tickets = (s) => have(s, 'battle');
export const addPotion = (s, n, why, t) => giveItems(s, { potion: n }, why, t);
export const addTickets = (s, n, why, t) => giveItems(s, { battle: n }, why, t);
export const useTicket = (s) => take(s, 'battle');
export const buyPotion = (s, t = Date.now(), n = 1) => buy(s, 'potion', n, t);
export const buyTickets = (s, t = Date.now(), n = 1) => buy(s, 'battle', n, t);

/** 每秒（在线）/ 回来时：看有没有该发的金券、药水。返回这次发了的 [{ n, why, potion }]（给提示用） */
export function tick(s, t = Date.now(), rnd = Math.random) {
  const c = cp(s); const d = today(s, t); const out = []; const give = (n, why, g) => { earn(s, n, why, t); const gifts = giveItems(s, g, why, t); out.push({ n, why, gifts }); };
  const dd = daily(s, t);
  // 签到：每天 5，连签第 7 天 20；第 3 天送 1 瓶药水、第 5 天 3 张商战券、第 7 天 2 瓶药水（设计86）
  if (dd.signed && !d.sign) { d.sign = true; const day = (((s.signin && s.signin.streak) || 1) - 1) % 7 + 1; give(day === 7 ? C.earn.sign7 : C.earn.sign, `签到第 ${day} 天`, C.gift[`sign${day}`]); }
  // 每日任务全部领完：10，30% 送 1 瓶
  const ts = tasksFor(s); if (!d.tasks && ts.length && ts.every((x) => dd.tasks[x.id])) { d.tasks = true; give(C.earn.tasksAll, '每日任务全部做完', rnd() < C.gift.tasksAllP ? C.gift.tasksAll : null); }
  // 目标链：每完成一个 5
  const gi = gl(s).i || 0; while (c.seen.goal < gi) { c.seen.goal += 1; give(C.earn.goal, `新手目标 ${c.seen.goal} 完成`); }
  // 升称号：每升一级 50 + 3 瓶药水、2 张自动券、1 张事件券
  while (c.seen.title < (s.title || 0)) { c.seen.title += 1; give(C.earn.title, '升称号', C.gift.title); }
  // 第一次收购最终对手：每个最终对手 30（收购了才能升称号）
  for (const r of RIVALS) if (r.final && !c.seen.final[r.id] && s.rivals && s.rivals[r.id] && s.rivals[r.id].acquired) { c.seen.final[r.id] = true; give(C.earn.finalAcquire, `收购了最终对手${r.name}`); }
  // 第一次赢一个对手：送 3 张商战券（只送券，不给金券）
  c.seen.win = c.seen.win || {};
  for (const [id, x] of Object.entries(s.rivals || {})) if (x && x.wins > 0 && !c.seen.win[id]) { c.seen.win[id] = true; const r = RIVALS.find((y) => y.id === id); give(0, `第一次赢了${r ? r.name : '对手'}`, C.gift.firstWin); }
  // 秘书好感升阶：每升一阶 10 + 1 瓶药水（设计86）（新来的秘书从她现在的阶段算起）
  for (const [id, x] of Object.entries(s.secs || {})) { const st = favorStage(x.favor || 0); if (c.seen.favor[id] == null) { c.seen.favor[id] = st; continue; } while (c.seen.favor[id] < st) { c.seen.favor[id] += 1; give(C.earn.favorStage, '秘书好感升阶', C.gift.favorStage); } }
  return out;
}

// —— 精力药水 ——
export function drink(s, t = Date.now()) {
  if (!take(s, 'potion')) return { ok: false, why: '没有药水了' };
  H.energyAdd(s, ITEMS.potion.energy, t); return { ok: true, energy: ITEMS.potion.energy };
}
/** 精力不够时：有药水就喝一瓶，没有就买一瓶再喝 */
export function drinkOrBuy(s, t = Date.now()) { if (potions(s) <= 0) { const b = buy(s, 'potion', 1, t); if (!b.ok) return b; } return drink(s, t); }

// —— 互动券：某个秘书今天 +5 次，每人每天最多 3 张 ——
export const talksBought = (s, id, t) => today(s, t).talks[id] || 0;
export function whyTalks(s, id, t) { if (!s.secs[id]) return '没有这个秘书'; if (talksBought(s, id, t) >= ITEMS.talk.perSecDay) return `今天给她用过 ${ITEMS.talk.perSecDay} 张了`; if (!have(s, 'talk')) return '没有互动券'; return null; }
export function useTalk(s, id, t = Date.now()) {
  const why = whyTalks(s, id, t); if (why) return { ok: false, why };
  take(s, 'talk'); const d = today(s, t); d.talks[id] = (d.talks[id] || 0) + 1; talkExtra(s, id, ITEMS.talk.n, t); return { ok: true, n: ITEMS.talk.n };
}

// —— 事件券：经营事件「再来 10 件」，小老板起一天最多 2 次（次数、扣券都在开发1 的 bizevents.more）——
export function refillState(s, t = Date.now()) {
  if (!(s.title || 0)) return { can: false, why: '升到小老板开放' };
  const left = H.moreLeft ? H.moreLeft(s, t) : 1; if (!left) return { can: false, why: '明天再来' };
  if (H.refillState) { const r = H.refillState(s, t); if (r && !r.can) return r; }
  if (!H.refill) return { can: false, why: '还没开放' };
  return { can: true, have: have(s, 'event'), left };
}
export function useRefill(s, t = Date.now()) {
  const st = refillState(s, t); if (!st.can) return { ok: false, why: st.why };
  if (!have(s, 'event')) return { ok: false, why: '没有事件券' };
  const r = H.refill(s, t); if (!r || !r.ok) return { ok: false, why: (r && r.why) || '没抽到' };
  return { ok: true, ...r };
}

// —— 自动券：一条门店线自动上阵 1 天；生效中再用接在后面（界面先问） ——
/** 自动上阵还剩多少毫秒（开发1 manage.autoActLeft） */
export const autoLeft = (s, line, t = Date.now()) => autoActLeft(s, line, t);
export function useAuto(s, line, t = Date.now()) {
  if (!H.auto) return { ok: false, why: '还没开放' };
  if (!have(s, 'auto')) return { ok: false, why: '没有自动券' };
  const r = H.auto(s, line, t); if (!r || !r.ok) return { ok: false, why: (r && r.why) || '用不了' };
  return { ok: true, left: autoActLeft(s, line, t) };
}

// —— 设计86：约会券取消。读档时手上剩的按 refund.date（15）每张退成金券、清掉 items.date、「系统」发一条；items.date 清了就不会再退 ——
export function refundDateTickets(s, t = Date.now()) {
  if (!s || !s.items || !('date' in s.items)) return 0;
  const n = Math.max(0, Math.floor(s.items.date || 0)); delete s.items.date; if (!n) return 0;
  const m = n * C.refund.date; earn(s, m, '约会券取消退回', t);
  addMsg(s, { kind: 'system', type: 'date_refund', title: '约会券取消了', body: `约会券取消了，你手上的 ${n} 张换成了 ${m} 金券。` }, t);
  return m;
}
addLoadFix(refundDateTickets);

/** 今天还能领的金券（金券页「怎么得」标出来） */
export function todayLeft(s, t = Date.now()) {
  const d = today(s, t); const dd = daily(s, t); const ts = tasksFor(s);
  return { sign: !dd.signed, tasks: !d.tasks && ts.length ? `${ts.filter((x) => dd.tasks[x.id]).length}/${ts.length}` : '' };
}
