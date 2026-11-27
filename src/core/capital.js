// 阶段三 3-02：投资人融资 + 对赌 + 股东名册 + 董事会 + 施压（设计23 第一、二节）
// 估值、持股在 core/economy.js（earningsValue / companyEquity / stakeOf），身价 = 公司估值 × 你的持股
import { credit } from './credit.js?v=b846574c'; // V3-01 亲自拍板攒投入度
import CAP from '../config/capital.json?v=b846574c' with { type: 'json' };
import { companyEquity, stakeOf, profit12, earningsValue, lineNetMonth } from './economy.js?v=b846574c';
import { ensureSec } from './secretary.js?v=b846574c';
import { isTraining } from './training.js?v=b846574c';
import { receive, pay, canPay } from './ledger.js?v=b846574c';
import { bank } from './bank.js?v=b846574c';
import { addContract } from './contracts.js?v=b846574c';
import { addMsg } from './inbox.js?v=b846574c';
import { gm, profitMul } from './calib.js?v=b846574c';
import { MONTH_MS, YEAR_MS, monthIndex } from './gametime.js?v=b846574c';
import { holder, isSec, power, POSTS_CFG as P } from './posts.js?v=b846574c';
import { addFavor } from './affection.js?v=b846574c';
export { CAP };

const r2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** s.cap：{ stake 你的持股, holders [{ name, pct, round, pref, board, anti }], rounds 做过的轮次 id, vams 对赌, invite 主动约, seq } */
export function cap(s) { const c = (s.cap = s.cap || { stake: 1, holders: [], rounds: [], vams: [], invite: null, seq: 0 }); return c; }
export const ROUND_BY_ID = Object.fromEntries(CAP.rounds.map((r) => [r.id, r]));
/** 下一轮（按顺序；做过的不再做） */
/** 下一个够得着的轮次（P-00 验收）：从最后融过的那轮往后找，投资人估值已经超过区间上限的跳过；Pre-IPO 融过或已经上市就没有了（只剩上市） */
export function nextRound(s) {
  const C = cap(s); if ((s.listing && s.listing.listed) || C.rounds.includes('pre')) return null;
  const last = Math.max(-1, ...C.rounds.map((id) => CAP.rounds.findIndex((r) => r.id === id))); const v = investorValue(s);
  return CAP.rounds.slice(last + 1).find((r) => !(r.maxVal && v > r.maxVal)) || null;
}
/** 能不能谈这一轮：称号够、公司估值到下限 */
export function whyNotRound(s, r, t = Date.now()) {
  if (!r) return '五轮都融完了';
  const C0 = cap(s); if (C0.closing) return `${C0.closing.roundName}还在交割，${fmtGm(C0.closing.at - t)}后到账`;
  if (C0.lastClose && t < C0.lastClose + gm(CAP.close.gapRealMonths) * MONTH_MS) return `投资人要先看上一轮的钱用出效果，${fmtGm(C0.lastClose + gm(CAP.close.gapRealMonths) * MONTH_MS - t)}后再谈`;
  if ((s.title || 0) < r.minTitle) return `${r.name}要「${['打工人', '小老板', '老板', '企业家'][r.minTitle]}」`;
  const v = investorValue(s); if (v < r.minVal) return `投资人按近 12 个游戏月的利润算，公司估值到 ${Math.round(r.minVal / 1e4)} 万才看（现在 ${Math.round(v / 1e4)} 万）`;
  return null;
}
/** 股东名册：你 + 投资人 + 激励池（3-03） */
export const shareholders = (s) => [{ name: '你', pct: stakeOf(s), me: true }, ...cap(s).holders.filter((h) => h.pct > 1e-9)];

/** 投资人主动约（每秒 / 离线检查）：估值到了、没在约，就发一条「XX 约您喝咖啡」，30 分钟内回 */
export function tickCapital(s, t) {
  const C = cap(s); const r = nextRound(s); const ev = [];
  if (C.invite && C.invite.until && t > C.invite.until) { C.invite = null; } /* V0.2.3（设计35 第十节）：新约的不过期，老存档里有时限的照旧 */
  if (!C.invite && r && !whyNotRound(s, r, t) && (!C.lastInviteRound || C.lastInviteRound !== r.id || t - (C.lastInviteAt || 0) > 4 * 3600e3)) {
    const who = r.investors[(C.seq++) % r.investors.length];
    C.invite = { round: r.id, investor: who }; C.lastInviteRound = r.id; C.lastInviteAt = t;
    addMsg(s, { kind: 'invite', type: 'invest_invite', title: `${who}约您喝咖啡（${r.name}）`, body: `对方看好公司，想谈${r.name}。什么时候去谈都行，对方一直等（财富 → 资本 → 融资）。`, data: { round: r.id } }, t);
    ev.push(`${who}约您谈${r.name}`);
  }
  if (C.closing && t >= C.closing.at) ev.push(closeRound(s, C.closing.at));
  for (const v of C.vams) if (v.status === 'open' && t >= v.end) settleVam(s, v, t, ev);
  pressure(s, t);
  return ev;
}

// ---------- 谈判 ----------
const teamPower = (s, team) => team.reduce((a, id) => { const x = isSec(id) ? ensureSec(s, id).attrs : { social: 30, wit: 30 }; return a + x.social + x.wit; }, 0) / Math.max(1, team.length);
/** 条款 terms：{ adj 投前估值 −0.2～+0.2, sell 出让比例, vam 对赌增长（0 = 不对赌）, pref 优先清算倍数, board 董事席位, anti 反稀释 } */
// ---------- V2-07 谈估值（接开发2 的 core/negotiate.js）----------
export function capNegoOpts(s, roundId, team) {
  const N = CAP.nego; const base = quoteRound(s, roundId, { adj: 0, _raw: true }).pre;
  return { key: 'cap_' + roundId, kind: 'sell', base: Math.round(base * N.open), range: N.range, step: Math.pow(10, Math.max(3, Math.floor(Math.log10(Math.max(1, base))) - 2)), persona: N.persona,
    chips: { intel: !!holder(s, 'ipo'), secId: (team || []).find((id) => isSec(id)) || null, boss: bigBonus(s, 'deal') > 0 } };
}
export function setNegoPre(s, roundId, pre) { cap(s).negPre = { round: roundId, pre: Math.round(pre) }; }
export const negoPre = (s, roundId) => { const n = s.cap && s.cap.negPre; return n && n.round === roundId ? n.pre : null; };
export function quoteRound(s, roundId, terms) {
  const r = ROUND_BY_ID[roundId]; const D = CAP.ipoDirector; const dirK = holder(s, 'ipo') ? D.valueLo + (D.valueHi - D.valueLo) * Math.min(1, ipoPower(s)) : 0; // 投融资总监多谈 5%～15%
  const np = terms._raw ? null : negoPre(s, roundId); /* V2-07 谈下来的投前估值 */
  const pre = np != null ? np : r2(investorValue(s) * (terms._raw ? 1 : 1 + bigBonus(s, 'deal')) * (1 + clamp(terms.adj || 0, -CAP.valueAdj, CAP.valueAdj)) * (1 + dirK));
  const sell = clamp(terms.sell ?? r.sell[0], r.sell[0], r.sell[1]); const amount = r2(pre * sell / (1 - sell));
  return { round: r, pre, post: r2(pre + amount), sell, amount };
}
export function talkRate(s, roundId, team, terms, invited) {
  const T = CAP.talk; const adj = negoPre(s, roundId) != null ? 0 : clamp(terms.adj || 0, -CAP.valueAdj, CAP.valueAdj); // V2-07 谈好了估值就不算溢价
  const finBonus = ipoPower(s) * CAP.ipoDirector.talkK; // 投融资总监（3-03）
  return clamp(T.base + (invited ? T.invite : T.self) + teamPower(s, team) * T.attrK - Math.max(0, adj) * T.premiumK + Math.max(0, -adj) * 1 + (terms.vam ? T.vam : 0) + ((terms.pref || 1) > 1 ? T.pref : 0) + (terms.board ? T.board : 0) + (terms.anti ? T.anti : 0) + finBonus, 0.05, 0.95);
}
export function whyNotTalk(s, roundId, team, t) {
  const r = ROUND_BY_ID[roundId]; const w = whyNotRound(s, r, t); if (w) return w;
  if (!team.length) return '至少带一个人去';
  if (team.some((id) => isSec(id) && isTraining(s, id))) return '上课的人不能带';
  const C = cap(s); if (C.cool && t < C.cool) return `对方还在考虑，${Math.ceil((C.cool - t) / 60e3)} 分钟后再谈`;
  return null;
}
/** 谈一轮：成了 → 签投资协议 + 股东协议、钱进公司账户（限公司用）、你被稀释、名册更新；对赌另记 */
export function raise(s, roundId, team, terms, t, rnd = Math.random) {
  const why = whyNotTalk(s, roundId, team, t); if (why) return { ok: false, why };
  const C = cap(s); const invited = !!(C.invite && C.invite.round === roundId && (!C.invite.until || t <= C.invite.until));
  const rate = talkRate(s, roundId, team, terms, invited);
  if (rnd() >= rate) { C.cool = t + CAP.negotiateMin * 60e3; if (invited) C.invite = null; C.negPre = null; return { ok: true, success: false, rate }; }
  const q = quoteRound(s, roundId, terms); const r = q.round; const investor = invited ? C.invite.investor : r.investors[0];
  const pref = terms.pref || 1;
  // 稀释：所有人 × (1 − 出让比例)；反稀释的老投资人这里只记条款（降价融资时再补，设计23）
  C.stake = stakeOf(s) * (1 - q.sell); for (const h of C.holders) { h.pct *= 1 - q.sell; if (h.pool) { h.free *= 1 - q.sell; h.dil = (h.dil || 1) * (1 - q.sell); } }
  for (const g of Object.values(C.options || {})) { g.pct *= 1 - q.sell; g.done = (g.done || 0) * (1 - q.sell); } // 期权一起被稀释
  const h = { name: investor, round: r.id, roundName: r.name, pct: q.sell, invest: q.amount, pre: q.pre, pref, board: !!terms.board, anti: !!terms.anti, t };
  if (C.negPre) credit(s, 'nego', 1, t); /* V3-01：谈好的估值签了才算 */ C.holders.push(h); C.rounds.push(r.id); C.invite = null; C.negPre = null;
  const rows = [['投前估值', q.pre], ['投资金额', q.amount], ['出让比例', `${(q.sell * 100).toFixed(1)}%`], ['优先清算', `${pref} 倍`], ['董事席位', terms.board ? '1 席' : '无'], ['反稀释', terms.anti ? '有（加权平均）' : '无']];
  let vam = null;
  if (terms.vam) {
    const len = gm(CAP.vam.realMonths) * MONTH_MS; const base = recentProfit(s, len, t);
    const need = terms.vam * (holder(s, 'ipo') ? CAP.ipoDirector.vamEase : 1); // 投融资总监：对赌松一档
    vam = { id: C.vams.length + 1, investor, round: r.id, invest: q.amount, growth: need, asked: terms.vam, start: t, end: t + len, base, status: 'open', holder: h };
    C.vams.push(vam); rows.push(['对赌', `${(len / MONTH_MS).toFixed(1)} 个游戏月净利比前一期增长 ${Math.round(vam.growth * 100)}%（基数 ${Math.round(base)} 元）；没达到个人按投资额 × (1 + ${Math.round(CAP.vam.rate * profitMul() * 100)}% × 年数) 回购`]);
  }
  const ct = addContract(s, { prefix: 'TZ', kind: 'invest', title: '投资协议', parties: [['投资方', investor], ['公司', s.companyName || '我的公司'], ['创始人', s.bossName || '老板']], subject: `${r.name}：${investor}以 ${Math.round(q.pre / 1e4)} 万投前估值投资 ${Math.round(q.amount / 1e4)} 万，取得 ${(q.sell * 100).toFixed(1)}% 股权`, rows, total: q.amount, wallet: 'company' }, t);
  addContract(s, { prefix: 'GD', kind: 'invest', title: '股东协议', parties: [['股东', `你（${(C.stake * 100).toFixed(1)}%）`], ['股东', `${investor}（${(q.sell * 100).toFixed(1)}%）`]], subject: '公司治理、董事会、优先清算、反稀释、领售跟售', rows: rows.slice(3), total: 0, wallet: 'company' }, t);
  h.contract = ct.no; if (vam) vam.contract = ct.no;
  useBig(s, 'deal'); // P-05 亲自谈判用掉
  C.closing = { round: r.id, roundName: r.name, investor, amount: q.amount, ref: ct.no, at: t + gm(CAP.close.realMonths) * MONTH_MS }; // 3-08：交割期到了钱才进来
  return { ok: true, success: true, rate, ...q, investor, contract: ct, vam, closeAt: C.closing.at };
}
/** 3-08：投资人看的估值（设计23 第一节「近 12 个游戏月净利 × 市盈率」）：经营估值按「近 12 个游戏月实际净利 ÷ 现在的年化净利」打折（刚开的店、刚升的级还没赚出来不算），账上的钱和资产照算 */
export function trailingK(s) {
  const now = Object.keys(s.inds).reduce((a, id) => a + lineNetMonth(s, id), 0) * 12; if (!(now > 0)) return 1;
  const got = (s.monthly || []).slice(-12).reduce((a, x) => a + (x.profit || 0), 0);
  return Math.max(0, Math.min(1, got / now));
}
export const investorValue = (s) => companyEquity(s) - earningsValue(s) * (1 - trailingK(s));
/** 交割：融资款进公司账户（限公司用），投融资总监拿提成 */
function closeRound(s, t) {
  const C = cap(s); const x = C.closing; C.closing = null; C.lastClose = t;
  receive(s, { wallet: 'company', cat: 'investment', amount: x.amount, party: x.investor, ref: x.ref, note: `${x.roundName}融资款交割（限公司用）` }, t);
  bank(s).restricted += x.amount; // 融资款跟贷款资金一样只能用在公司（开店、项目、收购），不能分红
  const ipoWho = holder(s, 'ipo'); if (isSec(ipoWho)) { const fee = r2(x.amount * P.posts.ipo.raiseRate); pay(s, { wallet: 'company', cat: 'sec_salary', amount: fee, force: true, party: ipoWho, by: ipoWho, note: `投融资总监融资提成 0.5%（${x.roundName}）` }, t); }
  addMsg(s, { kind: 'system', type: 'invest', title: `${x.roundName}交割完成：${Math.round(x.amount / 1e4)} 万到账`, body: `${x.investor}的融资款进了公司账户（限公司用：开店、项目、收购）。` }, t);
  return `${x.roundName} ${Math.round(x.amount / 1e4)} 万到账`;
}
/** 最近一段时间（len 毫秒）的净利：按月报折算 */
export function recentProfit(s, len, t) {
  const months = len / MONTH_MS; const m = (s.monthly || []).slice(-Math.max(1, Math.ceil(months)));
  if (!m.length) return Math.max(0, profit12(s) / 12 * months);
  return m.reduce((a, x) => a + (x.profit || 0), 0) / m.length * months;
}
// ---------- 对赌结算 ----------
function settleVam(s, v, t, ev) {
  const C = cap(s); const len = v.end - v.start; const got = recentProfit(s, len, t); const need = v.base * (1 + v.growth);
  v.got = got; v.need = need;
  if (got >= need || need <= 0) { v.status = 'won'; addMsg(s, { kind: 'system', type: 'vam', title: `对赌达标：${v.investor}`, body: `对赌期净利 ${Math.round(got)} 元，目标 ${Math.round(need)} 元。` }, t); ev.push(`对赌达标（${v.investor}）`); return; }
  // 没达到：你个人按 投资额 × (1 + 8% × profitMul × 游戏年数) 回购这家的股份；现金不够用你的股份抵
  const years = len / YEAR_MS; const price = r2(v.invest * (1 + CAP.vam.rate * profitMul() * years)); const h = v.holder;
  const cash = Math.max(0, Math.min(s.cash || 0, price));
  if (cash > 0) pay(s, { wallet: 'personal', cat: 'buyback', amount: cash, party: v.investor, ref: v.contract, note: `对赌没达标，个人回购${v.investor}股份` }, t);
  const frac = cash / price; const back = h.pct * frac; h.pct -= back; C.stake += back; // 付了现金的部分：股份回到你手里
  const short = price - cash;
  if (short > 0.01) { const val = Math.max(1, companyEquity(s)); const give = Math.min(C.stake, short / val); C.stake -= give; h.pct += give; } // 现金不够：用你的股份抵
  v.status = 'lost'; v.price = price; v.cash = cash; v.short = short;
  addMsg(s, { kind: 'system', type: 'vam', title: `⚠️ 对赌没达标：${v.investor}`, body: `对赌期净利 ${Math.round(got)} 元，目标 ${Math.round(need)} 元。回购价 ${Math.round(price)} 元：个人现金付了 ${Math.round(cash)} 元${short > 0.01 ? `，不够的 ${Math.round(short)} 元用你的股份抵` : ''}。你现在持股 ${(C.stake * 100).toFixed(1)}%。` }, t);
  ev.push(`对赌没达标（${v.investor}）`);
}
// ---------- 董事会、施压 ----------
/** 有投资人董事席位：单笔超过公司估值 20% 的收购要过董事会 */
export function needsBoard(s, amount) { return cap(s).holders.some((h) => h.board && h.pct > 0) && amount > companyEquity(s) * CAP.board.bigDealOfVal; }
export function boardApprove(s, rnd = Math.random) {
  const m = (s.monthly || []).slice(-3); const up = m.length >= 2 && m[m.length - 1].profit > m[0].profit;
  return rnd() < CAP.board.approveBase + (up ? CAP.board.approveGood : 0);
}
function pressure(s, t) {
  const C = cap(s); if (!C.holders.length) return; const m = s.monthly || []; const n = CAP.pressureMonths;
  if (m.length < n + 1) return; const last = m[m.length - 1].m; if (C.pressedAt === last) return;
  let down = true; for (let i = m.length - n; i < m.length; i++) if (!(m[i].profit < m[i - 1].profit)) down = false;
  if (!down) return; C.pressedAt = last;
  const who = C.holders.filter((h) => h.pct > 0).at(-1);
  addMsg(s, { kind: 'system', type: 'invest_press', title: `${who.name}来电：利润连续 ${n} 个月下降`, body: '「我们投的是增长。下个月的数字，希望能看到改善。」' }, t);
}

// ---------- 投融资总监（3-03）----------
/** 投融资总监的本事（0～1.x）：交际 + 智慧 / 100 × 效率；外包 FA 按 0.3；没人 0。开发2 的上市（问询少、减持提醒）也用它 */
export const ipoPower = (s) => power(s, 'ipo');

// ---------- 秘书股权激励（3-03）----------
const PL = CAP.pool;
export const pool = (s) => cap(s).holders.find((h) => h.pool) || null;
/** 激励池：从你的股份里划（最多公司 10%）；之后融资跟大家一起被稀释 */
export function whyNotPool(s, size) { if (pool(s)) return '已经有激励池了'; if (!(size > 0) || size > PL.max + 1e-9) return `激励池最多 ${PL.max * 100}%`; if (stakeOf(s) - size < 0.01) return '你的股份不够'; return null; }
export function makePool(s, size, t) {
  const why = whyNotPool(s, size); if (why) return { ok: false, why };
  const C = cap(s); C.stake = stakeOf(s) - size; C.holders.push({ name: '秘书激励池', pool: true, pct: size, free: size, roundName: '激励池', t });
  addContract(s, { prefix: 'JL', kind: 'invest', title: '股权激励计划', parties: [['公司', s.companyName || '我的公司'], ['创始人', s.bossName || '老板']], subject: `从创始人股份中划出 ${(size * 100).toFixed(1)}% 设立秘书激励池（有限合伙持股平台）`, rows: [['激励池', `${(size * 100).toFixed(1)}%`], ['归属', `${gm(PL.vestRealMonths).toFixed(1)} 个游戏月，按月归属`], ['行权价', `授予时公司估值 × ${PL.strikeOfValue * 100}%`]], total: 0, wallet: 'company' }, t);
  return { ok: true };
}
/** 给秘书期权：每次 1%（按公司总股本算；池子被稀释后按池子里剩的比例） */
export function whyNotGrant(s, id, t = s._now || Date.now()) { const P0 = pool(s); if (!P0) return '先设激励池'; if (!s.secs[id]) return '没有这个秘书'; const g = opts(s)[id]; if (g && vestedFrac(g, t) < 1) return '她的期权还在归属中'; if (P0.free < PL.grant * (P0.dil || 1) * 0.5 - 1e-9) return '激励池分完了'; return null; }
const opts = (s) => (cap(s).options = cap(s).options || {});
export const grantOf = (s, id) => opts(s)[id] || null;
const vestLen = () => gm(PL.vestRealMonths) * MONTH_MS;
/** 已归属比例（按游戏月一格一格）：0～1 */
export const vestedFrac = (g, t) => Math.min(1, Math.floor((t - g.t) / MONTH_MS) * MONTH_MS / vestLen());
export function grant(s, id, t) {
  const why = whyNotGrant(s, id, t); if (why) return { ok: false, why };
  const P0 = pool(s); const pct = Math.min(PL.grant * (P0.dil || 1), P0.free); // 每次 1%（之后融资稀释了就按稀释后的）
  P0.free -= pct; const strike = r2(companyEquity(s) * pct * PL.strikeOfValue);
  const old = opts(s)[id]; opts(s)[id] = { pct: (old ? old.pct - (old.done || 0) : 0) + pct, strike: (old ? old.strike : 0) + strike, t, done: 0 };
  addFavor(s, id, PL.favor);
  return { ok: true, pct, strike, line: optionLine(s, id) };
}
/** 行权：已归属没行权的部分；她付行权价（进公司），差价按工资薪金交个税（财务总监代扣）；股份从激励池转到她名下 */
export function exercise(s, id, t) {
  const g = opts(s)[id]; if (!g) return { ok: false, why: '她没有期权' };
  const can = g.pct * vestedFrac(g, t) - (g.done || 0); if (can <= 1e-9) return { ok: false, why: '还没有归属的期权' };
  const strike = r2(g.strike * can / g.pct); const fmv = r2(companyEquity(s) * can); const gain = Math.max(0, fmv - strike);
  const tax = r2(iitOnce(gain)); // 股权激励单独按年度综合所得税率表算（3%～45%）
  receive(s, { wallet: 'company', cat: 'option_strike', amount: strike, party: id, note: `秘书行权缴款（${(can * 100).toFixed(2)}%）` }, t);
  if (tax > 0) pay(s, { wallet: 'company', cat: 'iit_withheld', amount: tax, memo: true, party: '税务局', by: (s.positions || {}).cfo || '', note: `股权激励个税（差价 ${Math.round(gain)} 元，财务总监代扣，她自己出）` }, t);
  g.done = (g.done || 0) + can; const P0 = pool(s); P0.pct -= can;
  let mine = cap(s).holders.find((h) => h.sec === id); if (!mine) { mine = { name: (SEC_BY_ID[id] || {}).name || id, sec: id, pct: 0, roundName: '秘书持股' }; cap(s).holders.push(mine); } mine.pct += can;
  return { ok: true, pct: can, strike, gain, tax };
}
/** 年度综合所得税率表（股权激励单独计税：应纳税所得额 × 税率 − 速算扣除） */
function iitOnce(x) { const B = [[36000, 0.03, 0], [144000, 0.1, 2520], [300000, 0.2, 16920], [420000, 0.25, 31920], [660000, 0.3, 52920], [960000, 0.35, 85920], [1e18, 0.45, 181920]]; if (x <= 0) return 0; const [, r, q] = B.find(([u]) => x <= u); return Math.max(0, x * r - q); }
export const iitOnOption = iitOnce;
/** 她的身家：已行权股份 + 已归属没行权的期权（按公司估值 − 行权价） */
export function secWorth(s, id, t = s._now || Date.now()) {
  const v = companyEquity(s); const mine = cap(s).holders.find((h) => h.sec === id); const g = opts(s)[id];
  const held = mine ? mine.pct * v : 0; let opt = 0, unvested = 0;
  if (g) { const vf = vestedFrac(g, t); const can = g.pct * vf - (g.done || 0); opt = Math.max(0, can * v - g.strike * can / g.pct); unvested = g.pct * (1 - vf); }
  return { held, opt, unvested, pct: (mine ? mine.pct : 0) + (g ? g.pct - (g.done || 0) : 0), total: held + opt };
}
/** 拿了期权的秘书：职位效率 × 1.1（posts.efficiency 挂这个） */
export const optionEff = (s, id) => (s.cap && s.cap.options && s.cap.options[id] ? PL.eff : 1);
const LINES = { 元气: '诶？这是……公司的股份？我会更拼命的！', 清冷: '……谢谢。我会好好保管。', 天然呆: '股份？……我查一下这是什么意思。……哦。谢谢。很多钱。', 妩媚: '送我股份？……老板，这是聘礼吗？我收下了。', 高冷: '……谢谢。我不会让它贬值。', 知性: '这是对我的信任。我会让公司值得这个价。', 绿茶: '老板只给我一个人的对吧？我就知道你最懂我～', 傲娇: '哼，给这么点……算了，看在你诚意的份上。' };
import { SEC_BY_ID } from '../config/secretaries.js?v=b846574c';
import { bigBonus, useBig } from './manage.js?v=b846574c';
const fmtGm = (ms) => `${Math.max(0.1, ms / MONTH_MS).toFixed(1)} 个游戏月`;
export const optionLine = (s, id) => LINES[(SEC_BY_ID[id] || {}).type] || '谢谢老板。';
