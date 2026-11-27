// 好感、爱慕、每天互动、送礼、台词触发规则（设计03 第五节）、吃醋 / 冷落
import { capAdd } from './cap.js?v=f00c2612';   // 设计79：有上限的列表（config/caps.js）
import { SEC_BY_ID, SECRETARIES } from '../config/secretaries.js?v=f00c2612';
import { GIFT_BY_ID } from '../config/gifts.js?v=f00c2612';
import { LINES } from '../config/lines.js?v=f00c2612';
import { ensureSec, favorStage, loveStage, FAVOR_MAX, FAVOR_FULL_AT, LOVE_STAGES } from './secretary.js?v=f00c2612';
import { bump } from './daily.js?v=f00c2612';
import { pay, receive, accrue, canPay } from './ledger.js?v=f00c2612';
import LOVE from '../config/love.json?v=f00c2612' with { type: 'json' };   // 设计56
import { afterLine } from './afterlines.js?v=f00c2612';   // 设计89 私密约会第二天的台词

export const DAILY_TALKS = 10;      // 每人每天点她涨好感的次数
export const TALK_FAVOR = 2;
export const FLIRT_FROM_FAVOR = 200; // 好感到「信任」后点她一半机会暧昧
export const NEGLECT_DAYS = 2;       // 冷落 2 天以上吃醋、爱慕慢慢掉
const DAY = 86400e3;

/** 本地日期 key（按手机时间过天） */
export const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export function daily(s, t) {
  const k = dayKey(t);
  if (!s.daily || s.daily.day !== k) s.daily = { day: k, talks: {}, flirts: {}, accompanied: {}, tasks: {}, signed: false };
  return s.daily;
}

/** 老板气场（第 12 项：车 → 气场）让好感涨得快：× (1 + 气场 / 200)；这里先留接口 */
let auraOf = () => 0;
export const setAura = (fn) => { auraOf = fn; };
export const favorMult = (s) => 1 + (auraOf(s) || 0) / 200;
const r2 = (v) => Math.round(v * 100) / 100;
/** 设计56：到了「唯一」（爱慕 100）以后不再掉好感、也不掉爱慕 */
export const isOnly = (s, id) => !!(s.secs[id] && s.secs[id].love >= 100);
/** 加好感（加的时候乘气场；设计56 起存两位小数，阶段等判断都按整数段）；「唯一」的不掉；返回 { from, to, stageUp } */
export function addFavor(s, id, n) {
  const r = ensureSec(s, id); const from = r.favor;
  if (n < 0 && isOnly(s, id)) return { from, to: from, stageUp: false };
  if (n > 0) n = r2(n * favorMult(s));
  r.favor = r2(Math.max(0, Math.min(FAVOR_MAX, r.favor + n)));
  if (r.favor >= FAVOR_FULL_AT) r.favor = FAVOR_MAX;   // 设计76：进「知己」就直接满（礼物、互动、约会、出差、职位……都走这里）
  return { from, to: r.favor, stageUp: favorStage(r.favor) > favorStage(from), full: r.favor >= FAVOR_MAX };
}
/** 设计56 门：20 / 40 / 60 / 80 / 100。加爱慕最多加到下一道门减 1；cross（约会）能跨 20 / 40 / 60 / 80，但最多 99（100 只靠定情信物） */
export const LOVE_GATES = LOVE.gates;
export function loveCap(from, cross = false) {
  if (from >= 100) return 100; if (cross) return 99;
  const g = LOVE_GATES.find((x) => x > from + 1e-9); return g == null ? 100 : g - 1;
}
/** 加爱慕；减的时候不掉阶段、「唯一」的不掉；加的时候到门口为止（cross = 约会能跨门）；返回 { from, to, stageUp, capped } */
export function addLove(s, id, n, { cross = false } = {}) {
  const r = ensureSec(s, id); const from = r.love;
  if (n < 0 && from >= 100) return { from, to: from, stageUp: false };
  let v = Math.max(0, Math.min(100, from + n)); let capped = false;
  if (n > 0) { const cap = loveCap(from, cross); if (v > cap) { v = Math.max(from, cap); capped = true; } }
  if (n < 0) v = Math.max(v, LOVE_STAGES[loveStage(from)][0]);
  r.love = r2(v);
  return { from, to: r.love, stageUp: loveStage(r.love) > loveStage(from), capped };
}
/** 定情信物：爱慕直接到 100（只有 core/love.js 调） */
export function setOnly(s, id) { const r = ensureSec(s, id); const from = r.love; r.love = 100; return { from, to: 100, stageUp: loveStage(100) > loveStage(from) }; }

/** 陪着她（换人、点她）：记一下，用来算冷落和「同一天陪别人」 */
export function markWith(s, id, t) {
  const r = ensureSec(s, id); r.rec.lastWith = t;
  daily(s, t).accompanied[id] = true;
}
export const neglectedDays = (s, id, t) => {
  const r = ensureSec(s, id); const last = r.rec.lastWith || r.joinedAt || t;
  return Math.floor((t - last) / DAY);
};

/** 今天还能涨好感的互动次数 */
const extraOf = (s, id, t) => (s.daily && s.daily.day === dayKey(t) && s.daily.talkExtra ? s.daily.talkExtra[id] || 0 : 0);
export const talksLeft = (s, id, t) => Math.max(0, DAILY_TALKS + extraOf(s, id, t) - (s.daily && s.daily.day === dayKey(t) ? s.daily.talks[id] || 0 : 0)); // 只看不改（不翻天）
/** 金券买的「互动 +5 次」（设计39，core/coupon.js 调） */
export const talkExtra = (s, id, n, t) => { const d = daily(s, t); d.talkExtra = d.talkExtra || {}; d.talkExtra[id] = (d.talkExtra[id] || 0) + n; };
/** 点她：返回 { scene, line, favor } */
export function tapSec(s, id, t, rnd = Math.random) {
  const r = ensureSec(s, id); const d = daily(s, t);
  markWith(s, id, t);
  let favor = null;
  // 每天前 10 次涨好感，也只有这 10 次算互动记录、每日任务；用完以后点她照样说话，不涨不记
  if ((d.talks[id] || 0) < DAILY_TALKS + ((d.talkExtra || {})[id] || 0)) { d.talks[id] = (d.talks[id] || 0) + 1; favor = addFavor(s, id, TALK_FAVOR); r.rec.talks += 1; s.stats.talks = (s.stats.talks || 0) + 1; bump(s, t, 'talk'); }
  let scene = 'tap';
  if (r.favor >= FLIRT_FROM_FAVOR && rnd() < 0.5) {
    scene = 'flirt';
    if (!d.flirts[id]) { d.flirts[id] = true; favor = favor || null; addLove(s, id, 1); } // 暧昧时点她，每天第一次 +1 爱慕
  }
  if (new Date(t).getDate() === LOVE.secretary.birthday[id] && !(d.bday && d.bday[id])) { (d.bday = d.bday || {})[id] = true; return { scene: 'happy', line: LOVE.birthdayLines[id], favor, birthday: true }; }   // 设计56：生日当天点她，先说生日那句
  { const ln = afterLine(s, id, t, rnd); if (ln) return { scene: 'after', line: ln, favor, after: true }; }   // 设计89：私密约会的下一天先说这些（当天不重复，用完回平常）
  return { scene, line: LINES[id] && LINES[id][scene], favor };
}

/** 切到她：冷落太久 / 今天先陪过别人 → 吃醋，否则问候 */
export function switchTo(s, id, t) {
  const d = daily(s, t);
  const others = Object.keys(d.accompanied).some((k) => k !== id);
  const jealous = !isOnly(s, id) && (neglectedDays(s, id, t) >= NEGLECT_DAYS || (others && !d.accompanied[id]));   // 设计56：「唯一」的不吃醋
  markWith(s, id, t);
  const scene = jealous ? 'jealous' : 'greet';
  return { scene, line: LINES[id] && LINES[id][scene] };
}

// 送礼（设计56）搬到 core/love.js giveGift（礼物只加好感 = 价钱 ÷ 500）

/** 每天过天时：冷落 2 天以上的爱慕 -1（不掉阶段）。返回掉了的人 */
export function dailyDecay(s, t) {
  if (s.flags.lastDecayDay === dayKey(t)) return [];
  s.flags.lastDecayDay = dayKey(t);
  const out = [];
  for (const c of SECRETARIES) {
    if (!s.secs[c.id]) continue;
    if (neglectedDays(s, c.id, t) >= NEGLECT_DAYS && !isOnly(s, c.id)) { const r = addLove(s, c.id, -1); if (r.to < r.from) out.push(c.id); }
  }
  return out;
}

/** 发票（设计14：买东西都出发票，进档案柜）：{ no, t, item, amount, tax, seller, buyer } */
export function invoice(s, { item, amount, seller, t, taxRate = 0.13 }) {
  s.invoiceSeq = (s.invoiceSeq || 0) + 1;
  const no = `发票-${String(s.invoiceSeq).padStart(6, '0')}`;
  const tax = Math.round(amount / (1 + taxRate) * taxRate * 100) / 100; // 价税合计里含的增值税
  const inv = { no, t, item, amount, tax, seller, buyer: s.bossName || '老板' };
  capAdd(s, 'invoices', (s.invoices = s.invoices || []), inv);   // 设计79：留 100 张，更早的按年汇总进 invoiceSum
  return inv;
}
