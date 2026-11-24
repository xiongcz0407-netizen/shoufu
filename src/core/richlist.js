// V2-14 财富榜（设计32）：华夏财富榜（中国）+ 全球财富榜（世界），各 100 位
// 前 10（和华夏第 12 郑浩然）挂股票的人身价 = 持股 × 游戏里这只股票的实时市值（+ 私人部分）；其余按字库生成、存档里固定一份
// 对手老板 = 公司估值 × 70%，没上榜的放「你身边的人」；被你收购的退出。每个游戏年开始发榜（消息 + 新闻 + 秘书点评），首次进前 100 / 前 10 / 第 1 给人脉和剧情（只给一次）
// 存档 s.rich = { v 版本, ppl: [{ id, n 名字, c 国家, cn 中国富豪, biz 生意 / 行业, v 身价, stock, pct, priv, top 前 10 不出负面事件 }], seq, year 发过榜的年份, last: { cn: {id: 名次}, gl: {...} }, first: {}, net 人脉, story: [], acq: [] }
import C from '../config/richlist.json?v=f7808ad2' with { type: 'json' };
import { RIVALS, RIVAL_BY_ID } from '../config/rivals.js?v=f7808ad2';
import { SEC_BY_ID } from '../config/secretaries.js?v=f7808ad2';
import * as SK from './stocks.js?v=f7808ad2';
import { live as rivalLive } from './rivalgrow.js?v=f7808ad2';
import { rivalState } from './battle.js?v=f7808ad2';
import { netWorth } from './economy.js?v=f7808ad2';
import { addAttrHook } from './boss.js?v=f7808ad2';
import { addMsg } from './inbox.js?v=f7808ad2';
import { YEAR_MS } from './gametime.js?v=f7808ad2';
export { C as RICH_CFG };

const ME = 'me';
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (a, r) => a[Math.floor(r() * a.length)];
const gauss = (r) => { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const yearOf = (s, t) => Math.floor((t - s.createdAt) / YEAR_MS);
/** 名次 → 身价（对数插值，最后一段往后延） */
export function curve(kind, rank) {
  const a = C.curve[kind]; let i = 0; while (i < a.length - 2 && rank > a[i + 1][0]) i++;
  const [r0, v0] = a[i], [r1, v1] = a[i + 1]; const k = Math.log(v1 / v0) / Math.log(r1 / r0);
  return v0 * Math.pow(rank / r0, k);
}
// —— 名字 ——
const BLACK = new Set(C.blacklist);
function usedNames() { const u = new Set(C.top.map((x) => x.n)); for (const r of RIVALS) if (r.boss) u.add(r.boss); for (const x of Object.values(SEC_BY_ID)) u.add(x.name); return u; }
export function cnName(r, used) {
  for (let i = 0; i < 50; i++) {
    const sur = pick([...C.cnSur], r); const g = [...(r() < C.femaleP ? C.cnGivenF : C.cnGiven)]; const n = sur + pick(g, r) + (r() < 0.8 ? pick(g, r) : '');
    if (!BLACK.has(n) && !used.has(n) && n[1] !== n[2]) { used.add(n); return n; }
  }
  return null;
}
const GL = Object.fromEntries(Object.entries(C.gl).map(([k, v]) => [k, v.same ? { ...C.gl[v.same], w: v.w } : v]));
const GL_W = Object.entries(GL).reduce((a, [, v]) => a + v.w, 0);
export function glName(r, used) {
  for (let i = 0; i < 50; i++) {
    let x = r() * GL_W, c = null; for (const [k, v] of Object.entries(GL)) { x -= v.w; if (x <= 0) { c = k; break; } } c = c || '美国';
    const g = GL[c]; const n = g.fam ? pick(g.f, r) + pick(g.l, r) : `${pick(g.f, r)}·${pick(g.l, r)}`;
    if (!used.has(n) && !BLACK.has(n)) { used.add(n); return { n, c }; }
  }
  return null;
}
// —— 生成 ——
export const rc = (s) => { if (!s.rich) init(s); return s.rich; };
function genPerson(R, kind, v, r, used) {
  R.seq = (R.seq || 0) + 1;
  if (kind === 'cn') { const n = cnName(r, used); if (!n) return null; return { id: 'g' + R.seq, n, c: '中国', cn: true, biz: pick(C.cnInd, r), v: Math.round(v) }; }
  const x = glName(r, used); if (!x) return null; return { id: 'g' + R.seq, n: x.n, c: x.c, biz: pick(C.glInd, r), v: Math.round(v) };
}
export function init(s) {
  const r = rng(hash(`rich|${s.createdAt || 0}`)); const used = usedNames();
  const R = (s.rich = { v: 1, ppl: [], seq: 0, year: null, last: null, first: {}, net: 0, story: [], acq: [] });
  for (const x of C.top) R.ppl.push({ id: x.id, n: x.n, c: x.c, cn: !!x.cn, biz: x.biz, v: x.v || 0, stock: x.stock || null, pct: x.pct || 0, priv: x.priv || 0, top: true });
  for (let k = 11; k <= C.pool; k++) { if (k === 12) continue; const p = genPerson(R, 'cn', curve('cn', k) * (1 + (r() * 2 - 1) * C.jitter), r, used); if (p) R.ppl.push(p); }
  for (let k = 11; k <= C.pool; k++) { const p = genPerson(R, 'gl', curve('gl', k) * (1 + (r() * 2 - 1) * C.jitter), r, used); if (p) R.ppl.push(p); }
  return R;
}
// —— 身价 ——
const capOf = (s, code) => (s.mkt && s.mkt.px && s.mkt.px[code] != null ? SK.marketCap(s, code) : SK.BY[code].price * SK.BY[code].shares * 1e8);
export const valueOf = (s, p) => (p.stock ? p.pct * capOf(s, p.stock) + (p.priv || 0) : p.v);
/** 对手老板：没被收购的（投行不算） */
export function rivalPpl(s) {
  const out = [];
  for (const r of RIVALS) {
    if (r.noAcquire || !r.boss) continue; if (rivalState(s, r.id).acquired) continue;
    const lv = rivalLive(s, r.id); out.push({ id: 'rv_' + r.id, rival: r.id, n: r.boss, c: '中国', cn: true, biz: `${r.name}（${r.ind}）`, v: Math.round(lv.value * C.rivalStake), img: r.bossImg ? `assets/boss/${r.bossImg}.webp` : null, desc: r.desc });
  }
  return out;
}
export const meRow = (s) => ({ id: ME, me: true, n: s.bossName || '你', c: '中国', cn: true, biz: s.companyName || '', v: netWorth(s) });
/** 一张榜：[{ ...人, val, rank }] 前 100；all = 带名次的全部（含榜外的，给差多少用） */
export function board(s, kind) {
  const R = rc(s); const all = [...R.ppl.filter((p) => kind === 'gl' || p.cn), ...rivalPpl(s), meRow(s)].map((p) => ({ ...p, val: p.me || p.rival ? p.v : valueOf(s, p) }));
  all.sort((a, b) => b.val - a.val); all.forEach((p, i) => (p.rank = i + 1));
  return { list: all.slice(0, C.size), all, me: all.find((p) => p.me), cut: all[C.size - 1] ? all[C.size - 1].val : 0 };
}
export function myRank(s, kind) { const b = board(s, kind); return { rank: b.me.rank <= C.size ? b.me.rank : null, gap: b.me.rank <= C.size ? 0 : Math.max(0, b.cut - b.me.val + 1), val: b.me.val }; }
/** 你身边的人：没上华夏榜的对手老板 */
export function nearby(s) { const b = board(s, 'cn'); return b.all.filter((p) => p.rival && p.rank > C.size); }

// —— 每年变 ——
export function yearStep(s, r) {
  const R = rc(s); const Y = C.year; const news = { crash: [] }; const vals = {};
  for (const p of R.ppl) {
    if (p.stock) { if (p.priv) p.priv = Math.round(p.priv * (1 + Y.priv)); continue; } // 挂股票的只跟股价走
    const g = p.top ? Y.top : Y.gen; p.v = Math.round(p.v * (1 + clamp(g.mean + gauss(r) * g.sd, g.lo, g.hi)));
  }
  for (const kind of ['cn', 'gl']) {
    const b = board(s, kind); const gens = b.list.filter((p) => !p.top && !p.rival && !p.me && !(kind === 'gl' && p.cn));
    const n = Y.crash.n[0] + Math.floor(r() * (Y.crash.n[1] - Y.crash.n[0] + 1));
    for (let i = 0; i < n && gens.length; i++) { const x = gens.splice(Math.floor(r() * gens.length), 1)[0]; const P = R.ppl.find((q) => q.id === x.id); const k = Y.crash.lo + r() * (Y.crash.hi - Y.crash.lo); P.v = Math.round(P.v * (1 - k)); news.crash.push({ id: P.id, n: P.n, why: pick(Y.crash.why, r), k, kind }); }
    const m = Y.newcomer.n[0] + Math.floor(r() * (Y.newcomer.n[1] - Y.newcomer.n[0] + 1)); const used = new Set(R.ppl.map((p) => p.n));
    for (let i = 0; i < m; i++) { const rk = Y.newcomer.rank[0] + Math.floor(r() * (Y.newcomer.rank[1] - Y.newcomer.rank[0])); const ref = b.list[Math.min(b.list.length - 1, rk - 1)]; if (!ref) continue; const p = genPerson(R, kind, ref.val * (1 + r() * 0.1), r, used); if (p) { p.newAt = yearOf(s, s.rich.lastT || s.createdAt); R.ppl.push(p); } }
    const cut = board(s, kind).cut; R.ppl = R.ppl.filter((p) => p.top || (kind === 'cn' ? !p.cn : p.cn) || p.v >= cut * Y.dropBelow);
  }
  return news;
}
const ranksOf = (b) => Object.fromEntries(b.list.map((p) => [p.id, p.rank]));
/** 每跳叫（在线、离线补算）：跨年就发榜（只发最近一年的），中间的年份照样变；还查首次上榜奖励 */
export function tick(s, t, rnd) {
  const R = rc(s); const y = yearOf(s, t); R.lastT = t; let out = null;
  if (R.year == null) R.year = y; // 第一次：从这一年算起，下一年开始发榜
  if (R.last == null) R.last = { cn: ranksOf(board(s, 'cn')), gl: ranksOf(board(s, 'gl')), me: { cn: null, gl: null } };
  if (y > R.year) {
    const r = rnd ? rnd : rng(hash(`richy|${s.createdAt}|${y}`)); let news = null;
    for (let k = R.year + 1; k <= y; k++) news = yearStep(s, r);
    out = publish(s, y, news, t, r); R.year = y;
  }
  checkFirst(s, t);
  return out;
}
function publish(s, y, news, t, r) {
  const R = rc(s); const pages = [];
  for (const [kind, title] of [['cn', '华夏财富榜'], ['gl', '全球财富榜']]) {
    const b = board(s, kind); const lastR = R.last[kind] || {}; const me = b.me; const was = R.last.me ? R.last.me[kind] : null;
    const mine = me.rank <= C.size ? (was ? (was > me.rank ? `第 ${me.rank} 名，升了 ${was - me.rank} 名` : was < me.rank ? `第 ${me.rank} 名，降了 ${me.rank - was} 名` : `第 ${me.rank} 名，跟去年一样`) : `第 ${me.rank} 名，首次上榜`) : `还没上榜，距离上榜还差 ¥${fmt(b.cut - me.val)}`;
    const top3 = b.list.slice(0, 3).map((p) => p.n).join('、');
    const out = Object.keys(lastR).filter((id) => id !== ME && !b.list.some((p) => p.id === id));
    const outNames = out.map((id) => { const c = news && news.crash.find((x) => x.id === id && x.kind === kind); const rv = id.startsWith('rv_') && RIVAL_BY_ID[id.slice(3)]; if (rv && rivalState(s, rv.id).acquired) return `${rv.name}被收购，${rv.boss}跌出榜单`; const p = R.ppl.find((q) => q.id === id); return p ? `${p.n}${c ? `（${c.why}）` : ''}` : null; }).filter(Boolean);
    const inn = b.list.filter((p) => !p.me && !lastR[p.id]).map((p) => p.n);
    pages.push({ kind, title, mine, top3, out: outNames.slice(0, 3), inn: inn.slice(0, 3), rank: me.rank <= C.size ? me.rank : null, was, gap: me.rank <= C.size ? 0 : b.cut - me.val });
    R.last[kind] = ranksOf(b); R.last.me[kind] = me.rank <= C.size ? me.rank : null;
  }
  const secs = Object.keys(s.secs || {}); const who = s.current && SEC_BY_ID[s.current] ? s.current : secs[0]; const cn = pages[0];
  const sl = who ? secLine(who, cn) : '';
  const body = pages.map((p) => `【${p.title}】你：${p.mine}。前三：${p.top3}。${p.out.length ? `跌出榜单：${p.out.join('、')}。` : ''}${p.inn.length ? `冲进来：${p.inn.join('、')}。` : ''}`).join('\n') + (sl ? `\n${SEC_BY_ID[who].name}：「${sl}」` : '');
  addMsg(s, { kind: 'report', type: 'richlist', from: who || '', title: `第 ${y + 1} 年财富榜出炉`, body, actions: [{ key: 'open', label: '看榜单' }], data: { y, pages } }, t);
  return { published: y, pages, line: sl };
}
export function secLine(secId, p) {
  const L = C.secLines; const ty = SEC_BY_ID[secId].type; const tpl = (k) => (L[k][ty] || L[k]['知性']);
  if (!p.rank) return tpl('off').replace('{gap}', `¥${fmt(p.gap)}`);
  if (!p.was) return tpl('first').replace('{r}', p.rank);
  const d = p.was - p.rank; return d > 0 ? tpl('up').replace('{d}', d) : d < 0 ? tpl('down').replace('{d}', -d) : tpl('same');
}
const fmt = (n) => (n >= 1e12 ? `${+(n / 1e12).toFixed(2)}万亿` : n >= 1e8 ? `${+(n / 1e8).toFixed(1)}亿` : n >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);
// —— 首次上榜奖励（只给一次）——
export function checkFirst(s, t) {
  const R = rc(s); const got = [];
  for (const kind of ['cn', 'gl']) {
    const { rank } = myRank(s, kind); if (!rank) continue;
    for (const lv of [100, 10, 1]) {
      const k = kind + lv; if (rank > lv || R.first[k]) continue;
      R.first[k] = t; R.net += C.reward[kind][String(lv)] || 0; got.push(k);
      const lines = C.stories[k].map(([w, x]) => ({ who: w, text: x.replace('{boss}', s.bossName || '老板') }));
      if (k === 'cn10') for (const id of Object.keys(s.secs || {})) { const ty = SEC_BY_ID[id] && SEC_BY_ID[id].type; if (ty) lines.push({ who: id, text: C.tvLines[ty] || C.tvLines['知性'] }); }
      const prev = R.story.findIndex((x) => x.k.startsWith(kind) && got.includes(x.k)); if (prev >= 0) R.story.splice(prev, 1); // 一下子跨了几档只播最高那档（奖励照样都给）
      R.story.push({ k, lines });
    }
  }
  return got;
}
addAttrHook((s) => ({ network: (s.rich && s.rich.net) || 0 }));
