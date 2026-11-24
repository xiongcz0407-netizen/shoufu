// 设计56 礼物加好感、奢侈品加爱慕、定情信物、秘书生日（开发2）
// 礼物（1 万以下）只加好感 = 价钱 ÷ 500（两位小数）；奢侈品（名包 + 1 万以上的首饰 / 表 / 酒，100 万以下）只加爱慕 = 价钱 ÷ 1 万（向下取整）
// 加成：最喜欢的礼物 / 喜欢的牌子 / 最喜欢的奢侈品 ×2，讨厌的礼物 ×0.5，她生日 ×3，叠乘；爱慕到门口为止（affection.addLove）
// 定情信物：爱慕 ≥ 80 后下一次约会她提起，价钱 = 身价 × 1%（最少 100 万）定死；送出爱慕直接 100（「唯一」）
import CFG from '../config/love.json?v=f7808ad2' with { type: 'json' };
import { GIFTS } from '../config/gifts.js?v=f7808ad2';
import { SECRETARIES, SEC_BY_ID } from '../config/secretaries.js?v=f7808ad2';
import { LINES } from '../config/lines.js?v=f7808ad2';
import { ensureSec, FAVOR_MAX } from './secretary.js?v=f7808ad2';
import { addFavor, addLove, setOnly, loveCap, favorMult, markWith, invoice, dayKey } from './affection.js?v=f7808ad2';
import { pay, canPay } from './ledger.js?v=f7808ad2';
import { bump } from './daily.js?v=f7808ad2';
import { BAGS, L as LX_L, label, payBag } from './luxury.js?v=f7808ad2';
import { netWorth } from './economy.js?v=f7808ad2';

export const LOVE_CFG = CFG;
const G = CFG.gift, MU = CFG.mult, TK = CFG.token;
const r2 = (v) => Math.round(v * 100) / 100;
const DAY = 86400e3;

// ---------- 两类东西 ----------
/** 礼物：1 万以下 24 件，按价钱排 */
export const GIFT_LIST = GIFTS.filter((g) => g.price < G.giftMax).sort((a, b) => a.price - b.price);
const giftOf = (id) => GIFT_LIST.find((g) => g.id === id) || null;
/** 奢侈品：名包（喜马拉雅不卖了）+ 1 万以上的礼物（珠宝套装、粉钻戒指不卖了），一共 25 件，按价钱排。{ id, kind: bag / jewel / watch / wine, name, price, img, brandKey } */
export const LUX_LIST = [
  ...BAGS.filter((x) => !x.retired && !G.removedBags.includes(x.id)).map((x) => ({ id: x.id, kind: 'bag', name: label(x), price: x.price, img: `assets/bag/${x.id}.webp`, brandKey: x.brandKey })),
  ...GIFTS.filter((g) => g.price >= G.giftMax && g.price <= G.luxMax && !G.removed.includes(g.id)).map((g) => ({ id: g.id, kind: CFG.luxKind[g.id] || 'jewel', name: g.name, price: g.price, img: `assets/gift/${g.id}.webp` })),
].sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1));
export const LUX_BY_ID = Object.fromEntries(LUX_LIST.map((x) => [x.id, x]));

// ---------- 生日（现实日历每月一次，手机本地时间）----------
export const birthdayOf = (id) => CFG.secretary.birthday[id] || null;
const dateOf = (t) => new Date(t).getDate();
/** 今天是她生日（还没加入的不算） */
export const isBirthday = (s, id, t = Date.now()) => !!(s.secs && s.secs[id]) && dateOf(t) === birthdayOf(id);
/** 这一天过生日的秘书（已加入的） */
export const birthdaysOn = (s, t = Date.now()) => SECRETARIES.filter((c) => isBirthday(s, c.id, t)).map((c) => c.id);
/** 明天过生日的（日程前一天预告） */
export const birthdaysTomorrow = (s, t = Date.now()) => { const d = new Date(t); return birthdaysOn(s, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12).getTime()); };
/** 今天送过她东西没有（今日日常「给她过生日」划掉） */
export const giftedToday = (s, id, t = Date.now()) => !!(s.secs[id] && s.secs[id].rec && s.secs[id].rec.lastGiftDay === dayKey(t));
/** 生日当天点她：说生日台词 */
export const birthdayLine = (id) => CFG.birthdayLines[id] || null;

// ---------- 能加多少 ----------
/** 礼物的加成：{ mult, fav（最喜欢）, dislike（讨厌）, bday（生日）} */
export function giftMult(s, id, g, t = Date.now()) {
  const c = SEC_BY_ID[id]; const fav = (c.favorites || []).includes(g.name); const dislike = (c.dislikes || []).includes(g.name); const bday = isBirthday(s, id, t);
  return { mult: (fav ? MU.favorite : 1) * (dislike ? MU.dislike : 1) * (bday ? MU.birthday : 1), fav, dislike, bday };
}
/** 送这件礼物实际能加多少好感：{ favor（实际，含气场、满了为止）, raw（没封顶的）, full（好感已满）, ...加成 } */
export function giftGain(s, id, giftId, t = Date.now()) {
  const g = giftOf(giftId); const r = ensureSec(s, id); if (!g || !r) return null; const m = giftMult(s, id, g, t);
  const raw = r2(r2(g.price / G.favorPer * m.mult) * favorMult(s)); const room = r2(Math.max(0, FAVOR_MAX - r.favor));
  return { ...m, raw, favor: Math.min(raw, room), full: room <= 0 };
}
/** 奢侈品的加成：喜欢的牌子 / 最喜欢的奢侈品 ×2、生日 ×3 */
export function luxMult(s, id, x, t = Date.now()) {
  const c = SEC_BY_ID[id]; const like = (x.kind === 'bag' && x.brandKey === c.likeBrand) || x.name === c.likeLux; const bday = isBirthday(s, id, t);
  return { mult: (like ? MU.likeLux : 1) * (bday ? MU.birthday : 1), like, bday };
}
/** 送这件奢侈品实际能加多少爱慕：{ love（实际，到门口为止）, raw, why: null / gate（到门口了，约她出去）/ token（要定情信物）/ max（已经唯一）} */
export function luxGain(s, id, luxId, t = Date.now()) {
  const x = LUX_BY_ID[luxId]; const r = ensureSec(s, id); if (!x || !r) return null; const m = luxMult(s, id, x, t);
  const raw = Math.floor(x.price / G.lovePer) * m.mult; const cap = loveCap(r.love, false); const love = Math.max(0, Math.min(raw, r2(cap - r.love)));
  const why = love >= raw ? null : r.love >= 100 ? 'max' : r.love >= TK.askAt ? 'token' : 'gate';
  return { ...m, raw, love, why };
}
const logGift = (r, t, e) => { r.rec.giftLog = r.rec.giftLog || []; r.rec.giftLog.push({ t, ...e }); if (r.rec.giftLog.length > 300) r.rec.giftLog.shift(); };
const after = (s, id, r, t) => { r.rec.gifts += 1; r.rec.lastGiftDay = dayKey(t); s.stats.gifts = (s.stats.gifts || 0) + 1; bump(s, t, 'gift'); markWith(s, id, t); };

// ---------- 送 ----------
/** 送礼物：只加好感；返回 { ok, favor, gain, line, scene } */
export function giveGift(s, id, giftId, t = Date.now()) {
  const g = giftOf(giftId); if (!g || !s.secs[id]) return { ok: false, why: '没有这个' };
  if (!canPay(s, 'personal', g.price)) return { ok: false, why: '个人现金不够' };
  const gain = giftGain(s, id, giftId, t);
  const inv = invoice(s, { item: g.name, amount: g.price, seller: '星光商场', t });
  pay(s, { wallet: 'personal', cat: 'gift', amount: g.price, party: id, ref: inv.no, note: `送${g.name}` }, t);
  const r = ensureSec(s, id); const favor = addFavor(s, id, r2(g.price / G.favorPer * gain.mult));
  logGift(r, t, { name: g.name, price: g.price, favor: r2(favor.to - favor.from), love: 0 }); after(s, id, r, t);
  const line = gain.dislike ? CFG.dislikeLines[id] : gain.bday ? CFG.birthdayLines[id] : LINES[id] && LINES[id].happy;
  return { ok: true, favor, gain, invoice: inv, line, scene: gain.dislike ? 'tap' : 'happy', love: { from: r.love, to: r.love, stageUp: false } };
}
/** 送奢侈品：只加爱慕（到门口为止），进她的首饰盒 */
export function giveLux(s, id, luxId, t = Date.now()) {
  const x = LUX_BY_ID[luxId]; if (!x || !s.secs[id]) return { ok: false, why: '没有这件' };
  if (!canPay(s, 'personal', x.price)) return { ok: false, why: '个人现金不够' };
  const gain = luxGain(s, id, luxId, t); let inv;
  if (x.kind === 'bag') { inv = payBag(s, LX_L[x.id], t, { party: LX_L[x.id].brand, note: `送${SEC_BY_ID[id].name} ${x.name}` }); if (!inv) return { ok: false, why: '个人现金不够' }; }
  else { inv = invoice(s, { item: x.name, amount: x.price, seller: '星光商场', t }); pay(s, { wallet: 'personal', cat: 'gift', amount: x.price, party: id, ref: inv.no, note: `送${x.name}` }, t); }
  const r = ensureSec(s, id); const love = addLove(s, id, Math.floor(x.price / G.lovePer) * gain.mult);
  (r.rec.box = r.rec.box || []).push({ id: x.id, name: x.name, price: x.price, img: x.img, t });
  logGift(r, t, { name: x.name, price: x.price, favor: 0, love: r2(love.to - love.from) }); after(s, id, r, t);
  const line = gain.bday ? CFG.birthdayLines[id] : LINES[id] && LINES[id].happy;
  return { ok: true, love, gain, invoice: inv, line, favor: { from: r.favor, to: r.favor, stageUp: false } };
}

// ---------- 定情信物 ----------
export const tokenOf = (id) => TK.items[id] || null;
/** 定价：身价 × 1%，最少 100 万，取整到万 */
export const tokenPrice = (s) => Math.max(TK.min, Math.round(netWorth(s) * TK.pct / TK.round) * TK.round);
/** 约会结束时调（from = 这次约会前的爱慕）：爱慕 ≥ 80 以后的下一次约会，她提起信物，价钱这时定死。返回 { name, line, price } 或 null */
export function afterDate(s, id, from, t = Date.now()) {
  const r = ensureSec(s, id); const k = tokenOf(id); if (!r || !k || r.token || from < TK.askAt || r.love >= 100) return null;
  r.token = { price: tokenPrice(s), at: t, given: null };
  return { name: k.name, line: k.origin, price: r.token.price };
}
/** 信物那一栏：{ state: hidden（80 前剪影）/ wait（80 了，等下一次约会提起）/ ready（能买）/ given（送过了）, name, price, img } */
export function tokenState(s, id) {
  const r = s.secs[id]; const k = tokenOf(id); if (!r || !k) return null;
  const base = { name: k.name, img: `assets/gift/${k.img}.webp`, origin: k.origin };
  if (r.token && r.token.given) return { ...base, state: 'given', price: r.token.price, at: r.token.given };
  if (r.token) return { ...base, state: 'ready', price: r.token.price };
  return { ...base, state: r.love >= TK.askAt ? 'wait' : 'hidden' };
}
/** 送定情信物：只能一次、不能卖、不吃加成；爱慕直接 100 */
export function giveToken(s, id, t = Date.now()) {
  const r = s.secs[id]; const k = tokenOf(id); if (!r || !k) return { ok: false, why: '没有这个' };
  if (!r.token) return { ok: false, why: '她还没提起过' }; if (r.token.given) return { ok: false, why: '已经送过了' };
  if (!canPay(s, 'personal', r.token.price)) return { ok: false, why: '个人现金不够' };
  const inv = invoice(s, { item: k.name, amount: r.token.price, seller: '星光商场', t });
  if (!pay(s, { wallet: 'personal', cat: 'token', amount: r.token.price, party: id, ref: inv.no, note: `送${SEC_BY_ID[id].name}定情信物：${k.name}` }, t)) return { ok: false, why: '个人现金不够' };
  r.token.given = t; const love = setOnly(s, id);
  (r.rec.box = r.rec.box || []).push({ id: `token_${id}`, name: k.name, price: r.token.price, img: `assets/gift/${k.img}.webp`, t, token: true });
  after(s, id, r, t);
  return { ok: true, love, invoice: inv, line: k.accept };
}

// ---------- 首饰盒：送过的奢侈品和信物（老存档送过的名包、1 万以上的礼物也算）----------
export function jewelBox(s, id) {
  const r = s.secs[id]; if (!r) return { items: [], n: 0, total: 0 }; const items = [...(r.rec.box || [])];
  const seen = new Set(items.map((x) => `${x.id}@${x.t}`));
  for (const b of r.rec.bags || []) { const x = LX_L[b.id]; if (x && !seen.has(`${b.id}@${b.t}`)) items.push({ id: b.id, name: label(x), price: x.price, img: `assets/bag/${b.id}.webp`, t: b.t, old: true }); }
  const names = new Set(items.map((x) => `${x.name}@${x.t}`));
  for (const e of r.rec.giftLog || []) { const g = GIFTS.find((y) => y.name === e.name); if (g && g.price >= G.giftMax && !names.has(`${g.name}@${e.t}`)) items.push({ id: g.id, name: g.name, price: g.price, img: `assets/gift/${g.id}.webp`, t: e.t, old: true }); }
  items.sort((a, b) => b.t - a.t);
  return { items, n: items.length, total: items.reduce((a, x) => a + x.price, 0) };
}
export { DAY };
