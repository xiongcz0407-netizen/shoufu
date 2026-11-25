// 设计28 第二节 进货挑品 → 设计49（V0.2.15）今日主推自动选：每个游戏天的季节、天气、节日；每条门店线每天自动选最对路的那样，
// 不用玩家、秘书、店长；离线照样每天有；开第一家店那天就有。营业额统一 +15%（pick.autoRev，不按家数摊、第三档不减半、没有不对路），估值不算。
import M from '../config/manage.json?v=8c602723' with { type: 'json' };
import * as MG from './manage.js?v=8c602723';

const P = M.pick;
export { P as PICK_CFG };
/** 按 (开局时间, 第几天, 盐) 定的随机数：同一天怎么算都一样（离线、在线、刷新） */
export function dayRnd(s, d, salt = 0) {
  let h = (Math.floor(s.createdAt / 1000) ^ (d * 2654435761) ^ (salt * 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
const SEASON_OF = Object.fromEntries(Object.entries(P.seasons).flatMap(([k, ms]) => ms.map((m) => [m, k])));
/** 某一天：{ d, month, day, season, weather, holiday（{ id, name } 或 null）, weekend, tags } */
export function dayInfo(s, d) {
  const month = (Math.floor(d / 30) % 12) + 1, day = (d % 30) + 1; const season = SEASON_OF[month];
  const hol = P.holidays.find((x) => x.m === month && day >= x.d && day < x.d + x.len) || null;
  const weekend = P.weekend.includes(((d % 7) + 7) % 7);
  let r = dayRnd(s, d, 1), weather = 'sunny'; for (const [w, p] of Object.entries(P.weather[season])) { if (r < p) { weather = w; break; } r -= p; }
  const tags = [season, weather, weekend ? 'weekend' : 'workday', ...(hol ? [hol.id, 'holiday'] : [])];
  return { d, month, day, season, weather, holiday: hol ? { id: hol.id, name: hol.name } : null, weekend, tags };
}
export const today = (s, t) => dayInfo(s, MG.dayIndex(s, t));
export const todayText = (x) => `${P.weatherIcon[x.weather]} ${P.seasonName[x.season]} · ${P.weatherName[x.weather]}${x.holiday ? ` · ${x.holiday.name}` : x.weekend ? ' · 周末' : ''}`;
export const options = (id) => P.options[id] || [];
export const optOf = (id, key) => options(id).find((o) => o.key === key) || null;
/** 对上了几条合适的条件 */
const goodN = (info, o) => o.good.filter((x) => info.tags.includes(x)).length;
const badN = (info, o) => (o.bad || []).filter((x) => info.tags.includes(x)).length;
/** 最对路的那样：对上的条件最多；一样多取不对路条件少的；再一样按配置顺序 */
export function bestKey(info, id) {
  const os = options(id).map((o, i) => ({ o, i, g: goodN(info, o), b: badN(info, o) }));
  return os.sort((a, b) => b.g - a.g || a.b - b.b || a.i - b.i)[0].o.key;
}
/** 为什么选它：对上的第一条（天气 / 季节 / 节日 / 周末）；一条也没对上写今天的天气 */
export function reasonOf(info, id, key) {
  const o = optOf(id, key); const tag = o && o.good.find((x) => info.tags.includes(x));
  if (P.weatherName[tag]) return `${P.weatherIcon[tag]} ${P.weatherName[tag]}`;
  if (P.seasonName[tag]) return `${P.seasonName[tag]}天`;
  if (tag === 'holiday' || (info.holiday && tag === info.holiday.id)) return info.holiday.name;
  if (tag === 'weekend') return '周末'; if (tag === 'workday') return '工作日';
  return `${P.weatherIcon[info.weather]} ${P.weatherName[info.weather]}`;
}
const isOpen = (s, id) => MG.isShop(id) && !!s.inds[id] && s.inds[id].branches > 0;
/** 今天这条线的主推：{ d, key, name, reason, rev } 或 null（没开店） */
export function current(s, id, t) {
  if (!isOpen(s, id) || !options(id).length) return null; const d = MG.dayIndex(s, t); const info = dayInfo(s, d); const key = bestKey(info, id);
  return { d, key, name: optOf(id, key).name, reason: reasonOf(info, id, key), rev: P.autoRev };
}
/** 门店线详情那一行：「今天主推：冰镇饮料（🔥 炎热）· 营业额 +15%」 */
export const lineText = (c) => (c ? `今天主推：${c.name}（${c.reason}）· 营业额 +${Math.round(c.rev * 100)}%` : '');
/** 营业额挂钩：开了店的门店线 × (1 + 15%)，按 manage 记的「现在」算哪一天 */
MG.setPickHook((s, id) => (isOpen(s, id) && options(id).length ? 1 + P.autoRev : 1));
