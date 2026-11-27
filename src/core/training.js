// 培养：课程价格、立刻学完（设计35 第八节：不再等时间、没有培训位；存档里正在上的课读档时直接结业）；设计91：每门课现实价格 + 最多练到，不限次数
import { COURSES, COURSE_BY_ID, PRICE_TOP, BEST_DISCOUNT } from '../config/courses.js?v=701a82d3';
import { SEC_BY_ID } from '../config/secretaries.js?v=701a82d3';
import { ensureSec } from './secretary.js?v=701a82d3';
import { bump } from './daily.js?v=701a82d3';
import { pay, canPay } from './ledger.js?v=701a82d3';
import { deduct as deductTax } from './companytax.js?v=701a82d3';   // 设计93 挂钩（开发1）

export const ATTR_MAX = 100;
/** 设计35 第八节：上课立刻学完，一律不占人（商战 / 踩点 / 出差 / 职位效率都不受影响） */
export const isTraining = () => false;
export const availableCourses = (s) => COURSES.slice();   // 设计101：不锁称号，开局全部能上（只看上限和钱）

const mainAttr = (course) => Object.keys(course.gain)[0];
const hasBest = (secId, course) => SEC_BY_ID[secId].best in course.gain;
/** 设计91：这门课最多练到（不超过 100） */
export const capOf = (c) => Math.min(c.cap || ATTR_MAX, ATTR_MAX);
/** 设计91：价格 = 基础价 × (1 + (PRICE_TOP − 1) × 属性 ÷ 100)，擅长 8 折 */
const priceAt = (secId, c, v) => Math.ceil(c.price * (1 + (PRICE_TOP - 1) * v / 100) * (hasBest(secId, c) ? BEST_DISCOUNT : 1));
const gainAt = (secId, c, attrs) => { const best = SEC_BY_ID[secId].best; const top = capOf(c); const out = {}; for (const [k, v] of Object.entries(c.gain)) out[k] = Math.max(0, Math.min(top - attrs[k], v + (k === best ? 1 : 0))); return out; };
/** 设计91：这门课练到上限了，再往上去上哪几门（加同样属性、上限更高、上限最低的那门） */
export function nextCourses(c) {
  const names = []; for (const k of Object.keys(c.gain)) { const n = COURSES.filter((x) => x.id !== c.id && k in x.gain && capOf(x) > capOf(c)).sort((a, b) => capOf(a) - capOf(b) || a.price - b.price)[0]; if (n && !names.includes(n.name)) names.push(n.name); }
  return names;
}
/** 设计91：练到上限的那句（「这门课最多练到 50，再往上去上 海外 MBA」）；满 100 写「这项已经满了」 */
export function capWhy(c) { const nx = nextCourses(c); return capOf(c) >= ATTR_MAX || !nx.length ? '这项已经满了' : `这门课最多练到 ${capOf(c)}，再往上去上${nx.map((x) => `「${x}」`).join('、')}`; }

export function coursePrice(s, secId, courseId) {
  const c = COURSE_BY_ID[courseId]; const r = ensureSec(s, secId);
  return priceAt(secId, c, r.attrs[mainAttr(c)]);
}
/** 实际加多少（擅长那项多 +1；每项不超过这门课的上限 min(cap, 100)，到了的那项不加） */
export function courseGain(s, secId, courseId) {
  const r = ensureSec(s, secId); return gainAt(secId, COURSE_BY_ID[courseId], r.attrs);
}
/** 不能上的原因；能上返回 null */
export function whyNot(s, secId, courseId) {
  const c = COURSE_BY_ID[courseId];
  if (!c) return '没有这门课';
  if (!s.secs[secId]) return '还没有这个秘书';
  if (Object.values(courseGain(s, secId, courseId)).every((v) => v <= 0)) return capWhy(c);   // 设计91：这门课加的几项都到上限才灰掉
  if (!canPay(s, 'company', coursePrice(s, secId, courseId))) return '公司账户不够';
  return null;
}
/** 上一节：付钱、属性立刻加上。返回 { ok, gain, price } 或 { ok:false, why } */
export function learn(s, secId, courseId, t = Date.now()) {
  const why = whyNot(s, secId, courseId); if (why) return { ok: false, why };
  const price = coursePrice(s, secId, courseId); const gain = courseGain(s, secId, courseId);
  pay(s, { wallet: 'company', cat: 'training', amount: price, by: secId, note: `${COURSE_BY_ID[courseId].name}` }, t); deductTax(s, price); /* 设计93：学费税前扣 */
  const r = ensureSec(s, secId); for (const [k, v] of Object.entries(gain)) r.attrs[k] += v;
  s.stats.coursesDone = (s.stats.coursesDone || 0) + 1;
  bump(s, t, 'course');
  return { ok: true, gain, price };
}
/** 老接口：开课 = 立刻学完一节 */
export const startCourse = (s, secId, courseId, t = Date.now()) => learn(s, secId, courseId, t).ok;
/** 「上到 N」：主属性上到 target 要几节、总价、总共加多少（不扣钱，只算） */
export function quoteTo(s, secId, courseId, target) {
  const c = COURSE_BY_ID[courseId]; const r = ensureSec(s, secId); const m = mainAttr(c);
  const a = { ...r.attrs }; let n = 0, total = 0; const gain = {};
  target = Math.min(capOf(c), target);
  while (a[m] < target && n < 200) {
    const g = gainAt(secId, c, a); if (Object.values(g).every((v) => v <= 0)) break;
    total += priceAt(secId, c, a[m]); n += 1;
    for (const [k, v] of Object.entries(g)) { a[k] += v; gain[k] = (gain[k] || 0) + v; }
  }
  return { n, total, gain, reach: a[m] };
}
/** 一次买到 target：钱不够整单不买 */
export function learnTo(s, secId, courseId, target, t = Date.now()) {
  const c = COURSE_BY_ID[courseId];
  if (!c) return { ok: false, why: '没有这门课' };
  const q = quoteTo(s, secId, courseId, target);
  if (!q.n) return { ok: false, why: '已经到了' };
  if (!canPay(s, 'company', q.total)) return { ok: false, why: `公司账户不够（要 ${q.total}）` };
  const gain = {}; let price = 0;
  for (let i = 0; i < q.n; i++) { const r = learn(s, secId, courseId, t); if (!r.ok) break; price += r.price; for (const [k, v] of Object.entries(r.gain)) gain[k] = (gain[k] || 0) + v; }
  return { ok: true, n: q.n, gain, price };
}
/** 老存档里正在上的课：读档时直接结业（不发消息）；返回结业列表 [{sec, course, gain}] */
export function finishDue(s) {
  const done = [];
  for (const x of s.training || []) {
    if (!s.secs[x.sec] || !COURSE_BY_ID[x.course]) continue;
    const gain = courseGain(s, x.sec, x.course); const r = ensureSec(s, x.sec);
    for (const [k, v] of Object.entries(gain)) r.attrs[k] += v;
    s.stats.coursesDone = (s.stats.coursesDone || 0) + 1;
    done.push({ sec: x.sec, course: x.course, gain });
  }
  s.training = [];
  return done;
}
