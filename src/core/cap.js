/* 设计79：有上限的列表（开发2）
   capPush(list, item, max, fold)：加到尾巴，超了丢最老的；fold(丢掉的) 先汇总
   capAdd(s, key, list, item)：按 config/caps.js 的登记表（上限、新的在前还是在后、汇总函数）
   trimAll(s)：把存档里登记过的列表都整理到上限以内（读档、每个游戏天、上传前太大时）
   capCfg.scale：上限打几折（云端传不上时砍一半：shrinkHalf） */
import { LOG, BOUND, UNLISTED_MAX } from '../config/caps.js?v=06229def';

export const capCfg = { scale: 1 };
const FOLDS = {}; const ONADD = {};
/** 某个列表每加一条都要顺手做的事（完税凭证 → books.tax）：fn(s, item) */
export const setOnAdd = (key, fn) => { ONADD[key] = fn; };
/** 某个列表丢掉老记录前先汇总：fn(s, 丢掉的记录（按时间从老到新）) */
export const setFold = (key, fn) => { FOLDS[key] = fn; };
export const capOf = (key) => { const c = LOG[key]; return c ? Math.max(1, Math.floor(c.max * capCfg.scale)) : Infinity; };

export function capPush(list, item, max, fold) {
  list.push(item);
  if (list.length > max) { const old = list.splice(0, list.length - max); if (fold) fold(old); }
  return list;
}
export function capUnshift(list, item, max, fold) {
  list.unshift(item);
  if (list.length > max) { const old = list.splice(max); if (fold) fold(old.reverse()); }
  return list;
}
const foldFor = (s, key) => FOLDS[key] && ((old) => FOLDS[key](s, old));
/** 按登记表加一条；list 不存在就别用这个（先建好） */
export function capAdd(s, key, list, item) {
  const c = LOG[key]; if (!c) throw new Error(`config/caps.js 没登记：${key}`);
  if (ONADD[key]) ONADD[key](s, item);
  return (c.front ? capUnshift : capPush)(list, item, capOf(key), foldFor(s, key));
}
/** 列表现在超了就砍到上限（不加新的） */
export function capTrim(s, key, list) {
  const c = LOG[key], max = capOf(key); if (!c || !Array.isArray(list) || list.length <= max) return 0;
  const old = c.front ? list.splice(max).reverse() : list.splice(0, list.length - max);
  const f = foldFor(s, key); if (f) f(old); return old.length;
}

/** 按路径找到存档里的所有数组：[ [实际路径, 数组] … ] */
export function resolve(s, path) {
  let cur = [['', s]];
  for (const seg of path.split('.')) {
    const next = [];
    const isArr = seg.endsWith('[]'); const k = isArr ? seg.slice(0, -2) : seg;
    for (const [p, o] of cur) {
      if (!o || typeof o !== 'object') continue;
      const kids = k === '*' ? Object.entries(o) : (k in o ? [[k, o[k]]] : []);
      for (const [kk, v] of kids) {
        const pp = p ? `${p}.${kk}` : kk;
        if (isArr) { if (Array.isArray(v)) v.forEach((x, i) => next.push([`${pp}[${i}]`, x])); } else next.push([pp, v]);
      }
    }
    cur = next;
  }
  return cur.filter(([, v]) => Array.isArray(v));
}
/** 状态型列表里「已经结束、只留着看」的部分（做完的地产项目等）：各模块自己挂整理函数 fn(s, scale) → 砍掉几条 */
const TRIMS = [];
export const addTrim = (fn) => { TRIMS.push(fn); };
/** 整理全部；返回砍掉多少条 */
export function trimAll(s) {
  let n = 0;
  for (const fn of TRIMS) n += fn(s, capCfg.scale) || 0;
  for (const key of Object.keys(LOG)) for (const [, a] of resolve(s, key)) n += capTrim(s, key, a);
  return n;
}
/** 云端传不上（压缩后还超过 5 MB）：上限打对折再整理一遍。k = 第几次（1 → 1/2，2 → 1/4 …，最多 1/16） */
export function shrinkHalf(s, k = 1) {
  const old = capCfg.scale; capCfg.scale = Math.max(1 / 16, old / 2 ** k);
  try { return trimAll(s); } finally { capCfg.scale = old; }
}

/** 测试用：存档里每个数组 → 是否超上限 / 没登记又太长。返回问题列表 */
export function checkArrays(s) {
  const bad = []; const keyOf = (path) => path.replace(/\[\d+\]/g, '[]');
  const pats = [...Object.keys(LOG).map((k) => [k, LOG[k].max]), ...Object.entries(BOUND)].map(([k, max]) => [new RegExp('^' + k.replace(/\./g, '\\.').replace(/\[\]/g, '\\[\\]').replace(/\*\*/g, '\u0001').replace(/\*/g, '[^.]+').replace(/\u0001/g, '.+') + '$'), max, k]);
  const walk = (o, p) => {
    if (Array.isArray(o)) {
      const kp = keyOf(p); const hit = pats.find(([re]) => re.test(kp));
      if (hit ? o.length > hit[1] : o.length > UNLISTED_MAX || UNLISTED_MAX === 0) bad.push({ path: p, len: o.length, max: hit ? hit[1] : UNLISTED_MAX, listed: !!hit });
      o.forEach((x, i) => walk(x, `${p}[${i}]`));
    } else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (!p && k.startsWith('_')) continue; walk(v, p ? `${p}.${k}` : k); }   // _ 开头的是模拟器临时字段
  };
  walk(s, ''); return bad;
}
