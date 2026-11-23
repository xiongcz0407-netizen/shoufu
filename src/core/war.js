// V2-05 商战三回合（设计29 第一节）：开战前看对手卡片；三回合每回合双方各出一张打法同时亮牌；克制的赢，同打法 / 不相克比带去的秘书对应属性
// 三回合赢两回合算赢（提前分出胜负就结束）；每赢一回合你这条线当月营收 +2%、对手利润 −3%；结果落地走 battle.settleBattle
import { WAR, RIVAL_BY_ID } from '../config/rivals.js?v=0553afd8';
import * as B from './battle.js?v=0553afd8';
import { live, monthGrowth } from './rivalgrow.js?v=0553afd8';
import { ensureSec } from './secretary.js?v=0553afd8';
import { netWorth } from './economy.js?v=0553afd8';
import * as E from './economy.js?v=0553afd8';
import { auraBattle, visionBattle } from './boss.js?v=0553afd8';
import { bizBattle } from './rivalry.js?v=0553afd8';
import { bigBonus } from './manage.js?v=0553afd8';
import { pay, canPay } from './ledger.js?v=0553afd8';
import { wage } from './staff.js?v=0553afd8';
import { DAY_MS, dayIndex } from './manage.js?v=0553afd8';

const P = WAR.plays; export const PLAY_IDS = Object.keys(P); export { WAR };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r2 = (x) => Math.round(x * 100) / 100;
/** 这张牌花多少（按对手规模） */
export function costOf(s, rivalId, card) {
  const c = P[card].cost; const r = live(s, rivalId); const mp = (r.profit || 0) / 12;
  if (c.wage) return wage(c.wage) * (c.months || 12);
  return Math.round(c.profit ? mp * c.profit : (mp / WAR.revMargin) * c.rev);
}
/** 对手爱出的牌（按权重从高到低） */
export const favorites = (rivalId) => Object.entries(RIVAL_BY_ID[rivalId].style || {}).sort((a, b) => b[1] - a[1]).map(([k]) => k);
function draw(r, rnd) { const w = r.style || { price: 1 }; const tot = Object.values(w).reduce((a, x) => a + x, 0); let x = rnd() * tot; for (const [k, v] of Object.entries(w)) { if (x < v) return k; x -= v; } return Object.keys(w)[0]; }
/** 专长牌：秘书最高那项属性对应的打法 */
export function specOf(s, id) { const a = ensureSec(s, id).attrs; const k = ['manage', 'charm', 'social', 'wit'].sort((x, y) => (a[y] || 0) - (a[x] || 0))[0]; return WAR.specOf[k]; }
const teamAttr = (s, team, key) => (team.length ? team.reduce((a, id) => a + (ensureSec(s, id).attrs[key] || 0), 0) / team.length : 0);
/** 对手卡片：规模、这个月涨了多少、爱用的打法、情报（够的时候看到它这一战最可能出的两张） */
export function rivalCard(s, rivalId) {
  const r = live(s, rivalId); const st = B.rivalState(s, rivalId);
  return { name: r.name, value: r.value || 0, profit: r.profit || 0, growth: monthGrowth(s, rivalId), favorites: favorites(rivalId).slice(0, 2), intel: st.intel || 0, intelEnough: (st.intel || 0) >= WAR.intelShow };
}
/** 开战：扣一次商战次数，对手先定好三张牌 */
export function start(s, rivalId, team, t, rnd = Math.random) {
  const why = B.whyNotBattle(s, rivalId, team, t); if (why) return { ok: false, why };
  if (s.war && s.war.open) return { ok: false, why: '还有一场没打完' };
  B.payBattle(s, t); /* 设计39：有券用券，没券 5 精力 */
  const r = RIVAL_BY_ID[rivalId]; const plan = Array.from({ length: WAR.rounds }, () => draw(r, rnd));
  const st = B.rivalState(s, rivalId); const enough = (st.intel || 0) >= WAR.intelShow;
  const cnt = {}; for (const c of plan) cnt[c] = (cnt[c] || 0) + 1;
  const likely = enough ? [...new Set([...Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]), ...favorites(rivalId)])].slice(0, 2) : null;
  const peek = bigBonus(s, 'battle') ? plan[0] : null; // 亲自带队：偷看对手第一张牌
  s.war = { open: true, rivalId, team: [...team], plan, likely, peek, round: 0, me: 0, op: 0, log: [], usedSpec: [], hurtMe: 0, hurtOp: 0, paid: 0, t0: t };
  return { ok: true, war: s.war };
}
/** 这回合能不能出这张牌 */
export function whyNotPlay(s, card, spec, t) {
  const w = s.war; if (!w || !w.open) return '没有在打的商战'; if (!P[card]) return '没有这张牌';
  const c = costOf(s, w.rivalId, card); if (!canPay(s, 'company', c)) return `公司账户不够（要 ${c}）`;
  if (spec) { const who = w.team.find((id) => specOf(s, id) === card && !w.usedSpec.includes(id)); if (!who) return '没有能用在这张牌上的专长'; }
  return null;
}
/** 一回合不相克时赢的把握：跟原来的胜率一样的算法，属性按这张牌看 */
export function roundRate(s, card, spec) {
  const w = s.war; const r = live(s, w.rivalId); const nw = Math.max(1, netWorth(s));
  const money = 0.3 * Math.tanh(Math.log10(nw / r.power) * 1.5);
  const mine = teamAttr(s, w.team, P[card].attr) * (spec ? WAR.special : 1) * (1 - w.hurtMe); const theirs = (r.skill || 0) * (1 - w.hurtOp);
  return clamp(0.45 + money + (mine - theirs) / 100 + (w.team.length >= 2 ? 0.05 : 0) + auraBattle(s) + B.intelBonus(s, w.rivalId) + bizBattle(s) + visionBattle(s), 0.05, 0.95);
}
/** 出一张牌：同时亮牌，判这一回合；分出胜负就结算 */
export function play(s, card, spec, t, rnd = Math.random) {
  const why = whyNotPlay(s, card, spec, t); if (why) return { ok: false, why };
  const w = s.war; const op = w.plan[w.round]; const c = costOf(s, w.rivalId, card);
  if (c > 0) { pay(s, { wallet: 'company', cat: 'opex', amount: c, party: RIVAL_BY_ID[w.rivalId].name, note: `商战：${P[card].name}` }, t); w.paid += c; }
  if (spec) w.usedSpec.push(w.team.find((id) => specOf(s, id) === card && !w.usedSpec.includes(id)));
  let win, how, rate = null;
  if (P[card].beats.includes(op)) { win = true; how = 'beat'; }
  else if (P[op].beats.includes(card)) { win = false; how = 'beaten'; }
  else { rate = roundRate(s, card, spec); win = rnd() < rate; how = card === op ? 'same' : 'attr'; }
  // 挖人：没被公关克住，对方下回合效果 −30%
  const nextMe = op === 'poach' && card !== 'pr' ? P.poach.hurt : 0, nextOp = card === 'poach' && op !== 'pr' ? P.poach.hurt : 0;
  w.hurtMe = nextMe; w.hurtOp = nextOp;
  if (win) w.me++; else w.op++;
  const rec = { round: w.round + 1, me: card, op, win, how, rate, spec: !!spec, cost: c }; w.log.push(rec); w.round++;
  let res = null;
  if (w.me >= WAR.need || w.op >= WAR.need || w.round >= WAR.rounds) res = finish(s, t);
  return { ok: true, ...rec, done: !!res, result: res };
}
function finish(s, t) {
  const w = s.war; w.open = false; const win = w.me >= WAR.need;
  const r = B.settleBattle(s, w.rivalId, w.team, win, t, { rounds: w.me, project: 'war', cards: w.log.map((x) => [x.me, x.op, x.win]) });
  s.war = { ...w, result: r }; return r;
}
/** 放弃（关了面板）：没打的回合都算输 */
export function abandon(s, t) { const w = s.war; if (!w || !w.open) return null; w.op = WAR.need; return finish(s, t); }
// 抢份额：每赢一回合，你这条线（对手抢的那条）这个月营收 +2%（一个游戏月 30 天）；估值不算
B.onShare((s, rivalId, rounds, t) => {
  const r = RIVAL_BY_ID[rivalId]; if (!rounds || !r.line || !s.inds[r.line]) return;
  prune(s, t); (s.warFx = s.warFx || []).push({ line: r.line, k: WAR.share.rev * rounds, until: s.createdAt + (dayIndex(s, t) + WAR.share.days) * DAY_MS });
});
export const shareK = (s, id) => { const now = (s.mg && s.mg.t) || 0; let k = 1; for (const f of s.warFx || []) if (f.line === id && f.until > now) k *= 1 + f.k; return k; };
E.setWarHook((s, id) => (s.warFx && s.warFx.length ? shareK(s, id) : 1));
/** 清掉过期的（月结时顺手） */
export const prune = (s, t) => { if (s.warFx) s.warFx = s.warFx.filter((f) => f.until > t); };
/** 默认出牌（交给秘书 / 挂机）：带去的人最强那项；A 打法：情报够就挑克它的 */
export function pickCard(s, smart = false) {
  const w = s.war; const best = PLAY_IDS.filter((k) => k !== 'poach').sort((a, b) => teamAttr(s, w.team, P[b].attr) - teamAttr(s, w.team, P[a].attr))[0];
  const known = w.round === 0 && w.peek ? [w.peek] : smart && w.likely ? w.likely : null;
  if (known) { const ctr = PLAY_IDS.find((k) => P[k].beats.includes(known[0])); if (ctr && !whyNotPlay(s, ctr, false, 0)) return ctr; }
  return whyNotPlay(s, best, false, 0) ? PLAY_IDS.filter((k) => !whyNotPlay(s, k, false, 0)).sort((a, b) => costOf(s, w.rivalId, a) - costOf(s, w.rivalId, b))[0] || null : best;
}
