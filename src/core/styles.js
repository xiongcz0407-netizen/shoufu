// V3-05 衣服有用（设计33 第四之五节）：设计/剧情/衣服款式.json（每人 c1～c11 的款式和名字，tools/story_sync.mjs 拷进来）
// 场合要什么款式：她肯穿的里挑同款最贵的，没有就按退的顺序；扮装只在私下（出差回酒店、恋人以上、20%）
import { OUTFIT_STYLES } from '../config/story/index.js?v=701206f7';
import { OUTFITS, priceOf } from '../config/outfits.js?v=701206f7';
import { canWear } from './outfits.js?v=701206f7';
import { ensureSec, loveStage } from './secretary.js?v=701206f7';
export { OUTFIT_STYLES };

export const COSTUME = '扮装';
export const styleOf = (id, o) => ((OUTFIT_STYLES[id] || {})[o] || {}).style || null;
export const nameOf = (id, o) => ((OUTFIT_STYLES[id] || {})[o] || {}).name || `第 ${String(o).slice(1)} 套`;
export const tagOf = (id, o) => { const st = styleOf(id, o); return st ? `${nameOf(id, o)} · ${st}` : nameOf(id, o); };
/** 场合 → [要的, 退一档, 再退…] */
export const OCC = {
  gala: ['晚装', '职业'], work: ['职业', '晚装'], sport: ['运动', '休闲'], salon: ['晚装', '休闲'],
  dateFormal: ['晚装', '休闲'], dateResort: ['度假', '休闲'], tripDay: ['职业'],
  tripEveSea: ['度假', '休闲', '晚装', '职业'], tripEve: ['休闲', '晚装', '职业'], hotel: ['居家', '度假', '休闲', '晚装'], // 设计33 第四之五节（11-22 更新）：加晚装一档
};
/** 日程事件 → 场合 */
export function occOfItem(it) {
  if (['banquet', 'charity'].includes(it.kind)) return /家宴/.test(it.title || '') ? 'salon' : 'gala';
  if (it.kind === 'private') return /高尔夫|马术/.test(it.title || '') ? 'sport' : 'salon';
  if (['talk', 'sign', 'media', 'inspect', 'meeting'].includes(it.kind)) return 'work';
  if (it.kind === 'datesec') return 'dateFormal';
  return null;
}
export const SEA = ['上海', '深圳', '香港', '新加坡', '迪拜', '纽约', '广州'];
/** 挑：返回 { o, style, rank }（rank 0 对路、1 退一档、2 退两档…、-1 没有合适的穿身上那套）；扮装永远不在这里出（private 另说） */
export function pick(s, id, occ) {
  const want = OCC[occ] || []; const r = ensureSec(s, id);
  const ok = OUTFITS.filter((x) => canWear(s, id, x.id) && styleOf(id, x.id) !== COSTUME).map((x) => x.id);
  for (let i = 0; i < want.length; i++) { const xs = ok.filter((o) => styleOf(id, o) === want[i]); if (xs.length) { const o = xs.sort((a, b) => priceOf(id, b) - priceOf(id, a))[0]; return { o, style: want[i], rank: i }; } }
  const cur = r.outfit && styleOf(id, r.outfit) !== COSTUME ? r.outfit : 'c1'; return { o: cur, style: styleOf(id, cur), rank: -1 };
}
/** 带她当女伴的款式系数：对路 ×1.0（档次高时同款越贵越多，最多 +10%）；退一档 ×0.9；穿职业装去晚宴 / 没有合适的 ×0.8（她说一句） */
export function fitMult(s, id, occ, tier = 0) {
  const p = pick(s, id, occ); let k = p.rank === 0 ? 1 : p.rank === 1 ? 0.9 : 0.8; let line = '';
  if (occ === 'gala' && p.style === '职业') k = 0.8;
  if (k <= 0.8) line = occ === 'gala' || occ === 'salon' ? '「我没有合适的礼服……就穿这身去吧。」' : '「我没有合适的衣服……」';
  if (p.rank === 0 && tier >= 3) { const pr = priceOf(id, p.o); k += 0.1 * Math.min(1, Math.max(0, Math.log10(Math.max(1, pr) / 1e4) / Math.log10(150))); /* 设计35 第十四节：1 万 → 0，150 万（顶级高定）→ +10% */ }
  return { ...p, k: Math.round(k * 1000) / 1000, line, name: nameOf(id, p.o) };
}
/** 出差回酒店 / 早上：居家 → 度假 → 休闲 → 晚装 → 身上那套；恋人以上、有扮装的 20% 她主动换扮装 */
export function hotelOutfit(s, id, rnd = Math.random) {
  const r = ensureSec(s, id); const cos = OUTFITS.filter((x) => canWear(s, id, x.id) && styleOf(id, x.id) === COSTUME).map((x) => x.id);
  if (cos.length && loveStage(r.love) >= 4 && rnd() < 0.2) { const o = cos[Math.floor(rnd() * cos.length)]; return { o, style: COSTUME, costume: true, name: nameOf(id, o) }; }
  const p = pick(s, id, 'hotel'); return { ...p, name: nameOf(id, p.o) };
}
