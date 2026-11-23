// V3-02 老板日程表（设计33 第四之二节）：日程秘书（陪着你、没别的职位的那位）每天把明天的邀请推给你；一天上午 / 下午 / 晚上三个时段
// 邀请：答应 / 推掉 / 派秘书代去（效果一半）；到点去参加 = 一个小场景（ui/agenda.js）；宴会、慈善、讲座、私人场合选车 / 表 / 西装 / 女伴
// 外部事件（开发1 的大项目节点、对手进攻；开发2 的经营会）用 pushEvent 放进日程，界面上「去处理」交给注册的打开函数
// 存档 s.agenda = { day 推到第几天, seq, items: [{ id, day, slot, kind, title, tier, host, line, sec, firm, status, ext, ref, days, city, purpose }], net 人脉, gov 政府关系, log }
import C from '../config/agenda.json?v=d69b03f5' with { type: 'json' };
import { IND_BY_ID } from '../config/industries.js?v=d69b03f5';
import { SEC_BY_ID } from '../config/secretaries.js?v=d69b03f5';
import { RIVALS } from '../config/rivals.js?v=d69b03f5';
import { DAY_MS, dayIndex, addFx, addRep, isShop, dayRev } from './manage.js?v=d69b03f5';
import { postOfSec, attrs } from './posts.js?v=d69b03f5';
import { isTraining } from './training.js?v=d69b03f5';
import { isScouting } from './busy.js?v=d69b03f5';
import { addAttrHook } from './boss.js?v=d69b03f5';
import { addFavor, addLove } from './affection.js?v=d69b03f5';
import { addMsg } from './inbox.js?v=d69b03f5';
import { pay } from './ledger.js?v=d69b03f5';
import { netWorth } from './economy.js?v=d69b03f5';
import { rivalState } from './battle.js?v=d69b03f5';
import { ITEM } from './assets.js?v=d69b03f5';
import * as LX from './luxury.js?v=d69b03f5';
import * as STY from './styles.js?v=d69b03f5'; // V3-05 女伴按款式
import * as LT from './late.js?v=d69b03f5'; // 开发1 V3-01：大项目节点、对手进攻、地产决策的消息
export { C as AGENDA_CFG };

const SLOT_MS = DAY_MS / 3;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pick = (a, r) => a[Math.floor(r() * a.length)];
export const ag = (s) => { const a = (s.agenda = s.agenda || { day: null, seq: 0, items: [], net: 0, gov: 0, log: [] }); a.items = a.items || []; return a; };
export const unlocked = (s) => (s.title || 0) >= C.minTitle;
export const slotName = (k) => C.slots[k][1];
export const slotStart = (s, day, slot) => s.createdAt + day * DAY_MS + slot * SLOT_MS;
export const slotEnd = (s, day, slot) => slotStart(s, day, slot) + SLOT_MS;
export const nowSlot = (s, t) => ({ day: dayIndex(s, t), slot: Math.min(2, Math.floor(((t - s.createdAt) % DAY_MS) / SLOT_MS)) });
/** 日程秘书：陪着你、没有别的职位的那位；没有就 null（自己看邀请函） */
export const scheduler = (s) => (s.current && s.secs && s.secs[s.current] && !postOfSec(s, s.current) ? s.current : null);
export const tierOf = (s) => { const sc = scheduler(s); const up = sc && (attrs(s, sc).social || 0) >= C.invites.tierSocial ? 1 : 0; return clamp((s.title || 0) + up, 0, C.tiers.length - 1); };
const free = (s, id) => !!s.secs[id] && !isTraining(s, id) && !isScouting(s, id);
export const tripDays = (s) => { const out = new Set(); for (const x of ag(s).items) if (x.kind === 'trip' && ['accepted', 'going', 'done'].includes(x.status)) for (let k = 0; k < (x.days || 1); k++) out.add(x.day + k); return out; };

// —— 生成邀请 ——
const EXT = new Set(['meeting', 'project', 'attack', 'realestate']);
const TRIP_HOOK = { make: null };
export const setTripMaker = (fn) => { TRIP_HOOK.make = fn; };   // core/trip.js 挂：出差邀请的城市、目的、天数
function title(s, k, vars) { return pick(C.kinds[k].titles, vars.r).replace('{tier}', C.tiers[vars.tier]).replace('{host}', vars.host).replace('{line}', vars.line || '门店').replace('{sec}', vars.secName || '秘书'); }
export function generate(s, day, rnd = Math.random) {
  const A = ag(s); const sc = scheduler(s); const soc = sc ? attrs(s, sc).social || 0 : 0; const man = sc ? attrs(s, sc).manage || 0 : 0;
  if (tripDays(s).has(day)) return [];
  const n = Math.min(C.invites.max, C.invites.base + (sc ? Math.floor(soc / C.invites.perSocial) : 0));
  const kinds = Object.entries(C.kinds).filter(([k, v]) => !EXT.has(k) && (s.title || 0) >= v.minTitle && v.w > 0);
  const W = kinds.reduce((a, [, v]) => a + v.w, 0); const tier = tierOf(s); const out = [];
  const shops = Object.keys(s.inds || {}).filter((id) => s.inds[id].branches > 0);
  const secs = Object.keys(s.secs || {});
  for (let i = 0; i < n; i++) {
    let x = rnd() * W, k = kinds[0][0]; for (const [kk, v] of kinds) { x -= v.w; if (x <= 0) { k = kk; break; } }
    if (k === 'trip' && (A.items.some((z) => z.kind === 'trip' && z.status !== 'expired' && z.status !== 'declined' && z.day >= day) || !TRIP_HOOK.make)) k = 'banquet';
    if (k === 'inspect' && !shops.length) continue;
    const used = out.filter((z) => z.kind !== 'trip').map((z) => z.slot); const freeSlots = [0, 1, 2].filter((z) => !used.includes(z));
    const slot = man >= 50 && freeSlots.length ? pick(freeSlots, rnd) : Math.floor(rnd() * 3);   // 管理高的排得不冲突
    const host = pick(C.hosts, rnd); const line = shops.length ? IND_BY_ID[pick(shops, rnd)].name : ''; const inviter = k === 'datesec' ? pick(secs, rnd) : null;
    if (k === 'datesec' && !inviter) continue;
    A.seq += 1;
    const it = { id: A.seq, day, slot, kind: k, tier, host, line, sec: inviter, firm: !!C.kinds[k].firm, status: 'invite', from: sc };
    it.title = title(s, k, { r: rnd, tier, host, line, secName: inviter ? SEC_BY_ID[inviter].name : '' });
    if (k === 'trip') { Object.assign(it, TRIP_HOOK.make(s, day, rnd)); it.slot = 0; it.title = `${it.days > 1 ? `${it.days} 天` : ''}去${it.city}${it.purposeName}`; }
    out.push(it); A.items.push(it);
  }
  return out;
}
/** 外部事件进日程（经营会、大项目节点、对手进攻）：{ kind, title, body, ref, due, at } → 放进 at 所在的时段；ext 的「去处理」由 ui/agenda.js registerOpen(kind, fn) 打开 */
export function pushEvent(s, ev, t) {
  const A = ag(s); const at = ev.at || t; const { day, slot } = nowSlot(s, at); A.seq += 1;
  const it = { id: A.seq, day, slot, kind: ev.kind, title: ev.title, body: ev.body || '', ref: ev.ref ?? null, due: ev.due || slotEnd(s, day, slot), status: 'invite', ext: true, tier: tierOf(s) };
  A.items.push(it); return it;
}
export const closeEvent = (s, kind, ref, status = 'done') => { for (const x of ag(s).items) if (x.ext && x.kind === kind && x.ref === ref && !['done', 'expired'].includes(x.status)) x.status = status; };

/** 开发1 的 late.agenda()：大项目节点（project）、对手进攻（attack）、地产决策（realestate）进日程；消息处理掉了就关（经营会我自己推） */
function syncLate(s, t) {
  const A = ag(s); let open = [];
  try { open = LT.agenda(s, t) || []; } catch (e) { return; }
  const ids = new Set(open.map((x) => x.msgId));
  for (const x of open) { if (x.kind === 'meeting' || !x.msgId || A.items.some((i) => i.ext && i.ref === x.msgId && i.kind === x.kind)) continue; pushEvent(s, { kind: x.kind, title: x.title, body: x.body, ref: x.msgId, due: x.until || t + SLOT_MS, at: Math.max(x.at || t, s.createdAt) }, t); }
  for (const i of A.items) if (i.ext && i.kind !== 'meeting' && ['invite', 'accepted'].includes(i.status) && !ids.has(i.ref) && t < i.due) i.status = 'done';
}

// —— 每跳 ——
/** 在线 ticker / 离线补算（offline: true，秘书替你推掉，不扣） */
export function tick(s, t, opts = {}, rnd = Math.random) {
  const A = ag(s); const d = dayIndex(s, t); let out = null;
  if (!unlocked(s)) { A.day = d; return null; }
  if (A.day == null) { generate(s, d, rnd); generate(s, d + 1, rnd); A.day = d; out = { day: d }; }
  else if (d > A.day) { A.day = d; const g = generate(s, d + 1, rnd); out = { day: d, invites: g.length }; if (g.length && !opts.offline) brief(s, d + 1, t); }
  for (const x of A.items) {
    if (['done', 'expired', 'declined', 'missed'].includes(x.status)) continue;
    const end = x.ext ? x.due : x.kind === 'trip' ? slotEnd(s, x.day + (x.days || 1) - 1, 2) : slotEnd(s, x.day, x.slot);
    if (t < end) continue;
    if (x.status === 'delegated') { resolve(s, x, null, t, { delegated: true }); continue; }
    if (x.status === 'accepted' && x.firm && !opts.offline) { x.status = 'missed'; A.net = clamp(A.net - C.missNet, C.netFloor, C.netCap); A.log.unshift({ t, id: x.id, text: `失约：${x.title}，人脉 −${C.missNet}` }); continue; }
    x.status = x.status === 'accepted' && opts.offline ? 'declined' : 'expired';
  }
  syncLate(s, t);
  A.items = A.items.filter((x) => x.day >= d - 2 || (x.kind === 'trip' && x.day + (x.days || 1) >= d - 1));
  if (A.log.length > 30) A.log.length = 30;
  return out;
}
function brief(s, day, t) {
  const A = ag(s); const sc = scheduler(s); const xs = A.items.filter((x) => x.day === day && !x.ext);
  if (!xs.length) return;
  addMsg(s, { kind: 'report', type: 'agenda', from: sc || '', title: '明天的日程', body: xs.map((x) => `${slotName(x.slot)}：${x.title}${x.firm ? '（要答应才算数，失约扣人脉）' : ''}`).join('\n') + (sc ? '' : '\n（没有日程秘书，邀请函都堆在桌上）'), actions: [{ key: 'open', label: '看日程' }] }, t);
}

// —— 答应 / 推掉 / 代去 ——
export const itemsOf = (s, day) => ag(s).items.filter((x) => x.day === day || (x.kind === 'trip' && day >= x.day && day < x.day + (x.days || 1))).sort((a, b) => a.slot - b.slot || a.id - b.id);
export const byId = (s, id) => ag(s).items.find((x) => x.id === id);
export function whyAccept(s, it) {
  if (!it || it.status !== 'invite') return '已经处理过了';
  if (it.kind === 'trip') { for (let k = 0; k < (it.days || 1); k++) if (ag(s).items.some((x) => x !== it && x.status === 'accepted' && x.day === it.day + k && !x.ext)) return '那几天已经答应了别的事'; return null; }
  if (tripDays(s).has(it.day)) return '那天在出差';
  const c = ag(s).items.find((x) => x !== it && x.day === it.day && x.slot === it.slot && x.status === 'accepted' && !x.ext);
  return c ? `这个时段已经答应了「${c.title}」` : null;
}
export function accept(s, id) {
  const it = byId(s, id); const why = whyAccept(s, it); if (why) return { ok: false, why };
  it.status = 'accepted';
  if (it.kind === 'trip') for (const x of ag(s).items) if (x !== it && !x.ext && x.status === 'invite' && x.day >= it.day && x.day < it.day + it.days) x.status = 'declined';
  return { ok: true };
}
export function decline(s, id) { const it = byId(s, id); if (!it || !['invite', 'accepted'].includes(it.status)) return { ok: false, why: '已经处理过了' }; it.status = 'declined'; return { ok: true }; }
export function whyDelegate(s, it, secId) {
  if (!it || !['invite', 'accepted'].includes(it.status) || it.ext || it.kind === 'trip' || it.kind === 'datesec') return '这件不能代';
  if (!secId || !free(s, secId)) return '她现在走不开';
  if (ag(s).items.some((x) => x.status === 'delegated' && x.day === it.day && x.slot === it.slot && x.del === secId)) return '她这个时段已经代你去别处了';
  return null;
}
export function delegate(s, id, secId) { const it = byId(s, id); const why = whyDelegate(s, it, secId); if (why) return { ok: false, why }; it.status = 'delegated'; it.del = secId; return { ok: true }; }
/** 现在能去吗（在它的时段里） */
export function whyAttend(s, it, t) {
  if (!it || !['invite', 'accepted'].includes(it.status)) return '已经处理过了';
  if (it.ext) return null;
  if (it.kind === 'trip') return t < slotStart(s, it.day, 0) ? `${it.day - dayIndex(s, t)} 天后出发` : it.status === 'accepted' ? null : '先答应';
  const a = slotStart(s, it.day, it.slot), b = slotEnd(s, it.day, it.slot);
  if (t < a) return `${it.day > dayIndex(s, t) ? '明天' : '今天'}${slotName(it.slot)}才开始`;
  if (t >= b) return '已经过了';
  if (tripDays(s).has(it.day)) return '你在出差';
  const c = ag(s).items.find((x) => x !== it && x.day === it.day && x.slot === it.slot && x.status === 'accepted' && !x.ext); if (c) return `这个时段答应了「${c.title}」`;
  return null;
}

// —— 出席打扮 ——
export const needDress = (it) => !!C.kinds[it.kind].dress;
export function wardrobe(s) {
  const cars = ((s.garage && s.garage.cars) || []).filter((id) => ITEM[id]).map((id) => ({ id, name: `${ITEM[id].brand} ${ITEM[id].model}`, price: ITEM[id].price })).sort((a, b) => b.price - a.price);
  const one = (k) => LX.mine(s, k).map((id) => ({ id, name: LX.label(LX.L[id]), price: LX.L[id].price })).sort((a, b) => b.price - a.price);
  return { car: cars, watch: one('watch'), suit: one('suit'), sec: Object.keys(s.secs || {}).filter((id) => free(s, id)) };
}
export function bestDress(s) { const w = wardrobe(s); return { car: w.car[0] ? w.car[0].id : null, watch: w.watch[0] ? w.watch[0].id : null, suit: w.suit[0] ? w.suit[0].id : null, sec: s.current && w.sec.includes(s.current) ? s.current : w.sec[0] || null }; }
const priceOf = (k, id) => (!id ? 0 : k === 'car' ? (ITEM[id] || {}).price || 0 : (LX.L[id] || {}).price || 0);
/** 打扮系数 0.7～1.25 + 女伴 0～0.25 */
/** 女伴的衣服对不对路（V3-05）：{ o, name, style, k, line } 或 null */
export const compFit = (s, it, sel) => (sel && sel.sec && s.secs[sel.sec] && it && STY.occOfItem(it) ? STY.fitMult(s, sel.sec, STY.occOfItem(it), it.tier) : null);
export function dressMult(s, tier, sel = {}, it = null) {
  const req = C.dress[tier]; const sc = ['car', 'watch', 'suit'].map((k) => Math.min(1.2, priceOf(k, sel[k]) / req[k]));
  const avg = sc.reduce((a, b) => a + b, 0) / 3; const a = sel.sec && s.secs[sel.sec] ? attrs(s, sel.sec) : null;
  const f = compFit(s, it, sel);
  return Math.round((0.7 + 0.5 * Math.min(1.1, avg) + (a ? ((a.charm || 0) + (a.social || 0)) / 800 : 0)) * (f ? f.k : 1) * 1000) / 1000;
}
export const reqText = (tier) => { const r = C.dress[tier]; return `其他来宾平均座驾 ${big(r.car)}、腕表 ${big(r.watch)}、西装 ${big(r.suit)}`; };
const big = (v) => (v >= 1e8 ? `${+(v / 1e8).toFixed(1)}亿` : v >= 1e4 ? `${+(v / 1e4).toFixed(0)}万` : `${v}`);

// —— 结果 ——
const bestShop = (s) => Object.keys(s.inds || {}).filter((id) => isShop(id) && s.inds[id].branches).sort((a, b) => dayRev(s, b) - dayRev(s, a))[0] || null;
const bumpPx = (s, k) => { const L = s.listing && s.listing.listed; if (L && k) L.px = Math.round(L.px * (1 + k) * 100) / 100; return !!L; };
/** 结算：score = 小场景里选对了几次（0～4，两轮各 0～2）；sel = 打扮；opts.delegated 代去 */
export function resolve(s, it, sel, t, opts = {}, rnd = Math.random) {
  const A = ag(s); const K = C.kinds[it.kind]; const score = opts.delegated ? 2 : clamp(opts.score ?? 2, 0, 4);
  let m = C.mult[score] * (opts.delegated ? C.delegateK : 1);
  if (!opts.delegated && needDress(it)) m *= dressMult(s, it.tier, sel || {}, it);
  const res = { m: Math.round(m * 100) / 100, lines: [] }; const net = (n) => { if (!n) return; const v = Math.round(n * 10) / 10; A.net = clamp(A.net + v, C.netFloor, C.netCap); res.net = (res.net || 0) + v; };
  if (it.kind === 'inspect') { const id = bestShop(s); if (id) { addFx(s, id, { rev: K.rev * m }, t, K.days); addRep(s, id, K.rep * m); res.lines.push(`${IND_BY_ID[id].name}营业额 +${(K.rev * m * 100).toFixed(1)}%（${K.days} 天）`); } else net(K.net * m); }
  if (it.kind === 'sign') { for (const id of Object.keys(s.inds || {}).filter((x) => isShop(x) && s.inds[x].branches)) addFx(s, id, { rev: K.rev * m }, t, K.days); res.lines.push(`门店营业额 +${(K.rev * m * 100).toFixed(1)}%（${K.days} 天）`); }
  if (['talk', 'banquet', 'charity', 'sign', 'media', 'private'].includes(it.kind)) net(K.net * m);
  if (it.kind === 'talk' && bumpPx(s, K.px * m)) res.lines.push(`股价 +${(K.px * m * 100).toFixed(2)}%`);
  if (it.kind === 'media') { const up = score >= 2 ? K.px * m : -K.px; if (bumpPx(s, up)) res.lines.push(`股价 ${up >= 0 ? '+' : ''}${(up * 100).toFixed(2)}%`); if (score < 2) res.lines.push('答得不好，有一篇负面报道'); }
  if (it.kind === 'charity' && !opts.delegated) { const g = Math.max(K.giveMin, Math.round(netWorth(s) * K.give)); pay(s, { wallet: 'personal', cat: 'charity', amount: g, force: true, party: '慈善基金会', note: `${it.title}捐款` }, t); A.gov = (A.gov || 0) + K.gov; res.lines.push(`捐了 ¥${big(g)}，政府关系 +${K.gov}`); }
  if (it.kind === 'banquet' && !opts.delegated && rnd() < K.meet) {
    const w = pick(C.meetWho, rnd); const rv = RIVALS.filter((r) => !r.noAcquire && r.boss && !rivalState(s, r.id).acquired && r.stage <= (s.title || 0) + 1);
    if (w.k === 'rival' && rv.length) { const r = pick(rv, rnd); rivalState(s, r.id).intel = (rivalState(s, r.id).intel || 0) + w.intel; res.lines.push(w.text.replace('{rival}', r.name).replace('{boss}', r.boss) + `（${r.name}情报 +1）`); }
    else if (w.k !== 'rival') { net(w.net); res.lines.push(w.text); }
  }
  const comp = !opts.delegated && sel && sel.sec && s.secs[sel.sec] ? sel.sec : null;
  if (comp && needDress(it)) { addFavor(s, comp, 3); addLove(s, comp, it.kind === 'private' ? K.love : 0.5); res.comp = comp; }
  if (it.kind === 'datesec' && it.sec && s.secs[it.sec]) { addFavor(s, it.sec, Math.round(K.favor * m)); addLove(s, it.sec, Math.round(K.love * m * 10) / 10); res.lines.push(`${SEC_BY_ID[it.sec].name}好感 +${Math.round(K.favor * m)}`); }
  if (res.net) res.lines.unshift(`人脉 ${res.net > 0 ? '+' : ''}${res.net}`);
  it.status = 'done'; it.res = { m: res.m, delegated: !!opts.delegated, score };
  A.log.unshift({ t, id: it.id, text: `${opts.delegated ? `${SEC_BY_ID[it.del] ? SEC_BY_ID[it.del].name : '秘书'}代你去了` : '去了'}${it.title}：${res.lines.join('，') || '没什么收获'}` });
  return res;
}
export const pendingCount = (s, t) => ag(s).items.filter((x) => (x.status === 'invite' && x.day > dayIndex(s, t) && !x.ext) || (!whyAttend(s, x, t) && ['invite', 'accepted'].includes(x.status))).length;
addAttrHook((s) => ({ network: (s.agenda && s.agenda.net) || 0 }));
/** econsim A：每天去 2 个（打扮最好、小场景都选对） */
export function autoA(s, t, maxPerDay = 2) {
  const A = ag(s); const d = dayIndex(s, t); A.aDone = A.aDone || {}; let n = A.aDone[d] || 0; const out = [];
  for (const x of A.items) { if (n >= maxPerDay) break; if (x.ext || x.kind === 'trip' || whyAttend(s, x, t)) continue; out.push(resolve(s, x, bestDress(s), t, { score: 4 })); n += 1; }
  A.aDone = { [d]: n }; return out;
}
