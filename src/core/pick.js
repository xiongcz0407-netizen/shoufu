// 设计28 第二节 进货挑品：每个游戏天的季节、天气、节日；每家店（门店线）每天选一次主推（不花精力）
// 对路营业额 +8%～15%，不对路营业额 −3%、进货 +2%（压货）；按家数摊，第三档样子再减半；估值不算（临时效果）
// 没选的：有店长的店长替选（一半对路、一半一般），没店长的按昨天的；智慧最高的秘书出主意（对的概率 50% + 智慧 / 2）
import { credit } from './credit.js?v=b3791cdb'; // V3-01 亲自拍板攒投入度
import M from '../config/manage.json?v=b3791cdb' with { type: 'json' };
import { IND_BY_ID } from '../config/industries.js?v=b3791cdb';
import { SEC_BY_ID } from '../config/secretaries.js?v=b3791cdb';
import * as MG from './manage.js?v=b3791cdb';
import { holder, attrs } from './posts.js?v=b3791cdb';
import { isTraining } from './training.js?v=b3791cdb';
import * as E from './economy.js?v=b3791cdb';

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
/** 合不合适：{ fit: good / normal / bad, bonus（对路时营业额加成，未摊） } */
export function fitOf(info, id, key) {
  const o = optOf(id, key); if (!o) return { fit: 'normal', bonus: 0 };
  const g = o.good.filter((x) => info.tags.includes(x)).length, b = o.bad.filter((x) => info.tags.includes(x)).length;
  if (g > 0 && g >= b) return { fit: 'good', bonus: Math.min(P.goodMax, P.goodBase + P.goodStep * (g - 1)) };
  if (b > 0) return { fit: 'bad', bonus: 0 };
  return { fit: 'normal', bonus: 0 };
}
/** 摊薄：÷ 家数，第三档样子再 × bigK（店大了、请齐了人，老板挑品作用变小） */
export function scaleOf(s, id) {
  const ind = s.inds[id]; if (!ind || !ind.branches) return 0; const cfg = IND_BY_ID[id];
  return (1 / ind.branches) * (E.lookIndex(cfg, ind.level) >= 2 ? P.bigK : 1);
}
const st = (s) => (s.pick = s.pick || { lines: {}, log: [] });
const hasManager = (s, id) => !!holder(s, 'manager_' + id) || ((s.inds[id] && s.inds[id].staff) || {}).manager > 0;
/** 今天这家店的主推：{ d, key, by: you / mgr / keep, fit, bonus } 或 null */
export function current(s, id, t) { const x = st(s).lines[id]; return x && x.d === MG.dayIndex(s, t) ? x : null; }
/** 最好的选项（对路加成最大；没有对路的取一般） */
export function bestKey(info, id) {
  const os = options(id).map((o) => ({ o, f: fitOf(info, id, o.key) }));
  const rank = (x) => (x.f.fit === 'good' ? 1 + x.f.bonus : x.f.fit === 'normal' ? 0.5 : 0);
  return os.sort((a, b) => rank(b) - rank(a))[0].o.key;
}
function apply(s, id, key, t, by) {
  const L = MG.line(s, id); const d = MG.dayIndex(s, t); const end = s.createdAt + (d + 1) * MG.DAY_MS;
  L.fx = L.fx.filter((f) => !(f.src === 'pick' && f.until === end)); // 换选：先撤掉今天的
  const info = dayInfo(s, d); const f = fitOf(info, id, key); const k = scaleOf(s, id);
  if (f.fit === 'good') L.fx.push({ rev: f.bonus * k, until: end, perm: false, src: 'pick' });
  if (f.fit === 'bad') L.fx.push({ rev: P.bad.rev * k, cogs: P.bad.cogs * k, until: end, perm: false, src: 'pick' });
  const rec = { d, key, by, fit: f.fit, bonus: f.bonus * k }; st(s).lines[id] = rec; return rec;
}
/** 玩家自己选（每家店每天一次；店长替选的 / 按昨天的可以换一次） */
export function whyNotChoose(s, id, key, t) {
  if (!MG.isShop(id) || !s.inds[id] || !s.inds[id].branches) return '先开一家';
  if (!optOf(id, key)) return '没有这个选项';
  const c = current(s, id, t); if (c && c.by === 'you') return '今天已经选过了';
  return null;
}
export function choose(s, id, key, t) {
  const why = whyNotChoose(s, id, key, t); if (why) return { ok: false, why };
  const rec = apply(s, id, key, t, 'you'); MG.mg(s, t); credit(s, 'pick', 1, t); return { ok: true, ...rec, name: optOf(id, key).name };
}
/** 秘书出主意：智慧最高、没在上课的；对的概率 50% + 智慧 / 2（%），同一天同一家店说法不变 */
export function advice(s, id, t) {
  const ids = Object.keys(s.secs || {}).filter((x) => !isTraining(s, x)); if (!ids.length || !options(id).length) return null;
  const sec = ids.sort((a, b) => (attrs(s, b).wit || 0) - (attrs(s, a).wit || 0))[0]; const wit = attrs(s, sec).wit || 0;
  const d = MG.dayIndex(s, t); const info = dayInfo(s, d); const best = bestKey(info, id); const salt = 7 + Object.keys(P.options).indexOf(id) * 13;
  const right = dayRnd(s, d, salt) < 0.5 + wit / 200; const others = options(id).filter((o) => o.key !== best);
  const key = right || !others.length ? best : others[Math.floor(dayRnd(s, d, salt + 1) * others.length)].key;
  return { sec, key, right, name: optOf(id, key).name, text: `${SEC_BY_ID[sec] ? SEC_BY_ID[sec].name : ''}：「今天${P.weatherName[info.weather]}${info.holiday ? `，又是${info.holiday.name}` : ''}，我看主推${optOf(id, key).name}。」` };
}
/** 结果一句话（晚上出） */
export function resultText(id, rec) {
  const o = optOf(id, rec.key); if (!o) return '';
  const name = `${IND_BY_ID[id].name}：`;
  return name + (rec.fit === 'good' ? o.goodText : rec.fit === 'bad' ? o.badText : P.normalText.replace('{name}', o.name));
}
/** 新的一天（manage.tickManage 每天调）：先出昨天的结果，再给今天没人选的店替选 */
export function onDay(s, d, at) {
  const S = st(s); const out = [];
  for (const id of Object.keys(s.inds)) {
    if (!MG.isShop(id) || !s.inds[id].branches) continue; const prev = S.lines[id];
    if (prev && prev.d === d - 1) { out.push(resultText(id, prev)); S.log.push({ d: prev.d, id, key: prev.key, fit: prev.fit, by: prev.by }); }
    if (prev && prev.d >= d) continue;
    if (hasManager(s, id)) {
      const info = dayInfo(s, d); const good = options(id).filter((o) => fitOf(info, id, o.key).fit === 'good'); const normal = options(id).filter((o) => fitOf(info, id, o.key).fit === 'normal');
      const r = dayRnd(s, d, 101 + Object.keys(P.options).indexOf(id)); const pool = (r < P.mgrGoodP && good.length) || !normal.length ? (good.length ? good : options(id)) : normal;
      apply(s, id, pool[Math.floor(dayRnd(s, d, 202 + Object.keys(P.options).indexOf(id)) * pool.length)].key, at, 'mgr');
    } else if (prev) apply(s, id, prev.key, at, 'keep');
  }
  if (S.log.length > 30) S.log.splice(0, S.log.length - 30);
  return out;
}
MG.onDay(onDay);
