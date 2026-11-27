// 设计74 主页秘书自己换衣服：每个游戏天（游戏时间 0 点那一跳）每个秘书随机换一套；打开游戏时过了一个游戏天就先换好（离线不补换几次，只换一次）
// 「平时穿的」就是存档里的 r.outfit（设计里叫 wearing）：约会 / 日程 / 出差按场合挑的衣服只传给剧情，不改它，所以场合结束自然回到这套
// r.wearAt：上次换的游戏天；r.autoDress：衣柜开关「让她自己换衣服」，没写 = 开
import { outfitsOf } from '../config/outfits.js?v=701a82d3';
import { owns, canWear } from './outfits.js?v=701a82d3';
import { styleOf, COSTUME } from './styles.js?v=701a82d3';
import { ensureSec } from './secretary.js?v=701a82d3';
import { dayIndex } from './manage.js?v=701a82d3';

export const autoOn = (s, id) => ensureSec(s, id).autoDress !== false;
export function setAuto(s, id, on) { ensureSec(s, id).autoDress = !!on; }
/** 能自己换的那几套：买了、现在能穿、不是扮装 */
export const pool = (s, id) => outfitsOf(id).map((o) => o.id).filter((o) => owns(s, id, o) && canWear(s, id, o) && styleOf(id, o) !== COSTUME);
/** 挑下一套：不跟身上这套重复，等概率；没得换返回 null */
export function pickNext(s, id, rnd = Math.random) {
  const cur = ensureSec(s, id).outfit; const xs = pool(s, id).filter((o) => o !== cur);
  return xs.length ? xs[Math.min(xs.length - 1, Math.floor(rnd() * xs.length))] : null;
}
/** 每跳 / 读档后调：到了新的游戏天就换。返回 [[秘书 id, 新衣服]]（给主页做换装动画） */
export function dressTick(s, t, rnd = Math.random) {
  if (!s || !s.secs || s.createdAt == null) return [];
  const d = dayIndex(s, t); const out = [];
  for (const id of Object.keys(s.secs)) {
    const r = ensureSec(s, id); if (!r) continue;
    if (r.wearAt == null) { r.wearAt = d; continue; }   // 第一次见到她：从今天开始算，明天再换
    if (d <= r.wearAt) continue;
    r.wearAt = d;
    if (!autoOn(s, id)) continue;
    const o = pickNext(s, id, rnd); if (!o) continue;
    r.outfit = o; out.push([id, o]);
  }
  return out;
}
