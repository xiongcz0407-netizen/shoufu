// 基金（第 2-10 项，设计13 第二节、设计14 第二节 6）：跟股票同一套行情
// 公募：指数、行业（科技 / 消费 / 新能源汽车 / 金融红利 / 奢侈品）、债券、货币；净值每跳跟着成分股走，管理费按时间扣
// 私募对冲：合格投资者（身价 ≥ 1000 万）、起投 100 万，签认购协议 + 风险揭示书 + 合格投资者确认书；管理费 2% + 赚的部分 20%
// 天使 / 风投：合格投资者 + 企业家、起投 500 万；锁定期按游戏时间；到期随机：40% 亏一半、40% 拿回 1～2 倍、20% 翻 5～20 倍；赚的部分 20%
// 申购费、赎回费（按持有时间）；赎回下一跳（30 秒）到账；交给投资经理：她按风格配这些基金
import CFG from '../config/funds.json?v=451b6719' with { type: 'json' };
import * as SK from './stocks.js?v=451b6719';
import { pay, receive } from './ledger.js?v=451b6719';
import { addContract } from './contracts.js?v=451b6719';
import { addAssetHook } from './assets.js?v=451b6719';
import { MONTH_MS, YEAR_MS } from './gametime.js?v=451b6719';
import { profitMul } from './calib.js?v=451b6719';

export const FCFG = CFG;
export const FUNDS = CFG.funds;
export const FB = Object.fromEntries(FUNDS.map((f) => [f.id, f]));
const TICKS_PER_YEAR = YEAR_MS / (SK.SCFG.tickSec * 1000);
/** 天使锁定期（游戏年）= 真实年 ÷ profitMul（设计21 第九节） */
export const lockGameYears = (f) => f.lockYears / profitMul();
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (n) => (Math.abs(n) >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : Math.abs(n) >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);
const freeCash = (s) => s.cash - (s.freezes || []).reduce((a, f) => a + f.amount, 0);

/** 存档 s.fund：{ nav, ret（这一跳每只的对数收益）, hist, hold: { id: { units, cost, at } }, pending: [{ id, amount, at }], angel: [{ uid, amount, at, until }], seq } */
export function fd(s) {
  if (!s.fund) { s.fund = { nav: {}, ret: {}, hist: {}, hold: {}, pending: [], angel: [], seq: 0 }; for (const f of FUNDS) if (f.type !== 'angel') { s.fund.nav[f.id] = 1; s.fund.hist[f.id] = [1]; } }
  return s.fund;
}
/** 成分股这一跳的市值涨跌（对数） */
function basket(prev, px, codes) { let a = 0, b = 0; for (const c of codes) { const sh = SK.BY[c].shares; a += prev[c] * sh; b += px[c] * sh; } return a > 0 ? Math.log(b / a) : 0; }
const members = (f) => SK.STOCKS.filter((x) => !f.sectors || f.sectors.includes(x.sector) || (f.minDiv != null && x.div >= f.minDiv)).map((x) => x.code);
const MEM = Object.fromEntries(FUNDS.map((f) => [f.id, members(f)]));
/** 每跳（stocks.advance 叫）：算每只基金的净值 */
export function onStep(s, tick, prev, px) {
  const d = fd(s);
  for (const f of FUNDS) {
    if (f.type === 'angel') continue;
    let r;
    if (f.type === 'equity') r = basket(prev, px, MEM[f.id]);
    else if (f.type === 'bond') r = Math.log(1 + f.yearRet * profitMul()) / TICKS_PER_YEAR + f.tickSigma * SK.hn('BOND', tick);
    else if (f.type === 'money') r = Math.log(1 + f.yearRet * profitMul()) / TICKS_PER_YEAR;
    else if (f.type === 'hedge') r = f.beta * basket(prev, px, MEM.f_index) + f.hourMean / 120 + f.hourSigma / Math.sqrt(120) * SK.hn('HEDGE', tick);
    r -= f.fee / TICKS_PER_YEAR;   // 管理费按时间扣
    d.ret[f.id] = r; d.nav[f.id] = Math.max(0.01, d.nav[f.id] * Math.exp(r));
    if (tick % 20 === 0) { const h = d.hist[f.id]; h.push(+d.nav[f.id].toFixed(4)); if (h.length > 400) h.shift(); }
  }
}

// ---------- 门槛 ----------
export function whyNot(s, id, amount, netWorth) {
  const f = FB[id]; if ((s.title || 0) < (f.title || 0)) return `称号要「${['打工人', '小老板', '老板', '企业家'][f.title]}」`;
  if (amount < f.min) return `起投 ${fmt(f.min)}`;
  if (f.qualified && netWorth < CFG.qualifiedNetWorth) return `合格投资者：身价要 ≥ ${fmt(CFG.qualifiedNetWorth)}（照私募规定：金融资产 ≥ 300 万或年收入 ≥ 50 万，游戏里简化成身价）`;
  if (freeCash(s) < amount) return `个人现金还差 ${fmt(amount - freeCash(s))}`;
  return null;
}
// ---------- 申购 ----------
export function subscribe(s, id, amount, t, { netWorth = Infinity, by = '' } = {}) {
  const f = FB[id]; const why = whyNot(s, id, amount, netWorth); if (why) return { ok: false, why };
  const fee = r2(amount * f.buyFee); const net = amount - fee;
  let docs = [];
  if (f.qualified) docs = ['认购协议', '风险揭示书', '合格投资者确认书'].map((title) => addContract(s, { prefix: 'SM', kind: 'private_fund', title, parties: [['投资者', s.bossName || '老板'], ['基金管理人', f.manager]], subject: `${f.name}，认购 ${fmt(amount)}`, rows: title === '认购协议' ? [['认购金额', amount, ''], ['认购费', fee, `${(f.buyFee * 100).toFixed(2)}%`]] : [], total: title === '认购协议' ? amount : 0, wallet: 'personal' }, t));
  else docs = [addContract(s, { prefix: 'JJ', kind: 'fund', title: '基金申购确认单', parties: [['投资者', s.bossName || '老板'], ['基金公司', f.manager]], subject: f.name, rows: [['申购金额', amount, ''], ['申购费', fee, `${(f.buyFee * 100).toFixed(2)}%`]], total: amount, wallet: 'personal' }, t)];
  pay(s, { wallet: 'personal', cat: 'fund_buy', amount: net, ref: docs[0].no, party: f.manager, by, note: `申购 ${f.name}` }, t);
  if (fee > 0) pay(s, { wallet: 'personal', cat: 'fund_fee', amount: fee, ref: docs[0].no, party: f.manager, by, note: `${f.name} 申购费` }, t);
  const d = fd(s);
  if (f.type === 'angel') { d.seq += 1; const a = { uid: d.seq, id, amount: net, at: t, until: t + lockGameYears(f) * YEAR_MS }; d.angel.push(a); return { ok: true, angel: a, docs }; }
  const units = net / d.nav[id]; const h = d.hold[id] || (d.hold[id] = { units: 0, cost: 0, at: t });
  if (!h.units) h.at = t; h.cost += net; h.units += units;
  return { ok: true, units, docs };
}
// ---------- 赎回：按当跳净值，下一跳（30 秒）到账 ----------
export function redeemFee(f, held) { if (f.type === 'money') return 0; const day = MONTH_MS / 30; return held < 7 * day ? 0.015 : held < 30 * day ? 0.005 : 0; }
export function redeem(s, id, frac, t) {
  const d = fd(s); const f = FB[id]; const h = d.hold[id]; if (!h || h.units <= 0) return { ok: false, why: '没有这只' };
  const units = h.units * Math.min(1, frac); const gross = units * d.nav[id]; const costPart = h.cost * units / h.units;
  const rf = r2(gross * redeemFee(f, t - h.at)); const perf = f.perfFee ? r2(Math.max(0, gross - costPart) * f.perfFee) : 0;
  h.units -= units; h.cost -= costPart; if (h.units < 1e-9) delete d.hold[id];
  d.pending.push({ id, gross: r2(gross), rf, perf, at: t + SK.SCFG.tickSec * 1000, cost: r2(costPart) });
  return { ok: true, gross: r2(gross), rf, perf, net: r2(gross - rf - perf) };
}
/** 每秒：赎回到账、天使到期 */
export function tick(s, t, rnd = null) {
  const d = fd(s); const out = [];
  for (const p of d.pending.slice()) if (t >= p.at) {
    const f = FB[p.id];
    receive(s, { wallet: 'personal', cat: 'fund_sell', amount: p.gross, party: f.manager, note: `赎回 ${f.name}（基金收益免个税）` }, t);
    if (p.rf + p.perf > 0) pay(s, { wallet: 'personal', cat: 'fund_fee', amount: p.rf + p.perf, party: f.manager, note: `${f.name} ${p.rf ? '赎回费' : ''}${p.rf && p.perf ? '、' : ''}${p.perf ? '业绩报酬 20%' : ''}`, force: true }, t);
    d.pending = d.pending.filter((x) => x !== p); out.push(`${f.name}赎回到账 ${fmt(p.gross - p.rf - p.perf)}`);
  }
  for (const a of d.angel.slice()) if (t >= a.until) {
    const f = FB[a.id]; const u = rnd ? rnd() : SK.hu('ANGEL' + (s.gid || ''), a.uid); const v = rnd ? rnd() : SK.hu('ANGELX' + (s.gid || ''), a.uid);
    const O = f.outcomes; const mult = u < O.lose[0] ? O.lose[1] : u < O.lose[0] + O.mid[0] ? O.mid[1] + v * (O.mid[2] - O.mid[1]) : O.big[1] + v * (O.big[2] - O.big[1]);
    const back = r2(a.amount * mult); const carry = r2(Math.max(0, back - a.amount) * f.perfFee);
    receive(s, { wallet: 'personal', cat: 'fund_sell', amount: back, party: f.manager, note: `${f.name} 到期退出（${mult.toFixed(2)} 倍）` }, t);
    if (carry > 0) pay(s, { wallet: 'personal', cat: 'fund_fee', amount: carry, party: f.manager, note: `${f.name} 业绩报酬 20%`, force: true }, t);
    d.angel = d.angel.filter((x) => x !== a); out.push(`${f.name}到期：${mult < 1 ? '亏了一半' : mult >= 5 ? `投中独角兽，${mult.toFixed(1)} 倍` : `拿回 ${mult.toFixed(2)} 倍`}，到手 ${fmt(back - carry)}`);
  }
  return out;
}
export const holdings = (s) => Object.entries(fd(s).hold).map(([id, h]) => ({ id, ...h, value: r2(h.units * fd(s).nav[id]) }));
export const value = (s) => (s.fund ? holdings(s).reduce((a, h) => a + h.value, 0) + s.fund.angel.reduce((a, x) => a + x.amount, 0) + s.fund.pending.reduce((a, p) => a + p.gross - p.rf - p.perf, 0) : 0);
/** 投资经理按风格配的组合这一跳的收益（对数）；ret 还没算出来的用 0 */
export function styleRet(s, style) { const w = CFG.styles[style]; if (!w || !s.fund) return null; let r = 0; for (const [id, k] of Object.entries(w.mix)) r += k * (s.fund.ret[id] || 0); return r; }

SK.addStepHook(onStep);
SK.setStyleRet(styleRet);
addAssetHook({ value });
