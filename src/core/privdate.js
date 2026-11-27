// 设计83 第四节 私密约会：恋人（爱慕 ≥ 80）+ 有符合条件的座驾才出现；不收钱；设计86：精力 ≥ E_COST.privMin（100）才能开始，结束精力清空，不限次数
// 算一次约会：次数 +1、爱慕 +10、好感 +20（照设计56 门规则，能跨门）
import { E_COST, energy, doEnergy } from './manage.js?v=f00c2612';
import { recordDate } from './dates.js?v=f00c2612';
import { isTraining } from './training.js?v=f00c2612';
import { privRideId, rideItem, nameOf } from './ride.js?v=f00c2612';
import { homeInfo } from './home.js?v=f00c2612';   // 设计95 住哪套（设计94）
import { hasPrivPlace, pickPriv, stageOf } from './datelib.js?v=f00c2612';
import { stockingsOf } from './styles.js?v=f00c2612';
import { STOCKING_GIFT } from '../config/story/index.js?v=f00c2612';
import { localDay } from './afterlines.js?v=f00c2612';
import { addLoadFix } from './loadfix.js?v=f00c2612';

export const PRIV_MIN_LOVE = 80, PRIV_LOVE = 10, PRIV_FAVOR = 20;
/** key → 座驾哪一类、地点名、背景（第一张没图用第二张） */
export const PRIV_PLACES = {
  home: { kind: 'house', name: '家里', bg: ['bg_home_night', 'bg_home_small', 'bg_hotel_night'] },   // 设计95：排第一；big → bg_home_night，不是 big → bg_home_small，没图退 bg_hotel_night
  car: { kind: 'car', name: '车里', bg: ['bg_car_night', 'bg_date_4'] },
  jet: { kind: 'plane', name: '私人飞机', bg: ['bg_jet_cabin', 'bg_hangar'] },
  yacht: { kind: 'yacht', name: '游艇', bg: ['bg_date_3'] },
};
/** 这一处私密约会用哪台：{ id, name, cabin } 或 null（没符合条件的 → 不出现） */
export function privRide(s, key) {
  if (key === 'home') { const h = homeInfo(s); return h && { ...h, cabin: h.big ? 'big' : 'small' }; }   // 设计95：{ id, name 去括号, city, big }
  const P = PRIV_PLACES[key]; const id = privRideId(s, P.kind); if (!id) return null;
  const it = rideItem(P.kind, id); return { id, name: nameOf(P.kind, id), cabin: P.kind === 'plane' ? it.cabin || 'small' : null };
}
/** 出不出现：恋人 + 这位秘书有这一处的场景（设计95：家里剧情没写完的不出）+ 有符合条件的那台 / 那套房子 */
export const privShown = (s, id, key) => !!(s.secs[id] && s.secs[id].love >= PRIV_MIN_LOVE && hasPrivPlace(id, key) && privRide(s, key));
/** 设计95 背景候选：家里按大小选大平层 / 小户型夜景，再退酒店夜景；其他照 PRIV_PLACES */
export const privBgList = (key, ride) => (key === 'home' ? (ride && ride.big ? ['bg_home_night', 'bg_hotel_night'] : ['bg_home_small', 'bg_hotel_night']) : PRIV_PLACES[key].bg);
export const privList = (s, id) => Object.keys(PRIV_PLACES).filter((k) => privShown(s, id, k));
/** 能不能开始（出现了以后的原因：上课、精力不到 privMin） */
export function whyNotPriv(s, id, key, t) {
  if (!s.secs[id]) return '还没有这个秘书';
  if (!privShown(s, id, key)) return '还不能去';
  if (isTraining(s, id)) return '她在上课';
  { const e = energy(s, t); if (e < E_COST.privMin - 1e-9) return `私密约会要 ${E_COST.privMin} 精力（现在 ${Math.floor(e)}）`; }   // 设计86：精力 ≥ 100 才能开始
  return null;
}
/** 开始：挑场景、记一次约会、精力清空。outfit = 画面上她穿的那套（styles.privOutfit 挑的）。返回 { ok, scene, ride, place, stage, outfit, stk 丝袜名或 null, gift 送丝袜台词, love, favor, milestones, hurt, token } */
export function goPriv(s, id, key, t, rnd = Math.random, outfit = null) {
  const why = whyNotPriv(s, id, key, t); if (why) return { ok: false, why };
  const P = PRIV_PLACES[key]; const ride = privRide(s, key); const stage = stageOf(s.secs[id].love);
  const pk = pickPriv(s, id, key, stage, ride.cabin, rnd); if (!pk) return { ok: false, why: '还没有这里的剧情' };
  doEnergy(s, energy(s, t), t);   // 结束精力变 0（先扣掉，中途退出也一样）
  const r = recordDate(s, id, t, `私密约会 · ${P.name}`, PRIV_LOVE, PRIV_FAVOR);
  // 设计87：私密约会次数；她穿的那套有丝袜就送你（挑一段跟上次不同的）；设计89：记下哪天、送没送（第二天的台词）
  const rec = s.secs[id].rec; rec.privDates = (rec.privDates || 0) + 1; s.stats.privDates = (s.stats.privDates || 0) + 1;
  const { stk, gift } = afterPriv(s, id, t, outfit, rnd);
  return { ok: true, scene: pk.scene, idx: pk.idx, ride, place: P, stage, outfit: outfit || null, stk, gift, ...r };
}
/** 设计87 / 89 私密约会以后（设计96 主动要求也用）：她穿的那套有丝袜就送（挑一段跟上次不同的），记下哪天、送没送（第二天的台词）。返回 { stk, gift } */
export function afterPriv(s, id, t, outfit, rnd = Math.random) {
  const rec = s.secs[id].rec; const stk = outfit ? stockingsOf(id, outfit) : null; let gift = [];
  if (stk) {
    rec.stockings = (rec.stockings || 0) + 1; s.stats.stockings = (s.stats.stockings || 0) + 1;
    const L = STOCKING_GIFT[id] || [];
    if (L.length) { const ids = L.map((_, i) => i).filter((i) => L.length < 2 || i !== rec.lastStk); const k = ids[Math.floor(rnd() * ids.length)]; rec.lastStk = k; gift = L[k].filter((x) => x).map((x) => x.replace(/\{丝袜\}/g, stk)); }
  }
  rec.privDay = localDay(t); rec.privStk = !!stk;
  return { stk, gift };
}
/** 设计87「她的记录」里私密约会那两行：恋人以前不显示私密约会；没送过丝袜不显示那行。返回 [[名字, 值]] */
export function privRecordRows(r) {
  const out = []; if (!r || !(r.love >= PRIV_MIN_LOVE)) return out;
  out.push(['私密约会', `${(r.rec && r.rec.privDates) || 0} 次`]);
  out.push(['主动要求', `${(r.rec && r.rec.askCount) || 0} 次`]);   // 设计96：不算进私密约会次数
  if (r.rec && r.rec.stockings) out.push(['送你丝袜', `${r.rec.stockings} 双`]);
  return out;
}
/** 设计87 读档：老存档按 rec.places 里「私密约会 · 」开头的次数补 privDates（有了就不动） */
export function fillPrivDates(s) {
  for (const r of Object.values(s.secs || {})) {
    if (!r || !r.rec || r.rec.privDates != null) continue;
    r.rec.privDates = Object.entries(r.rec.places || {}).filter(([k]) => k.startsWith('私密约会 · ')).reduce((a, [, n]) => a + (n || 0), 0);
  }
}
addLoadFix(fillPrivDates);
