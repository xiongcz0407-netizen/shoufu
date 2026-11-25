// 礼物信箱 → 奖励邮件（V0.2.8 礼物信箱；设计42 改成邮件，开发2）
// 云端信箱 shoufu/gifts/<id>.json：{ list: [{ id, why, at, minV, coupons, items, secAttrs: { 秘书id: { wit: 100 } } }] }
// 看到新礼物（id 没收过、游戏版本 ≥ minV）→ 变成一封「重要」邮件（不过期），玩家点「领取」才到手；收过的 id 记在 s.coupon.gifts（只生成一封）
import { cp, earn, giveItems, giftText, ITEMS } from './coupon.js?v=8c602723';
import { addMsg } from './inbox.js?v=8c602723';
import { attrs as secAttrs } from './posts.js?v=8c602723';
import { ATTR_MAX } from './training.js?v=8c602723';
import { SEC_BY_ID } from '../config/secretaries.js?v=8c602723';
import { receive } from './ledger.js?v=8c602723';

export const ATTR_NAME = { charm: '魅力', wit: '智慧', social: '交际', manage: '管理' };
const whyOf = (g) => String((g && g.why) || '作者赠送').slice(0, 30);
const clamp = (v) => Math.max(0, Math.min(ATTR_MAX, Math.round(+v || 0)));
/** 礼物里能用的：金券、券、秘书属性（只认四项属性；值夹在 0～100） */
export function cleanGift(g) {
  const items = Object.fromEntries(Object.entries(g.items || {}).filter(([k, x]) => ITEMS[k] && x > 0).map(([k, x]) => [k, Math.floor(x)]));
  const sec = {}; for (const [id, o] of Object.entries(g.secAttrs || {})) { if (!SEC_BY_ID[id] || !o) continue; const a = {}; for (const [k, v] of Object.entries(o)) if (ATTR_NAME[k] && Number.isFinite(+v)) a[k] = clamp(v); if (Object.keys(a).length) sec[id] = a; }
  const cash = Math.max(0, Math.floor(+g.cash || 0));   // 设计62 第二件：送个人现金（元）
  return { id: g.id, why: whyOf(g), coupons: Math.max(0, Math.floor(+g.coupons || 0)), items, secAttrs: sec, ...(cash ? { cash } : {}) };
}
/** ¥100万 / ¥1,234 */
export const cashText = (v) => (v >= 1e4 && v % 100 === 0 ? `¥${+(v / 1e4).toFixed(2)}万` : `¥${v.toLocaleString('zh-CN')}`);
/** 邮件里逐项写 */
export function giftLines(s, g) {
  const out = []; if (g.cash) out.push(`个人现金 ${cashText(g.cash)}`); if (g.coupons) out.push(`金券 ×${g.coupons}`);
  for (const [k, n] of Object.entries(g.items)) out.push(`${ITEMS[k].name} ×${n}`);
  for (const [id, a] of Object.entries(g.secAttrs)) for (const [k, v] of Object.entries(a)) out.push(`${SEC_BY_ID[id].name} ${ATTR_NAME[k]} → ${v}${s.secs[id] ? `（现在 ${secAttrs(s, id)[k]}）` : '（还没有她，领的时候这项跳过）'}`);
  return out;
}
/** 信箱里的新礼物 → 邮件。appV：游戏版本，低于礼物 minV 的不收（信箱留着）。返回这次新生成的邮件 */
export function giftsToMail(s, list, appV, t = Date.now()) {
  const c = cp(s); const seen = (c.gifts = c.gifts || []); const out = [];
  for (const raw of list || []) {
    if (!raw || !raw.id || seen.includes(raw.id)) continue;
    if (raw.minV && appV < raw.minV) continue;   // 版本太旧：先不收，等更新
    seen.push(raw.id); if (seen.length > 100) seen.splice(0, seen.length - 100);
    const g = cleanGift(raw); const lines = giftLines(s, g);
    out.push(addMsg(s, { kind: 'request', type: 'gift_mail', title: `🎁 作者赠送${g.why !== '作者赠送' ? ` · ${g.why}` : ''}`, body: lines.join('\n') || '（空的）', actions: [{ key: 'take', label: '领取' }], data: { gift: g } }, t));
  }
  return out;
}
/** 点「领取」：金券、券进卡包；秘书属性改成写的值（没有这个秘书跳过）。返回 { coupons, items（文字）, changes: [{ id, A0, A1 }], skipped: [名字] }；邮件挪到「系统」写「已领取」 */
export function claimGift(s, msg, t = Date.now()) {
  if (!msg || msg.type !== 'gift_mail' || msg.status !== 'open') return null;
  const g = msg.data.gift; const why = g.why; const res = { why, coupons: 0, cash: 0, items: '', changes: [], skipped: [] };
  if (g.cash > 0 && receive(s, { wallet: 'personal', cat: 'reward', amount: g.cash, party: '作者', note: why }, t)) res.cash = g.cash;   // 设计62 第二件：走记账，备注写 why
  if (g.coupons) { earn(s, g.coupons, why, t); res.coupons = g.coupons; }
  res.items = giveItems(s, g.items, why, t) || '';
  for (const [id, a] of Object.entries(g.secAttrs)) {
    if (!s.secs[id]) { res.skipped.push(SEC_BY_ID[id].name); continue; }
    const A0 = { ...secAttrs(s, id) }; const A1 = { ...A0, ...a }; s.secs[id].attrs = A1; res.changes.push({ id, A0, A1 });
  }
  msg.status = 'done'; msg.read = true; msg.title += '（已领取）'; msg.body += '\n已领取';
  return res;
}
/** 信箱里的是不是都收成邮件了（都收了才删信箱；版本不够的留着） */
export const allTaken = (s, list) => (list || []).every((g) => !g || !g.id || (cp(s).gifts || []).includes(g.id));
/** 老名字（V0.2.8 直接加）不再用；留给老测试 */
export { giftText };
