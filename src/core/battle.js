// 商战和收购：胜率、开战、赢满 3 次收购、收购效果、升称号
import { capAdd } from './cap.js?v=9a2bf56f';   // 设计79：有上限的列表（config/caps.js）
import { whyCushion } from './cashflow.js?v=9a2bf56f'; // V0.2.3 留够两个月工资
import { credit } from './credit.js?v=9a2bf56f'; // V3-01 亲自拍板攒投入度
import { MONTH_MS, gameDate, dateText } from './gametime.js?v=9a2bf56f';
import { downRate, downOf, schedule, openDeal } from './equity.js?v=9a2bf56f';
import { gm } from './calib.js?v=9a2bf56f';
import { whyNotMa, maLoan } from './bank.js?v=9a2bf56f';
import { needsBoard } from './capital.js?v=9a2bf56f';   // 设计64：董事会一律通过，只在协议上留一行
import { live, onBattle } from './rivalgrow.js?v=9a2bf56f'; // P-00 对手也在长大
import { bigBonus, useBig, whyEnergy, doEnergy, energy, E_COST } from './manage.js?v=9a2bf56f'; // P-05 老板亲自带队 / 亲自谈判
import { ACQ_NEGO, RIVAL_BY_ID, RIVALS, PROJECTS, WINS_TO_ACQUIRE, TEAM_MAX, ACQ_DISC, INTEL_PER_LOSS, INTEL_MAX } from '../config/rivals.js?v=9a2bf56f';
import { TITLES } from '../config/titles.js?v=9a2bf56f';
import { fmtMoney } from './format.js?v=9a2bf56f';
import { addMsg } from './inbox.js?v=9a2bf56f';   // 设计64 待签协议
import { netWorth, unlockIfReady, earningsValue } from './economy.js?v=9a2bf56f';
import { ensureSec } from './secretary.js?v=9a2bf56f';
import { addFavor, daily } from './affection.js?v=9a2bf56f';
import { isTraining } from './training.js?v=9a2bf56f';
import { isScouting } from './busy.js?v=9a2bf56f'; // V2-08 踩点占用（开发2）
import { auraBattle, networkAcquire, visionBattle } from './boss.js?v=9a2bf56f';
import { bump } from './daily.js?v=9a2bf56f';
import { pay, receive, accrue, canPay } from './ledger.js?v=9a2bf56f';
import { TAX } from './companytax.js?v=9a2bf56f';
import { addContract } from './contracts.js?v=9a2bf56f';
import { IND_BY_ID } from '../config/industries.js?v=9a2bf56f';
import { establishment, staffUp } from './staff.js?v=9a2bf56f';
import { bizBattle, bizAcquire, grantBridge } from './rivalry.js?v=9a2bf56f';
import { logi, LOGI_CFG } from './logistics.js?v=9a2bf56f';
import { addAcquiredProject } from './realestate.js?v=9a2bf56f';
import { tech, TECH_CFG } from './tech.js?v=9a2bf56f';
import { lookOf } from './staff.js?v=9a2bf56f';
import { reValue } from './realestate.js?v=9a2bf56f';
import { fleetValue } from './logistics.js?v=9a2bf56f';

const PROJ = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function rv(s, id) {
  s.rivals = s.rivals || {};
  return (s.rivals[id] = s.rivals[id] || { wins: 0, losses: 0, acquired: false, cooldownUntil: 0 });
}
export const rivalState = rv;
/** 设计39 第一、五节：商战没有单独的次数了——有商战券（开发2 的道具，存在 s.items.battle）先用券，不花精力；没券花 5 精力 */
export const tickets = (s) => (s.items && s.items.battle) || 0;
export const addTickets = (s, n) => { s.items = s.items || {}; s.items.battle = Math.max(0, (s.items.battle || 0) + n); };
export const battleCostText = (s) => (tickets(s) > 0 ? `用商战券（还有 ${tickets(s)} 张）` : `${E_COST.battle} 精力`);
export const whyNoBattlePay = (s, t) => (tickets(s) > 0 ? null : whyEnergy(s, E_COST.battle, t));
/** 扣一次：'ticket' / 'energy'；都没有 null */
export function payBattle(s, t) { if (tickets(s) > 0) { s.items.battle -= 1; return 'ticket'; } return doEnergy(s, E_COST.battle, t) ? 'energy' : null; }
/** 还能打几次（券 + 精力够几次），给 autoplay / 界面看 */
export const battlesLeft = (s, t) => tickets(s) + Math.floor(energy(s, t) / E_COST.battle + 1e-9);
/** 现在能打的对手：当前阶段、没收购过的 */
export const activeRivals = (s) => RIVALS.filter((r) => r.stage === s.title || (r.stage < s.title && !rv(s, r.id).acquired));

function teamAttr(s, team, key) {
  if (!team.length) return 0;
  return team.reduce((a, id) => a + ensureSec(s, id).attrs[key], 0) / team.length;
}
/** 胜率：身价跟对手实力比 + 带去的人那项属性跟对手比；第二个人多加一点 */
export function winRate(s, rivalId, projectId, team) {
  const r = live(s, rivalId); const p = PROJ[projectId];
  const nw = Math.max(1, netWorth(s));
  const money = 0.3 * Math.tanh(Math.log10(nw / r.power) * 1.5);
  const attr = (teamAttr(s, team, p.attr) - r.skill) / 100;
  const extra = team.length >= 2 ? 0.05 : 0;
  return clamp(0.45 + money + attr + extra + auraBattle(s) + intelBonus(s, rivalId) + bizBattle(s) + visionBattle(s) + bigBonus(s, 'battle'), 0.05, 0.95); // 老板眼光看穿底牌（第 2-13 项） // 老板气场压对方一头；商务总监
}
/** 知己知彼：输过几次就多几分把握 */
export function intelBonus(s, rivalId) {
  return Math.min(INTEL_MAX, (rv(s, rivalId).intel || 0) * INTEL_PER_LOSS);
}
export function whyNotBattle(s, rivalId, team, t) {
  const r = RIVAL_BY_ID[rivalId];
  if (!r || rv(s, rivalId).acquired) return '已经收购了';
  { const w = whyNoBattlePay(s, t); if (w) return w; }
  if (!team.length) return '至少带一个人';
  if (team.length > TEAM_MAX) return `最多带 ${TEAM_MAX} 个人`;
  if (team.some((id) => !s.secs[id])) return '没有这个秘书';
  if (team.some((id) => isTraining(s, id))) return '上课的人不能带';
  if (team.some((id) => isScouting(s, id, t))) return '踩点的人不能带'; // V2-08
  return null;
}
/** 交给秘书打（一次出结果，按原来的胜率；设计29 前的打法，挂机 / 快速用）。rnd 给测试用。返回 { ok, win, rate, reward, canAcquire, rounds } */
export function fight(s, rivalId, projectId, team, t, rnd = Math.random) {
  const why = whyNotBattle(s, rivalId, team, t);
  if (why) return { ok: false, why };
  payBattle(s, t);
  const rate = winRate(s, rivalId, projectId, team);
  const win = rnd() < rate;
  const rounds = win ? 2 : (rnd() < rate ? 1 : 0); // 交给秘书打：赢了按赢 2 回合、输了 0～1 回合算份额
  return settleBattle(s, rivalId, team, win, t, { rate, project: projectId, rounds, auto: true }); // 交给秘书打：对手利润照原来（赢 −8%、输 +3%）
}
/** 商战结果落地（交给秘书打、三回合都走这里）：攒胜场 / 情报、奖金、好感、对手利润、抢份额、记录 */
export function settleBattle(s, rivalId, team, win, t, o = {}) {
  const r = RIVAL_BY_ID[rivalId]; const st = rv(s, rivalId); const rate = o.rate == null ? null : o.rate;
  let reward = 0;
  if (win) {
    st.wins += 1; st.intel = 0; reward = r.reward; if (reward) receive(s, { wallet: 'company', cat: 'battle_bonus', amount: reward, party: r.name }, t);
    for (const id of team) addFavor(s, id, 5);
    s.stats.battleWins = (s.stats.battleWins || 0) + 1;
    if (r.loan && !s.flags.beatSuBank) { s.flags.beatSuBank = true; grantBridge(s, rate == null ? 0.7 : rate, t); } // 瑞霖：第一次谈赢 → 过桥融资 + 苏曼琳
  } else { st.losses += 1; st.intel = (st.intel || 0) + 1; }
  useBig(s, 'battle'); onBattle(s, rivalId, win, t, o.auto ? null : o.rounds || 0); // P-05 亲自带队用掉；V2-05：每赢一回合对手利润 −3%，输了 +3%
  for (const f of SHARE_HOOKS) f(s, rivalId, o.rounds || 0, t); // V2-05 抢份额（core/war.js）
  capAdd(s, 'battleLog', (s.battleLog = s.battleLog || []), { t, rival: rivalId, project: o.project || 'war', team: [...team], win, rate, reward, intel: !win, rounds: o.rounds || 0, cards: o.cards || null });
  s.stats.battles = (s.stats.battles || 0) + 1; bump(s, t, 'battle');
  return { ok: true, win, rate, reward, intel: win ? 0 : intelBonus(s, rivalId), canAcquire: st.wins >= WINS_TO_ACQUIRE && !st.acquired, rounds: o.rounds || 0 };
}
const SHARE_HOOKS = []; export const onShare = (fn) => SHARE_HOOKS.push(fn);

/** 满 3 胜以后多赢的次数（设计64：每次收购价 −2%，最多 3 次） */
export const extraWins = (s, rivalId) => Math.max(0, rv(s, rivalId).wins - WINS_TO_ACQUIRE);
/** 设计64：收购价优惠（原来加成功率的那些）。返回 { k 合计（≤ ACQ_DISC.max）, parts: [{ name, k }], capped } */
export function acqDiscount(s, rivalId) {
  const D = ACQ_DISC; const parts = []; const ew = extraWins(s, rivalId);
  const add = (name, k) => { k = Math.round(k * 1e4) / 1e4; if (k > 0) parts.push({ name, k }); };
  add(`多赢 ${Math.min(ew, D.extraMax / D.extraWin)} 次`, Math.min(ew * D.extraWin, D.extraMax));
  add('老板人脉', Math.min(networkAcquire(s) * D.network, D.networkMax));
  add('商务总监', Math.min(bizAcquire(s) * D.biz, D.bizMax));
  add('董事会并购', acqHook(s) * D.board);
  add('亲自谈判', bigBonus(s, 'deal'));
  const sum = parts.reduce((a, x) => a + x.k, 0);
  return { k: Math.min(sum, D.max), parts, capped: sum > D.max + 1e-9 };
}
/** 第 3-05 项：换股收购的挂钩 { why(s, r, plan, amount), issue(s, r, amount, t), row(s, r, amount) }（core/takeover.js 设） */
/** V2-13 董事会「并购」：这一周的加成（开发2，core/meeting.js 挂进来）；设计64 起 × 0.5 变成收购价优惠 */
let acqHook = () => 0; export const setAcquireHook = (fn) => { acqHook = fn; };
let SWAP = null; export const setSwapHook = (x) => { SWAP = x; };
/** 设计38 第四节：收购每档最终对手，身价要先到那一档门槛的 80% */
export const FINAL_NW_K = 0.8;
export function whyNotAcquire(s, rivalId, team, t, plan = 'full', loan = null, swap = 0) {
  const r = liveDeal(s, rivalId, t); const st = rv(s, rivalId);
  if (r.noAcquire) return '投行不能收购';
  if (st.acquired) return '已经收购了';
  { const ti = TITLES.findIndex((x) => x.rival === rivalId); if (ti > 0 && netWorth(s) < FINAL_NW_K * TITLES[ti].need) return `身价到 ${fmtMoney(FINAL_NW_K * TITLES[ti].need)} 才能谈`; } /* 设计38 第四节：最终对手要身价先到这一档门槛的 80% */
  if (st.wins < WINS_TO_ACQUIRE) return `商战赢满 ${WINS_TO_ACQUIRE} 次才能收购`;
  if (team.some((id) => isTraining(s, id))) return '上课的人不能带';
  if (team.some((id) => isScouting(s, id, t))) return '踩点的人不能带'; // V2-10：收购也挡踩点的（开发2）
  if (loan && loan.amount > 0) { const w = whyNotMa(s, loan.bank, r.value, payNow(s, r, plan), loan.amount); if (w) return w; }
  if (swap > 0) { const w = SWAP ? SWAP.why(s, r, plan, swap) : '还不能换股'; if (w) return w; if (((loan && loan.amount) || 0) + swap > payNow(s, r, plan) - 1e-6) return '贷款 + 换股超过了收购价，少贷一点'; }
  if (!canPay(s, 'company', payNow(s, r, plan) - ((loan && loan.amount) || 0) - (swap || 0))) return plan === 'install' ? `公司账户不够首付（${Math.round(downRate(s) * 100)}%）` : '公司账户不够';
  { const w = whyCushion(s, payNow(s, r, plan) - ((loan && loan.amount) || 0) - (swap || 0)); if (w) return w; } /* V0.2.3 */
  return null;
}
/** 现在要付多少：一次付清 = 估值；分期 = 首付 */
// ---------- V2-07 收购谈价（接开发2 的 core/negotiate.js）：先谈价，谈成的价 60 分钟内收购按这个价付 ----------
const stepOf = (v) => Math.pow(10, Math.max(2, Math.floor(Math.log10(Math.max(1, v))) - 2));
export function acqNegoOpts(s, rivalId, team, t) {
  const r = live(s, rivalId); const st = rv(s, rivalId);
  return { key: 'acq_' + rivalId, kind: 'buy', base: Math.round(r.value * ACQ_NEGO.ask), range: ACQ_NEGO.range, step: stepOf(r.value), persona: (RIVAL_BY_ID[rivalId] || {}).nego || '精明',
    chips: { intel: extraWins(s, rivalId) > 0 || (st.intel || 0) > 0, secId: (team && team[0]) || null, boss: bigBonus(s, 'deal') > 0 } };
}
export function setAcqPrice(s, rivalId, price, t) { void t; rv(s, rivalId).deal = { price: Math.round(price), value0: live(s, rivalId).value }; } /* V0.2.3（设计35 第十节）：谈好的价一直有效，对手估值变动超过 20% 才要重谈 */
export const dealStale = (s, rivalId) => { const d = rv(s, rivalId).deal; return !!(d && d.value0 && Math.abs(live(s, rivalId).value / d.value0 - 1) > 0.2); };
export const dealPrice = (s, rivalId, t) => { const d = rv(s, rivalId).deal; if (!d) return null; if (d.value0) return dealStale(s, rivalId) ? null : d.price; return d.until > t ? d.price : null; };
/** 收购这次按多少付：谈下来的价（比估值贵就按估值）再打设计64 的优惠。value = 实付价；value0 估值、base 打折前、dealP 谈下来的价、disc 优惠 */
export function liveDeal(s, rivalId, t) {
  const r = live(s, rivalId); const p = dealPrice(s, rivalId, t); const base = p && p < r.value ? p : r.value;
  const disc = acqDiscount(s, rivalId);
  return { ...r, value: Math.round(base * (1 - disc.k)), value0: r.value, base, dealP: p, disc };
}
export const payNow = (s, r, plan) => (plan === 'install' ? downOf(s, r.value) : r.value);
/** 收购。plan：'full' 一次付清 / 'install' 分期（首付付完就算成功）。设计64：签了字就成（没有成功率、退款、冷却、董事会否决） */
export function acquire(s, rivalId, team, t, rnd = Math.random, plan = 'full', loan = null, swap = 0) {
  const why = whyNotAcquire(s, rivalId, team, t, plan, loan, swap);
  if (why) return { ok: false, why };
  const r = liveDeal(s, rivalId, t); const rTrue = live(s, rivalId); /* V2-07：谈下来的价按成交价付，身价里按真实估值 */ const st = rv(s, rivalId);
  void rnd; const board = needsBoard(s, r.value);   // 设计64：要过董事会的一律通过，协议上留一行
  const now0 = payNow(s, r, plan); const la = (loan && loan.amount) || 0; const sw = swap > 0 ? swap : 0; const own = now0 - la - sw; // 换股那部分谈成了才发新股 // 并购贷款那部分谈成了才放款
  pay(s, { wallet: 'company', cat: 'acquire', amount: own, party: r.name, note: plan === 'install' ? `收购${r.name}首付（${Math.round(downRate(s) * 100)}%）${la ? '自有部分' : ''}` : `收购${r.name}${la ? '（自有部分）' : ''}` }, t);
  let maL = null;
  if (la > 0) { maL = maLoan(s, loan.bank, r.name, la, t); pay(s, { wallet: 'company', cat: 'acquire', amount: la, party: r.name, ref: maL.contract, note: `收购${r.name}（并购贷款受托支付）` }, t); }
  if (r.dealP) credit(s, 'nego', 1, t); /* V3-01：谈下来的价真用上了才算拍板 */ st.acquired = true; st.deal = null; st.sign = null;
  s.flags.acquired = s.flags.acquired || {}; s.flags.acquired[rivalId] = true;
  const e = r.effect || {}; const iv0 = earningsValue(s);
  if (e.boost) { s.flags.indBoost = s.flags.indBoost || {}; for (const [k, v] of Object.entries(e.boost)) s.flags.indBoost[k] = (s.flags.indBoost[k] || 0) + v; }
  const v0 = reValue(s) + fleetValue(s); // 并进来的项目、车队另算进身价，估值里扣掉，免得算两遍
  if (e.fleetUnits && s.inds.logistics) { const truck = LOGI_CFG.fleet.kinds.truck; const n = Math.ceil(e.fleetUnits / truck.units); logi(s).lots.push({ kind: 'truck', n, cost: Math.round(n * truck.price / LOGI_CFG.fleet.vatDiv * 0.7), t, dep: 0 }); } // 车队按七成账面价值并进来
  for (const sp of e.reProjects || []) if (s.inds.realestate) addAcquiredProject(s, sp, r.name, t);
  if (e.techProduct && s.inds.tech) { const X = tech(s); X.seq += 1; X.products.push({ id: X.seq, dir: e.techProduct.dir, name: `${TECH_CFG.directions[e.techProduct.dir].name}（原${r.name}）`, scale: TECH_CFG.marketByLook[lookOf(s, 'tech')], stage: 'live', start: t, at: t, launch: t - gm(TECH_CFG.directions[e.techProduct.dir].rampMonths) * MONTH_MS, /* 收购来的产品已经爬到顶 */ cost: 0, q: e.techProduct.q, users: 0, revTotal: 0 }); }
  for (const [ind, n] of Object.entries(e.levelUp || {})) if (s.inds[ind]) { s.inds[ind].level += n; staffUp(s, ind); } // 团队一起并进来
  if (e.rights) receive(s, { wallet: 'company', cat: 'revenue', amount: e.rights, party: '视频平台', note: `娱乐传媒 ${r.name}片库版权授权` }, t);
  if (e.early) { s.flags.earlyUnlock = s.flags.earlyUnlock || {}; for (const k of e.early) s.flags.earlyUnlock[k] = true; unlockIfReady(s); }
  if (r.final) { s.flags.finalBeaten = s.flags.finalBeaten || {}; s.flags.finalBeaten[r.stage] = true; }
  // 对方的门店和员工并进来
  const merged = mergeStores(s, r, t);
  // 收购来的公司算资产：估值进身价（并进来的门店、项目、车队已经按各自的价值算了，估值里扣掉，免得算两遍）
  const av = Math.max(0, rTrue.value - (reValue(s) + fleetValue(s) - v0) - (earningsValue(s) - iv0)); s.acquiredValue = (s.acquiredValue || 0) + av;
  for (const id of team) addFavor(s, id, 10);
  // 股权转让协议：买方印花税 0.05%（产权转移书据），合同进档案柜
  const stamp = Math.round(r.value * TAX.stamp.equity * 100) / 100;
  const ct = addContract(s, { prefix: 'GQ', kind: 'equity', title: '股权转让协议', parties: [['受让方', s.companyName || '我的公司'], ['转让方', `${r.boss}（${r.name}）`]], subject: `${r.name} 100% 股权`, rows: [['股权转让款', r.value], ...(r.disc.k > 0 ? [[`已减优惠 −${+(r.disc.k * 100).toFixed(1)}%（${r.disc.parts.map((x) => x.name).join('、')}）`, r.base - r.value]] : []), ...(board ? [['董事会决议：同意（收购超过公司估值 20%）', 0]] : []), ...(plan === 'install' ? [[`首付（${Math.round(downRate(s) * 100)}%，已付）`, now0], ...schedule(s, r.value, t, now0).map((x) => [`第 ${x.k} 期（${dateText(gameDate(s, x.due))}）`, x.amount])] : []), ['印花税（0.05%）', stamp]], total: r.value + stamp, wallet: 'company' }, t);
  pay(s, { wallet: 'company', cat: 'tax_company', amount: stamp, force: true, party: '税务局', ref: ct.no, note: `股权转让印花税（${r.name}）` }, t);
  let swapped = null; if (sw > 0 && SWAP) { swapped = SWAP.issue(s, r, sw, t); ct.rows.push(SWAP.row(s, r, sw)); } // 第 3-05 项
  if (bigBonus(s, 'deal')) useBig(s, 'deal'); // P-05 老板亲自谈判：设计64 起已经并进收购价优惠（liveDeal），这里只把这次用掉
  const deal = plan === 'install' ? openDeal(s, rivalId, t, { down: now0, merged, av, boost: e.boost, contract: ct.no }) : null;
  capAdd(s, 'battleLog', (s.battleLog = s.battleLog || []), { t, rival: rivalId, acquire: true, win: true, price: r.value, disc: r.disc.k, reward: 0, merged, contract: ct.no, plan });
  return { ok: true, success: true, price: r.value, disc: r.disc, board, stamp, contract: ct, merged, deal, loan: maL, swapped };
}

// ---------- 设计64 第三节第 5 条：协议没签就关 → 消息「重要」挂一条待签，点开回到协议；签了 / 价作废（估值变 20%）自动收掉 ----------
const signOf = (s, rivalId) => (s.inbox || []).find((m) => m.type === 'acq_sign' && m.status === 'open' && m.data && m.data.rivalId === rivalId);
/** 挂（或更新）待签。c：{ plan, useLoan, swapK, team } */
export function signMsg(s, rivalId, t, c = {}) {
  if (rv(s, rivalId).acquired) return null;
  const r = liveDeal(s, rivalId, t); const title = `待签：收购${r.name}股权转让协议（${fmtMoney(r.value)}）`;
  const data = { rivalId, plan: c.plan || 'full', useLoan: !!c.useLoan, swapK: c.swapK || 0, team: c.team || [], value0: r.value0 };
  const old = signOf(s, rivalId); if (old) { old.title = title; old.data = data; old.t = t; old.read = false; return old; }
  return addMsg(s, { kind: 'request', type: 'acq_sign', title, body: `${r.dealP && r.dealP < r.value0 ? `谈好的价 ${fmtMoney(r.dealP)}` : `按估值 ${fmtMoney(r.value0)}`}${r.disc && r.disc.k ? `，优惠后 ${fmtMoney(r.value)}` : ''}。谈好的价一直有效，${r.name}估值变动超过 20% 才要重谈。`, actions: [{ key: 'open', label: '打开协议' }], data }, t);
}
/** 每秒看一眼：收购了的收掉；估值变了 20%（谈的价作废）收掉，换成一句「要重新谈」。有变化返回 true */
export function tidySign(s, t) {
  let ch = false;
  for (const m of s.inbox || []) {
    if (m.type !== 'acq_sign' || m.status !== 'open' || !m.data) continue;
    const id = m.data.rivalId; const st = rv(s, id);
    if (st.acquired) { m.status = 'done'; ch = true; continue; }
    const v = live(s, id).value; const stale = dealStale(s, id) || (m.data.value0 && Math.abs(v / m.data.value0 - 1) > 0.2);
    if (stale) { m.status = 'done'; ch = true; addMsg(s, { kind: 'system', type: 'acq_stale', title: `${live(s, id).name}估值变了，上次谈的价不算了，要重新谈`, body: '去「商战 → 收购」重新谈价，或者按估值直接签。' }, t); }
  }
  return ch;
}

/** 升称号（身价到线 + 最终对手收购了）；返回新称号序号或 null */
export function promoteIfReady(s, canPromote, t = Date.now()) {
  if (!canPromote(s)) return null;
  s.title += 1; unlockIfReady(s);
  s.flags.titleAt = s.flags.titleAt || {}; s.flags.titleAt[s.title] = t; // 事件（财务危机等）按升称号的时间算
  return s.title;
}
export { TITLES };

/** 收购后对方门店（连员工）并进来：返回 [{ ind, n, staff }] */
export function mergeStores(s, r, t) {
  const out = [];
  for (const [ind, n] of Object.entries(r.merge || {})) {
    const x = s.inds[ind]; if (!x) continue;
    const add = Math.min(n, Math.max(IND_BY_ID[ind].maxBranch, x.branches) - x.branches); // 收购并进来的店不受称号上限（对方本来就有） if (add <= 0) continue;
    const before = establishment(s, ind); // 并进来的店带着自己的员工：编制多出来多少就来多少人（老板自己看的第一家店不算）
    x.branches += add; x.staff = x.staff || {}; let staff = 0; const roles = {};
    for (const [role, k] of Object.entries(establishment(s, ind))) { const d = k - (before[role] || 0); if (d > 0) { x.staff[role] = (x.staff[role] || 0) + d; staff += d; roles[role] = d; } }
    out.push({ ind, n: add, staff, roles });
  }
  return out;
}
