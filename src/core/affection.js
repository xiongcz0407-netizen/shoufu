// 好感、爱慕、每天互动、送礼、台词触发规则（设计03 第五节）、吃醋 / 冷落
import { SEC_BY_ID, SECRETARIES } from '../config/secretaries.js?v=598ef1ae';
import { GIFT_BY_ID } from '../config/gifts.js?v=598ef1ae';
import { LINES } from '../config/lines.js?v=598ef1ae';
import { ensureSec, favorStage, loveStage, FAVOR_MAX, LOVE_STAGES } from './secretary.js?v=598ef1ae';
import { bump } from './daily.js?v=598ef1ae';
import { pay, receive, accrue, canPay } from './ledger.js?v=598ef1ae';

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
/** 加好感（加的时候乘气场）；返回 { from, to, stageUp } */
export function addFavor(s, id, n) {
  const r = ensureSec(s, id); const from = r.favor;
  if (n > 0) n = Math.round(n * favorMult(s));
  r.favor = Math.max(0, Math.min(FAVOR_MAX, r.favor + n));
  return { from, to: r.favor, stageUp: favorStage(r.favor) > favorStage(from) };
}
/** 加爱慕；减的时候不掉阶段；返回 { from, to, stageUp } */
export function addLove(s, id, n) {
  const r = ensureSec(s, id); const from = r.love;
  let v = Math.max(0, Math.min(100, r.love + n));
  if (n < 0) v = Math.max(v, LOVE_STAGES[loveStage(from)][0]);
  r.love = v;
  return { from, to: v, stageUp: loveStage(v) > loveStage(from) };
}

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
  return { scene, line: LINES[id] && LINES[id][scene], favor };
}

/** 切到她：冷落太久 / 今天先陪过别人 → 吃醋，否则问候 */
export function switchTo(s, id, t) {
  const d = daily(s, t);
  const others = Object.keys(d.accompanied).some((k) => k !== id);
  const jealous = neglectedDays(s, id, t) >= NEGLECT_DAYS || (others && !d.accompanied[id]);
  markWith(s, id, t);
  const scene = jealous ? 'jealous' : 'greet';
  return { scene, line: LINES[id] && LINES[id][scene] };
}

/** 送礼；返回 { ok, liked, favor, love, line } 或 { ok:false, why } */
export function giveGift(s, id, giftId, t) {
  const g = GIFT_BY_ID[giftId]; const c = SEC_BY_ID[id];
  if (!g || !s.secs[id]) return { ok: false, why: '没有这个' };
  if (!canPay(s, 'personal', g.price)) return { ok: false, why: '个人现金不够' };
  const inv = invoice(s, { item: g.name, amount: g.price, seller: '星光商场', t });
  pay(s, { wallet: 'personal', cat: 'gift', amount: g.price, party: id, ref: inv.no, note: `送${g.name}` }, t);
  const r = ensureSec(s, id);
  r.rec.gifts += 1; s.stats.gifts = (s.stats.gifts || 0) + 1; bump(s, t, 'gift');
  const liked = (c.gifts || []).includes(g.name);
  const favor = addFavor(s, id, liked ? g.favor * 2 : g.favor);
  const love = addLove(s, id, liked ? 1 : 0);
  r.rec.giftLog = r.rec.giftLog || []; r.rec.giftLog.push({ t, name: g.name, favor: favor.to - favor.from, love: love.to - love.from }); if (r.rec.giftLog.length > 300) r.rec.giftLog.shift(); // 秘书详情「送过的礼物」明细
  markWith(s, id, t);
  return { ok: true, liked, favor, love, invoice: inv, line: LINES[id] && LINES[id].happy };
}

/** 每天过天时：冷落 2 天以上的爱慕 -1（不掉阶段）。返回掉了的人 */
export function dailyDecay(s, t) {
  if (s.flags.lastDecayDay === dayKey(t)) return [];
  s.flags.lastDecayDay = dayKey(t);
  const out = [];
  for (const c of SECRETARIES) {
    if (!s.secs[c.id]) continue;
    if (neglectedDays(s, c.id, t) >= NEGLECT_DAYS) { const r = addLove(s, c.id, -1); if (r.to < r.from) out.push(c.id); }
  }
  return out;
}

/** 发票（设计14：买东西都出发票，进档案柜）：{ no, t, item, amount, tax, seller, buyer } */
export function invoice(s, { item, amount, seller, t, taxRate = 0.13 }) {
  s.invoiceSeq = (s.invoiceSeq || 0) + 1;
  const no = `发票-${String(s.invoiceSeq).padStart(6, '0')}`;
  const tax = Math.round(amount / (1 + taxRate) * taxRate * 100) / 100; // 价税合计里含的增值税
  const inv = { no, t, item, amount, tax, seller, buyer: s.bossName || '老板' };
  (s.invoices = s.invoices || []).push(inv);
  if (s.invoices.length > 500) s.invoices.shift();
  return inv;
}
