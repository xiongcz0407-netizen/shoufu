// 礼物信箱（V0.2.8）：把云端信箱里作者送的金券 / 券加进卡包。领过的 id 记在 s.coupon.gifts，不会重复领
import { cp, earn, giveItems, ITEMS } from './coupon.js?v=598ef1ae';

/** list: [{ id, coupons, items, why }] → 这次新领到的 [{ why, lines: ['金券 +10000', '精力药水 ×5'] }] */
export function applyGifts(s, list, t = Date.now()) {
  const c = cp(s); const seen = (c.gifts = c.gifts || []); const got = [];
  for (const g of list || []) {
    if (!g || !g.id || seen.includes(g.id)) continue;
    seen.push(g.id); if (seen.length > 100) seen.splice(0, seen.length - 100);
    const why = String(g.why || '作者赠送').slice(0, 30); const lines = [];
    const n = Math.max(0, Math.floor(+g.coupons || 0)); if (n) { earn(s, n, why, t); lines.push(`金券 +${n}`); }
    const it = Object.fromEntries(Object.entries(g.items || {}).filter(([k, x]) => ITEMS[k] && x > 0).map(([k, x]) => [k, Math.floor(x)]));
    const txt = giveItems(s, it, why, t); if (txt) lines.push(txt);
    if (lines.length) got.push({ why, lines });
  }
  return got;
}
/** 信箱里的是不是都领过了（都领过才删信箱） */
export const allTaken = (s, list) => (list || []).every((g) => !g || !g.id || (cp(s).gifts || []).includes(g.id));
