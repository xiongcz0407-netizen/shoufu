// 培养：课程价格 / 时间、培训位、开课、结业（离线也算）
import { COURSES, COURSE_BY_ID, BASE_SLOTS, PRICE_BASE, PRICE_GROW, TIME_BASE_SEC, TIME_GROW, BEST_DISCOUNT } from '../config/courses.js?v=b7d8e042';
import { SEC_BY_ID } from '../config/secretaries.js?v=b7d8e042';
import { ensureSec } from './secretary.js?v=b7d8e042';
import { bump } from './daily.js?v=b7d8e042';
import { isScouting } from './busy.js?v=b7d8e042'; // V2-08 踩点占用（开发2）
import { pay, receive, accrue, canPay } from './ledger.js?v=b7d8e042';

export const ATTR_MAX = 100;
export const slotCount = (s) => BASE_SLOTS + s.title;
export const isTraining = (s, secId) => (s.training || []).some((t) => t.sec === secId);
export const availableCourses = (s) => COURSES.filter((c) => s.title >= c.unlockTitle);

const mainAttr = (course) => Object.keys(course.gain)[0];
const hasBest = (secId, course) => SEC_BY_ID[secId].best in course.gain;

export function coursePrice(s, secId, courseId) {
  const c = COURSE_BY_ID[courseId]; const r = ensureSec(s, secId);
  const p = PRICE_BASE * Math.pow(PRICE_GROW, r.attrs[mainAttr(c)]);
  return Math.ceil(p * (hasBest(secId, c) ? BEST_DISCOUNT : 1));
}
export function courseTimeSec(s, secId, courseId) {
  const c = COURSE_BY_ID[courseId]; const r = ensureSec(s, secId);
  return Math.round(TIME_BASE_SEC * Math.pow(TIME_GROW, r.attrs[mainAttr(c)]));
}
/** 实际加多少（擅长那项多 +1；不超过 100） */
export function courseGain(s, secId, courseId) {
  const c = COURSE_BY_ID[courseId]; const r = ensureSec(s, secId); const best = SEC_BY_ID[secId].best;
  const out = {};
  for (const [k, v] of Object.entries(c.gain)) out[k] = Math.min(ATTR_MAX - r.attrs[k], v + (k === best ? 1 : 0));
  return out;
}
/** 不能上的原因；能上返回 null */
export function whyNot(s, secId, courseId) {
  const c = COURSE_BY_ID[courseId];
  if (!c || s.title < c.unlockTitle) return '课程还没解锁';
  if (!s.secs[secId]) return '还没有这个秘书';
  if (isTraining(s, secId)) return '她正在上课';
  if (isScouting(s, secId)) return '她在踩点，回来再上课'; // V2-08
  if ((s.training || []).length >= slotCount(s)) return '培训位满了';
  if (Object.values(courseGain(s, secId, courseId)).every((v) => v <= 0)) return '这项已经满了';
  if (!canPay(s, 'company', coursePrice(s, secId, courseId))) return '公司账户不够';
  return null;
}
export function startCourse(s, secId, courseId, t = Date.now()) {
  if (whyNot(s, secId, courseId)) return false;
  pay(s, { wallet: 'company', cat: 'training', amount: coursePrice(s, secId, courseId), by: secId, note: `${COURSE_BY_ID[courseId].name}` }, t);
  s.training = s.training || [];
  s.training.push({ sec: secId, course: courseId, start: t, end: t + courseTimeSec(s, secId, courseId) * 1000 });
  bump(s, t, 'course');
  return true;
}
/** 到点的自动结业；返回结业列表 [{sec, course, gain}] */
export function finishDue(s, t = Date.now()) {
  const done = [];
  s.training = (s.training || []).filter((x) => {
    if (x.end > t) return true;
    const gain = courseGain(s, x.sec, x.course);
    const r = ensureSec(s, x.sec);
    for (const [k, v] of Object.entries(gain)) r.attrs[k] += v;
    s.stats.coursesDone = (s.stats.coursesDone || 0) + 1;
    done.push({ sec: x.sec, course: x.course, gain });
    return false;
  });
  return done;
}
