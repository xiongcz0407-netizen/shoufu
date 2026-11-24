// 设计44 投资经理自动炒股（开发2）：每天本地 0 / 6 / 12 / 18 点各一轮。
// 开轮那一跳：用看盘同一套（core/look.js bestRun / priceRow、SK.future 先算接下来 240 跳）挑最多 3 只，她手上的钱全部平分（第二版：没有风格）；
// 买卖点从真实走势里挑，所以一定成交、一定赚；到了买那一跳记「买进」、卖那一跳记「卖出」，都卖完结算：赚的 10% 是她的提成（照 payerOfPost 谁付；外包也收「投顾服务费」）。
// 她的账在 s.mkt.mgr：不进玩家持仓、不用条件单、不动玩家现金、不改股价。第二版：她最多管 SK.mgrCap（下一个称号门槛 × 10%），每轮卖完超出的转回投资账户。
// 每一步只看「这一跳」和固定种子（种子带存档的 gid，每局不一样）：离线补算一跳一跳走过来，跟在线一模一样。
import * as SK from './stocks.js?v=ad479e23';
import { bestRun, priceRow } from './look.js?v=ad479e23';
import { addMsg } from './inbox.js?v=ad479e23';
import { pay, receive } from './ledger.js?v=ad479e23';
import { addUpHook } from './upnote.js?v=ad479e23';
import { payerOfPost } from './fiscal.js?v=ad479e23';
import { isSec } from './posts.js?v=ad479e23';
import { SEC_BY_ID } from '../config/secretaries.js?v=ad479e23';

const C = SK.SCFG; const G = C.mgr; const K = C.watch.look; const LU = C.watch.lu; const F = C.fees;
const TICK = C.tickSec * 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (n) => { const a = Math.abs(n); const t = a >= 1e8 ? `${+(a / 1e8).toFixed(2)}亿` : a >= 1e4 ? `${+(a / 1e4).toFixed(a >= 1e6 ? 0 : 1)}万` : `${Math.round(a).toLocaleString()}`; return `${n < 0 ? '−' : ''}¥${t}`; };
const nm = (c) => SK.BY[c].name;
const pc = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;

/** 这一刻在哪一轮：本地 年月日 × 10 + 第几轮（0 / 6 / 12 / 18 点 → 0～3） */
export function roundOf(t) { const d = new Date(t); const hs = G.hours; let k = 0; for (let i = 0; i < hs.length; i++) if (d.getHours() >= hs[i]) k = i; return ((d.getFullYear() * 100 + d.getMonth() + 1) * 100 + d.getDate()) * 10 + k; }
/** 下一轮几点开：{ at 时间, hour 几点 } */
export function nextRound(t) {
  const d = new Date(t); for (let add = 0; add < 2; add++) for (const hr of G.hours) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + add, hr).getTime(); if (x > t) return { at: x, hour: hr }; }
  return null;
}
const buyFee = (gross) => r2(Math.max(F.minCommission, gross * F.commission) + gross * F.transfer);
const sellFee = (gross) => r2(Math.max(F.minCommission, gross * F.commission) + gross * F.transfer + gross * F.stamp);
export const seeOf = (wit) => SK.seeCount(wit);   // 设计54
export const captureOf = (wit) => K.cBase + K.cK * Math.min(100, Math.max(0, wit)) / 100;

/** 挑这一轮的股票（纯计算）：看得到 5 + 智慧/4 只（种子打乱）；窗口里会封涨停的排第一；其余按赚头；最多 3 只。返回 [{ code, X, Y, g, lu, bi, si, bp, sp }]（bi / si 第几跳买 / 卖，bp / sp 成交价） */
export function picks(m, wit, seed) {
  let i = 0; const rnd = () => SK.hu(seed, i++);
  const pool = SK.live(m).map((x) => x.code).filter((c) => m.px[c] > 0 && SK.onBoard(m, c) !== 'up');
  for (let a = pool.length - 1; a > 0; a--) { const b = Math.floor(rnd() * (a + 1)); [pool[a], pool[b]] = [pool[b], pool[a]]; }
  const see = pool.slice(0, seeOf(wit));
  const Fu = SK.future(m, K.ticks); const end = m.tick + K.ticks;
  const luIn = {}; for (const p of (Fu.lu ? Fu.lu.act : [])) if (p.limit && p.at + LU.pullTicks - 1 > m.tick && p.at + LU.pullTicks - 1 <= end) luIn[p.code] = p.limit;
  const out = [];
  for (const c of see) {
    const path = Fu.path[c]; if (!path) continue;
    const run = bestRun(path); const lu = luIn[c] != null && run.H >= luIn[c] - 1e-9;
    const pr = priceRow(run, wit, lu ? luIn[c] : null, SK.band(m, c).dn); if (!lu && pr.g < K.minG) continue;
    const bi = path.findIndex((p) => p <= pr.X + 1e-9); if (bi < 0) continue;
    let si = -1; for (let k = bi + 1; k < path.length; k++) if (path[k] >= pr.Y - 1e-9) { si = k; break; } if (si < 0) continue;
    out.push({ code: c, X: pr.X, Y: pr.Y, g: pr.g, lu, bi, si, bp: path[bi], sp: path[si] });
  }
  out.sort((a, b) => (b.lu - a.lu) || (b.g - a.g));
  return out.slice(0, G.max);
}

/** 开一轮：把要买几股、哪一跳买卖定下来（钱数按这一刻她手上的） */
function openRound(s, g, tk, t) {
  const m = s.mkt; const wit = SK.mgrWit(s, t); const key = roundOf(t);
  if (key % 10 === 0) { g.prevDay = g.day; g.day = null; }   // 0 点那轮：昨天合计留给这一轮的汇报
  if (!g.day) g.day = { start: g.value, n: 0, pnl: 0, lu: 0, back: 0 };
  const inv0 = r2(g.value);   // 第二版：手上的钱全投
  const ps = wit > 0 ? picks(m, wit, `MGR${s.gid || ''}:${tk}`) : [];
  const per = ps.length ? inv0 / ps.length : 0; const legs = [];
  for (const p of ps) {
    let n = Math.floor(per / (p.bp * (1 + F.commission + F.transfer)) / 100) * 100;   // 整手
    while (n >= 100 && r2(p.bp * n) + buyFee(r2(p.bp * n)) > per) n -= 100;
    if (n < 100) continue;
    const gross = r2(p.bp * n); legs.push({ code: p.code, X: p.X, Y: p.Y, lu: p.lu, n, bt: tk + 1 + p.bi, st: tk + 1 + p.si, bp: p.bp, sp: p.sp, cost: r2(gross + buyFee(gross)), bought: false, sold: false });
  }
  const inv = r2(legs.reduce((a, x) => a + x.cost, 0));
  g.cur = { key, at: t, tick: tk, end: tk + K.ticks, wit: Math.round(wit), inv, legs, who: SK.mgrWho(s) };
  if (!legs.length) settle(s, g, tk, t);   // 一只都没有：这轮不动
}

function settle(s, g, tk, t) {
  const c = g.cur; g.cur = null; const who = c.who; const sec = isSec(who);
  let pnl = 0; const rows = [];
  for (const x of c.legs) { const gross = r2(x.sp * x.n); const get = r2(gross - sellFee(gross)); const p = r2(get - x.cost); pnl += p; rows.push({ code: x.code, bp: x.bp, sp: x.sp, n: x.n, pnl: p, pct: get / x.cost - 1, lu: x.lu }); }
  pnl = r2(pnl); g.value = r2(g.value + pnl); g.earn = r2((g.earn || 0) + pnl);
  const fee = pnl > 0 ? r2(pnl * SK.MGR.feeRate) : 0;
  if (fee >= 0.01) {
    const w = payerOfPost(s, 'invest');
    pay(s, { wallet: w, cat: w === 'personal' ? 'family_office' : sec ? 'sec_salary' : 'outsource', amount: fee, force: true, party: sec ? who : '券商投顾', by: sec ? who : '', note: sec ? '投资经理炒股提成 10%' : '投顾服务费（券商投顾，赚的 10%）' }, t);
    g.fees = r2((g.fees || 0) + fee);
  }
  // 第二版：超过上限的转回投资账户（扣了提成以后）
  const over = r2(g.value - SK.mgrCap(s)); let back = 0;
  if (over >= 0.01) { back = over; g.value = r2(g.value - over); g.back = r2((g.back || 0) + over); receive(s, { wallet: 'invest', cat: 'inv_in', amount: over, by: sec ? who : '', party: '投资经理', note: `投资经理转回赚头（她最多管 ${fmt(SK.mgrCap(s))}）` }, t); }
  const luN = rows.filter((r) => r.lu).length;
  const d = g.day || (g.day = { start: g.value - pnl, n: 0, pnl: 0, lu: 0, back: 0 }); d.n += 1; d.pnl = r2(d.pnl + pnl); d.lu += luN; d.back = r2((d.back || 0) + back);
  const rec = { key: c.key, at: c.at, done: tk * TICK, rows, pnl, fee, back, value: g.value, inv: c.inv, lu: luN };
  g.hist = [rec, ...(g.hist || [])].slice(0, G.hist);
  // 汇报进「系统」
  const parts = rows.map((r) => `${r.lu ? '🔥 ' : ''}${nm(r.code)} ¥${r.bp.toLocaleString()} 买、¥${r.sp.toLocaleString()} 卖 ${pc(r.pct)}${r.lu ? '（抓到涨停）' : ''}`);
  let body = rows.length ? `这一轮：${parts.join('；')}。赚 ${fmt(pnl)}${fee >= 0.01 ? `，${sec ? '提成' : '投顾服务费'} ${fmt(fee)}` : ''}${back ? `，转回你 ${fmt(back)}` : ''}，她手上 ${fmt(g.value)}。` : `这一轮没看到好机会，钱没动，她手上 ${fmt(g.value)}。`;
  if (c.key % 10 === 0 && g.prevDay) { const y = g.prevDay; body += `\n昨天 ${y.n} 轮，赚 ${fmt(y.pnl)}，转回你 ${fmt(y.back || 0)}，抓到涨停 ${y.lu} 次。`; g.prevDay = null; }
  addMsg(s, { kind: 'system', type: 'invest_report', from: sec ? who : '', title: `投资经理 · ${new Date(c.at).getHours()} 点这一轮`, body }, t);
  if (luN) { const r = rows.find((x) => x.lu); const ty = sec ? (SEC_BY_ID[who] || {}).type : '知性'; const L = G.luLines[ty] || G.luLines['知性']; g.pop = { at: t, who, code: r.code, pct: r.pct, line: L.replace('{name}', nm(r.code)).replace('{pct}', (r.pct * 100).toFixed(1)) }; }
  return rec;
}

/** 每跳（stocks.js advance 里叫）：开轮 → 买进 / 卖出 → 都卖完或到点结算 */
export function mgrTick(s, tk) {
  const g = s.mkt && s.mkt.mgr; if (!g || g.value <= 0) return;
  const t = tk * TICK; const c = g.cur;
  if (c) {
    for (const x of c.legs) { if (!x.bought && tk >= x.bt) x.bought = true; if (x.bought && !x.sold && tk >= x.st) x.sold = true; }
    if (c.legs.every((x) => x.sold) || tk >= c.end) settle(s, g, tk, t);
  }
  if (!g.cur && roundOf(t) !== roundOf(t - TICK) && SK.mgrWho(s)) openRound(s, g, tk, t);
}
SK.setMgrStep(mgrTick);

/** 弹框：抓到涨停那一轮结算后 popMin 分钟内才弹（离线补的不弹）；拿一次就清 */
export function takePop(s, t = Date.now()) { const g = s.mkt && s.mkt.mgr; if (!g || !g.pop) return null; const p = g.pop; g.pop = null; return t - p.at <= G.popMin * 60e3 ? p : null; }

/** 第二版：升称号的升级框加一行「投资经理最多管 ¥X → ¥Y」（core/upnote.js 挂钩） */
addUpHook((s, note) => { if (note.title !== '升称号' || !(s.title > 0)) return; const a = SK.mgrCap(s, s.title - 1), b = SK.mgrCap(s, s.title); if (b > a) (note.fx = note.fx || []).push({ name: '投资经理最多管', from: fmt(a), to: fmt(b) }); });
