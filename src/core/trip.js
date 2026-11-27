// V3-03 出差（设计33 第四之三节）：日程里的「去 X 签约 / 看地 / 见投资人 / 考察」，占 1～3 个游戏日
// 出发前选带谁 → 交通（私人飞机 / 头等舱）、住（自己的房子 / 地标酒店 / 按档次订一间套房）→ 白天办事（她的属性 + 你的选择）→ 晚上 → 过夜剧情（按爱慕阶段拼片段）→ 早上收尾
// 存档 s.trip = { rec: { 秘书id: { n, cities: [] } }, n }；片段用过的记 s.storyUsed（core/storylib.js）
import C from '../config/trips.json?v=701a82d3' with { type: 'json' };
import { SEC_BY_ID } from '../config/secretaries.js?v=701a82d3';
import { ITEM } from './assets.js?v=701a82d3';
import { rideId, nameOf } from './ride.js?v=701a82d3'; // 设计71 座驾
import { LM, mine as lmMine } from './landmark.js?v=701a82d3';
import { attrs } from './posts.js?v=701a82d3';
import { ensureSec, loveStage } from './secretary.js?v=701a82d3';
import { addFavor, addLove } from './affection.js?v=701a82d3';
import { pay } from './ledger.js?v=701a82d3';
import { addFx, isShop } from './manage.js?v=701a82d3';
import { isTraining } from './training.js?v=701a82d3';
import { isScouting } from './busy.js?v=701a82d3';
import * as AG from './agenda.js?v=701a82d3';
import * as SL from './storylib.js?v=701a82d3';
import * as STY from './styles.js?v=701a82d3'; // V3-05 出差按场合换衣服
export { C as TRIP_CFG };

const pick = (a, r) => a[Math.floor(r() * a.length)];
const CITY = Object.fromEntries(C.cities.map((c) => [c.id, c]));
export const tr = (s) => { const x = (s.trip = s.trip || { rec: {}, n: 0 }); x.rec = x.rec || {}; return x; };
/** 日程生成出差邀请时用：城市（够格才出国）、目的、天数 */
export function make(s, day, rnd = Math.random) {
  const cs = C.cities.filter((c) => !c.abroad || (s.title || 0) >= C.abroadTitle); const c = pick(cs, rnd); const pk = pick(Object.keys(C.purposes), rnd);
  const days = C.days[0] + Math.floor(rnd() * (C.days[1] - C.days[0] + 1));
  return { day: day + (rnd() < 0.5 ? 0 : 1), city: c.name, cityId: c.id, purpose: pk, purposeName: C.purposes[pk].name, days };
}
AG.setTripMaker(make);
export const canBring = (s, id) => !!s.secs[id] && !isTraining(s, id) && !isScouting(s, id);
/** 交通、住哪、多少钱 */
export function plan(s, it) {
  const c = CITY[it.cityId] || C.cities[0]; const plane = ((s.garage && s.garage.planes) || []).some((id) => ITEM[id]);
  const home = ((s.garage && s.garage.houses) || []).find((id) => ITEM[id] && ITEM[id].city === c.name);
  const lmHotel = lmMine(s).find((id) => LM[id].city === c.name && LM[id].kind === 'hotel');
  const tierI = C.hotelTier.reduce((a, h, i) => ((s.title || 0) >= h.minTitle ? i : a), 0); const ht = C.hotelTier[tierI];
  const hotel = lmHotel ? LM[lmHotel].name : home ? `${c.name}的家` : c.hotels[tierI];
  const nights = it.days || 1; const flight = plane ? 0 : 2 * (c.abroad ? C.flight.abroad : C.flight.home) * 2; // 两个人、来回
  const room = lmHotel || home ? 0 : ht.night * nights;
  const planeName = plane ? nameOf('plane', rideId(s, 'plane')) : '';   // 设计71：坐座驾飞机
  return { city: c.name, view: c.view, plane, planeName, home: !!home, ownHotel: !!lmHotel, hotel, room: ht.name, flight, roomCost: room, cost: flight + room, nights };
}
/** 出发：带 secId；choice = 白天那一步选了第几个（0 最好）。返回要播的剧情 + 结果 */
export function go(s, id, secId, choice, t, rnd = Math.random) {
  const it = AG.byId(s, id); const why = AG.whyAttend(s, it, t); if (why) return { ok: false, why };
  if (!canBring(s, secId)) return { ok: false, why: '她现在走不开' };
  const P = plan(s, it); const sec = SEC_BY_ID[secId]; const name = sec.name; const pu = C.purposes[it.purpose];
  if (P.cost > 0) pay(s, { wallet: 'personal', cat: 'trip', amount: P.cost, force: true, party: P.plane ? P.hotel : '航空公司 / 酒店', note: `去${P.city}${pu.name}（${P.plane ? '' : '头等舱 ×2 来回'}${P.roomCost ? `${P.plane ? '' : '、'}${P.hotel}${P.room} ${P.nights} 晚` : ''}）` }, t);
  const wear = { day: STY.pick(s, secId, 'tripDay'), eve: STY.pick(s, secId, STY.SEA.includes(P.city) ? 'tripEveSea' : 'tripEve'), hotel: STY.hotelOutfit(s, secId, rnd) };
  const cloth = STY.nameOf(secId, wear.hotel.o);
  const sub = (x) => x.replace(/\{sec\}/g, name).replace(/\{城市\}/g, P.city).replace(/\{夜景\}/g, P.view).replace(/\{酒店\}/g, P.hotel).replace(/\{衣服\}/g, cloth);
  // 白天：选项分 2 / 1 / 0，加她这项属性
  const o = pu.opts[Math.max(0, Math.min(pu.opts.length - 1, choice | 0))]; const a = attrs(s, secId)[pu.attr] || 0;
  const m = Math.round((0.5 + o[1] * 0.25 + Math.min(100, a) / 200) * 100) / 100; // 0.5～1.5
  const res = []; const R = AG.ag(s);
  if (pu.rev) { for (const lid of Object.keys(s.inds || {}).filter((x) => isShop(x) && s.inds[x].branches)) addFx(s, lid, { rev: pu.rev * m }, t, pu.days); res.push(`门店营业额 +${(pu.rev * m * 100).toFixed(1)}%（${pu.days} 天）`); }
  if (pu.net) { const v = Math.round(pu.net * m * 10) / 10; R.net = Math.max(AG.AGENDA_CFG.netFloor, Math.min(AG.AGENDA_CFG.netCap, R.net + v)); res.push(`人脉 +${v}`); }
  if (pu.gov) { R.gov = (R.gov || 0) + pu.gov; res.push(`政府关系 +${pu.gov}`); }
  if (pu.px && s.listing && s.listing.listed) { s.listing.listed.px = Math.round(s.listing.listed.px * (1 + pu.px * m) * 100) / 100; res.push(`股价 +${(pu.px * m * 100).toFixed(1)}%`); }
  const r0 = ensureSec(s, secId); const stage = loveStage(r0.love);
  addFavor(s, secId, C.favor); addLove(s, secId, C.love); res.push(`${name}好感 +${C.favor}、爱慕 +${C.love}`);
  const T = tr(s); const rec = (T.rec[secId] = T.rec[secId] || { n: 0, cities: [] }); rec.n += 1; if (!rec.cities.includes(P.city)) rec.cities.push(P.city); T.n += 1;
  it.status = 'done'; it.doneAt = t; it.res = { sec: secId, m }; AG.startTrip(s, it, t);   // 设计69：出发起占 N 个游戏日 R.log.unshift({ t, id: it.id, text: `跟${name}去${P.city}${pu.name}：${res.join('，')}` });
  // 剧情
  const st = Math.max(1, stage);
  const parts = SL.hasTrip(secId) ? SL.night(s, secId, st, { city: P.city, view: P.view, hotel: P.hotel, cloth }, rnd) : C.fallback[String(st)].map((seg) => seg.map(sub));
  const story = {
    go: [sub(P.plane ? C.plane : C.firstClass), sub(P.home ? C.ownHome : P.ownHotel ? C.ownHotel : `住${P.hotel}，${name}只订了一间${P.room}。`)],
    day: [sub(pu.q), sub(o[0]) + '。', sub(o[2])], evening: sub(pick(C.evening, rnd)),
    night: parts, stage, lib: SL.hasTrip(secId), wear: { day: wear.day.o, eve: wear.eve.o, hotel: wear.hotel.o, costume: !!wear.hotel.costume, cloth },
    costumeLine: wear.hotel.costume ? `「上次你多看了两眼……我就带来了。」她换上了${cloth}。` : '',
  };
  return { ok: true, plan: P, story, res, m };
}
