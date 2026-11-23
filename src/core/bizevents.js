// P-05 经营事件（设计25 第二节，config/events.json）：在线每 3～5 分钟来一件，最多挂 1 件（左侧「限时」浮动 + 消息中心邀请），2 分钟不理按默认；
// 离线不来、不补；按你有的店、行业、称号筛；同一件 1 个游戏月内不重复；相关属性最高的秘书出主意（对的概率 50% + 属性 / 2）
import { credit } from './credit.js?v=b7d8e042'; // V3-01 亲自拍板攒投入度
import EV from '../config/events.json?v=b7d8e042' with { type: 'json' };
import { IND_BY_ID } from '../config/industries.js?v=b7d8e042';
import { SEC_BY_ID } from '../config/secretaries.js?v=b7d8e042';
import { MONTH_MS } from './gametime.js?v=b7d8e042';
import { addMsg, onAction } from './inbox.js?v=b7d8e042';
import { pay, receive } from './ledger.js?v=b7d8e042';
import { addContract } from './contracts.js?v=b7d8e042';
import { attrs } from './posts.js?v=b7d8e042';
import { isTraining } from './training.js?v=b7d8e042';
import * as MG from './manage.js?v=b7d8e042';
import * as PK from './pick.js?v=b7d8e042';
import * as PQ from './prereq.js?v=b7d8e042';
import './late.js?v=b7d8e042'; // V3-01 后期不挂机（挂钩注册） // V2-12 前置条件第一次满足时秘书说一句 // V2-03 进货挑品：暴雨跟着天气、节日事件跟着节日
import { mark } from './goals.js?v=b7d8e042';

export { EV as EVENTS_CFG };
const r2 = (x) => Math.round(x * 100) / 100;
export const EV_BY_ID = Object.fromEntries(EV.list.map((e) => [e.id, e]));
const ev = (s) => (s.bev = s.bev || { next: 0, cur: null, cd: {} });
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
export const eligible = (s, t) => EV.list.filter((e) => !(ev(s).cd[e.id] > t) && targetOf(s, e, t));
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
  const body = `${e.text.replace('{节日}', (PK.today(s, t).holiday || { name: '过节' }).name)}${ln ? `（${IND_BY_ID[ln].name}）` : ''}${ad ? `\n${SEC_BY_ID[ad.id].name}：「我觉得${sug.label.replace(/（.*）/, '')}比较好。」` : ''}\n${Math.round(EV.timeoutSec / 60)} 分钟不理就按「${e.options.find((o) => o.key === e.default).label}」处理。`;
  const m = addMsg(s, { kind: 'invite', type: 'biz_event', title: `经营：${e.title}`, body, from: ad ? ad.id : '', actions: e.options.map((o) => ({ key: o.key, label: o.label })), data: { ev: e.id, line: ln, until: t + EV.timeoutSec * 1000, sug: sug ? sug.key : null } }, t);
  B.cur = m.id; B.cd[e.id] = t + EV.cooldownMonths * MONTH_MS; return m;
}
const scaleOf = (s, id) => (id ? Math.max(1, MG.dayRev(s, id) / EV.refDay) : 1);
/** 执行效果，返回附加说明 */
function apply(s, ln, list, t, rnd, out, ctx) {
  for (const f of list || []) {
    if (f.chance != null) { apply(s, ln, rnd() < f.chance ? f.then : f.else, t, rnd, out, ctx); continue; }
    if (f.attrCheck) { const ok = rnd() < (ctx.ad ? ctx.ad.attr : 30) / 100; apply(s, ln, ok ? f.then : f.else, t, rnd, out, ctx); out.push(ok ? '谈下来了' : '没谈下来'); continue; }
    if (f.cash != null || f.cashDay != null) {
      const amt = r2(f.cash != null ? f.cash * scaleOf(s, ln) : f.cashDay * (ln ? MG.dayRev(s, ln) : 0)); if (!amt) continue;
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
  const need = (o.fx || []).find((f) => f.energy); if (need && !MG.doEnergy(s, need.energy, t)) { o = e.options.find((x) => x.key === e.default); }
  const out = []; const ctx = { e, o, ad: m.from ? { id: m.from, attr: attrs(s, m.from)[e.attr] || 0 } : null, paid: 0, bank: false };
  apply(s, m.data.line, opts.fx || o.fx, t, rnd, out, ctx);
  if (o.doc && ctx.paid > 0) addContract(s, { prefix: 'PZ', kind: 'voucher', title: o.doc, parties: [['当事人', s.companyName || '我的公司'], ['事由', e.title]], subject: `${e.title}：${o.label}`, rows: [['金额', ctx.paid]], total: ctx.paid, wallet: 'company' }, t);
  const text = `${opts.msg || o.msg}${out.length ? `（${out.join('，')}）` : ''}${m.data.sug ? (m.data.sug === o.key ? '' : '') : ''}`;
  if (key) { mark(s, 'event'); credit(s, o.best ? 'eventBest' : 'event', 1, t); } // 自己选的才算「处理了经营事件」（超时默认不算）
  m.status = 'done'; m.read = true; m.result = text; m.choice = o.label; const B = ev(s); if (B.cur === msgId) B.cur = null;
  addMsg(s, { kind: 'system', type: 'biz_event_done', title: `${e.title}：${o.label}`, body: text }, t);
  return { ok: true, text, bank: ctx.bank, best: !!o.best };
}
onAction('biz_event', (s, m, a, t) => { const r = resolve(s, m.id, a, t); return r.ok; });
/** 在线每秒（main.js）：到点来一件；挂着的超时按默认。离线不叫 */
export function tickEvents(s, t, rnd = Math.random) {
  const B = ev(s); const out = [];
  out.push(...PQ.checkNeeds(s, t));
  if (B.cur) { const m = (s.inbox || []).find((x) => x.id === B.cur); if (!m || m.status !== 'open') B.cur = null; else if (t >= m.data.until) { const r = resolve(s, m.id, null, t, rnd); out.push(`没来得及管：${r.text}`); } }
  if (!B.cur && !s.flags.noBizEvents) {
    if (!B.next) B.next = t + (EV.everySec[0] + rnd() * (EV.everySec[1] - EV.everySec[0])) * 1000;
    else if (t >= B.next) { const m = spawn(s, t, rnd); B.next = t + (EV.everySec[0] + rnd() * (EV.everySec[1] - EV.everySec[0])) * 1000; if (m) out.push(m.title); }
  }
  return out;
}
/** 离线回来：下一件从现在起算（不补） */
export const resetTimer = (s, t) => { ev(s).next = t + EV.everySec[0] * 1000; };
