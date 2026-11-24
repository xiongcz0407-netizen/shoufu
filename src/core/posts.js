// 秘书职位（设计16）和秘书工资（设计17 第二节）：数据、任免、效率、加成、工资、谈加薪
// 注意：不 import economy（economy 要用这里的店长加成）
import P from '../config/posts.json?v=701206f7' with { type: 'json' };
import { SEC_BY_ID } from '../config/secretaries.js?v=701206f7';
import { IND_BY_ID } from '../config/industries.js?v=701206f7';
import { MONTH_MS } from './gametime.js?v=701206f7';
import { addMsg } from './inbox.js?v=701206f7';
import { POST_LINES } from '../config/post-lines.js?v=701206f7';
export { P as POSTS_CFG };

export const OUT = 'outsource';
const DAY = 86400e3;
const nowOf = (s) => (s._t != null ? s._t : Date.now());
/** 职位 key → 种类：manager_store → manager */
export const kindOf = (key) => (key.startsWith('manager_') ? 'manager' : key);
export const indOf = (key) => (key.startsWith('manager_') ? key.slice(8) : null);
export const postName = (key) => (kindOf(key) === 'manager' ? `店长·${(IND_BY_ID[indOf(key)] || {}).name || ''}` : P.posts[key].name);
/** 现在有哪些职位（阶段一：每条产业线一个店长、财务总监、资产管家） */
export function postKeys(s) {
  return ['cfo', 'biz', 'ipo', 'steward', 'invest', 'collector', ...Object.keys(s.inds).map((id) => 'manager_' + id)]; // 总监类放上面，店长按产业排在下面（验收：商务总监要一眼看到）
}
export const postLocked = (s, key) => (s.title < P.posts[kindOf(key)].unlockTitle ? `升到「${['打工人', '小老板', '老板', '企业家'][P.posts[kindOf(key)].unlockTitle]}」开放` : noStore(s, indOf(key)) ? '还没开店' : null);
/** 设计58：还没开的线（空着起步、0 家）不能派店长。不 import economy，这里自己看 */
export const noStore = (s, id) => !!(id && IND_BY_ID[id] && IND_BY_ID[id].startEmpty && s.inds && s.inds[id] && !(s.inds[id].branches > 0));
/** 设计58：老存档里派到还没开的线上的店长撤回「没职位」，秘书说一句；返回撤回的秘书 id */
export function recallEmpty(s, t = nowOf(s)) {
  const back = [];
  for (const [key, who] of Object.entries(s.positions || {})) {
    const id = indOf(key); if (!id || !noStore(s, id)) continue;
    delete s.positions[key]; if (s.inds[id]) s.inds[id].sec = null;
    if (!isSec(who) || !s.secs || !s.secs[who] || !SEC_BY_ID[who]) continue;
    const nm = SEC_BY_ID[who].name; back.push(who);
    addMsg(s, { kind: 'system', type: 'post_recall', from: who, title: `${nm}回来陪着你了`, body: `${nm}：「老板，${IND_BY_ID[id].name}还没开店，我先回来陪着你，开了店再派我去～」` }, t);
  }
  return back;
}
export const holder = (s, key) => (s.positions || {})[key] || null;
export const isSec = (who) => !!who && who !== OUT;
/** 她担任的职位 key，没有返回 null */
export function postOfSec(s, id) { for (const [k, v] of Object.entries(s.positions || {})) if (v === id) return k; return null; }
const meta = (s, key) => { s.postMeta = s.postMeta || {}; return (s.postMeta[key] = s.postMeta[key] || { since: 0, auth: P.posts[kindOf(key)].auth, host: { on: false, budget: P.manager.defaultBudget, spent: 0, paybackH: P.manager.defaultPaybackH } }); };
export const postMeta = meta;

export const attrs = (s, id) => (s.secs[id] && s.secs[id].attrs) || (() => { const c = SEC_BY_ID[id]; return { charm: c.attrs[0], wit: c.attrs[1], social: c.attrs[2], manage: c.attrs[3] }; })();
/** 某职位看的主属性（两项的取平均） */
export function mainAttr(s, id, kind) {
  const a = attrs(s, id); const ks = kind && P.posts[kind] ? P.posts[kind].attrs : ['charm', 'wit', 'social', 'manage'];
  return ks.reduce((x, k) => x + a[k], 0) / ks.length;
}
/** 最适合的职位打星 */
export const bestFor = (id, kind) => (P.best[id] || []).includes(kind);

/** 效率：好感信任 ×1.1、知己 ×1.2；冷落 3 天 ×0.7；上课 ×0.5；刚换人 10 分钟 ×0.5；拒绝加薪一个游戏月 ×0.9 */
export function efficiency(s, id, key, t = nowOf(s)) {
  const r = s.secs[id]; if (!r) return 0;
  let e = 1;
  for (const [f, k] of P.favorEff) if ((r.favor || 0) >= f) e = k;
  const last = (r.rec && r.rec.lastWith) || r.joinedAt || t;
  const only = (r.love || 0) >= 100;   // 设计56：「唯一」的不心不在焉、拒绝加薪也不低落
  if (t - last >= P.neglectDays * DAY && !only) e *= P.neglectEff;
  if ((s.training || []).some((x) => x.sec === id)) e *= P.trainingEff;
  if (key && t - (meta(s, key).since || 0) < P.handoverMin * 60e3) e *= P.handoverEff;
  if (r.pay && r.pay.sadUntil > t && !only) e *= P.raise.rejectEff;
  if (s.cap && s.cap.options && s.cap.options[id]) e *= (s.cap.optionEff || 1.1); // 拿了期权（3-03）
  return e;
}
/** 职位上的人的本事（0～1.x）= 主属性 / 100 × 效率；外包按配置；空缺 0 */
export function power(s, key, t = nowOf(s)) {
  const who = holder(s, key); const kind = kindOf(key);
  if (!who) return 0;
  if (who === OUT) return kind === 'manager' ? P.outsource.manager.manage / 100 : kind === 'biz' || kind === 'ipo' ? 0.3 : 0; // 商务咨询公司、FA 按 30 算
  return mainAttr(s, who, kind) / 100 * efficiency(s, who, key, t);
}
/** 店长加成：收入 ×(1 + 本事 × 0.8)、进货成本 ×(1 − 本事 × 0.15) */
export const managerRevMult = (s, indId) => 1 + power(s, 'manager_' + indId) * P.manager.revK;
export const managerCostMult = (s, indId) => 1 - power(s, 'manager_' + indId) * P.manager.costK;
/** 资产管家：维护费折扣、卖出回收价、排队时间（第 12 项用） */
export const stewardUpkeepMult = (s) => (isSec(holder(s, 'steward')) ? 1 - power(s, 'steward') * P.steward.upkeepK : 1);
export const stewardSellRate = (s) => (isSec(holder(s, 'steward')) ? P.steward.sellBase + Math.min(1, attrs(s, holder(s, 'steward')).social / 100) * P.steward.sellK : P.steward.sellBase);
export const stewardQueueMult = (s) => (isSec(holder(s, 'steward')) ? 1 - attrs(s, holder(s, 'steward')).social / 100 * P.steward.queueK : 1);
export const hasCfo = (s) => !!holder(s, 'cfo');

/** 任命 / 外包 / 撤职。who = 秘书 id | 'outsource' | null */
export function assign(s, key, who, t = nowOf(s)) {
  if (postLocked(s, key)) return { ok: false, why: postLocked(s, key) };
  s.positions = s.positions || {};
  if (isSec(who)) { if (!s.secs[who]) return { ok: false, why: '没有这个秘书' }; const old = postOfSec(s, who); if (old && old !== key) delete s.positions[old]; }
  if (who) s.positions[key] = who; else delete s.positions[key];
  meta(s, key).since = t;
  if (isSec(who)) { const r = s.secs[who]; r.salary = marketSalary(s, who); r.pay = r.pay || {}; }
  // 第一轮的派驻字段跟着走（以后删）
  if (indOf(key) && s.inds[indOf(key)]) s.inds[indOf(key)].sec = isSec(who) ? who : null;
  return { ok: true };
}

/** 秘书市场月薪：基本月薪 × (0.6 + 主属性 / 100 × 0.8) × 公司规模 */
export function marketSalary(s, id) {
  if (!s.title && P.starterSalary) return P.starterSalary; // 打工人阶段：店员工资
  const key = postOfSec(s, id); const kind = key ? kindOf(key) : null;
  const base = kind ? P.posts[kind].base : P.assistantBase;
  const k = P.salaryAttrBase + mainAttr(s, id, kind) / 100 * P.salaryAttrK;
  return Math.round(base * k * (P.scaleByTitle[s.title] ?? 1) / 10) * 10;
}
/** 她现在的月薪（谈好的；没谈过按市场价） */
export function salaryOf(s, id) { const r = s.secs[id]; if (!r) return 0; if (!r.salary) r.salary = marketSalary(s, id); return r.salary; }
export const secPayroll = (s) => Object.keys(s.secs).reduce((a, id) => a + salaryOf(s, id), 0);

const lines = (id) => POST_LINES[SEC_BY_ID[id].type] || POST_LINES.元气;
export const say = (id, k, what = '', x = '') => (lines(id)[k] || '').replace('{what}', what).replace('{x}', x).replace('{n}', SEC_BY_ID[id].name);

/** 属性涨了、市场价比工资高 10% 以上 → 她来谈加薪（请示）；一个月最多一次 */
export function checkRaises(s, t = nowOf(s)) {
  const out = [];
  for (const id of Object.keys(s.secs)) {
    const r = s.secs[id]; r.pay = r.pay || {};
    const m = marketSalary(s, id); const cur = salaryOf(s, id);
    if (m < cur * P.raise.askAbove) continue;
    if (r.pay.lastAsk && t - r.pay.lastAsk < MONTH_MS) continue;
    if ((s.inbox || []).some((x) => x.type === 'raise' && x.from === id && x.status === 'open')) continue;
    r.pay.lastAsk = t;
    addMsg(s, { kind: 'request', type: 'raise', from: id, title: `${SEC_BY_ID[id].name}想谈加薪：月薪 ${cur} → ${m}`, body: say(id, 'raise'), data: { to: m }, actions: [{ key: 'approve', label: '同意' }, { key: 'reject', label: '拒绝' }] }, t);
    out.push(id);
  }
  return out;
}
/** 处理加薪请示 */
export function answerRaise(s, id, yes, to, t = nowOf(s), addFavor) {
  const r = s.secs[id]; r.pay = r.pay || {};
  if (yes) { r.salary = to; addFavor && addFavor(s, id, P.raise.acceptFavor); }
  else { if ((r.love || 0) < 100) r.pay.sadUntil = t + MONTH_MS; addFavor && addFavor(s, id, P.raise.rejectFavor); }
  return say(id, yes ? 'yes' : 'no');
}
/** 你主动给她加薪 10%（一个游戏月一次） */
export function giveRaise(s, id, t = nowOf(s), addFavor) {
  const r = s.secs[id]; r.pay = r.pay || {};
  if (r.pay.lastGive && t - r.pay.lastGive < MONTH_MS) return { ok: false, why: '这个月已经给她加过了' };
  r.salary = Math.round(salaryOf(s, id) * (1 + P.raise.giveRate) / 10) * 10; r.pay.lastGive = t;
  addFavor && addFavor(s, id, P.raise.giveFavor);
  return { ok: true, salary: r.salary, line: say(id, 'yes') };
}

/** 本月为你赚 / 省（界面用）：s.postStats[key] = { gain, save, rent, ... } 每月清零 */
export function stat(s, key) { s.postStats = s.postStats || {}; return (s.postStats[key] = s.postStats[key] || { gain: 0, save: 0, rent: 0, filed: 0 }); }
