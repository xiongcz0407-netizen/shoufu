// P-05 经营事件（设计25 第二节，config/events.json）。设计39 第三节：每天 0 点（手机本地时间）整批来 10 件，不管在不在线；
// 当天同一种只出一次；没做的 0 点清掉（不按默认、没有影响）；打工人只抽 tier 0（正好 10 种），小老板起 tier 0 + 1，小老板起「再来 10 件」一天一次（金券开发2 扣）。
// 按你有的店、行业、称号筛；相关属性最高的秘书出主意（对的概率 50% + 属性 / 2）
import { credit } from './credit.js?v=d69b03f5'; // V3-01 亲自拍板攒投入度
import EV from '../config/events.json?v=d69b03f5' with { type: 'json' };
import { IND_BY_ID } from '../config/industries.js?v=d69b03f5';
import { SEC_BY_ID } from '../config/secretaries.js?v=d69b03f5';
import { dayKey } from './affection.js?v=d69b03f5';
import { addMsg, onAction } from './inbox.js?v=d69b03f5';
import { pay, receive } from './ledger.js?v=d69b03f5';
import { addContract } from './contracts.js?v=d69b03f5';
import { attrs } from './posts.js?v=d69b03f5';
import { isTraining } from './training.js?v=d69b03f5';
import * as MG from './manage.js?v=d69b03f5';
import * as PK from './pick.js?v=d69b03f5';
import * as PQ from './prereq.js?v=d69b03f5';
import './late.js?v=d69b03f5'; // V3-01 后期不挂机（挂钩注册） // V2-12 前置条件第一次满足时秘书说一句 // V2-03 进货挑品：暴雨跟着天气、节日事件跟着节日
import { mark } from './goals.js?v=d69b03f5';
import { available } from './accrual.js?v=d69b03f5'; // V0.2.2 打工人阶段事件花钱封顶
import { fmtMoney } from './format.js?v=d69b03f5';
import * as CF from './cashflow.js?v=d69b03f5'; // V0.2.9 工资锁

export { EV as EVENTS_CFG };
const r2 = (x) => Math.round(x * 100) / 100;
export const EV_BY_ID = Object.fromEntries(EV.list.map((e) => [e.id, e]));
/** s.bev = { day 哪天, seen 今天出过的种类, ids 今天的事件消息, more 今天再来过几次 } */
const ev = (s) => (s.bev = s.bev && s.bev.seen ? s.bev : { day: null, seen: {}, ids: [], more: 0 });
const shops = (s) => Object.keys(s.inds).filter((id) => MG.isShop(id) && s.inds[id].branches);
const staffOf = (s, id) => Object.values(s.inds[id].staff || {}).reduce((a, n) => a + n, 0);
const allStaff = (s) => Object.keys(s.inds).reduce((a, id) => a + staffOf(s, id), 0);
/** 这件事能不能来，来了落在哪条线 */
export function targetOf(s, e, t) {
  const w = e.when || {}; let ls = shops(s);
  if ((w.weather || w.holiday) && t != null) { const x = PK.today(s, t); if (w.weather && !w.weather.includes(x.weather)) return null; if (w.holiday && !x.holiday) return null; }
  if (w.food) ls = ls.filter((id) => id === 'food');
  if (w.repMin) ls = ls.filter((id) => MG.line(s, id).rep >= w.repMin);
  if (w.branchesMin) ls = ls.filter((id) => s.inds[id].branches >= w.branchesMin);
  if (w.staffMin) ls = ls.filter((id) => staffOf(s, id) >= w.staffMin);
  if ((w.retail || w.food || w.repMin || w.branchesMin || w.staffMin || w.random) && !ls.length) return null;
  if (w.titleMin && (s.title || 0) < w.titleMin) return null;
  if (w.rival && (s.title || 0) < 1 && !Object.values(s.rivals || {}).some((x) => x.wins || x.losses)) return null;
  return ls.length ? ls.slice().sort((a, b) => MG.dayRev(s, b) - MG.dayRev(s, a))[0] : (shops(s)[0] || null);
}
/** V0.2.2 开局头 3 个游戏天不出要掏钱的坏事件 */
export const earlyQuiet = (s, t) => t != null && t - (s.createdAt || 0) < (EV.noPayDays || 0) * MG.DAY_MS;
/** 今天还能抽的：打工人只抽 tier 0（不看条件，有店就行），小老板起 tier 0 + 1 按条件；当天出过的不再出；开局头 3 个游戏天不出要掏钱的 */
export const eligible = (s, t) => EV.list.filter((e) => !ev(s).seen[e.id] && !(earlyQuiet(s, t) && (EV.bad || []).includes(e.id)) && ((s.title || 0) ? targetOf(s, e, t) : (e.tier || 0) === 0 && shops(s).length > 0));
/** V0.2.2 打工人阶段：一件事最多花公司可用资金的 20%（不会扣成负数）；以后不封顶（null） */
export const capOf = (s) => ((s.title || 0) ? null : r2(Math.max(0, Math.min(EV.capRate * available(s), s.company || 0))));
/** 一个选项要花的钱：sure 一定花的，maybe 看运气可能花的（都按封顶算） */
export function optCost(s, ln, fx) {
  let sure = 0, maybe = 0; const one = (f) => (f.cash != null ? f.cash * scaleOf(s, ln) : f.cashDay != null ? f.cashDay * (ln ? MG.dayRev(s, ln) : 0) : 0);
  const walk = (list, chance) => { for (const f of list || []) { if (f.chance != null || f.attrCheck) { walk(f.then, true); walk(f.else, true); continue; } const a = one(f); if (a < 0) { if (chance) maybe = Math.max(maybe, -a); else sure += -a; } } };
  walk(fx, false); const cap = capOf(s); if (cap != null) { sure = Math.min(sure, cap); maybe = Math.min(maybe, Math.max(0, cap - sure)); }
  return { sure: Math.round(sure), maybe: Math.round(maybe) };
}
/** 选项上写实际要花的钱：「先花钱整改（¥2500）」「拿证照给他们看（可能要花 ¥1500）」 */
export function optLabel(s, ln, o) {
  const { sure, maybe } = optCost(s, ln, o.fx); const add = [sure ? fmtMoney(sure) : '', maybe ? `可能要花 ${fmtMoney(maybe)}` : ''].filter(Boolean).join('，'); if (!add) return o.label;
  const m = o.label.match(/^(.*)（(.*)）$/); return m ? `${m[1]}（${m[2]}，${add}）` : `${o.label}（${add}）`;
}
/** 出主意的秘书：相关属性最高、没在上课的 */
export function advisor(s, e) {
  const ids = Object.keys(s.secs).filter((id) => !isTraining(s, id)); if (!ids.length) return null;
  const id = ids.sort((a, b) => (attrs(s, b)[e.attr] || 0) - (attrs(s, a)[e.attr] || 0))[0]; return { id, attr: attrs(s, id)[e.attr] || 0 };
}
/** 来一件事（rnd 给测试）。返回消息 */
export function spawn(s, t, rnd = Math.random, id = null) {
  const list = id ? [EV_BY_ID[id]] : eligible(s, t); if (!list.length) return null;
  const e = list[Math.floor(rnd() * list.length)]; const ln = targetOf(s, e) || shops(s)[0]; const B = ev(s);
  const ad = advisor(s, e); const best = e.options.find((o) => o.best) || e.options[0];
  const right = ad && rnd() < 0.5 + ad.attr / 200; const others = e.options.filter((o) => o !== best);
  const sug = !ad ? null : right || !others.length ? best : others[Math.floor(rnd() * others.length)];
  const body = `${e.text.replace('{节日}', (PK.today(s, t).holiday || { name: '过节' }).name)}${ln ? `（${IND_BY_ID[ln].name}）` : ''}${ad ? `\n${SEC_BY_ID[ad.id].name}：「我觉得${sug.label.replace(/（.*）/, '')}比较好。」` : ''}\n今天之内处理，0 点换新一批（没做的清掉，没有影响）。`;
  const m = addMsg(s, { kind: 'invite', type: 'biz_event', title: `经营：${e.title}`, body, from: ad ? ad.id : '', actions: e.options.map((o) => ({ key: o.key, label: optLabel(s, ln, o) })), data: { ev: e.id, line: ln, day: B.day, sug: sug ? sug.key : null } }, t);
  B.seen[e.id] = true; B.ids.push(m.id); return m;
}
function scaleOf(s, id) { return id ? Math.max(1, MG.dayRev(s, id) / EV.refDay) : 1; }
/** 执行效果，返回附加说明 */
function apply(s, ln, list, t, rnd, out, ctx) {
  for (const f of list || []) {
    if (f.chance != null) { apply(s, ln, rnd() < f.chance ? f.then : f.else, t, rnd, out, ctx); continue; }
    if (f.attrCheck) { const ok = rnd() < (ctx.ad ? ctx.ad.attr : 30) / 100; apply(s, ln, ok ? f.then : f.else, t, rnd, out, ctx); out.push(ok ? '谈下来了' : '没谈下来'); continue; }
    if (f.cash != null || f.cashDay != null) {
      let amt = r2(f.cash != null ? f.cash * scaleOf(s, ln) : f.cashDay * (ln ? MG.dayRev(s, ln) : 0)); if (!amt) continue;
      if (amt < 0 && ctx.cap != null) { const want = -amt; const c = r2(Math.max(0, Math.min(want, ctx.cap, s.company || 0))); ctx.cap = r2(ctx.cap - c); if (c < want - 0.5) ctx.capped = r2((ctx.capped || 0) + want - c); if (c <= 0) continue; amt = -c; } /* V0.2.2 打工人阶段封顶 20%、不扣成负数 */
      if (amt < 0) { pay(s, { wallet: 'company', cat: f.cat || 'opex', amount: -amt, force: true, party: ctx.e.title, note: `经营事件：${ctx.e.title}（${ctx.o.label}）` }, t); ctx.paid += -amt; if (f.back) { MG.stockIn(s, ln, -amt, t, f.backDays || 3); out.push(`备了 ${Math.round(-amt)} 元的货（之后 ${f.backDays || 3} 天卖掉，少进货）`); } else out.push(`花了 ${Math.round(-amt)} 元`); }
      else { receive(s, { wallet: 'company', cat: f.cat || 'franchise', amount: amt, party: ctx.e.title, note: `经营事件：${ctx.e.title}（${ctx.o.label}）` }, t); out.push(`收了 ${Math.round(amt)} 元`); }
      continue;
    }
    if (f.prepaidDay) { const amt = r2(f.prepaidDay * MG.dayRev(s, ln)); if (amt > 0) { MG.prepaidIn(s, ln, amt, t, '储值卡'); out.push(`预收 ${Math.round(amt)} 元`); } continue; }
    if (f.rev || f.cogs || f.margin) { MG.addFx(s, ln, { ...(f.rev ? { rev: f.rev } : {}), ...(f.cogs ? { cogs: f.cogs } : {}), ...(f.margin ? { margin: f.margin } : {}) }, t, f.days || 1); continue; }
    if (f.rep) { MG.addRep(s, ln, f.rep); out.push(`口碑 ${f.rep > 0 ? '+' : ''}${f.rep}`); continue; }
    if (f.quit) { const st = s.inds[ln].staff || {}; const role = Object.keys(st).filter((r) => st[r] > 0 && r !== 'manager').sort((a, b) => st[b] - st[a])[0]; if (role) { st[role] -= 1; out.push('走了 1 个人'); } continue; }
    if (f.bank) { ctx.bank = true; continue; }
  }
}
/** 选一个选项（消息中心按钮 / 超时默认 / 测试）。返回 { ok, text } */
export function resolve(s, msgId, key, t, rnd = Math.random, opts = {}) {   // opts（V2-06 开发2 挂钩）：{ fx 换掉这个选项的效果, msg 换掉结果话 }
  const m = (s.inbox || []).find((x) => x.id === msgId); if (!m || !m.data || !m.data.ev) return { ok: false, why: '没有这件事' };
  const e = EV_BY_ID[m.data.ev]; let o = e.options.find((x) => x.key === key) || e.options.find((x) => x.key === e.default);
  if (m.status !== 'open') return { ok: false, why: '已经处理过了' };
  { const c = optCost(s, m.data.line, o.fx).sure; if (c > 0 && CF.cushionShort(s, c) > 0) return { ok: false, why: CF.LOCK_WHY }; } /* V0.2.9 工资锁：要花钱的选项也要留够两个月工资 */
  const need = (o.fx || []).find((f) => f.energy); if (need) { const w = MG.whyEnergy(s, need.energy, t); if (w) return { ok: false, why: w }; MG.doEnergy(s, need.energy, t); } /* 设计39：精力不够就不能选这个 */
  const out = []; const ctx = { e, o, ad: m.from ? { id: m.from, attr: attrs(s, m.from)[e.attr] || 0 } : null, paid: 0, bank: false, cap: capOf(s), capped: 0 };
  apply(s, m.data.line, opts.fx || o.fx, t, rnd, out, ctx);
  if (ctx.capped > 0) out.push(`打工人阶段最多花可用资金的 20%，这次少掏 ${Math.round(ctx.capped)} 元`);
  if (o.doc && ctx.paid > 0) addContract(s, { prefix: 'PZ', kind: 'voucher', title: o.doc, parties: [['当事人', s.companyName || '我的公司'], ['事由', e.title]], subject: `${e.title}：${o.label}`, rows: [['金额', ctx.paid]], total: ctx.paid, wallet: 'company' }, t);
  const text = `${opts.msg || o.msg}${out.length ? `（${out.join('，')}）` : ''}${m.data.sug ? (m.data.sug === o.key ? '' : '') : ''}`;
  if (key) { mark(s, 'event'); credit(s, o.best ? 'eventBest' : 'event', 1, t); } // 自己选的才算「处理了经营事件」（超时默认不算）
  m.status = 'done'; m.read = true; m.result = text; m.choice = o.label;
  addMsg(s, { kind: 'system', type: 'biz_event_done', title: `${e.title}：${o.label}`, body: text }, t);
  return { ok: true, text, bank: ctx.bank, best: !!o.best };
}
onAction('biz_event', (s, m, a, t) => { const r = resolve(s, m.id, a, t); m.why = r.ok ? null : r.why; return r.ok; }); /* 设计39：精力不够写在 m.why，界面提示 */
/** 抽一批（最多 10 件，同一批、同一天不重复；够条件的不够就有几种给几种） */
function batch(s, t, rnd) {
  const out = [];
  for (let k = 0; k < EV.perDay; k++) { const list = eligible(s, t); if (!list.length) break; const m = spawn(s, t, rnd, list[Math.floor(rnd() * list.length)].id); if (m) out.push(m); }
  return out;
}
/** 0 点换天：没做的清掉（不按默认、没有影响），来新的一批 */
export function rollDay(s, t, rnd = Math.random) {
  const k = dayKey(t); const B = ev(s); if (B.day === k) return null;
  const old = new Set(B.ids); s.inbox = (s.inbox || []).filter((m) => !(m.type === 'biz_event' && m.status === 'open' && (old.has(m.id) || !m.data || m.data.day !== k)));
  s.bev = { day: k, seen: {}, ids: [], more: 0 }; if (s.flags.noBizEvents) return [];
  return batch(s, t, rnd);
}
/** 设计39：事件券存在 s.items.event（开发2 卖、送）；「再来 10 件」小老板起、一天最多 moreMax 次，每次用 1 张 */
export const eventTickets = (s) => (s.items && s.items.event) || 0;
export const moreLeft = (s, t) => { rollDay(s, t); return Math.max(0, (EV.moreMax || 2) - ev(s).more); };
export function whyNotMore(s, t) { if ((s.title || 0) < (EV.moreTitle || 1)) return '升到小老板开放'; if (!moreLeft(s, t)) return '明天再来'; if (!eligible(s, t).length) return '今天能来的都来过了'; if (!eventTickets(s)) return '没有事件券'; return null; }
/** 按钮：「再来 10 件 · 用 1 张事件券（还有 N 张，今天还能 2 次）」 */
export const moreText = (s, t) => { const n = Math.min(EV.perDay, eligible(s, t).length); return `再来 ${n} 件 · 用 1 张事件券（还有 ${eventTickets(s)} 张，今天还能 ${moreLeft(s, t)} 次）`; };
export function more(s, t, rnd = Math.random) { const w = whyNotMore(s, t); if (w) return { ok: false, why: w }; s.items.event -= 1; ev(s).more += 1; const ms = batch(s, t, rnd); return { ok: true, n: ms.length }; }
/** 页顶「今天 6/10」：{ done, total } */
export function todayCount(s, t) { rollDay(s, t); const B = ev(s); const ids = new Set(B.ids); const ms = (s.inbox || []).filter((m) => ids.has(m.id)); return { done: ms.filter((m) => m.status !== 'open').length, total: B.ids.length, more: B.more }; }
/** 每秒（main.js）/ 离线回来：换天来一批；前置条件提醒 */
export function tickEvents(s, t, rnd = Math.random) {
  const out = []; out.push(...PQ.checkNeeds(s, t));
  const ms = rollDay(s, t, rnd); if (ms && ms.length) out.push(`今天的 ${ms.length} 件经营事件来了`);
  return out;
}
/** 老接口：不用了 */
export const resetTimer = () => {};
