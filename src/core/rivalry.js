// 对手第二、三批的玩法（设计20 第三节）：瑞霖过桥融资、对手反击（挖人 / 抢地）、按城市抢地盘、商务总监加成
// 不 import economy / battle
import { RIVALS, RIVAL_BY_ID, COUNTER, TURF_HIT, RUILIN } from '../config/rivals.js?v=701a82d3';
import { pay, receive } from './ledger.js?v=701a82d3';
import { addMsg } from './inbox.js?v=701a82d3';
import { holder, isSec, power } from './posts.js?v=701a82d3';
import { MONTH_MS, monthIndex } from './gametime.js?v=701a82d3';
import { cityK, cityName } from './cities.js?v=701a82d3';
import { tickRivalGrow, turfCities, counterBonus } from './rivalgrow.js?v=701a82d3';
export { RUILIN };

const r2 = (x) => Math.round(x * 100) / 100;
const st = (s, id) => (s.rivals || {})[id] || { wins: 0, acquired: false };
/** 商务总监的本事（0～1）：社交 + 魅力 */
export const bizPower = (s) => (holder(s, 'biz') ? power(s, 'biz') : 0);
export const bizBattle = (s) => bizPower(s) * 0.06;   // 带去商战：胜率 +（最多约 +6%）
export const bizAcquire = (s) => bizPower(s) * 0.06;  // 谈收购：设计64 起 × 0.5 变成收购价优惠（最多 3%）

// ---------- 按城市抢地盘 ----------
/** 这家对手现在还在跟你抢：到了它的阶段、没被收购 */
const active = (s, r) => s.title >= r.stage && !st(s, r.id).acquired;
/** 某城市某条线有没有对手开店 */
export const turfRival = (s, ind, city) => RIVALS.find((r) => r.turf && r.turf.ind === ind && active(s, r) && turfCities(s, r).includes(city)) || null; // P-00：利润翻倍多抢城市
/** 收入用的城市系数：家数 × 城市系数 × （有对手 −5%）÷ 家数 */
export function revK(s, id, cities) {
  const x = s.inds[id]; if (!x || !x.branches) return 1;
  let a = 0; for (const [c, n] of Object.entries(cities)) a += n * cityK(c) * (turfRival(s, id, c) ? 1 - TURF_HIT : 1);
  return a / x.branches;
}

// ---------- 瑞霖过桥融资 ----------
/** 利率按谈的结果：胜率越高、商务总监越强，利率越低（5%～10%） */
export function bridgeRate(s, winRate) { const L = RUILIN.loan; return Math.max(L.rateMin, Math.min(L.rateMax, L.rateMax - (winRate - 0.4) * 0.08 - bizPower(s) * 0.02)); }
export function grantBridge(s, winRate, t) {
  if (s.bridge) return null; const L = RUILIN.loan; const rate = Math.round(bridgeRate(s, winRate) * 1000) / 1000;
  receive(s, { wallet: 'company', cat: 'loan_in', amount: L.amount, party: RUILIN.name, note: `瑞霖资本过桥融资（年利率 ${(rate * 100).toFixed(1)}%，${L.months} 个游戏月到期）` }, t);
  s.bridge = { principal: L.amount, rate, start: t, month: monthIndex(s, t), left: L.months };
  return s.bridge;
}
/** 负债（身价要减掉） */
export const debt = (s) => (s.bridge ? s.bridge.principal : 0);

// ---------- 每游戏月：付息还本、对手反击 ----------
export function tickRivalry(s, t, rnd = Math.random) {
  const ev = [...tickRivalGrow(s, t)]; const m = monthIndex(s, t); // P-00：对手按游戏月长
  if (s.rivalMonth == null) s.rivalMonth = m;
  while (s.rivalMonth < m) {
    s.rivalMonth += 1; const at = s.createdAt + s.rivalMonth * MONTH_MS;
    const B = s.bridge;
    if (B) {
      const it = r2(B.principal * B.rate / 12);
      pay(s, { wallet: 'company', cat: 'interest', amount: it, force: true, party: RUILIN.name, note: '过桥融资利息' }, at);
      s.period = s.period || {}; s.period.other = (s.period.other || 0) + it; // 利息所得税前扣
      B.left -= 1;
      if (B.left <= 0) { pay(s, { wallet: 'company', cat: 'loan_out', amount: B.principal, force: true, party: RUILIN.name, note: '过桥融资到期还本' }, at); ev.push('瑞霖过桥融资到期，本金还了'); s.bridge = null; }
    }
    for (const r of RIVALS) {
      if (r.noAcquire || r.stage < COUNTER.fromStage || !active(s, r) || st(s, r.id).wins < COUNTER.minWins) continue;
      if (rnd() >= COUNTER.monthlyP + counterBonus(s, r.id)) continue; // P-00：翻一倍 +10%
      const lines = Object.keys(s.inds).filter((id) => Object.values(s.inds[id].staff || {}).some((n) => n > 0));
      const land = (s.re && s.re.listings || []).find((l) => l.status === 'open' && l.leader === 'me');
      const kind = land && rnd() < 0.5 ? 'land' : 'poach';
      if (holder(s, 'biz') && rnd() < COUNTER.bizStopP + bizPower(s) * 0.3) {
        const who = holder(s, 'biz');
        addMsg(s, { kind: 'system', type: 'counter', from: isSec(who) ? who : '', title: `商务总监预警：${r.name}想${kind === 'land' ? '抢地' : '挖人'}`, body: '提前打了招呼、稳住了，这次没得手。' }, at); continue;
      }
      if (kind === 'land') { land.status = 'lost'; land.leader = 'npc'; land.npcName = r.name; addMsg(s, { kind: 'system', type: 'counter', title: `${r.name}抢走了一块地`, body: `${land.district} 那块地，${r.boss}在最后一轮举了个高价。` }, at); ev.push(`${r.name}抢走了一块地`); continue; }
      const tot = (id) => Object.values(s.inds[id].staff).reduce((x, y) => x + y, 0); const all = lines.reduce((a, id) => a + tot(id), 0);
      let pick = rnd() * all, id = lines[0]; for (const x of lines) { pick -= tot(x); if (pick < 0) { id = x; break; } } // 按各条线人数比例随机挑
      if (!id) continue; let gone = 0;
      for (const [role, n] of Object.entries(s.inds[id].staff)) { const x = n * COUNTER.poachRate; const k = Math.floor(x) + (rnd() < x - Math.floor(x) ? 1 : 0); const g = Math.min(n, k); s.inds[id].staff[role] -= g; gone += g; }
      addMsg(s, { kind: 'system', type: 'counter', title: `${r.name}挖走了 ${gone} 个人`, body: `${r.boss}开了高薪，从你的${({ store: '便利店', food: '餐饮', fashion: '服装', logistics: '物流', realestate: '地产', tech: '科技', media: '娱乐传媒' })[id] || id}挖人。缺编要补招；有商务总监能提前预警。` }, at);
      ev.push(`${r.name}挖走了 ${gone} 个人`);
    }
  }
  return ev;
}
export const turfText = (s, ind, city) => { const r = turfRival(s, ind, city); return r ? `${r.name}在${cityName(city)}开店，这里的同行收入 −5%` : ''; };
