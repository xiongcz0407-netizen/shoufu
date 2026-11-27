// 设计83 约会剧情片段库：设计/剧情/约会_<id>.json（普通约会按爱慕阶段拼一场）、私密约会_<id>.json（车里 / 私人飞机 / 游艇，两次 3 选 1）
// 用过的片段 / 场景记在 s.secs[id].rec.dateUsed（键：s<阶段><o|c|e>、car、jet、yacht 是下标数组；s<阶段>h 是最近 10 场的组合），这一组用完才轮回（config/caps.js 登记）
import { DATE_LIB, PRIV_LIB } from '../config/story/index.js?v=701a82d3';
import { ensureSec, loveStage } from './secretary.js?v=701a82d3';

export const SLOTS = { open: 1, chat: 2, end: 1 };   // 一场：开场 1 段、聊 2 段（不重复）、结尾 1 段
export const PRIV_KEYS = ['car', 'jet', 'yacht'];
export const hasDateLib = (id) => !!(DATE_LIB[id] && DATE_LIB[id].stages);
export const hasPrivLib = (id) => !!(PRIV_LIB[id] && PRIV_LIB[id].places);
/** 设计95：这位秘书有这一处的场景 */
export const hasPrivPlace = (id, key) => hasPrivLib(id) && Array.isArray(PRIV_LIB[id].places[key]) && PRIV_LIB[id].places[key].length > 0;
export const stageOf = (love) => loveStage(love || 0);
const usedOf = (s, id, key) => { const r = ensureSec(s, id).rec; r.dateUsed = r.dateUsed || {}; return (r.dateUsed[key] = r.dateUsed[key] || []); };

/** 从 eligible（下标）里挑 k 个不重复的：先挑没用过的，用完一轮清掉这一组的记录再挑（轮回时尽量不跟上一次挑的一样） */
export function pickN(eligible, used, k, rnd = Math.random) {
  const out = []; const n = Math.min(k, eligible.length);
  while (out.length < n) {
    let avail = eligible.filter((i) => !used.includes(i) && !out.includes(i));
    if (!avail.length) {
      const last = used.length ? used[used.length - 1] : null;
      for (const i of eligible) { const j = used.indexOf(i); if (j >= 0) used.splice(j, 1); }
      used.push(...out);
      avail = eligible.filter((i) => !out.includes(i));
      if (avail.length > 1) avail = avail.filter((i) => i !== last);
    }
    const i = avail[Math.floor(rnd() * avail.length)]; out.push(i); used.push(i);
  }
  return out;
}

/** 占位：{地点} {车} {飞机} {游艇}；设计95 {房子} {城市}。Arvin 11-27：剧情里车、飞机、游艇、房子不写型号，旧占位一律换通用叫法 */
export const fill = (x, vars) => x.replace(/\{(地点|车|飞机|游艇|房子|城市)\}/g, (m, k) => (vars[k] != null && vars[k] !== '' ? vars[k] : { 地点: '这里', 车: '车', 飞机: '飞机', 游艇: '游艇', 房子: '你家', 城市: '这座城市' }[k]));

/** 普通约会这一场的片段：{ open: [行…], chat: [[行…], [行…]], end: [行…] }；没有片段库 → null
 *  跟最近 10 场（同一阶段）一模一样的组合、拼出来不在 8～14 行的组合不要：重挑（最多 20 次），组合记在 s<阶段>h */
export const HIST = 10, LINES_MIN = 8, LINES_MAX = 14;
export function buildDate(s, id, stage, vars = {}, rnd = Math.random) {
  if (!hasDateLib(id)) return null;
  const sk = DATE_LIB[id].stages[String(stage)] ? String(stage) : '0'; const st = DATE_LIB[id].stages[sk];
  const keys = Object.keys(SLOTS).map((slot) => `s${sk}${slot[0]}`); const hist = usedOf(s, id, `s${sk}h`);
  let pick = null;
  for (let tries = 0; tries < 20; tries++) {
    const save = keys.map((k) => usedOf(s, id, k).slice());
    const idx = Object.entries(SLOTS).map(([slot, k], j) => pickN((st[slot] || []).map((_, i) => i), usedOf(s, id, keys[j]), k, rnd));
    const key = idx.map((a, j) => keys[j].slice(-1) + (j === 1 ? a.slice().sort((x, y) => x - y) : a).join('.')).join('|');
    pick = idx;
    const lines = 2 + idx.reduce((n, a, j) => n + a.reduce((m, i) => m + st[Object.keys(SLOTS)[j]][i].filter((x) => x !== '#黑屏').length, 0), 0);   // 加上开场旁白、「第 N 次约会」
    if ((!hist.includes(key) && lines >= LINES_MIN && lines <= LINES_MAX) || tries === 19) { hist.push(key); if (hist.length > HIST) hist.splice(0, hist.length - HIST); break; }
    keys.forEach((k, j) => { const u = usedOf(s, id, k); u.length = 0; u.push(...save[j]); });   // 撤回这次挑的，重挑
  }
  const out = {};
  Object.keys(SLOTS).forEach((slot, j) => { const segs = pick[j].map((i) => st[slot][i].map((x) => fill(x, vars))); out[slot] = slot === 'chat' ? segs : segs[0] || []; });
  return out;
}

/** 私密约会挑一场：min ≤ 她现在的阶段、cabin 对得上（没写 cabin 的哪种都行；big 只在大飞机、small 只在小飞机），没用过的随机挑；没有 → null */
export function pickPriv(s, id, key, stage, cabin = null, rnd = Math.random) {
  if (!hasPrivLib(id)) return null;
  const pool = PRIV_LIB[id].places[key] || [];
  const ok = pool.map((x, i) => i).filter((i) => (pool[i].min || 0) <= stage && (!pool[i].cabin || pool[i].cabin === cabin) && (!pool[i].big || cabin === 'big'));   // 设计95：big 场景只在大房子
  if (!ok.length) return null;
  const [i] = pickN(ok, usedOf(s, id, key), 1, rnd);
  return { idx: i, scene: pool[i] };
}

// —— 结构检查（test/datelib83 遍历 10 个人的两个文件用；以后加新秘书文件也能先跑一下） ——
const strArr = (a) => Array.isArray(a) && a.length > 0 && a.every((x) => typeof x === 'string' && x.length > 0);
export function checkDateFile(d, who) {
  const bad = []; if (!d || d.who !== who) bad.push(`who 不对（${d && d.who}）`);
  for (let k = 0; k <= 5; k++) {
    const st = d && d.stages && d.stages[String(k)]; if (!st) { bad.push(`缺阶段 ${k}`); continue; }
    for (const slot of Object.keys(SLOTS)) {
      const pool = st[slot];
      if (!Array.isArray(pool) || pool.length < SLOTS[slot]) { bad.push(`阶段 ${k} ${slot} 不够 ${SLOTS[slot]} 段`); continue; }
      pool.forEach((seg, i) => { if (!strArr(seg)) bad.push(`阶段 ${k} ${slot}[${i}] 不是字符串数组`); });
    }
  }
  return bad;
}
export function checkPrivFile(d, who) {
  const bad = []; if (!d || d.who !== who) bad.push(`who 不对（${d && d.who}）`);
  for (const key of [...PRIV_KEYS, 'home']) {
    const pool = d && d.places && d.places[key];
    if (key === 'home' && pool == null) continue;   // 设计95：家里剧情可以还没写
    if (!Array.isArray(pool) || !pool.length) { bad.push(`缺 ${key}`); continue; }
    if (!pool.some((x) => !x.cabin && !x.big && (x.min || 0) <= 4)) bad.push(`${key} 没有恋人阶段、哪种都能用的场景`);
    if (key === 'home' && pool.filter((x) => !x.big).length < 3) bad.push('home 不写 big 的要至少 3 场');
    pool.forEach((x, i) => {
      const at = `${key}[${i}]`;
      if (typeof x.min !== 'number' || x.min < 0 || x.min > 5) bad.push(`${at} min 不对`);
      if (x.cabin != null && x.cabin !== 'big' && x.cabin !== 'small') bad.push(`${at} cabin 只能是 big 或 small`);
      if (x.big != null && x.big !== true) bad.push(`${at} big 只能写 true`);
      if (!strArr(x.open)) bad.push(`${at} open 不对`);
      for (const q of ['q1', 'q2']) {
        const Q = x[q]; if (!Q || !strArr(Q.ask)) { bad.push(`${at} ${q}.ask 不对`); continue; }
        if (!Array.isArray(Q.opts) || Q.opts.length !== 3) bad.push(`${at} ${q} 要 3 个选项`);
        else Q.opts.forEach((o, j) => { if (!o || typeof o.t !== 'string' || !o.t || !strArr(o.r)) bad.push(`${at} ${q}.opts[${j}] 不对`); });
      }
      if (!strArr(x.close) || !x.close.includes('#黑屏')) bad.push(`${at} close 要含 #黑屏`);
    });
  }
  return bad;
}
