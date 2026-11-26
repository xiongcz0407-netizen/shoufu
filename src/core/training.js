// 培养：课程价格、立刻学完（设计35 第八节：不再等时间、没有培训位；存档里正在上的课读档时直接结业）
import { COURSES, COURSE_BY_ID, BASE_SLOTS, PRICE_BASE, PRICE_GROW, TIME_BASE_SEC, TIME_GROW, BEST_DISCOUNT } from '../config/courses.js?v=a184462c';
import { SEC_BY_ID } from '../config/secretaries.js?v=a184462c';
import { ensureSec } from './secretary.js?v=a184462c';
import { bump } from './daily.js?v=a184462c';
import { pay, canPay } from './ledger.js?v=a184462c';

export const ATTR_MAX = 100;
/** 设计35 第八节：没有培训位了（留着给老代码 / 测试，不再用来限制） */
export const slotCount = (s) => BASE_SLOTS + s.title;
/** 设计35 第八节：上课立刻学完，一律不占人（商战 / 踩点 / 出差 / 职位效率都不受影响） */
export const isTraining = () => false;
export const availableCourses = (s) => COURSES.filter((c) => s.title >= c.unlockTitle);

const mainAttr = (course) => Object.keys(course.gain)[0];
const hasBest = (secId, course) => SEC_BY_ID[secId].best in course.gain;
const priceAt = (secId, c, v) => Math.ceil(PRICE_BASE * Math.pow(PRICE_GROW, v) * (hasBest(secId, c) ? BEST_DISCOUNT : 1));
const gainAt = (secId, c, attrs) => { const best = SEC_BY_ID[secId].best; const out = {}; for (const [k, v] of Object.entries(c.gain)) out[k] = Math.max(0, Math.min(ATTR_MAX - attrs[k], v + (k === best ? 1 : 0))); return out; };

export function coursePrice(s, secId, courseId) {
  const c = COURSE_BY_ID[courseId]; const r = ensureSec(s, secId);
  return priceAt(secId, c, r.attrs[mainAttr(c)]);
}
/** 老的上课时长（只留给老代码参考，不再用） */
export function courseTimeSec(s, secId, courseId) {
  const c = COURSE_BY_ID[courseId]; const r = ensureSec(s, secId);
  return Math.round(TIME_BASE_SEC * Math.pow(TIME_GROW, r.attrs[mainAttr(c)]));
}
/** 实际加多少（擅长那项多 +1；不超过 100） */
export function courseGain(s, secId, courseId) {
  const r = ensureSec(s, secId); return gainAt(secId, COURSE_BY_ID[courseId], r.attrs);
}
/** 不能上的原因；能上返回 null */
export function whyNot(s, secId, courseId) {
  const c = COURSE_BY_ID[courseId];
  if (!c || s.title < c.unlockTitle) return '课程还没解锁';
  if (!s.secs[secId]) return '还没有这个秘书';
  if (Object.values(courseGain(s, secId, courseId)).every((v) => v <= 0)) return '这项已经满了';
  if (!canPay(s, 'company', coursePrice(s, secId, courseId))) return '公司账户不够';
  return null;
}
/** 上一节：付钱、属性立刻加上。返回 { ok, gain, price } 或 { ok:false, why } */
export function learn(s, secId, courseId, t = Date.now()) {
  const why = whyNot(s, secId, courseId); if (why) return { ok: false, why };
  const price = coursePrice(s, secId, courseId); const gain = courseGain(s, secId, courseId);
  pay(s, { wallet: 'company', cat: 'training', amount: price, by: secId, note: `${COURSE_BY_ID[courseId].name}` }, t);
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
  target = Math.min(ATTR_MAX, target);
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
  if (!c || s.title < c.unlockTitle) return { ok: false, why: '课程还没解锁' };
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
