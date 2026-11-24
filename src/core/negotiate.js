// 通用谈判（V2-06，设计29 第二节）：对方有看不见的底线 + 耐心条；你出价，对方回一句、还一个价；可以用一次筹码；耐心用完对方走人，冷却一阵
// 接口（开发1 接收购、融资、谈地也用这个）：
//   start(s, { key, kind: 'buy' | 'sell', base, range: [lo, hi], persona, step, chips: { intel, secId, boss } }, t, rnd) → { ok, sess } / { ok: false, why }
//   offer(s, sess, price, t, rnd) → { deal } / { counter, line } / { walked, line }；accept(s, sess, t) → { deal }；useChip(s, sess, 'intel' | 'social' | 'boss')
//   negotiate(s, opts, strategy) → 成交价或 null（谈崩）：econsim / 挂机用，自动出价到底线附近
// kind = buy：你要买（价越低越好），底线 = 对方最低肯卖的价；sell：你要卖（价越高越好），底线 = 对方最高肯出的价
// base = 对方开价；range = 底线落在 base × [lo, hi] 之间（性格 pos 决定偏哪头）
import C from '../config/negotiate.json?v=e379aa95' with { type: 'json' };
import { attrs } from './posts.js?v=e379aa95';
import { isTraining } from './training.js?v=e379aa95';

export { C as NEGO_CFG };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pick = (a, rnd) => a[Math.floor(rnd() * a.length) % a.length];

/** 存档 s.nego：{ cd: { 事情 key: 到什么时候才能再谈 }, n, deals, walks } */
export function ng(s) { const d = (s.nego = s.nego || { cd: {}, n: 0, deals: 0, walks: 0 }); d.cd = d.cd || {}; return d; }
export const coolLeft = (s, key, t) => Math.max(0, (ng(s).cd[key] || 0) - t);
const roundTo = (v, step) => (step ? Math.round(v / step) * step : Math.round(v * 100) / 100);

/** 开始谈：底线（看不见）、耐心 */
export function start(s, o, t, rnd = Math.random) {
  const left = coolLeft(s, o.key, t); if (left > 0) return { ok: false, why: `刚谈崩，${Math.ceil(left / 60e3)} 分钟后才能再约` };
  const P = C.personas[o.persona] || C.personas['精明']; const [lo, hi] = o.range; const dir = o.kind === 'sell' ? -1 : 1;
  const pos = P.pos[0] + (P.pos[1] - P.pos[0]) * rnd();   // 0 = 对你最有利的一头
  // buy：底线在 base×lo（对你好）～ base×hi；sell：底线在 base×hi（对你好）～ base×lo
  const fLo = o.base * lo, fHi = o.base * hi; const floor = roundTo(dir > 0 ? fLo + (fHi - fLo) * pos : fHi - (fHi - fLo) * pos, o.step);
  const patience = P.patience[0] + Math.floor(rnd() * (P.patience[1] - P.patience[0] + 1));
  const sess = { key: o.key, kind: o.kind || 'buy', dir, base: o.base, ask: roundTo(o.base, o.step), floor, lo: fLo, hi: fHi, step: o.step || 0, persona: o.persona, patience, left: patience, chips: o.chips || {}, chipUsed: null, peek: null, log: [], done: false, deal: null, walked: false };
  ng(s).n += 1;
  return { ok: true, sess };
}
/** 你的价对你来说够不够好（buy：越低越好） */
const better = (sess, a, b) => (sess.dir > 0 ? a <= b : a >= b);
/** 现在能用哪几个筹码：{ intel, social, boss }（true / 原因） */
export function chipsOf(s, sess) {
  const c = sess.chips || {};
  const sec = c.secId && s.secs[c.secId] && !isTraining(s, c.secId) ? c.secId : null; const soc = sec ? attrs(s, sec).social || 0 : 0;
  return {
    intel: c.intel ? true : '没有对方的情报',
    social: sec ? (soc >= C.chips.socialMin ? true : `她交际 ${soc}，要 ≥ ${C.chips.socialMin}`) : '没带秘书',
    boss: c.boss ? true : '老板精力没留给这件事',
  };
}
/** 用一个筹码（每次谈判只能用一个） */
export function useChip(s, sess, which) {
  if (sess.done) return { ok: false, why: '已经谈完了' };
  if (sess.chipUsed) return { ok: false, why: '这次谈判已经用过筹码了' };
  const ok = chipsOf(s, sess)[which]; if (ok !== true) return { ok: false, why: ok || '用不了' };
  sess.chipUsed = which;
  if (which === 'intel') { const w = (sess.hi - sess.lo) * C.chips.intel; sess.floor = roundTo(sess.dir > 0 ? Math.max(sess.lo, sess.floor - w) : Math.min(sess.hi, sess.floor + w), sess.step); return { ok: true, text: '对方最近缺钱，底线松了' }; }
  if (which === 'social') { sess.left += 1; sess.patience += 1; return { ok: true, text: '她陪着谈，对方多给了一次机会' }; }
  const k = clamp(Math.floor((sess.floor - sess.lo) / (sess.hi - sess.lo) * 3), 0, 2); sess.peek = [sess.lo + (sess.hi - sess.lo) * k / 3, sess.lo + (sess.hi - sess.lo) * (k + 1) / 3].map((v) => roundTo(v, sess.step));
  return { ok: true, text: `你亲自看了对方的账：底线大概在 ${['低', '中', '高'][k]}三分之一`, third: k };
}
/** 出价 */
export function offer(s, sess, price, t, rnd = Math.random) {
  if (sess.done) return { done: true };
  price = roundTo(price, sess.step);
  const L = C.lines[sess.persona] || C.lines['精明'];
  if (!better(sess, price, sess.ask) || price === sess.ask) return finish(s, sess, sess.ask, rnd, L);   // 出的比对方要的还好（对对方）：按对方的价成交
  if (!better(sess, price, sess.floor) || price === sess.floor) return finish(s, sess, price, rnd, L);   // 过了底线：成交
  sess.left -= 1;
  // 离底线多近：0 = 离得远，1 = 贴着底线
  const span = Math.abs(sess.ask - sess.floor) || 1; const near = clamp(1 - Math.abs(sess.floor - price) / Math.max(span, Math.abs(sess.base - sess.floor)), 0, 1);
  const tier = near >= C.near[1] ? 'near' : near >= C.near[0] ? 'mid' : 'far';
  if (sess.left <= 0) {
    sess.done = true; sess.walked = true; const d = ng(s); d.walks += 1; d.cd[sess.key] = t + (sess.coolMin || C.cooldownMin) * 60e3;
    const line = pick(L.walk, rnd); sess.log.push({ you: price, line }); return { walked: true, line };
  }
  const P = C.personas[sess.persona] || C.personas['精明'];
  let ask = sess.ask - (sess.ask - sess.floor) * P.concede * (0.6 + 0.4 * near); ask = roundTo(ask, sess.step);
  if (!better(sess, sess.floor, ask)) ask = sess.floor; if (ask === sess.ask && sess.ask !== sess.floor) ask = roundTo(sess.ask - sess.dir * (sess.step || 0.01), sess.step);
  sess.ask = ask; const line = pick(L[tier], rnd); sess.log.push({ you: price, line, ask, tier });
  return { counter: ask, line, tier, left: sess.left };
}
/** 接受对方现在的价 */
export function accept(s, sess) { if (sess.done) return { done: true }; return finish(s, sess, sess.ask, Math.random, C.lines[sess.persona] || C.lines['精明']); }
function finish(s, sess, price, rnd, L) {
  sess.done = true; sess.deal = price; ng(s).deals += 1; const line = pick(L.deal, rnd); sess.log.push({ you: price, line, deal: price });
  return { deal: price, line };
}
/** 自动谈（econsim / 挂机）：strategy 'smart' 从底线附近往上试（A），'plain' 直接接受第一次还价（B / C）。返回成交价或 null（谈崩） */
export function negotiate(s, o, t, { strategy = 'smart', rnd = Math.random } = {}) {
  const r = start(s, o, t, rnd); if (!r.ok) return null; const S = r.sess;
  if (strategy === 'plain') { offer(s, S, S.dir > 0 ? S.base * o.range[0] : S.base * o.range[1], t, rnd); return S.done ? S.deal : accept(s, S).deal; }
  let lo = S.dir > 0 ? S.lo : S.hi;   // 对你最好的价
  while (!S.done) {
    if (S.left <= 1) { accept(s, S); break; }
    const tryP = lo + (S.ask - lo) * 0.45; const res = offer(s, S, tryP, t, rnd);
    if (res.counter != null) lo = tryP;
  }
  return S.walked ? null : S.deal;
}

// ---------- 接进来的两件（开发2）：房东涨租、拍卖私洽 ----------
/** 房东涨租的谈判参数：对方开价涨 10%，底线 3%～8%；谈成涨 p% → 毛利 −p × 0.1 个点、90 天 */
export const rentOpts = (msgId, secId, boss) => ({ key: 'rent_' + msgId, kind: 'buy', base: C.rent.base, range: C.rent.range, step: C.rent.step, persona: C.rent.persona, chips: { secId, boss } });
export const rentFx = (pct) => [{ margin: +(pct * C.rent.marginPer).toFixed(5), days: C.rent.days }];
