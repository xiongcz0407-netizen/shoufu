// V3-02 老板日程表（设计33 第四之二节）→ 设计69 第二版（Arvin 2026-11-25）：日程改成「邀请箱」，不分时段、不过期
// 日程秘书（陪着你、没别的职位的那位）每个游戏日开头把邀请箱补到上限（2 + 交际 / 35，最多 5；满了不补、不挤掉旧的）
// 每件三个按钮：去参加（小场景，ui/agenda.js；宴会、慈善、讲座、私人场合选车 / 表 / 西装 / 女伴）/ 派人代去（效果一半，马上结算）/ 推掉；没有「答应」、没有失约
// 出差也在邀请箱里，点「出发」起占 N 个游戏日（这期间别的只能派人代去）；外部事件（大项目节点、对手进攻、地产、经营会）用 pushEvent 放进日程
// 存档 s.agenda = { day 补到第几天, seq, items: [{ id, at, kind, title, tier, host, line, sec, status: invite / done / declined, ext, ref, days, city, purpose, from }], away 出差 { id, until }, net 人脉, gov 政府关系, log, fresh 刚来的（界面提示）, offNew 离线来的几个 }
import { capAdd } from './cap.js?v=9a2bf56f';   // 设计79：有上限的列表（config/caps.js）
import C from '../config/agenda.json?v=9a2bf56f' with { type: 'json' };
import { IND_BY_ID } from '../config/industries.js?v=9a2bf56f';
import { SEC_BY_ID } from '../config/secretaries.js?v=9a2bf56f';
import { RIVALS } from '../config/rivals.js?v=9a2bf56f';
import { DAY_MS, dayIndex, addFx, addRep, isShop, dayRev } from './manage.js?v=9a2bf56f';
import { postOfSec, attrs } from './posts.js?v=9a2bf56f';
import { isTraining } from './training.js?v=9a2bf56f';
import { isScouting } from './busy.js?v=9a2bf56f';
import { addAttrHook } from './boss.js?v=9a2bf56f';
import { addFavor, addLove } from './affection.js?v=9a2bf56f';
import { afterDate } from './love.js?v=9a2bf56f';   // 设计56
import { addMsg } from './inbox.js?v=9a2bf56f';
import { pay } from './ledger.js?v=9a2bf56f';
import { netWorth } from './economy.js?v=9a2bf56f';
import { rivalState } from './battle.js?v=9a2bf56f';
import { ITEM } from './assets.js?v=9a2bf56f';
import { rideId } from './ride.js?v=9a2bf56f'; // 设计71 座驾
import * as LX from './luxury.js?v=9a2bf56f';
import * as STY from './styles.js?v=9a2bf56f'; // V3-05 女伴按款式
import * as LT from './late.js?v=9a2bf56f'; // 开发1 V3-01：大项目节点、对手进攻、地产决策的消息
export { C as AGENDA_CFG, DAY_MS };


const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pick = (a, r) => a[Math.floor(r() * a.length)];
export const ag = (s) => { const a = (s.agenda = s.agenda || { day: null, seq: 0, items: [], net: 0, gov: 0, log: [] }); a.items = a.items || []; return a; };
export const unlocked = (s) => (s.title || 0) >= C.minTitle;
/** 日程秘书：陪着你、没有别的职位的那位；没有就 null（自己看邀请函） */
export const scheduler = (s) => (s.current && s.secs && s.secs[s.current] && !postOfSec(s, s.current) ? s.current : null);
export const tierOf = (s) => { const sc = scheduler(s); const up = sc && (attrs(s, sc).social || 0) >= C.invites.tierSocial ? 1 : 0; return clamp((s.title || 0) + up, 0, C.tiers.length - 1); };
const free = (s, id) => !!s.secs[id] && !isTraining(s, id) && !isScouting(s, id);
/** 邀请箱上限 = 原来每天的邀请数：2 + 交际 / 35，最多 5（没有日程秘书就 2） */
export const cap = (s) => { const sc = scheduler(s); return Math.min(C.invites.max, C.invites.base + (sc ? Math.floor((attrs(s, sc).social || 0) / C.invites.perSocial) : 0)); };
/** 邀请箱里还没处理的（不含外部事件），按来的先后 */
export const inbox = (s) => ag(s).items.filter((x) => !x.ext && x.status === 'invite').sort((a, b) => a.at - b.at || a.id - b.id);
/** 现在在出差：{ id, until } 或 null */
export const away = (s, t) => { const a = ag(s).away; return a && t < a.until ? a : null; };

// —— 生成邀请 ——
const EXT = new Set(['meeting', 'project', 'attack', 'realestate']);
const TRIP_HOOK = { make: null };
export const setTripMaker = (fn) => { TRIP_HOOK.make = fn; };   // core/trip.js 挂：出差邀请的城市、目的、天数
function title(s, k, vars) { return pick(C.kinds[k].titles, vars.r).replace('{tier}', C.tiers[vars.tier]).replace('{host}', vars.host).replace('{line}', vars.line || '门店').replace('{sec}', vars.secName || '秘书'); }
/** 来 n 个新邀请（出差同时只有一个） */
/** 算不算同一件：同一种事 + 同一条线（视察）/ 同一个标题（别的） */
export const keyOf = (x) => `${x.kind}|${x.kind === 'inspect' ? x.line : x.kind === 'trip' ? 'trip' : x.title}`;
export function generate(s, n, t, rnd = Math.random) {
  const A = ag(s); const sc = scheduler(s);
  const kinds = Object.entries(C.kinds).filter(([k, v]) => !EXT.has(k) && (s.title || 0) >= v.minTitle && v.w > 0);
  const W = kinds.reduce((a, [, v]) => a + v.w, 0); const tier = tierOf(s); const out = [];
  const shops = Object.keys(s.inds || {}).filter((id) => s.inds[id].branches > 0);
  const secs = Object.keys(s.secs || {});
  const have = new Set(inbox(s).map(keyOf));   // 设计69 验收：邀请箱里不放重复的（同一种事 + 同一条线 / 同一个标题），补的时候跳过、换别的
  for (let i = 0; i < n; i++) {
    let it = null;
    for (let tries = 0; tries < 12 && !it; tries++) {
      let x = rnd() * W, ki = 0; for (let j = 0; j < kinds.length; j++) { x -= kinds[j][1].w; if (x <= 0) { ki = j; break; } }
      let k = kinds[(ki + tries) % kinds.length][0];   // 换别的：重抽还撞就顺着换一种
      if (k === 'trip' && (A.items.some((z) => z.kind === 'trip' && z.status === 'invite') || out.some((z) => z.kind === 'trip') || !TRIP_HOOK.make)) k = 'banquet';
      if (k === 'inspect' && !shops.length) k = 'banquet';
      const host = pick(C.hosts, rnd); const line = shops.length ? IND_BY_ID[pick(shops, rnd)].name : ''; const inviter = k === 'datesec' ? pick(secs, rnd) : null;
      if (k === 'datesec' && !inviter) continue;
      const c = { at: t, kind: k, tier, host, line, sec: inviter, status: 'invite', from: sc };
      c.title = title(s, k, { r: rnd, tier, host, line, secName: inviter ? SEC_BY_ID[inviter].name : '' });
      if (have.has(keyOf(c))) continue; it = c;
    }
    if (!it) continue; A.seq += 1; it.id = A.seq; have.add(keyOf(it)); const k = it.kind;
    if (k === 'trip') { const tp = TRIP_HOOK.make(s, 0, rnd); Object.assign(it, { city: tp.city, cityId: tp.cityId, purpose: tp.purpose, purposeName: tp.purposeName, days: tp.days }); it.title = `${it.days > 1 ? `${it.days} 天` : ''}去${it.city}${it.purposeName}`; }
    out.push(it); A.items.push(it);
  }
  return out;
}
/** 外部事件进日程（经营会、大项目节点、对手进攻）：{ kind, title, body, ref, at }；ext 的「去处理」由 ui/agenda.js registerOpen(kind, fn) 打开；不过期，处理了才关 */
export function pushEvent(s, ev, t) {
  const A = ag(s); A.seq += 1;
  const it = { id: A.seq, at: ev.at || t, kind: ev.kind, title: ev.title, body: ev.body || '', ref: ev.ref ?? null, status: 'invite', ext: true, tier: tierOf(s) };
  A.items.push(it); return it;
}
export const closeEvent = (s, kind, ref, status = 'done') => { for (const x of ag(s).items) if (x.ext && x.kind === kind && x.ref === ref && x.status === 'invite') { x.status = status; x.doneAt = ag(s).now || 0; } };

/** 开发1 的 late.agenda()：大项目节点（project）、对手进攻（attack）、地产决策（realestate）进日程；消息处理掉了就关（经营会我自己推） */
function syncLate(s, t) {
  const A = ag(s); let open = [];
  try { open = LT.agenda(s, t) || []; } catch (e) { return; }
  const ids = new Set(open.map((x) => x.msgId));
  for (const x of open) { if (x.kind === 'meeting' || !x.msgId || A.items.some((i) => i.ext && i.ref === x.msgId && i.kind === x.kind)) continue; pushEvent(s, { kind: x.kind, title: x.title, body: x.body, ref: x.msgId, at: Math.max(x.at || t, s.createdAt) }, t); }
  for (const i of A.items) if (i.ext && i.kind !== 'meeting' && i.status === 'invite' && !ids.has(i.ref)) { i.status = 'done'; i.doneAt = t; }
}

// —— 每跳 ——
/** 在线 ticker / 离线补算（offline: true）：每个游戏日开头把邀请箱补到上限；邀请不过期。在线来的记进 fresh（界面弹提示），离线来的只数个数（对账单） */
export function tick(s, t, opts = {}, rnd = Math.random) {
  const A = ag(s); const d = dayIndex(s, t); A.now = t; let out = null;
  if (!unlocked(s)) { A.day = d; return null; }
  if (A.day == null || d > A.day) {
    A.day = d; const need = Math.max(0, cap(s) - inbox(s).length); const g = need ? generate(s, need, t, rnd) : [];
    out = { day: d, invites: g.length, items: g };
    if (g.length) { if (opts.offline) A.offNew = (A.offNew || 0) + g.length; else (A.fresh = A.fresh || []).push(...g.map((x) => x.id)); }
  }
  syncLate(s, t);
  A.items = A.items.filter((x) => x.status === 'invite' || (x.doneAt || x.at || 0) >= t - 2 * DAY_MS);
  if (A.log.length > 30) A.log.length = 30;
  return out;
}
/** 刚来的新邀请（在线，拿一次就清）：还在邀请箱里的那几件 */
export function takeFresh(s) { const A = ag(s); const ids = A.fresh || []; A.fresh = []; return ids.map((id) => byId(s, id)).filter((x) => x && x.status === 'invite'); }
/** 离线时来的（拿一次就清）：「日程：新来了 3 个邀请」，没有就 '' */
export function takeOffNew(s) { const A = ag(s); const n = A.offNew || 0; A.offNew = 0; return n ? `日程：新来了 ${n} 个邀请` : ''; }
/** 新邀请提示：「老板，又来了 2 个邀请：签约仪式、商会晚宴」（没有日程秘书写「日程：」） */
export const freshText = (s, xs) => `${scheduler(s) ? '老板，' : '日程：'}又来了 ${xs.length} 个邀请：${xs.map((x) => x.title).join('、')}`;

// —— 去 / 推掉 / 代去 ——
export const byId = (s, id) => ag(s).items.find((x) => x.id === id);
export function decline(s, id, t = ag(s).now || 0) { const it = byId(s, id); if (!it || it.status !== 'invite') return { ok: false, why: '已经处理过了' }; it.status = 'declined'; it.doneAt = t; return { ok: true }; }
export function whyDelegate(s, it, secId) {
  if (!it || it.status !== 'invite' || it.ext || it.kind === 'trip' || it.kind === 'datesec') return '这件不能代';
  if (!secId || !free(s, secId)) return '她现在走不开';
  return null;
}
/** 派人代去：马上按一半效果结算 */
export function delegate(s, id, secId, t = ag(s).now || 0, rnd = Math.random) { const it = byId(s, id); const why = whyDelegate(s, it, secId); if (why) return { ok: false, why }; it.del = secId; const res = resolve(s, it, null, t, { delegated: true }, rnd); return { ok: true, res }; }
/** 现在能去吗：出差中别的只能代去；其他什么时候都能去 */
export function whyAttend(s, it, t) {
  if (!it || it.status !== 'invite') return '已经处理过了';
  if (it.ext) return null;
  const a = away(s, t); if (a) { const left = Math.max(1, Math.ceil((a.until - t) / DAY_MS)); return it.kind === 'trip' ? '已经在出差了' : `你在出差（还有 ${left} 天回来），只能派人代去`; }
  return null;
}
/** 出差出发（core/trip.js go 叫）：从这一刻起占 N 个游戏日 */
export function startTrip(s, it, t) { ag(s).away = { id: it.id, until: t + (it.days || 1) * DAY_MS }; }
/** 去了有什么好处（按钮上写，不用玩家算；按「都选对、打扮够格」估） */
export function gainText(s, it) {
  const K = C.kinds[it.kind]; if (!K) return ''; const L = [];
  if (it.kind === 'inspect') L.push(`营业额 +${Math.round(K.rev * 100)}%（${K.days} 天）`);
  if (it.kind === 'sign') L.push(`门店营业额 +${Math.round(K.rev * 100)}%（${K.days} 天）`);
  if (K.net && it.kind !== 'datesec') L.push(`人脉 +${K.net}`);
  if (it.kind === 'talk' || it.kind === 'media') L.push('股价小涨');
  if (it.kind === 'charity') L.push(`政府关系 +${K.gov}（要捐款）`);
  if (it.kind === 'datesec' && it.sec && SEC_BY_ID[it.sec]) L.push(`${SEC_BY_ID[it.sec].name}好感 +${K.favor}`);
  if (needDress(it)) L.push('女伴好感、爱慕涨');
  return L.join('，');
}

// —— 出席打扮 ——
export const needDress = (it) => !!C.kinds[it.kind].dress;
export function wardrobe(s) {
  const cars = ((s.garage && s.garage.cars) || []).filter((id) => ITEM[id]).map((id) => ({ id, name: `${ITEM[id].brand} ${ITEM[id].model}`, price: ITEM[id].price })).sort((a, b) => b.price - a.price);
  const one = (k) => LX.mine(s, k).map((id) => ({ id, name: LX.label(LX.L[id]), price: LX.L[id].price })).sort((a, b) => b.price - a.price);
  return { car: cars, watch: one('watch'), suit: one('suit'), sec: Object.keys(s.secs || {}).filter((id) => free(s, id)) };
}
export function bestDress(s) { const w = wardrobe(s); const rc = rideId(s, 'car'); return { car: rc && w.car.some((x) => x.id === rc) ? rc : w.car[0] ? w.car[0].id : null, /* 设计71：默认开座驾，还能手动挑 */ watch: w.watch[0] ? w.watch[0].id : null, suit: w.suit[0] ? w.suit[0].id : null, sec: s.current && w.sec.includes(s.current) ? s.current : w.sec[0] || null }; }
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
  if (it.kind === 'inspect') { const id = bestShop(s); if (id) { addFx(s, id, { rev: K.rev * m, src: 'agenda' }, t, K.days); addRep(s, id, K.rep * m); res.lines.push(`${IND_BY_ID[id].name}营业额 +${(K.rev * m * 100).toFixed(1)}%（${K.days} 天）`); } else net(K.net * m); }
  if (it.kind === 'sign') { for (const id of Object.keys(s.inds || {}).filter((x) => isShop(x) && s.inds[x].branches)) addFx(s, id, { rev: K.rev * m, src: 'agenda' }, t, K.days);   /* 设计69 验收：日程来的营业额加成同一条线不叠加（core/manage.js addFx 的 src） */ res.lines.push(`门店营业额 +${(K.rev * m * 100).toFixed(1)}%（${K.days} 天）`); }
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
  if (it.kind === 'datesec' && it.sec && s.secs[it.sec]) { const l0 = s.secs[it.sec].love; addFavor(s, it.sec, Math.round(K.favor * m)); const lv = addLove(s, it.sec, Math.round(K.love * m * 10) / 10, { cross: true }); if (lv.stageUp) res.loveUp = { id: it.sec, r: lv }; const tk = afterDate(s, it.sec, l0, t); if (tk) { res.token = { id: it.sec, ...tk }; res.lines.push(`${SEC_BY_ID[it.sec].name}：「${tk.line}」`); } /* 设计56：日程里她约你也算约会（能跨门、提起信物） */  res.lines.push(`${SEC_BY_ID[it.sec].name}好感 +${Math.round(K.favor * m)}`); }
  if (res.net) res.lines.unshift(`人脉 ${res.net > 0 ? '+' : ''}${res.net}`);
  it.status = 'done'; it.doneAt = t; it.res = { m: res.m, delegated: !!opts.delegated, score };
  capAdd(s, 'agenda.log', A.log, { t, id: it.id, text: `${opts.delegated ? `${SEC_BY_ID[it.del] ? SEC_BY_ID[it.del].name : '秘书'}代你去了` : '去了'}${it.title}：${res.lines.join('，') || '没什么收获'}` });
  return res;
}

/** 主页「日程」红点：邀请箱里现在能去的件数（外部事件也算） */
export const pendingCount = (s, t) => ag(s).items.filter((x) => x.status === 'invite' && !whyAttend(s, x, t)).length;
addAttrHook((s) => ({ network: (s.agenda && s.agenda.net) || 0 }));
/** econsim A：每天去 2 个（打扮最好、小场景都选对） */
export function autoA(s, t, maxPerDay = 2) {
  const A = ag(s); const d = dayIndex(s, t); A.aDone = A.aDone || {}; let n = A.aDone[d] || 0; const out = [];
  for (const x of inbox(s)) { if (n >= maxPerDay) break; if (x.kind === 'trip' || whyAttend(s, x, t)) continue; out.push(resolve(s, x, bestDress(s), t, { score: 4 })); n += 1; }
  A.aDone = { [d]: n }; return out;
}
/** 设计69 econsim B / C：邀请箱里能去的都去掉（不挑：打扮照默认、小场景选中间）；出差交给 tools/autoplay.mjs（要选人） */
export function autoAll(s, t, ok = () => true) {
  const out = []; for (const x of inbox(s)) { if (x.kind === 'trip' || whyAttend(s, x, t) || !ok(x)) continue; out.push(resolve(s, x, bestDress(s), t, { score: 2 })); } return out;
}
