// 设计83 第四节 私密约会：恋人（爱慕 ≥ 80）+ 有符合条件的座驾才出现；不收钱；精力 ≥ 10 才能开始，结束精力清空
// 算一次约会：占免费次数 / 约会券、次数 +1、爱慕 +10、好感 +20（照设计56 门规则，能跨门）
import { E_COST, energy, doEnergy, whyEnergy } from './manage.js?v=a24b4431';
import { datesWith, dateTickets, DATE_TICKET_MAX, recordDate } from './dates.js?v=a24b4431';
import { isTraining } from './training.js?v=a24b4431';
import { privRideId, rideItem, nameOf } from './ride.js?v=a24b4431';
import { hasPrivLib, pickPriv, stageOf } from './datelib.js?v=a24b4431';

export const PRIV_MIN_LOVE = 80, PRIV_LOVE = 10, PRIV_FAVOR = 20;
/** key → 座驾哪一类、地点名、背景（第一张没图用第二张） */
export const PRIV_PLACES = {
  car: { kind: 'car', name: '车里', bg: ['bg_car_night', 'bg_date_4'] },
  jet: { kind: 'plane', name: '私人飞机', bg: ['bg_jet_cabin', 'bg_hangar'] },
  yacht: { kind: 'yacht', name: '游艇', bg: ['bg_date_3'] },
};
/** 这一处私密约会用哪台：{ id, name, cabin } 或 null（没符合条件的 → 不出现） */
export function privRide(s, key) {
  const P = PRIV_PLACES[key]; const id = privRideId(s, P.kind); if (!id) return null;
  const it = rideItem(P.kind, id); return { id, name: nameOf(P.kind, id), cabin: P.kind === 'plane' ? it.cabin || 'small' : null };
}
/** 出不出现：恋人 + 有片段库 + 有符合条件的那台 */
export const privShown = (s, id, key) => !!(s.secs[id] && s.secs[id].love >= PRIV_MIN_LOVE && hasPrivLib(id) && privRide(s, key));
export const privList = (s, id) => Object.keys(PRIV_PLACES).filter((k) => privShown(s, id, k));
/** 能不能开始（出现了以后的原因：上课、次数、券、精力） */
export function whyNotPriv(s, id, key, t) {
  if (!s.secs[id]) return '还没有这个秘书';
  if (!privShown(s, id, key)) return '还不能去';
  if (isTraining(s, id)) return '她在上课';
  { const n = datesWith(s, id, t); if (n >= 1 + DATE_TICKET_MAX) return '明天再约'; if (n >= 1 && !dateTickets(s)) return '今天约过了 · 买约会券'; }
  { const w = whyEnergy(s, E_COST.date, t); if (w) return w; }   // 精力 ≥ 10 才能开始
  return null;
}
/** 开始：挑场景、记一次约会、精力清空。返回 { ok, scene, ride, place, stage, love, favor, milestones, hurt, token } */
export function goPriv(s, id, key, t, rnd = Math.random) {
  const why = whyNotPriv(s, id, key, t); if (why) return { ok: false, why };
  const P = PRIV_PLACES[key]; const ride = privRide(s, key); const stage = stageOf(s.secs[id].love);
  const pk = pickPriv(s, id, key, stage, ride.cabin, rnd); if (!pk) return { ok: false, why: '还没有这里的剧情' };
  if (datesWith(s, id, t) >= 1) s.items.date -= 1; /* 今天约过她了：用一张约会券 */
  doEnergy(s, energy(s, t), t);   // 结束精力变 0（先扣掉，中途退出也一样）
  const r = recordDate(s, id, t, `私密约会 · ${P.name}`, PRIV_LOVE, PRIV_FAVOR);
  return { ok: true, scene: pk.scene, idx: pk.idx, ride, place: P, stage, ...r };
}
