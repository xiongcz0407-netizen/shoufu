// V3-03 / V3-04：设计/剧情/ 里的出差片段和台词（tools/story_sync.mjs 拷进 src/config/story/，按文件名自动读）
// 台词：台词_<秘书id>.json = { who, lines: { 场合: [句子…] } }，合进原来的 LINES（老的 8 句保留，每次随机挑一句）
//   设计的格式（台词_s09_xia.json 的 _说明）：条目是字符串或 { t, fav }（好感到第 fav 段才说）；greet_am / greet_pm / greet_night 按时间并进 greet（深夜再加 overtime）；
//   tap_head / tap_hand / tap_cloth 并进 tap；trip_ask = 出差前；schedule = 日程带她出席前；battle_win / battle_lose = 商战赢 / 输；其余用 lineOf(id, 场合) 取；不连着重复
// 出差：出差_<秘书id>.json = { who, stages: { 1..5: { open: [[句子…]×8], mid, end } } }；用过的记存档 s.storyUsed，全部用完才轮回
import { LINES } from '../config/lines.js?v=ad479e23';
import { TRIP_LIB, LINE_PACKS } from '../config/story/index.js?v=ad479e23';
export { TRIP_LIB, LINE_PACKS };

const MERGE = { tap: ['tap_head', 'tap_hand', 'tap_cloth'], happy: ['gift'] };
const ALIAS = { trip_before: ['trip_ask'], date_invite: ['date_ask'] }; // 设计文件里的名字 → 我这边用的名字
let hourOf = () => new Date().getHours();
export const setHourFn = (fn) => { hourOf = fn; };
/** 好感阶段（0 陌生～4 知己）：条目 { t, fav } 到了才说；ui 那边 setFavorFn 接上存档 */
let favOf = () => 4;
export const setFavorFn = (fn) => { favOf = fn; };
const period = () => { const h = hourOf(); return h < 11 ? ['greet_am', 'greet_morning'] : h < 18 ? ['greet_pm', 'greet_noon'] : ['greet_night', 'greet_evening', ...(h >= 22 || h < 5 ? ['overtime'] : [])]; };
const BASE = {};
const textOf = (x, fav) => (typeof x === 'string' ? x : x && typeof x.t === 'string' && (x.fav == null || fav >= x.fav) ? x.t : null);
/** 这个场合能说的所有句子（老的排第一 + 扩充的；好感不够的不算） */
export function pool(id, scene, fav = favOf(id)) {
  const base = BASE[id] && typeof BASE[id][scene] === 'string' ? [BASE[id][scene]] : [];
  const P = (LINE_PACKS[id] && LINE_PACKS[id].lines) || {};
  let keys = [scene, ...(ALIAS[scene] || [])];
  if (scene === 'greet') keys = [...keys, ...period()];
  else if (MERGE[scene]) keys = [...keys, ...MERGE[scene]];
  const extra = keys.flatMap((k) => P[k] || []).map((x) => textOf(x, fav)).filter(Boolean);
  return [...base, ...extra].filter((x) => typeof x === 'string' && x);
}
const LAST = {};
/** 随机挑一句，不跟上一句重复 */
export const lineOf = (id, scene, rnd = Math.random, fallback = '') => {
  const p = pool(id, scene); if (!p.length) return fallback; const k = `${id}.${scene}`;
  let c = p.filter((x) => x !== LAST[k]); if (!c.length) c = p; const x = c[Math.floor(rnd() * c.length)]; LAST[k] = x; return x;
};
/** 把扩充台词挂进 LINES：LINES[id].greet 之类每次取都随机挑一句（调用的地方不用改） */
for (const id of Object.keys(LINES)) {
  BASE[id] = { ...LINES[id] };
  if (!LINE_PACKS[id]) continue;
  LINES[id] = new Proxy(BASE[id], { get: (o, k) => (typeof k === 'string' && (k in o || (LINE_PACKS[id].lines || {})[k] || MERGE[k] || ALIAS[k]) ? lineOf(id, k, Math.random, o[k]) : o[k]) });
}
export const lineCount = (id) => { const P = (LINE_PACKS[id] && LINE_PACKS[id].lines) || {}; return Object.values(P).reduce((a, x) => a + (x.length || 0), 0); };

// —— 出差过夜片段 ——
export const hasTrip = (id) => !!(TRIP_LIB[id] && TRIP_LIB[id].stages);
/** 挑一段（不重复，用完轮回）：part = open / mid / end；stage 1～5（0 按 1） */
export function pickSeg(s, id, stage, part, rnd = Math.random) {
  const lib = TRIP_LIB[id]; if (!lib) return null; const st = String(Math.max(1, Math.min(5, stage || 1)));
  const list = (lib.stages[st] || {})[part]; if (!list || !list.length) return null;
  const U = (s.storyUsed = s.storyUsed || {}); const key = `${id}.${st}.${part}`; let used = U[key] || [];
  if (used.length >= list.length) used = [];
  const left = list.map((_, i) => i).filter((i) => !used.includes(i)); const i = left[Math.floor(rnd() * left.length)];
  U[key] = [...used, i];
  return list[i];
}
/** 一晚：open + mid + end，占位换成城市、夜景、酒店 */
export function night(s, id, stage, vars, rnd = Math.random) {
  const sub = (x) => x.replace(/\{城市\}/g, vars.city || '').replace(/\{夜景\}/g, vars.view || '').replace(/\{酒店\}/g, vars.hotel || '').replace(/\{衣服\}/g, vars.cloth || '那套衣服'); // V3-05：{衣服} = 她那时穿的
  return ['open', 'mid', 'end'].map((p) => (pickSeg(s, id, stage, p, rnd) || []).map(sub));
}
