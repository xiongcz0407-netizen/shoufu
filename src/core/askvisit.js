// 设计96 特殊事件「主动要求」：玩家在线（游戏在前台）时，已经是恋人的秘书来找你
// s.ask = { day 本地日, at 今天累计在线多少秒来, on 今天累计在线秒数, done 今天来过了, seen [这次上线来过的 id], pending { id, idx } 卡片挂着还没答, last { id: 上次来的时间 } }
// 一天一个：当天累计在线 5～40 分钟里的随机时刻；精力 < 100 先等；看剧情 / 商战 / 约会 / 弹框时不来（busy）
// 人选：恋人（爱慕 ≥ 80）、有主动要求剧情（她现在阶段能用的）、没在上课 / 外派、这次上线没来过；最近来过的往后排（轮着来）
import { ASK_LIB } from '../config/story/index.js?v=3839f433';
import { SECRETARIES } from '../config/secretaries.js?v=3839f433';
import { E_COST, energy, doEnergy } from './manage.js?v=3839f433';
import { recordDate } from './dates.js?v=3839f433';
import { canBring } from './trip.js?v=3839f433';
import { pickN, stageOf } from './datelib.js?v=3839f433';
import { ensureSec } from './secretary.js?v=3839f433';
import { PRIV_MIN_LOVE, PRIV_LOVE, PRIV_FAVOR, afterPriv } from './privdate.js?v=3839f433';
import { localDay } from './afterlines.js?v=3839f433';
import { addLoadFix } from './loadfix.js?v=3839f433';

export const ASK_MIN = 5, ASK_MAX = 40;   // 分钟
export const ASK_PLACE = '主动要求';
export const ask = (s) => (s.ask = s.ask || { day: '', at: 0, on: 0, done: false, seen: [], pending: null, last: {} });
/** 她现在阶段能用的场景下标 */
const scenesFor = (s, id) => { const L = (ASK_LIB[id] && ASK_LIB[id].scenes) || []; const st = stageOf(s.secs[id].love); return L.map((_, i) => i).filter((i) => (L[i].min || 0) <= st); };
export const hasAskLib = (id) => !!(ASK_LIB[id] && Array.isArray(ASK_LIB[id].scenes) && ASK_LIB[id].scenes.length);
/** 符合条件的秘书 */
export function askCands(s) {
  const a = ask(s);
  return SECRETARIES.map((c) => c.id).filter((id) => s.secs[id] && s.secs[id].love >= PRIV_MIN_LOVE && hasAskLib(id) && scenesFor(s, id).length && canBring(s, id) && !a.seen.includes(id));
}
/** 换天：重新随机今天什么时候来 */
export function newDay(s, t, rnd = Math.random) {
  const a = ask(s); const d = localDay(t); if (a.day === d) return false;
  a.day = d; a.at = Math.round((ASK_MIN + rnd() * (ASK_MAX - ASK_MIN)) * 60); a.on = 0; a.done = false; a.pending = null;
  return true;
}
/** 这次上线：清掉「这次上线来过的」（游戏打开时调一次） */
export const newSession = (s) => { ask(s).seen = []; };
/** 挑一位：最近来过的往后排（没来过的最先），同样久的随机 */
export function pickAsk(s, rnd = Math.random) {
  const a = ask(s); const L = askCands(s); if (!L.length) return null;
  const lastOf = (id) => a.last[id] || 0; const min = Math.min(...L.map(lastOf));
  const pool = L.filter((id) => lastOf(id) === min); return pool[Math.floor(rnd() * pool.length)];
}
/** 每秒（只在前台调）：加在线时间；到点、精力够、不忙就挑一位挂上。返回 pending（要弹卡片的）或 null */
export function askTick(s, t, dt, busy = false, rnd = Math.random) {
  const a = ask(s); newDay(s, t, rnd);
  if (a.pending) return busy ? null : a.pending;
  if (a.done) return null;
  a.on += dt;
  if (a.on < a.at || busy) return null;
  if (energy(s, t) < E_COST.privMin - 1e-9) return null;   // 精力不够先等
  const id = pickAsk(s, rnd); if (!id) return null;
  const [idx] = pickN(scenesFor(s, id), usedOf(s, id), 1, rnd);
  a.pending = { id, idx, at: t }; a.seen.push(id);
  return a.pending;
}
const usedOf = (s, id) => { const r = ensureSec(s, id).rec; r.dateUsed = r.dateUsed || {}; return (r.dateUsed.ask = r.dateUsed.ask || []); };
export const sceneOf = (p) => ASK_LIB[p.id].scenes[p.idx];
/** 「好」：照私密约会算一次（爱慕 +10、好感 +20、精力清空、送丝袜、次日台词），askCount +1，不算私密约会次数 */
export function goAsk(s, t, outfit = null, rnd = Math.random) {
  const a = ask(s); const p = a.pending; if (!p) return { ok: false, why: '没有人来' };
  doEnergy(s, energy(s, t), t);
  const r = recordDate(s, p.id, t, ASK_PLACE, PRIV_LOVE, PRIV_FAVOR);
  const rec = s.secs[p.id].rec; rec.askCount = (rec.askCount || 0) + 1; s.stats.asks = (s.stats.asks || 0) + 1;
  const { stk, gift } = afterPriv(s, p.id, t, outfit, rnd);
  a.pending = null; a.done = true; a.last[p.id] = t;
  return { ok: true, id: p.id, scene: sceneOf(p), stk, gift, outfit, ...r };
}
/** 「现在不行」：她说一句，今天算来过，别的都不变 */
export function refuseAsk(s, t) {
  const a = ask(s); const p = a.pending; if (!p) return { ok: false };
  a.pending = null; a.done = true; a.last[p.id] = t;
  return { ok: true, id: p.id, lines: sceneOf(p).refuse || [] };
}
addLoadFix(newSession);

/** 结构检查（test/story96 遍历主动要求_<id>.json）：5 场、恋人 / 唯一两个阶段都有，knock / refuse / open / close（含 #黑屏）、q1 q2 各 3 个选项 */
const strArr = (a) => Array.isArray(a) && a.length > 0 && a.every((x) => typeof x === 'string' && x.length > 0);
export function checkAskFile(d, who) {
  const bad = []; if (!d || d.who !== who) bad.push(`who 不对（${d && d.who}）`);
  const sc = (d && d.scenes) || []; if (sc.length < 5) bad.push(`只有 ${sc.length} 场`);
  for (const m of [4, 5]) if (!sc.some((x) => x.min === m)) bad.push(`没有 min ${m} 的场景`);
  sc.forEach((x, i) => {
    for (const k of ['knock', 'refuse', 'open', 'close']) if (!strArr(x[k])) bad.push(`[${i}] ${k} 不对`);
    if (strArr(x.close) && !x.close.includes('#黑屏')) bad.push(`[${i}] close 要含 #黑屏`);
    for (const q of ['q1', 'q2']) { const Q = x[q]; if (!Q || !strArr(Q.ask) || !Array.isArray(Q.opts) || Q.opts.length !== 3 || !Q.opts.every((o) => o && typeof o.t === 'string' && strArr(o.r))) bad.push(`[${i}] ${q} 不对`); }
  });
  return bad;
}
