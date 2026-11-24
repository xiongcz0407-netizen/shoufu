// 「财富 → 投资」股票（第 2-09 项，设计12 第八节）：行情 | 持仓 | 投资经理；点一只 → 个股（分时、指标、买卖、新闻、持仓）
import * as SK from '../core/stocks.js?v=691ed83a';
import * as AS from '../core/assets.js?v=691ed83a';
import * as INB from '../core/inbox.js?v=691ed83a';
import { bossAttrs } from '../core/boss.js?v=691ed83a';
import { holder, isSec } from '../core/posts.js?v=691ed83a';
import { SEC_BY_ID } from '../config/secretaries.js?v=691ed83a';
import { fmtMoney, fmtDuration } from '../core/format.js?v=691ed83a';
import { asset, hasAsset } from '../platform/assets.js?v=691ed83a';
import { game } from '../game.js?v=691ed83a';
import { now } from '../core/clock.js?v=691ed83a';
import { h, openPanel, toast, liveRender } from './dom.js?v=691ed83a';
import { say } from './main-screen.js?v=691ed83a';
import { renderFunds } from './funds.js?v=691ed83a';
import { hintLater } from './guide2.js?v=691ed83a';
import * as LSC from '../core/listing.js?v=691ed83a';
import { selfCard } from './listing.js?v=691ed83a';
import * as TKO from '../core/takeover.js?v=691ed83a';
import * as TR from '../core/trade.js?v=691ed83a';
import { renderTradeTab, orderBlock, ipoLogo } from './trade.js?v=691ed83a';
import { watchBlock, openWsMsg, setSay, setShowDone, wsTipBar, setGotoTip } from './look.js?v=691ed83a';
import { registerBadge, registerSegBadge, openTab } from './shell.js?v=691ed83a'; // 设计47 看盘改成时间段（开发2）
import * as WSM from '../core/ws.js?v=691ed83a';
import * as LK from '../core/look.js?v=691ed83a';
import { canPay } from '../core/ledger.js?v=691ed83a';
import * as MG from '../core/mgr.js?v=691ed83a'; // 设计44 投资经理自动炒股
import { upgradeBox } from './upgradebox.js?v=691ed83a';
import { makeLive, toNextSub } from '../core/live.js?v=691ed83a';   // 设计55 行情 3 秒刷新

let tab = 'market', sector = '全部', sortBy = 'chg';
const logo = (c, cls = 'sk-logo') => (SK.BY[c] && SK.BY[c].ipo ? ipoLogo(c, cls) : hasAsset(`assets/stock/logo_${c}.webp`) ? `<img class="${cls}" src="${asset(`assets/stock/logo_${c}.webp`)}" alt="">` : `<i class="${cls} ph">${c}</i>`);
const pct = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');   // 红涨绿跌
/** 折线（SVG），values 一串价格 */
export function spark(values, w = 340, hgt = 90) {
  if (!values || values.length < 2) return `<svg width="${w}" height="${hgt}"></svg>`;
  const lo = Math.min(...values), hi = Math.max(...values), k = hi > lo ? (hgt - 8) / (hi - lo) : 0;
  const pts = values.map((v, i) => `${(i / (values.length - 1) * w).toFixed(1)},${(hgt - 4 - (v - lo) * k).toFixed(1)}`).join(' ');
  const col = values.at(-1) >= values[0] ? '#e5484d' : '#2fb37a';
  return `<svg class="sk-spark" viewBox="0 0 ${w} ${hgt}" width="100%" height="${hgt}" preserveAspectRatio="none"><polyline fill="none" stroke="${col}" stroke-width="2" points="${pts}"/></svg>`;
}
/** 涨跌幅：照 A 股跟昨收比（设计41 第九节，跟涨跌停对得上）；没有昨收的按最近一段走势 */
const chgOf = (s, code, v) => { const B = SK.band(s.mkt, code); if (B.close > 0) return v / B.close - 1; const a = s.mkt.hist[code]; return a.length > 1 ? v / a[0] - 1 : 0; };
/** 显示价（设计55：3 秒一小步）；买卖一律 SK.price */
const dpx = (s, code) => SK.showPx(s.mkt, code, now());
const chg = (s, code) => { const B = SK.band(s.mkt, code); if (B.close > 0) return dpx(s, code) / B.close - 1; const a = s.mkt.hist[code]; return a.length > 1 ? a.at(-1) / a[0] - 1 : 0; };

export function renderInvest(body, ctx) {
  const wrap = h('div'); body.appendChild(wrap); hintLater('stocks');
  const draw = () => {
    const s = game.state; const t = now(); SK.advance(s, t); wrap.innerHTML = '';
    const m = s.mkt; const idx = SK.index(s); const ih = m.hist.IDX; const ic = ih.length > 1 ? idx / ih[0] - 1 : 0;
    wrap.appendChild(h('div', 'sk-head', `<div><small>大盘指数</small><b class="${cls(ic)}" data-idx>${SK.showIndex(s, t).toFixed(2)}</b><small class="${cls(ic)}">近 1 小时 ${pct(ic)}</small></div><div><small>行情</small><b>${SK.SCFG.model.regimeName[m.regime.kind]}</b><small>3 秒刷新，一直开盘</small></div>${spark(ih, 340, 60)}`));
    if (LSC.listed(s)) wrap.appendChild(selfCard(s));   // 第 3-04 项：上市以后你自己的股票在最上面
    const nw = m.news.slice(-3).reverse();
    if (nw.length) wrap.appendChild(h('div', 'sk-news', nw.map((n) => `<span class="${n.good ? 'up' : 'down'}">${n.title} ${pct(n.jump)}</span>`).join('　')));
    const tb = h('div', 'tabs');
    for (const [k, n] of [['market', `股票${WSM.unseen(s) ? `<i class="tab-cnt">${WSM.unseen(s)}</i>` : ''}`], ['fund', '基金'], ['hold', `持仓 ${Object.keys(SK.myShares(s)).length}`], ['trade', `打新 · 两融${TR.curIpo(s) && !TR.curIpo(s).sub ? ' ●' : ''}`], ['mgr', '投资经理']]) { const b = h('button', 'tab' + (k === tab ? ' on' : ''), n); b.onclick = () => { tab = k; draw(); }; tb.appendChild(b); }
    wrap.appendChild(tb);
    if (tab === 'market') market(s, wrap, draw); else if (tab === 'trade') renderTradeTab(s, wrap, draw); else if (tab === 'fund') renderFunds(s, wrap, draw); else if (tab === 'hold') hold(s, wrap, draw); else mgr(s, wrap, draw, t);
    wrap.classList.toggle('sk-live', tab === 'market' || tab === 'hold'); if (tab === 'market' || tab === 'hold') setTimeout(() => live.start(), 0);   // 设计55：行情 / 持仓开着才跑 3 秒刷新
  };
  ctx.onCleanup(liveRender(wrap, draw, (fn) => game.onChange(fn), body));
}

// ---------- 设计55 行情 3 秒刷新：只在股票页（行情 / 个股 / 持仓）开着时跑；就地改数字、按比上一小步高 / 低闪红 / 绿 ----------
const flash = (el, nv) => { const ov = +el.dataset.v; el.dataset.v = nv; if (!(ov > 0) || ov === nv) return; el.classList.remove('fl-up', 'fl-dn'); void el.offsetWidth; el.classList.add(nv > ov ? 'fl-up' : 'fl-dn'); };
function liveUpdate() {
  const s = game.state; const m = s.mkt; if (!m) return; const t = now(); const P = {};
  const px = (c) => (P[c] != null ? P[c] : (P[c] = SK.showPx(m, c, t)));
  document.querySelectorAll('.sk-live [data-px]').forEach((el) => { const c = el.dataset.px; const v = px(c); el.textContent = el.dataset.f === 'y' ? yuan(v) : v.toFixed(2); flash(el, v); if (el.dataset.col != null) el.className = cls(chgOf(s, c, v)); else if (el.dataset.cost) el.className = cls(v - +el.dataset.cost); });
  document.querySelectorAll('.sk-live [data-chg]').forEach((el) => { const c = chgOf(s, el.dataset.chg, px(el.dataset.chg)); el.textContent = pct(c); el.className = cls(c); });
  document.querySelectorAll('.sk-live [data-pnl]').forEach((el) => { const v = px(el.dataset.pnl); const n = +el.dataset.n, cost = +el.dataset.cost; const g = (v - cost) * n; el.textContent = `${sgnMoney(g)}（${sgnPct(cost > 0 ? v / cost - 1 : 0)}）`; el.className = cls(g); });
  document.querySelectorAll('.sk-live [data-idx]').forEach((el) => { const v = SK.showIndex(s, t); el.textContent = v.toFixed(2); flash(el, v); });
  document.querySelectorAll('.sk-live [data-eta]').forEach((el) => { el.innerHTML = etaInner({ kind: el.dataset.ek, at: +el.dataset.eta, by: +el.dataset.by }, t); });   // 设计60
  document.querySelectorAll('.sk-live [data-spark]').forEach((el) => { const c = el.dataset.spark; el.innerHTML = spark(m.hist[c].concat(SK.subPath(m, c, t))); });
}
const live = makeLive({ hasRoot: () => [...document.querySelectorAll('.sk-live')].some((e) => e.isConnected && e.offsetParent !== null), update: liveUpdate, schedule: (f, d) => setTimeout(f, d), cancel: (x) => clearTimeout(x), delay: () => toNextSub(now(), SK.SCFG.display.subSec * 1000) });
export const liveRunning = () => live.running();

function market(s, wrap, draw) {
  wrap.appendChild(watchBlock(s, draw));   // 设计47：看盘 = 一个时间段
  const st = h('div', 'tabs');
  for (const n of ['全部', ...SK.SECTORS]) { const b = h('button', 'tab' + (n === sector ? ' on' : ''), n); b.onclick = () => { sector = n; draw(); }; st.appendChild(b); }
  const sb = h('button', 'tab', sortBy === 'chg' ? '按涨跌幅 ↓' : '按市值 ↓'); sb.onclick = () => { sortBy = sortBy === 'chg' ? 'cap' : 'chg'; draw(); }; st.appendChild(sb);
  wrap.appendChild(st);
  const list = SK.live(s.mkt).filter((x) => sector === '全部' || x.sector === sector).sort((a, b) => (sortBy === 'chg' ? chg(s, b.code) - chg(s, a.code) : SK.marketCap(s, b.code) - SK.marketCap(s, a.code)));
  const MY = SK.myShares(s);
  for (const x of list) {
    const c = chg(s, x.code); const hd = MY[x.code];   // V0.2.16：含卖单里的
    const r = h('button', 'sk-row', `${logo(x.code)}<div class="sk-name"><b>${x.name}${{ up: '<i class="lu-tag">涨停</i>', down: '<i class="lu-tag dn">跌停</i>' }[SK.onBoard(s.mkt, x.code)] || ''}</b><small>${x.code} · ${x.sector}${hd ? `　持 ${hd.n.toLocaleString()} 股` : ''}</small></div><div class="sk-px"><b data-px="${x.code}">${dpx(s, x.code).toFixed(2)}</b><small class="${cls(c)}" data-chg="${x.code}">${pct(c)}</small></div>`);
    r.onclick = () => openStock(x.code); wrap.appendChild(r);
  }
}
/** 设计43 第二版：个人现金（挂单的钱已经扣走，就一个数） */
function cashLine(s) { return `<div class="tr-gain cash-line">个人现金 <b>${fmtMoney(s.cash)}</b></div>`; }   // 设计43 第二版：就一个数
/** 设计43 第三节：持仓页顶上「挂单中」：没成交的条件单一张一行，联动单一组排一起，能撤单；没有挂单不出 */
// 设计45 第五版：持仓页分「等着买入」「我的持仓」两块（原来顶上的「挂单中」拆开：买单按股票分组在上面，卖单写在各自持仓下面）
const yuan = (v) => `¥${(+v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sgnMoney = (v) => `${v >= 0 ? '+' : '−'}${fmtMoney(Math.abs(v))}`;
/** 设计45 第五版：「到了赚 +¥X，+x%」红 /「到了亏 −¥X，−x%」绿 */
const earn = (g, p = null) => `<span class="${cls(g)} nw">到了${g < 0 ? '亏' : '赚'} ${sgnMoney(g)}${p != null ? `，${sgnPct(p)}` : ''}</span>`;
const sgnPct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(Math.abs(v) < 0.001 ? 2 : 1)}%`;
function hold(s, wrap, redraw) {
  const t = now(); const V = LK.holdView(s, t);
  const done = (msg) => { toast(msg); AS.recalc(s); game.changed(); game.save(); redraw(); };
  // 一、等着买入
  if (V.buys.length) {
    const box = h('div', 'fn-card hv-buys'); const nb = V.buys.reduce((a, g) => a + g.rows.length, 0);
    box.innerHTML = `<div class="sd-rec-title" style="margin:0 0 4px">等着买入（${nb} 张）<small>　里面放着 ${fmtMoney(V.cash)}</small></div>` + V.buys.map((g) => `<div class="hv-grp"><div class="hv-head"><b>${SK.BY[g.code].name}</b><span>现价 <b>${yuan(g.px)}</b></span></div>${g.rows.map((r) => `<div class="hv-row"><div><b>${yuan(r.X)}</b> 买 ${r.n.toLocaleString()} 股 → ${r.tp != null ? `<b class="${TR.toneOf(r.tp, r.X, 'tp')}">${yuan(r.tp)}</b> 卖${r.sl != null ? ` · 止损 <span class="${TR.toneOf(r.sl, r.X, 'sl')}">${yuan(r.sl)}</span>` : ''}` : r.sl != null ? `止损 <span class="${TR.toneOf(r.sl, r.X, 'sl')}">${yuan(r.sl)}</span>` : '<span class="hv-dim">没挂卖价</span>'}<small>${[r.gain != null ? earn(r.gain) : '', r.src, r.eta ? etaSpan(r.eta) : r.quick ? `还剩 ${Math.max(1, Math.ceil(r.left / 60e3))} 分` : `还剩 ${left(r.left)}`].filter(Boolean).join(' · ')}</small></div><button class="btn sm" data-b="${r.id}">撤单</button></div>`).join('')}</div>`).join('');
    box.querySelectorAll('[data-b]').forEach((b) => (b.onclick = () => { const o = s.mkt.orders.find((x) => x.id === +b.dataset.b); TR.cancelOrder(s, +b.dataset.b, false, now()); done(o && o.back ? `撤了，${fmtMoney(o.back)} 退回个人现金` : '撤了'); }));
    wrap.appendChild(box);
  }
  // 二、我的持仓
  wrap.appendChild(h('div', 'sd-rec-title', '我的持仓'));
  const v = V.hold.reduce((a, x) => a + x.value, 0), p = V.hold.reduce((a, x) => a + x.pnl, 0), c0 = v - p;
  wrap.appendChild(h('div', 'sum-card', `<div><small>持仓市值</small><b>${fmtMoney(v)}</b></div><div><small>浮动盈亏</small><b class="${cls(p)}">${sgnMoney(p)}</b><small class="${cls(p)}">${c0 > 0 ? sgnPct(p / c0) : ''}</small></div>`));
  for (const x of V.hold) {
    const st = SK.stake(s, x.code);
    const card = h('div', 'fn-card hv-hold');
    card.innerHTML = `<div class="hv-top">${logo(x.code)}<b>${SK.BY[x.code].name}</b><span>${x.n.toLocaleString()} 股${x.free < x.n ? `<small>（能卖 ${x.free.toLocaleString()}）</small>` : ''}${st.pct >= 0.001 ? `<small>　占 ${(st.pct * 100).toFixed(2)}%</small>` : ''}</span><button class="btn sm gold hv-add">补仓</button></div>
      <div class="hv-line">现价 <b class="${cls(dpx(s, x.code) - x.cost)}" data-px="${x.code}" data-f="y" data-cost="${x.cost}">${yuan(dpx(s, x.code))}</b>　成本 ${yuan(x.cost)}</div>
      <div class="hv-line">盈亏 <b class="${cls((dpx(s, x.code) - x.cost) * x.n)}" data-pnl="${x.code}" data-n="${x.n}" data-cost="${x.cost}">${sgnMoney((dpx(s, x.code) - x.cost) * x.n)}（${sgnPct(x.cost > 0 ? dpx(s, x.code) / x.cost - 1 : 0)}）</b></div>
      ${x.sells.length ? x.sells.map((r, i) => `<div class="hv-row sell"><div>${r.tp != null ? `卖价 <b class="${TR.toneOf(r.tp, r.cost, 'tp')}">${yuan(r.tp)}</b> 卖 ${r.n.toLocaleString()} 股（${earn(r.gain, r.pct)}）` : `止损 <b class="${TR.toneOf(r.sl, r.cost, 'sl')}">${yuan(r.sl)}</b> 卖 ${r.n.toLocaleString()} 股（${earn(r.slGain, r.slPct)}）`}<small>${[r.tp != null && r.sl != null ? `止损 <span class="${TR.toneOf(r.sl, r.cost, 'sl')}">${yuan(r.sl)}</span>（${earn(r.slGain, r.slPct)}）` : '', r.src, r.eta ? etaSpan(r.eta) : r.quick ? `还剩 ${Math.max(1, Math.ceil(r.left / 60e3))} 分` : `还剩 ${left(r.left)}`].filter(Boolean).join(' · ')}</small></div><button class="btn sm" data-s="${i}">撤单</button></div>`).join('') : '<div class="hv-line hv-dim">卖价 没挂</div>'}`;
    card.onclick = (e) => { if (e.target.closest('button')) return; openStock(x.code); };
    card.querySelector('.hv-add').onclick = (e) => { e.stopPropagation(); openTopUp(x.code, redraw); };   // 设计57
    card.querySelectorAll('[data-s]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const n = LK.cancelSell(s, x.sells[+b.dataset.s].ids, now()); done(n ? `撤了，${n.toLocaleString()} 股回到能卖的` : '撤了'); }));
    wrap.appendChild(card);
  }
  if (!V.hold.length) wrap.appendChild(h('div', 'empty', '还没有持仓：去「行情」挑一只'));
  wrap.appendChild(h('div', 'tr-gain', '股票只能用个人现金；买卖收佣金 0.025%（最低 5 元）、过户费 0.001%，卖出另收印花税 0.05%；A 股差价免个税，分红按持有时间扣个税（不到 1 个游戏月 20%、满 1 个游戏月 10%、满 1 个游戏年免）。挂在卖单里的股票不能再卖，个股页「全部卖出」只卖没挂单的。'));
}
/** 设计57 补仓弹框（游戏自己的框）：⅓ / 半 / 全仓按个人现金算、100 股一手；按成本价马上成交 */
export function openTopUp(code, after) {
  const s = game.state; const x = SK.BY[code]; const T = TR.topUpBox(s, code); if (!T) { toast('没有这只的持仓'); return null; }
  const p = openPanel(`补仓 · ${x.name}（按成本 ${yuan(T.cost)}）`);
  const draw = () => {
    const ops = TR.topUpOptions(s, code);
    p.body.innerHTML = `<div class="tu-top">${logo(code)}<div><b>${x.name}</b><small>现价 ${yuan(SK.price(s, code))} · 成本 ${yuan(T.cost)} · 个人现金能花 ${fmtMoney(Math.max(0, TR.availCash(s)))}</small><small>${T.box ? `补的股票并进挂着的卖单（${T.n.toLocaleString()} 股那张），按原来的卖价、原来的时限一起卖` : '补的股票进可卖持仓'}</small></div></div>
      <div class="tu-ops">${ops.map((o) => `<button class="btn ${o.n ? 'gold' : ''} tu-op" data-k="${o.k}" ${o.n ? '' : 'disabled'}><b>${o.name}</b>${o.n ? `<small>花 ${fmtMoney(o.total)} 补 ${o.n.toLocaleString()} 股</small>${o.tp ? `<small class="up">到 ${yuan(o.tp.px)} 卖出多赚 ${fmtMoney(Math.abs(o.tp.gain))}</small>` : ''}${o.sl ? `<small class="down">止损多亏 ${fmtMoney(Math.abs(o.sl.loss))}</small>` : ''}` : '<small>不够一手（100 股）</small>'}</button>`).join('')}</div>
      <div class="tr-gain">按成本价马上成交，不看现价、不影响股价；佣金、过户费照收。不算跟单次数。</div>`;
    p.body.querySelectorAll('.tu-op').forEach((b) => (b.onclick = () => { const o = ops.find((y) => y.k === b.dataset.k); const r = TR.topUp(game.state, code, o.n, now()); if (!r.ok) { toast(r.why); return; } p.close(); toast(`补了 ${r.n.toLocaleString()} 股，按成本 ${yuan(r.cost)}，花 ${fmtMoney(r.total)}`); AS.recalc(game.state); game.changed(); game.save(); if (after) after(); }));
  };
  draw(); return p;
}
/** 设计60 看盘单的倒计时：等着买入按预计到低点、已买进按预计卖出；小字最晚按现价卖；预计时间过了写「还没涨到卖价」（现实时间，跟 3 秒刷新走） */
const mm = (ms) => Math.max(1, Math.round(ms / 60e3));
function etaText(e, t = now()) {
  const a = e.at - t, by = mm(e.by - t);
  if (e.kind === 'buy') return { main: a < 60e3 ? '马上买入' : `约 ${mm(a)} 分钟后到低点买入`, sub: `最晚 ${by} 分钟后按现价卖` };
  if (a <= 0) return { main: `还没涨到卖价 · 最晚 ${by} 分钟后按现价卖`, sub: '', late: true };
  return { main: a < 60e3 ? '马上卖出' : `预计 ${mm(a)} 分钟后卖出`, sub: `最晚 ${by} 分钟后按现价卖` };
}
const etaInner = (e, t) => { const x = etaText(e, t); return `<b class="eta-main${x.late ? ' late' : ''}">${x.main}</b>${x.sub ? `<i class="eta-sub">${x.sub}</i>` : ''}`; };
const etaSpan = (e) => `<span class="eta" data-eta="${e.at}" data-by="${e.by}" data-ek="${e.kind}">${etaInner(e)}</span>`;
const left = (ms) => { const m = Math.max(0, Math.round(ms / 60e3)); return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`; };   // 现实时间（设计44 下一轮倒计时）
function mgr(s, wrap, draw, t) {   // 设计44：投资经理自动炒股（每天 0 / 6 / 12 / 18 点各一轮）
  const w = holder(s, 'invest'); const g = s.mkt.mgr;
  if (!w) { wrap.appendChild(h('div', 'empty', '还没有投资经理：去「秘书 → 职位」任命（智慧高的打星）')); return; }
  const wit = Math.round(SK.mgrWit(s, t));
  wrap.appendChild(h('div', 'mg-who', `${isSec(w) ? `<img src="${asset(`assets/sec/${w}/c1.webp`)}" alt="">` : '<i class="msg-ico">🏦</i>'}<div><b>${isSec(w) ? SEC_BY_ID[w].name : '外包：券商投顾'}</b><small>智慧 ${isSec(w) ? `${s.secs[w].attrs ? s.secs[w].attrs.wit : ''}（算上职位效率 ${wit}）` : '按 50 算'}　每轮看得到 ${MG.seeOf(wit)} 只</small></div>`));
  wrap.appendChild(h('div', 'tr-gain', '她每天 0 / 6 / 12 / 18 点各炒一轮：看接下来 2 小时的走势，挑最多 3 只（涨停优先），她手上的钱全部平分，一定成交、一定赚。每轮卖完赚的 10% 是她的提成（公司或家族办公室付；外包收「投顾服务费」）。她最多管下一个称号门槛的 10%，超过的赚头每轮自动转回你的个人现金。她的买卖在她自己的账上，不进你的持仓。'));
  if (g) {
    wrap.appendChild(h('div', 'sum-card mg-sum', `<div><small>她手上 / 最多管</small><b>${fmtMoney(g.value)}</b><small>/ ${fmtMoney(SK.mgrCap(s))}　本金 ${fmtMoney(g.principal)}</small></div><div><small>累计赚</small><b class="${cls(g.earn || 0)}">${fmtMoney(g.earn || 0)}</b><small>转回你 ${fmtMoney(g.back || 0)}　提成 ${fmtMoney(g.fees || 0)}</small></div>`));
    const nx = MG.nextRound(t); const c = g.cur;
    const cur = h('div', 'mg-cur');
    cur.innerHTML = `<div class="sd-rec-title">${c ? `${new Date(c.at).getHours()} 点这一轮（进行中，投了 ${fmtMoney(c.inv)}）` : `下一轮：${nx.hour} 点（还有 ${left(nx.at - t)}）`}</div>`
      + (c ? c.legs.map((x) => `<div class="mg-leg">${x.lu ? '🔥 ' : ''}<b>${SK.BY[x.code].name}</b> ${x.n.toLocaleString()} 股　¥${x.X} 以内买${x.bought ? `<span class="pos">（¥${x.bp} 买进了）</span>` : '（还没成交）'}　涨到 ¥${x.Y} 卖${x.sold ? `<span class="pos">（¥${x.sp} 卖了）</span>` : x.bought ? '（等着卖）' : ''}</div>`).join('') : '')
      + (c ? `<small class="fn-note">下一轮：${nx.hour} 点（还有 ${left(nx.at - t)}）</small>` : '');
    wrap.appendChild(cur);
    const hs = g.hist || [];
    const hb = h('div', 'mg-hist'); hb.innerHTML = `<div class="sd-rec-title">最近 ${hs.length} 轮</div>` + (hs.length ? hs.map((r) => { const d = new Date(r.at); return `<div class="mg-row"><span>${d.getMonth() + 1}/${d.getDate()} ${d.getHours()} 点</span><span>${r.rows.length ? `${r.rows.length} 只${r.lu ? `　🔥×${r.lu}` : ''}` : '没动'}</span><b class="${cls(r.pnl)}">${r.pnl ? fmtMoney(r.pnl) : '—'}</b><small class="mg-back">${r.back ? `转回 ${fmtMoney(r.back)}` : ''}</small></div>`; }).join('') : '<div class="empty">还没炒过：等下一轮</div>');
    wrap.appendChild(hb);
  } else { const nx = MG.nextRound(t); wrap.appendChild(h('div', 'tr-gain', `划钱给她，下一轮 ${nx.hour} 点（还有 ${left(nx.at - t)}）开始炒。`)); }
  const box = h('div', 'mg-give'); wrap.appendChild(box);
  const rd = () => {   // 设计44 第二版：划钱只填金额，写最多管多少、还能划多少
    const cap = SK.mgrCap(s), cur = (s.mkt.mgr && s.mkt.mgr.value) || 0, room = SK.mgrRoom(s); const all = Math.min(room, Math.max(0, SK.availCash(s)));
    box.innerHTML = `<div class="sd-rec-title">划钱给她</div><div class="tr-gain">她最多管 <b>${fmtMoney(cap)}</b>，现在 ${fmtMoney(cur)}，还能再划 <b>${fmtMoney(room)}</b>（升称号上限变大；超过的划不进去）</div>
      <div class="ind-btns" style="margin-top:8px">${[1e5, 1e6, 1e7].map((a) => `<button class="btn gold" data-a="${a}" ${a > room + 0.005 ? 'disabled' : ''}>划 ${a / 1e4} 万</button>`).join('')}<button class="btn gold" data-a="${all}" ${all >= 1 ? '' : 'disabled'}>划满<small>${fmtMoney(all)}</small></button>${g ? '<button class="btn back">全部收回</button>' : ''}</div>`;
    box.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { const r = SK.giveMgr(s, +b.dataset.a, now()); if (!r.ok) { toast(r.why); return; } toast('划过去了'); AS.recalc(s); game.changed(); game.save(); draw(); }));
    const bk = box.querySelector('.back'); if (bk) bk.onclick = () => { const r = SK.takeBack(s, now()); if (!r.ok) { toast(r.why); return; } toast(`收回 ${fmtMoney(r.amount)}`); AS.recalc(s); game.changed(); game.save(); draw(); };
  };
  rd();
}

/** 个股 */
export function openStock(code) {
  const s = game.state; const x = SK.BY[code]; const p = openPanel(`${x.name}（${code}）`); p.body.classList.add('sk-live'); setTimeout(() => live.start(), 0);   // 设计55
  let range = 'recent', n = 100;
  const render = () => {
    SK.advance(s, now());
    const m = s.mkt; const px = SK.price(s, code); const c = chg(s, code); const hd = m.hold[code]; const my = SK.myShares(s)[code]; const vis = bossAttrs(s).vision;
    const ind = SK.indicators(s, code, vis); const st = SK.stake(s, code);
    const qb = SK.quote(s, code, n, 'buy'), qs = hd ? SK.quote(s, code, Math.min(n, hd.n), 'sell') : null;
    p.body.innerHTML = `<div class="sk-top">${logo(code, 'sk-logo big')}<div><b class="${cls(c)}" style="font-size:24px" data-px="${code}" data-col>${dpx(s, code).toFixed(2)}</b> <small class="${cls(c)}" data-chg="${code}">${pct(c)}</small>${x.desc ? `<div class="tr-gain">${x.desc}（新股）</div>` : ''}<div class="tr-gain">${x.sector} · 市值 ${fmtMoney(SK.marketCap(s, code))} · 股息率 ${(x.div * 100).toFixed(1)}% / 年</div>${(() => { const B = SK.band(m, code); const bd = SK.onBoard(m, code); return B.up != null ? `<div class="tr-gain band-row">今天涨停 <b class="up">${B.up.toFixed(2)}</b>　跌停 <b class="down">${B.dn.toFixed(2)}</b>　昨收 ${B.close.toFixed(2)}${bd ? `　<i class="lu-tag ${bd === 'down' ? 'dn' : ''}">${bd === 'up' ? '涨停' : '跌停'}</i>` : ''}</div>` : ''; })()}</div></div>
      <div class="tabs"><button class="tab ${range === 'recent' ? 'on' : ''}" data-r="recent">1 小时</button><button class="tab ${range === 'long' ? 'on' : ''}" data-r="long">全部</button></div>
      ${range === 'recent' ? `<div data-spark="${code}">${spark(m.hist[code].concat(SK.subPath(m, code, now())))}</div>` : spark(m.long[code])}
      <div class="tr-gain">${ind.length ? ind.map(([k, v]) => `${k} <b>${v}</b>`).join('　') : '技术指标：老板眼光每 10 点多看一档（均线 → 成交活跃度 → 资金流向）'}</div>
      ${cashLine(s)}
      ${my ? `<div class="tr-course"><button class="btn sm gold sk-add" style="float:right">补仓</button><div><b>持股 ${my.n.toLocaleString()} 股${TR.lockedShares(s, code) ? `（其中 ${TR.lockedShares(s, code).toLocaleString()} 股在卖单里）` : ''}</b><div class="tr-gain">成本 ${my.cost.toFixed(2)}　市值 ${fmtMoney(my.n * px)}　盈亏 <span class="${cls(px - my.cost)}">${fmtMoney((px - my.cost) * my.n)}</span>${st.pct >= 0.0001 ? `　占总股本 ${(st.pct * 100).toFixed(3)}%（举牌 5%、要约收购进度 ${(st.toTender * 100).toFixed(0)}%）` : ''}</div></div></div>` : ''}
      <div class="sd-rec-title">股数</div><div class="tabs">${[100, 1000, 10000, 100000, 1000000].map((k) => `<button class="tab ${k === n ? 'on' : ''}" data-n="${k}">${k >= 10000 ? k / 10000 + ' 万' : k} 股</button>`).join('')}</div>
      <div class="tr-gain">买 ${n.toLocaleString()} 股：成交价 ${qb.exec}${qb.impact ? `（大单滑点 +${(qb.impact * 100).toFixed(2)}%）` : ''}，佣金过户费 ${fmtMoney(qb.fees)}，共 <b>${fmtMoney(qb.total)}</b>${qs ? `<br>卖 ${Math.min(n, hd.n).toLocaleString()} 股：到手 <b>${fmtMoney(qs.total)}</b>（含印花税 ${fmtMoney(qs.stamp)}）` : ''}</div>
      <div class="ind-btns"><button class="btn gold buy">买入</button>${hd ? '<button class="btn sell">卖出</button>' : ''}</div>
      ${allBtns(s, code)}
      <div class="tr-orders"></div>
      <div class="sd-rec-title">相关新闻</div>${m.news.filter((y) => y.target === code || y.target === x.sector || y.kind === 'market').slice(-5).reverse().map((y) => `<div class="tr-gain ${y.good ? 'up' : 'down'}">${y.title} ${pct(y.jump)}</div>`).join('') || '<div class="tr-gain">最近没有</div>'}`;
    if (SK.unlocked(s) || SK.myShares(s)[code]) { const ib = p.body.querySelector('.ind-btns'); if (ib) ib.after(takeoverBlock(s, code, render)); }   // 第 3-05 项
    const ob = p.body.querySelector('.tr-orders'); if (ob) ob.replaceWith(orderBlock(s, code, n, render));   // 第 P-06 项：条件单、融资买入
    p.body.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { range = b.dataset.r; render(); }));
    p.body.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { n = +b.dataset.n; render(); }));
    { const ab = p.body.querySelector('.sk-add'); if (ab) ab.onclick = () => openTopUp(code, render); }   // 设计57
    p.body.querySelector('.buy').onclick = () => { const co = buyerOf() === 'co'; const r = co ? TKO.coBuy(s, code, n, now()) : SK.buy(s, code, n, now()); if (!r.ok) { toast(r.why); return; } toast(`${co ? '公司' : ''}买好了：${r.slip.no}`); if (r.stake && r.stake.notice) say(s.current, `老板，公司成了${x.name}的举牌股东——持股到 ${Math.round(r.stake.level * 100)}%，要发公告了！`, 4200); AS.recalc(s); game.changed(); game.save(); render(); };
    bindAll(s, code, p.body, render);   // 任务板 V0.2.11 第 1e 项：全仓买入 / 全部卖出
    const sb = p.body.querySelector('.sell'); if (sb) sb.onclick = () => { const r = TR.sellMine(s, code, Math.min(n, hd.n), now()); if (!r.ok) { toast(r.why); return; } toast(`卖了，${r.gain >= 0 ? '赚' : '亏'} ${fmtMoney(Math.abs(r.gain))}（${r.slip.no}）`); AS.recalc(s); game.changed(); game.save(); render(); };
  };
  render();
}

// —— 任务板 V0.2.11 第 1e 项（Arvin 加）：全仓买入（个人现金 / 公司自有资金）、全部卖出 ——
function allBtns(s, code) {
  const co = buyerOf() === 'co'; const nb = co ? TKO.maxCoBuy(s, code) : SK.maxBuyMe(s, code); const ns = SK.maxSellMe(s, code);
  const qb = nb ? SK.quote(s, code, nb, 'buy') : null; const qs = ns ? SK.quote(s, code, ns, 'sell') : null;
  return `<div class="ind-btns all-btns"><button class="btn ${nb ? 'gold' : ''} buy-all" ${nb ? '' : 'disabled'}>${nb ? `全仓买入 ${nb.toLocaleString()} 股<small>约 ${fmtMoney(qb.total)}（${co ? '公司自有资金' : '全部个人现金'}）</small>` : `全仓买入<small>钱不够</small>`}</button>${ns ? `<button class="btn sell-all">全部卖出 ${ns.toLocaleString()} 股${TR.lockedShares(s, code) ? `（另有 ${TR.lockedShares(s, code).toLocaleString()} 股在卖单里）` : ''}<small>约到手 ${fmtMoney(qs.total)}</small></button>` : ''}</div>`;
}
function bindAll(s, code, el, render) {
  const b = el.querySelector('.buy-all'); if (b) b.onclick = () => {
    const co = buyerOf() === 'co'; const n = co ? TKO.maxCoBuy(s, code) : SK.maxBuyMe(s, code); if (!n) { toast('钱不够'); return; }
    if (co && !canPay(s, 'company', SK.quote(s, code, n, 'buy').total)) { toast('公司账户不够：要留工资社保和房租'); return; }   // 走工资提醒（V0.2.9）
    const r = co ? TKO.coBuy(s, code, n, now()) : SK.buy(s, code, n, now()); if (!r.ok) { toast(r.why); return; }
    toast(`全仓买好了：${n.toLocaleString()} 股（${r.slip.no}）`); AS.recalc(s); game.changed(); game.save(); render();
  };
  const sl = el.querySelector('.sell-all'); if (sl) sl.onclick = () => { const n = SK.maxSellMe(s, code); const r = TR.sellMine(s, code, n, now()); if (!r.ok) { toast(r.why); return; } toast(`全部卖了，${r.gain >= 0 ? '赚' : '亏'} ${fmtMoney(Math.abs(r.gain))}`); AS.recalc(s); game.changed(); game.save(); render(); };
}

// 每秒：走到现在、分红、经理汇报、大新闻、看盘（设计47）
setSay((who, text) => say(who, text, 4200));
// 设计48：看盘提示放股票页 —— 没看过的条数：底下「财富」、「投资」分段、「股票」页签都写
registerBadge('wealth', (s) => ({ count: s.mkt ? WSM.unseen(s) : 0 }));
registerSegBadge('wealth', 'invest', (s) => (s.mkt ? WSM.unseen(s) : 0));
/** 小提示条点了：跳到 财富 → 投资 → 股票，滚到看盘卡片，弹开那一条 */
setGotoTip((m) => {
  tab = 'market'; document.querySelectorAll('.panel-mask').forEach((x) => x.remove()); openTab('wealth', 'invest');
  setTimeout(() => { const b = document.querySelector('.ws-box'); if (b) b.scrollIntoView({ block: 'start' }); openWsMsg(m); }, 120);
});
setShowDone((d) => { if (d) game.changed(); });   // 战绩框由 ticker 的 takeDone 弹（结束看盘时也走那里）
game.addTicker((s) => {
  if (!SK.unlocked(s) && !s.mkt) return;
  const t = now(); const r = SK.advance(s, t, { live: true });
  TR.tick(s, t); const g = s.mkt.margin; if (g && g.warnNew) { g.warnNew = false; const w = TR.wisest(s); if (w) say(w, '老板，融资那块的担保比例快到警戒线了，要不要先还一点？', 4200); }   // 第 P-06 项
  for (const x of TKO.tick(s, t)) toast(x, 3000);   // 第 3-05 项：要约期满
  for (const n of r.news) if (Math.abs(n.jump) >= 0.05 && r.ticks <= 2) INB.addMsg(s, { kind: 'system', type: 'stock_news', title: `${n.title} ${n.jump > 0 ? '+' : ''}${(n.jump * 100).toFixed(1)}%`, body: '财富 → 投资' }, t);
  if (r.ticks > 2 && r.news.length) { const big = r.news.slice().sort((a, b) => Math.abs(b.jump) - Math.abs(a.jump)).slice(0, 5); INB.addMsg(s, { kind: 'system', type: 'stock_news', title: '你不在的时候，股市里……', body: big.map((n) => `${n.title} ${(n.jump * 100).toFixed(1)}%`).join('\n') }, t); }
  for (const x of WSM.takeToast(s)) wsTipBar(x);
  for (const x of WSM.takeWrong(s)) { say(x.who, x.line, 4500); toast(`${SEC_BY_ID[x.who] ? SEC_BY_ID[x.who].name : ''}：「${x.line}」（这单亏了 ${fmtMoney(Math.abs(x.pnl))}）`, 4500); }   // 设计53：跟了她说错的、亏了，她说一句（在股票页也看得到）
  for (const x of TR.takeSold(s)) toast(`到时间按现价卖出：${SK.BY[x.code].name} ${x.n.toLocaleString()} 股 ${x.pnl >= 0 ? '+' : '−'}${fmtMoney(Math.abs(x.pnl))}`, 3500);   // 设计51   // 设计47：看盘发了消息，弹个小提示条，点了打开那条消息
  { const d = WSM.takeDone(s); if (d) upgradeBox({ title: '看盘结束', what: `${SEC_BY_ID[d.who] ? SEC_BY_ID[d.who].name : ''}盯完了：发了 ${d.sent} 条，你挂了 ${d.placed} 条${d.pnl ? `，${d.pnl >= 0 ? '赚' : '亏'} ${fmtMoney(Math.abs(d.pnl))}` : ''}；她说对了 ${d.right || 0} 条、错了 ${d.wrong || 0} 条`, sub: '这段时间', gains: [], line: d.line, sec: SEC_BY_ID[d.who] ? d.who : null }); }
  const dv = SK.dividends(s, t); if (dv.length) toast(`股票分红到账 ${fmtMoney(dv.reduce((a, x) => a + x.amt - x.tax, 0))}`, 2600);
  const pop = MG.takePop(s, t); if (pop) upgradeBox({ title: '抓到涨停！', what: `${isSec(pop.who) ? SEC_BY_ID[pop.who].name : '券商投顾'}：${SK.BY[pop.code].name} 抓到涨停，这一笔 +${(pop.pct * 100).toFixed(1)}%`, sub: '投资经理这一轮', gains: [], line: pop.line, sec: isSec(pop.who) ? pop.who : null });   // 设计44
  if (r.ticks) AS.recalc(s);
});

// ---------- 第 3-05 项 + 验收阶段三：个人买 / 公司买、公司持股、转给公司、要约收购（公司账户 + 并购贷款）、控股 ----------
let buyAs = 'me', useLoan = false;
export const buyerOf = () => buyAs;
function takeoverBlock(s, code, redraw) {
  const T = TKO.TCFG; const p = TKO.pctOf(s, code); const mp = TKO.myPct(s, code); const o = TKO.tk(s).offers[code]; const ctrl = TKO.controls(s, code); const t = now();
  const ch = TKO.coHold(s)[code]; const px = SK.price(s, code);
  const el = h('div', 'fn-card tk-box'); if (buyAs === 'co' || p > 0) hintLater('takeover');
  const lv = Math.floor(p / SK.SCFG.stake.notice + 1e-9) * SK.SCFG.stake.notice;
  el.innerHTML = `<div class="fn-row"><span><b>用谁的钱买</b></span><b class="tabs tk-as"><button class="tab ${buyAs === 'me' ? 'on' : ''}" data-as="me">个人买</button><button class="tab ${buyAs === 'co' ? 'on' : ''}" data-as="co">公司买</button></b></div>
    <small class="fn-note">${buyAs === 'me' ? `个人买只算投资：最多 ${SK.SCFG.stake.notice * 100}% 以下，不举牌、不能要约。` : '公司买（公司账户自有资金）：举牌、到 30% 发要约、50% 控股并进集团；卖出赚的交企业所得税。'}</small>
    <div class="fn-row"><span>个人持股</span><b>${(mp * 100).toFixed(2)}%</b></div>
    <div class="fn-row"><span><b>公司持股</b>${ch ? `<small>${ch.n.toLocaleString()} 股 · 市值 ${fmtMoney(ch.n * px)} · 成本 ${ch.cost.toFixed(2)}</small>` : ''}</span><b class="${ctrl ? 'pos' : ''}">${(p * 100).toFixed(2)}%${ctrl ? '（控股股东）' : ''}</b></div>
    <div class="tk-bar"><i style="width:${Math.min(100, p * 100)}%"></i><em style="left:5%"></em><em style="left:30%"></em><em style="left:50%"></em></div>
    <small class="fn-note">公司持股每过 5% 举牌公告一次（股价跳 3%）${lv ? `，已经公告到 ${(lv * 100).toFixed(0)}%` : ''}；二级市场最多到 30%，再往上发要约；到 50% 控股。</small>`;
  el.querySelectorAll('[data-as]').forEach((b) => (b.onclick = () => { buyAs = b.dataset.as; redraw(); }));
  const acts = h('div', 'ind-btns');
  if (TKO.transferQuote(s, code) && TKO.transferQuote(s, code).n > 0) { const q = TKO.transferQuote(s, code); const why = TKO.whyNotTransfer(s, code); const b = h('button', 'btn sm', `个人的 ${q.n.toLocaleString()} 股按现价转给公司（${fmtMoney(q.amount)}，个税 ${fmtMoney(q.tax)}）`); b.disabled = !!why; b.title = why || ''; b.onclick = () => { const r = TKO.transfer(s, code, now()); if (!r.ok) { toast(r.why); return; } toast(`转给公司了：${r.contract.no}`, 2600); game.changed(); game.save(); redraw(); }; acts.appendChild(b); }
  if (ch && !o) { const n = Math.min(ch.n, Math.max(100, Math.round(ch.n / 10))); const b = h('button', 'btn sm', `公司卖出 ${n.toLocaleString()} 股（约 ${fmtMoney(n * px)}）`); b.onclick = () => { const r = TKO.coSell(s, code, n, now()); if (!r.ok) { toast(r.why); return; } toast(`公司卖了，${r.gain >= 0 ? '赚' : '亏'} ${fmtMoney(Math.abs(r.gain))}`); game.changed(); game.save(); redraw(); }; acts.appendChild(b); }
  if (acts.children.length) el.appendChild(acts);
  if (o) el.appendChild(h('div', 'tr-gain', `要约进行中（公司账户${o.loan ? ' + 并购贷款' : ''}）：每股 ${o.price} 元，目标 ${o.target * 100}%，还有 ${fmtDuration(Math.max(0, (o.end - t) / 1000))}（现价 ${px.toFixed(2)}，预计接受 ${(TKO.acceptRate(s, code, o.price) * 100).toFixed(0)}%）`));
  else if (p >= SK.SCFG.stake.notice && !ctrl) {
    el.appendChild(h('div', 'sd-rec-title', `要约收购（公司账户；最低价 = 最近 ${T.avgDays} 个游戏天均价 ${TKO.avgPrice(s, code)}）`));
    const lt = h('div', 'tabs', `<button class="tab ${useLoan ? '' : 'on'}" data-l="0">只用公司自有资金</button><button class="tab ${useLoan ? 'on' : ''}" data-l="1">加并购贷款（最多 60%）</button>`); lt.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => { useLoan = b.dataset.l === '1'; redraw(); })); el.appendChild(lt);
    for (const target of T.targets.filter((x) => x > p)) {
      const row = h('div', 'ind-btns');
      for (const pr of T.premiums) { const q = TKO.offerQuote(s, code, target, pr); const why = TKO.whyNotOffer(s, code, target, pr, useLoan); const b = h('button', 'btn sm' + (why ? '' : ' gold'), `到 ${target * 100}%${pr ? ` 溢价 ${pr * 100}%` : ''}<small>${q.price} 元 · 约 ${fmtMoney(q.cost)} · 约接受 ${(TKO.acceptRate(s, code, q.price) * 100).toFixed(0)}%</small>`); b.disabled = !!why; b.title = why || ''; b.onclick = () => { const r = TKO.offer(s, code, target, pr, now(), { loan: useLoan }); if (!r.ok) { toast(r.why); return; } toast(`要约收购报告书发出去了：${r.contract.no}`, 2600); game.changed(); game.save(); redraw(); }; row.appendChild(b); }
      el.appendChild(row);
    }
  }
  return el;
}
game.on('tabHome', () => { tab = 'market'; }); // 从底下导航点进来：回到第一个小页签
