// 衣服：买（算送礼）、好感到了自动换上、衣柜、约会穿哪套
import { OUTFITS, OUTFIT_BY_ID, GIFT_CLOTH_FAVOR, DATE_OUTFIT } from '../config/outfits.js?v=1236a42d';
import { ensureSec, FAVOR_STAGES } from './secretary.js?v=1236a42d';
import { addFavor } from './affection.js?v=1236a42d';
import { pay, receive, accrue, canPay } from './ledger.js?v=1236a42d';

function rec(s, id) {
  const r = ensureSec(s, id);
  if (!r.owned) r.owned = ['c1'];
  if (!r.worn) r.worn = ['c1'];
  return r;
}
export const owns = (s, id, o) => rec(s, id).owned.includes(o);
/** 这套她肯穿了吗（买了 + 好感到了，或者是约会送的） */
export function canWear(s, id, o) {
  const r = rec(s, id);
  if (!r.owned.includes(o)) return false;
  if (o === DATE_OUTFIT && r.dateOutfit) return true;
  return r.favor >= OUTFIT_BY_ID[o].needFavor;
}
export const needText = (o) => `好感到「${FAVOR_STAGES[Math.floor(OUTFIT_BY_ID[o].needFavor / 100)]}」她才会穿`;

/** 买衣服；返回 { ok, wearNow, favor } 或 { ok:false, why } */
export function buyOutfit(s, id, o, t = Date.now()) {
  const r = rec(s, id); const cfg = OUTFIT_BY_ID[o];
  if (!cfg || o === 'c1') return { ok: false, why: '买不了' };
  if (r.owned.includes(o)) return { ok: false, why: '已经买过了' };
  if (!canPay(s, 'personal', cfg.price)) return { ok: false, why: '个人现金不够' };
  pay(s, { wallet: 'personal', cat: 'clothes', amount: cfg.price, party: id, note: `给${id}买第 ${o.slice(1)} 套` }, t); r.owned.push(o);
  r.rec.clothes += 1; r.rec.gifts += 1; s.stats.clothes = (s.stats.clothes || 0) + 1;
  const favor = addFavor(s, id, GIFT_CLOTH_FAVOR);
  return { ok: true, favor, wearNow: canWear(s, id, o) };
}

/** 有没有买了、条件到了、还没穿过的 → 换上最贵的那套。返回换上的 id 或 null */
export function autoWear(s, id) {
  const r = rec(s, id);
  const ready = OUTFITS.filter((x) => x.id !== 'c1' && canWear(s, id, x.id) && !r.worn.includes(x.id));
  if (!ready.length) return null;
  const best = ready[ready.length - 1].id; // 配置按价格从低到高
  for (const x of ready) r.worn.push(x.id);
  r.outfit = best;
  return best;
}
/** 衣柜里换：只能选肯穿的 */
export function chooseOutfit(s, id, o) {
  if (!canWear(s, id, o)) return false;
  rec(s, id).outfit = o; return true;
}
/** 约会送的专属衣服 */
export function grantDateOutfit(s, id) {
  const r = rec(s, id);
  if (!r.owned.includes(DATE_OUTFIT)) { r.owned.push(DATE_OUTFIT); r.rec.clothes += 1; }
}
/** 约会穿哪套：高档地点（formal）穿肯穿的里最贵的；休闲（casual）穿最贵的第 2～5 套里那套，没有就穿身上那套
 *  每套是晚装还是休闲等设计给风格表再细分 */
export function outfitForDate(s, id, dress) {
  const r = rec(s, id);
  const ok = OUTFITS.filter((x) => canWear(s, id, x.id)).map((x) => x.id);
  if (ok.length <= 1) return r.outfit;
  if (dress === 'formal') return ok[ok.length - 1];
  const casual = ok.filter((x) => ['c2', 'c3', 'c4', 'c5'].includes(x));
  return casual.length ? casual[casual.length - 1] : r.outfit;
}
