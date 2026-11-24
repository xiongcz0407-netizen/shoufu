// V3-01 后期不挂机（设计33 第一～四节）
// 1. 经营倍数：老板起全公司营业额 × (托管水平 + (1 − 托管水平) × 投入度 E)。E 靠你亲自拍板攒，按天衰减；托管水平按店长管理 60%～80%。按比例放大，规模越大越值
// 2. 大项目节点：科技立项、传媒投拍、跨城市扩张中途要你拍板（限时 30 分钟，不选按默认），结果按决策和秘书属性浮动；地产在 realestate.js（V2-09）
// 3. 对手主动进攻：老板起每游戏月有概率来一次，应对窗口 30 分钟：商战三回合 / 花钱摆平 / 不理（按比例掉营业额、做空掉股价）
// 4. 日程：agenda() 列出要你去的事（经营会、项目节点、地产决策、对手进攻），onAgenda(fn) 新事件推给日程表（开发2）
import { setCredit } from './credit.js?v=2c0f4ae6';
import L from '../config/late.json?v=2c0f4ae6' with { type: 'json' };
import * as E from './economy.js?v=2c0f4ae6';
import { addMsg, onAction } from './inbox.js?v=2c0f4ae6';
import { pay } from './ledger.js?v=2c0f4ae6';
import { RIVALS, RIVAL_BY_ID } from '../config/rivals.js?v=2c0f4ae6';
import { IND_BY_ID } from '../config/industries.js?v=2c0f4ae6';
import * as B from './battle.js?v=2c0f4ae6';
import * as W from './war.js?v=2c0f4ae6';
import { holder, isSec, attrs } from './posts.js?v=2c0f4ae6';
import * as MG from './manage.js?v=2c0f4ae6';
import { isTraining } from './training.js?v=2c0f4ae6';

export { L as LATE_CFG };
const MIN = 60e3; const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r2 = (x) => Math.round(x * 100) / 100;
export const lt = (s) => { const x = (s.late = s.late || { E: L.eStart, day: null, fx: [], atk: [], seq: 0, since: null, done: {}, log: [] }); x.fx = x.fx || []; x.atk = x.atk || []; x.done = x.done || {}; return x; };
export const active = (s) => (s.title || 0) >= L.fromTitle;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- 1. 经营倍数 ----------
/** 托管水平：店长 / 经理是秘书的，按她们的平均管理属性 60%～80% */
export function hostK(s) { return clamp(hostK0(s) + ((L.hostAdjByTitle || {})[String(s.title || 0)] || 0), 0.3, 1); } // V3-01 小调：老板这一档托管再低一点
function hostK0(s) {
  const ms = Object.keys(s.inds || {}).map((id) => holder(s, 'manager_' + id)).filter((h) => isSec(h) && s.secs[h]);
  if (!ms.length) return L.host.base; const avg = ms.reduce((a, id) => a + (attrs(s, id).manage || 0), 0) / ms.length;
  return clamp(L.host.base + (avg - 50) * L.host.attrK, L.host.min, L.host.max);
}
/** 全公司营业额倍数（valueMode：估值用，不含对手进攻的临时影响） */
export function mult(s, valueMode = false) {
  if (!active(s) || (s.late && s.late._off)) return 1; const X = lt(s); const h = hostK(s); const cap = (L.eCapByTitle || {})[String(s.title || 0)]; let m = h + (1 - h) * (cap != null ? Math.min(X.E, cap) : X.E); /* 老板这一档投入度的效果封顶（V3-01 小调：别让认真玩的人太快跳过老板） */
  if (!valueMode && X.fx.length) { const now = (s.mg && s.mg.t) || 0; for (const f of X.fx) if (f.until > now) m *= 1 + f.rev; }
  if (!valueMode && X.atk.some((a) => a.status === 'open' && !a.until)) m *= 1 + (L.attack.openRev || 0); /* V0.2.3 进攻挂着没应对 */
  return m;
}
/** 你亲自拍了一次板：投入度 + */
export function credit(s, kind, w = 1, t = null) {
  if (!active(s)) return 0; const X = lt(s); const d = (L.credit[kind] || 0) * w; if (!d) return 0;
  X.E = clamp(X.E + d, 0, L.eMax); X.log.unshift({ t, kind, d: r2(d) }); if (X.log.length > 50) X.log.length = 50; return d;
}
/** 公司一天的利润（按现在的规模，不含临时效果） */
export const dayProfit = (s) => Math.max(0, Object.keys(s.inds || {}).reduce((a, id) => a + (E.lineNetMonth(s, id) || 0), 0)) / 30;

// ---------- 4. 日程 ----------
const AG = []; export const onAgenda = (fn) => AG.push(fn);
const AGENDA_TYPES = { meeting: 'meeting', late_dec: 'project', late_atk: 'attack', re_dec: 'realestate' };
/** 要你去的事：[{ kind: meeting / project / attack / realestate, title, body, at, until, msgId }]（开着的） */
export function agenda(s, t) {
  return (s.inbox || []).filter((m) => AGENDA_TYPES[m.type] && m.status === 'open').map((m) => ({ kind: AGENDA_TYPES[m.type], title: m.title, body: m.body, at: m.t, until: (m.data && (m.data.until || m.data.due)) || (s.meet && s.meet.cur && s.meet.cur.due) || null, msgId: m.id }))
    .filter((x) => !x.until || x.until > t).sort((a, b) => (a.until || Infinity) - (b.until || Infinity));
}
const push = (s, m, t) => { for (const f of AG) f(s, { kind: AGENDA_TYPES[m.type], title: m.title, body: m.body, at: t, until: m.data && m.data.until, msgId: m.id }); return m; };

// ---------- 2. 大项目节点 ----------
const bestSec = (s, attr) => Object.keys(s.secs || {}).filter((id) => !isTraining(s, id)).sort((a, b) => (attrs(s, b)[attr] || 0) - (attrs(s, a)[attr] || 0))[0] || null;
/** 这些东西要排节点：{ key, kind, title, start, end, target } */
function projects(s) {
  const out = [];
  for (const p of (s.tech && s.tech.products) || []) if (p.stage === 'dev' || p.launch) out.push({ key: 'tech' + p.id, kind: 'tech', name: p.name, start: p.start, end: p.at, ref: p });
  for (const f of (s.media && s.media.films) || []) out.push({ key: 'media' + f.id, kind: 'media', name: `《${f.title}》`, start: f.start, end: f.at, ref: f });
  for (const [c, x] of Object.entries(s.cities || {})) if (x.status !== 'hq' && x.at) out.push({ key: 'city' + c, kind: 'city', name: c, start: x.at, end: x.at, ref: x });
  return out;
}
function scheduleNodes(s, t) {
  const X = lt(s); if (X.since == null) X.since = t;
  for (const p of projects(s)) {
    if (X.done[p.key] || p.start < X.since) continue; X.done[p.key] = { n: 0 };
  }
  for (const p of projects(s)) {
    const d = X.done[p.key]; if (!d || d.n >= L.nodes[p.kind].length || d.open) continue;
    const N = L.nodes[p.kind][d.n]; const at = N.days ? p.start + N.days * MG.DAY_MS : p.start + (p.end - p.start) * N.at;
    if (t < at) continue;
    if (p.kind !== 'city' && p.ref.result) { d.n = L.nodes[p.kind].length; continue; } // 已经结算了
    const m = addMsg(s, { kind: 'invite', type: 'late_dec', title: `${p.name}：${N.title}`, body: `${N.text}\n不拍板项目就停在这里。`, actions: N.options.map((o) => ({ key: o.key, label: o.label })), data: { key: p.key, kind: p.kind, n: d.n } }, t); /* V0.2.3（设计35 第十节）：不限时，不拍板项目暂停 */
    d.open = m.id; push(s, m, t);
  }
}
/** 节点拍板（消息按钮 / 超时默认 / autoplay）；key 为 null = 默认 */
export function decideNode(s, msgId, key, t) {
  const m = (s.inbox || []).find((x) => x.id === msgId); if (!m || !m.data || m.type !== 'late_dec') return { ok: false, why: '没有这件事' };
  const X = lt(s); const d = X.done[m.data.key]; const p = projects(s).find((x) => x.key === m.data.key); if (!d || !p) return { ok: false, why: '项目没了' };
  const N = L.nodes[m.data.kind][m.data.n]; const late = !!(m.data.until && t > m.data.until); const o = (!late && N.options.find((x) => x.key === key)) || N.options.find((x) => x.key === N.default);
  const sec = o.attr ? bestSec(s, o.attr) : null; const a = sec ? (attrs(s, sec)[o.attr] || 0) / 100 : 0.3; const r = rng(msgId * 7919 + (s.createdAt % 1e6))();
  const pickK = (v) => (Array.isArray(v) ? v[0] + (v[1] - v[0]) * clamp(a + (r - 0.5) * 0.5, 0, 1) : v);
  let text = `${N.title}：${o.label}`;
  if (o.cost) { const base = m.data.kind === 'tech' ? p.ref.cost || 0 : m.data.kind === 'media' ? (p.ref.cost && p.ref.cost.make) || 0 : 0; const c = Math.round(base * o.cost); if (c > 0) { pay(s, { wallet: 'company', cat: m.data.kind === 'tech' ? 'rnd' : 'film_cost', amount: c, force: true, party: '项目', note: `${p.name} ${N.title}：${o.label}` }, t); text += `，多花 ${Math.round(c / 1e4)} 万`; } }
  if (o.k != null) { const k = pickK(o.k); p.ref.q = (p.ref.q || 1) * k; text += k >= 1 ? `，效果 +${Math.round((k - 1) * 100)}%` : `，效果 ${Math.round((k - 1) * 100)}%`; }
  if (o.e != null) { const e = pickK(o.e); if (e) { lt(s).E = clamp(lt(s).E + e, 0, L.eMax); text += '，新城市打开了局面'; } }
  if (key != null && !late) credit(s, 'proj', 1, t);
  d.n += 1; d.open = null; m.status = 'done'; m.read = true; m.result = text; return { ok: true, text };
}
onAction('late_dec', (s, m, a, t) => decideNode(s, m.id, a, t).ok);

/** V0.2.3：没拍板的节点，项目的结束时间每天往后挪一天（暂停） */
function pauseOpenNodes(s, at) {
  const X = lt(s); const day = MG.DAY_MS; X.pauseDay = X.pauseDay || {};
  for (const p of projects(s)) { const d = X.done[p.key]; if (!d || !d.open) continue; const m = (s.inbox || []).find((x) => x.id === d.open); if (!m || m.status !== 'open' || m.data.until) continue;
    if (X.pauseDay[p.key] === Math.floor(at / day)) continue; X.pauseDay[p.key] = Math.floor(at / day);
    if (p.kind === 'city') { if (p.ref.at) p.ref.at += day; } else if (p.ref.at) p.ref.at += day; }
}
export const nodePaused = (s, key) => { const d = s.late && s.late.done && s.late.done[key]; return !!(d && d.open); };
// ---------- 3. 对手进攻 ----------
function attackers(s) { return RIVALS.filter((r) => !r.noAcquire && r.stage <= (s.title || 0) && !B.rivalState(s, r.id).acquired); }
export function spawnAttack(s, t, rnd = Math.random, forceKind = null) {
  const X = lt(s); const rs = attackers(s); if (!rs.length) return null; const r = rs[Math.floor(rnd() * rs.length)];
  const listed = !!(s.listing && s.listing.listed); const kinds = Object.entries(L.attack.kinds).filter(([, k]) => !k.listed || listed).map(([id]) => id);
  const kind = forceKind || kinds[Math.floor(rnd() * kinds.length)]; const K = L.attack.kinds[kind];
  const cost = Math.round(dayProfit(s) * L.attack.settleDays); X.seq += 1;
  const a = { id: X.seq, rival: r.id, kind, t, status: 'open', cost }; /* V0.2.3：不限时，挂着的时候一直少赚（mult） */
  const m = addMsg(s, { kind: 'invite', type: 'late_atk', from: '', title: `${r.name}：${K.name}`, body: `${K.text.replace('{r}', r.name)}\n没应对之前全公司营业额一直少 ${Math.round(-L.attack.openRev * 100)}%。应对：打一场商战（赢了化解），或者花钱摆平；不理的话一个月营业额 ${Math.round(L.attack.ignoreFx.rev * 100)}%${K.stock ? `、股价 ${Math.round(K.stock * 100)}%` : ''}。`,
    actions: [{ key: 'war', label: `商战应对（${r.name}）` }, { key: 'nego', label: `花钱摆平（约 ${Math.round(cost / 1e4)} 万）` }, { key: 'ignore', label: '不理' }], data: { atk: a.id } }, t);
  a.msg = m.id; X.atk.push(a); if (X.atk.length > 30) X.atk.shift(); push(s, m, t); return a;
}
function penalty(s, a, fx, t) {
  const X = lt(s); X.fx = X.fx.filter((f) => f.until > t); X.fx.push({ rev: fx.rev, until: t + fx.days * MG.DAY_MS, from: a.rival });
  X.E = clamp(X.E + (fx.e || 0), 0, L.eMax);
  const K = L.attack.kinds[a.kind]; if (K.stock && s.listing && s.listing.listed) s.listing.listed.px = r2(s.listing.listed.px * (1 + K.stock * (fx === L.attack.loseFx ? 0.5 : 1)));
}
/** 应对：war / nego / ignore（超时 = ignore） */
export function respond(s, atkId, how, t) {
  const X = lt(s); const a = X.atk.find((x) => x.id === atkId); if (!a || a.status !== 'open') return { ok: false, why: '这件事已经过去了' };
  if (a.until && t > a.until) how = 'ignore';
  const m = (s.inbox || []).find((x) => x.id === a.msg);
  if (how === 'war') {
    const team = Object.keys(s.secs || {}).filter((id) => !isTraining(s, id)).sort((x, y) => (attrs(s, y).manage + attrs(s, y).social) - (attrs(s, x).manage + attrs(s, x).social)).slice(0, 2);
    const r = W.start(s, a.rival, team, t); if (!r.ok) return { ok: false, why: r.why };
    a.status = 'war'; if (m) { m.status = 'done'; m.result = '打商战应对'; } return { ok: true, war: true };
  }
  if (how === 'nego') {
    if (a.cost > 0) pay(s, { wallet: 'company', cat: 'opex', amount: a.cost, force: true, party: RIVAL_BY_ID[a.rival].name, note: `应对${L.attack.kinds[a.kind].name}：花钱摆平` }, t);
    a.status = 'settled'; credit(s, 'attack', 0.5, t); if (m) { m.status = 'done'; m.result = `花了 ${Math.round(a.cost / 1e4)} 万摆平`; } return { ok: true };
  }
  a.status = 'ignored'; penalty(s, a, L.attack.ignoreFx, t); if (m) { m.status = 'done'; m.result = '没应对，吃了亏'; } return { ok: true, ignored: true };
}
onAction('late_atk', (s, m, a, t) => respond(s, m.data.atk, a, t).ok);
// 商战打完：是来应对进攻的，赢了化解、输了吃一半亏
B.onShare((s, rivalId, rounds, t) => {
  if (!s.late) return; const a = s.late.atk.find((x) => x.status === 'war' && x.rival === rivalId); if (!a) return;
  if (rounds >= 2) { a.status = 'won'; credit(s, 'attack', 1, t); } else { a.status = 'lost'; penalty(s, a, L.attack.loseFx, t); }
});
/** 三回合商战（自己打的）也算拍板 */
B.onShare((s, rivalId, rounds, t) => { if (s.war && s.war.open === false && s.war.rivalId === rivalId && !s.war.result) credit(s, 'war', 1, t), credit(s, 'warRound', rounds, t); });

// ---------- 每个游戏天（manage.onDay，在线离线都走） ----------
MG.onDay((s, d, at) => {
  if (!active(s)) return []; const X = lt(s); if (X.day == null) X.day = d;
  if (d > X.day) { X.E = X.E * Math.pow(0.5, (d - X.day) / L.halfLifeDays); X.day = d; }
  X.fx = X.fx.filter((f) => f.until > at);
  { X._off = true; X.share = X.share || {}; /* 非门店线的净利率（经营倍数按它作用到净利上） */
    try { for (const id of Object.keys(s.inds || {})) { const c = IND_BY_ID[id]; if (!c || c.retail) continue; const rev = E.industryRevenue(s, id) * 30 * MG.DAY_MS / 1000; const net = E.lineNetMonth(s, id); const cg = E.baseCogs(s, id) || 0; X.share[id] = rev > 0 && cg < 1 ? clamp(net / (rev * (1 - cg)), 0.02, 1) : 0.05; } } finally { X._off = false; } }
  for (const a of X.atk) if (a.status === 'open' && a.until && at > a.until) respond(s, a.id, 'ignore', at); // 老存档里有时限的照旧
  for (const m of s.inbox || []) if (m.type === 'late_dec' && m.status === 'open' && m.data.until && at > m.data.until) decideNode(s, m.id, null, at);
  pauseOpenNodes(s, at); // V0.2.3（设计35 第十节）：没拍板的节点，项目往后顺延一天
  scheduleNodes(s, at);
  const p = (L.attack.perMonth[String(Math.min(4, s.title || 0))] || 0) / 30; const r = rng(d * 131 + (s.createdAt % 1e6))();
  if (r < p && !X.atk.some((a) => a.status === 'open')) { const a = spawnAttack(s, at, rng(d * 977 + (s.createdAt % 1e6))); if (a) return [`${RIVAL_BY_ID[a.rival].name}出手了：${L.attack.kinds[a.kind].name}（没应对之前一直少赚）`]; }
  return [];
});
E.setLateHook((s, vm) => mult(s, vm));
setCredit(credit);
