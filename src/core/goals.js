// 第 P-06 项（设计25 第四节）：新手目标链 12 个 —— 主页顶上一条「当前目标」，做完自动领奖、弹一段剧情；做完整条链换成「下一个称号还差什么」
// 亲自上阵、经营事件、口碑、店长是开发1（P-05）的东西：那边做到了叫 mark(s, 'act' | 'event' | 'rep60' | 'manager')；口碑奖励、店长工资减半通过 onReward 挂钩交给那边，没挂钩先记在 s.goals.pending
import CFG from '../config/goals.json?v=2c0f4ae6' with { type: 'json' };
import { receive } from './ledger.js?v=2c0f4ae6';
import { netWorth, promoteRival } from './economy.js?v=2c0f4ae6';
import { addFavor, addLove } from './affection.js?v=2c0f4ae6';
import { TITLES } from '../config/titles.js?v=2c0f4ae6';
import { RIVALS } from '../config/rivals.js?v=2c0f4ae6';

export const GCFG = CFG; export const LIST = CFG.list;
export function gl(s) { return (s.goals = s.goals || { i: 0, marks: {}, energy: 0, pending: {}, fresh: [], doneAt: {} }); }
/** 开发1 的经营代码做到了就叫：act 第一次亲自上阵、event 第一次处理事件、rep60 有店口碑到 60、manager 雇了店长 */
export function mark(s, key) { gl(s).marks[key] = true; }
/** 精力上限加了多少（开发1 的精力上限 + 这个） */
export const energyBonus = (s) => (s.goals ? s.goals.energy || 0 : 0);
const HOOKS = {}; /** kind：rep（口碑 +n，给最近亲自经营的店）、mgrHalf（店长首月工资减半）；fn(s, n, t) */
export const onReward = (kind, fn) => { HOOKS[kind] = fn; };

const anyStaff = (s, role) => Object.values(s.inds || {}).some((x) => (x.staff || {})[role] > 0);
const totalStaff = (s) => Object.values(s.inds || {}).reduce((a, x) => a + Object.values(x.staff || {}).reduce((b, n) => b + n, 0) + Object.values(x.agency || {}).reduce((b, n) => b + n, 0), 0);
/** 这个目标现在：{ done, cur, need }（cur / need 给进度条） */
export function progress(s, g) {
  const M = gl(s).marks; const b = (v) => ({ done: !!v, cur: v ? 1 : 0, need: 1 });
  switch (g.kind) {
    case 'act': case 'event': case 'rep60': return b(M[g.kind]);
    case 'manager': return b(M.manager || anyStaff(s, 'manager'));
    case 'food': return b(s.inds.food && s.inds.food.branches > 0);
    case 'hire': return b(totalStaff(s) > 0);
    case 'stock': return b((s.mkt && (s.mkt.bought || Object.keys(s.mkt.hold || {}).length)) || M.stock);
    case 'date': { const r = s.secs[CFG.who] && s.secs[CFG.who].rec; return b(r && r.dates > 0); }
    case 'course': return b((s.training || []).length || (s.stats && s.stats.coursesDone));
    case 'beat': { const r = (s.rivals || {})[g.rival]; return b(r && r.wins > 0); }
    case 'nw': case 'lu': { const v = netWorth(s); const ok = g.kind === 'lu' ? v >= g.n || !!s.secs.s10_lu : v >= g.n; return { done: ok, cur: Math.min(v, g.n), need: g.n }; }
    default: return b(false);
  }
}
export const current = (s) => LIST[gl(s).i] || null;
export const finished = (s) => gl(s).i >= LIST.length;
const fmt = (n) => (n >= 1e8 ? `${+(n / 1e8).toFixed(2)} 亿` : n >= 1e4 ? `${+(n / 1e4).toFixed(1)} 万` : `${Math.round(n)}`);
export function rewardText(g) {
  if (g.rewardText) return g.rewardText; const r = g.reward || {};
  if (r.cash) return `${fmt(r.cash)} 元`; return '';
}
function grant(s, g, t) {
  const r = g.reward || {}; const G = gl(s);
  if (r.cash) receive(s, { wallet: 'personal', cat: 'newbie', amount: r.cash, party: '新手目标', note: `新手目标：${g.text}` }, t);
  if (r.rep) { if (HOOKS.rep) HOOKS.rep(s, r.rep, t); else G.pending.rep = (G.pending.rep || 0) + r.rep; }
  if (r.favor) addFavor(s, CFG.who, r.favor);
  if (r.love) addLove(s, CFG.who, r.love);
  if (r.energy) G.energy += r.energy;
  if (r.hint && s.mkt) s.mkt.freeHint = (s.mkt.freeHint || 0) + r.hint;
  if (r.course) G.freeCourse = { at: t };
  if (r.mgrHalf) { if (HOOKS.mgrHalf) HOOKS.mgrHalf(s, 1, t); else G.pending.mgrHalf = true; }
}
/** 免费一节课：领了以后第一笔课程费退回公司账户 */
function freeCourse(s, t) {
  const f = gl(s).freeCourse; if (!f) return;
  const row = (s.ledger || []).find((x) => x.cat === 'training' && x.dir === 'out' && x.t >= f.at && !x.memo);
  if (!row) return;
  receive(s, { wallet: 'company', cat: 'refund', amount: row.amount, party: '新手目标', note: `新手奖励：免费一节课（退回「${row.note}」的课程费）` }, t);
  gl(s).freeCourse = null;
}
/** 每秒（在线）看一次：做完的发奖、推进；返回这次做完的 [目标] */
export function check(s, t = Date.now()) {
  const G = gl(s); const out = []; freeCourse(s, t);
  while (G.i < LIST.length) {
    const g = LIST[G.i]; if (!progress(s, g).done) break;
    grant(s, g, t); G.doneAt[g.id] = t; G.i++; out.push(g); G.fresh.push(g.id);
  }
  if (G.fresh.length > 12) G.fresh.splice(0, G.fresh.length - 12);
  return out;
}
/** 做完整条链以后：下一个称号还差什么 → { title, need, nw, rival, rivalName, acquired } */
export function nextTitle(s) {
  const cur = TITLES[s.title || 0]; const nx = TITLES[(s.title || 0) + 1]; if (!nx || (cur && cur.last)) return null;   // 大亨是这一版最后一个称号（last），后面的不开放
  const rv = promoteRival(s); const r = rv && RIVALS.find((x) => x.id === rv);
  return { title: nx.name, need: nx.need, nw: netWorth(s), rival: rv, rivalName: r ? r.name : '', acquired: !!(rv && (s.flags.acquired || {})[rv]) };
}
