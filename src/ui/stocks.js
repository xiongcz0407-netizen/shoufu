// 「财富 → 投资」股票（第 2-09 项，设计12 第八节）：行情 | 持仓 | 投资经理；点一只 → 个股（分时、指标、买卖、新闻、持仓）
import * as SK from '../core/stocks.js?v=598ef1ae';
import * as AS from '../core/assets.js?v=598ef1ae';
import * as INB from '../core/inbox.js?v=598ef1ae';
import { bossAttrs } from '../core/boss.js?v=598ef1ae';
import { holder, isSec } from '../core/posts.js?v=598ef1ae';
import { SEC_BY_ID } from '../config/secretaries.js?v=598ef1ae';
import { fmtMoney, fmtDuration } from '../core/format.js?v=598ef1ae';
import { asset, hasAsset } from '../platform/assets.js?v=598ef1ae';
import { game } from '../game.js?v=598ef1ae';
import { now } from '../core/clock.js?v=598ef1ae';
import { h, openPanel, toast, liveRender } from './dom.js?v=598ef1ae';
import { say } from './main-screen.js?v=598ef1ae';
import { renderFunds } from './funds.js?v=598ef1ae';
import { hintLater } from './guide2.js?v=598ef1ae';
import * as LSC from '../core/listing.js?v=598ef1ae';
import { selfCard } from './listing.js?v=598ef1ae';
import * as TKO from '../core/takeover.js?v=598ef1ae';
import * as TR from '../core/trade.js?v=598ef1ae';
import { renderTradeTab, orderBlock, watchRow, ipoLogo } from './trade.js?v=598ef1ae';

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
const chg = (s, code) => { const a = s.mkt.hist[code]; return a.length > 1 ? a.at(-1) / a[0] - 1 : 0; };

export function renderInvest(body, ctx) {
  const wrap = h('div'); body.appendChild(wrap); hintLater('stocks');
  const draw = () => {
    const s = game.state; const t = now(); SK.advance(s, t); wrap.innerHTML = '';
    const m = s.mkt; const idx = SK.index(s); const ih = m.hist.IDX; const ic = ih.length > 1 ? idx / ih[0] - 1 : 0;
    wrap.appendChild(h('div', 'sk-head', `<div><small>大盘指数</small><b class="${cls(ic)}">${idx.toFixed(2)}</b><small class="${cls(ic)}">近 1 小时 ${pct(ic)}</small></div><div><small>行情</small><b>${SK.SCFG.model.regimeName[m.regime.kind]}</b><small>每 30 秒一跳，一直开盘</small></div>${spark(ih, 340, 60)}`));
    if (LSC.listed(s)) wrap.appendChild(selfCard(s));   // 第 3-04 项：上市以后你自己的股票在最上面
    const nw = m.news.slice(-3).reverse();
    if (nw.length) wrap.appendChild(h('div', 'sk-news', nw.map((n) => `<span class="${n.good ? 'up' : 'down'}">${n.title} ${pct(n.jump)}</span>`).join('　')));
    const tb = h('div', 'tabs');
    for (const [k, n] of [['market', '股票'], ['fund', '基金'], ['hold', `持仓 ${SK.holdings(s).length}`], ['trade', `打新 · 两融${TR.curIpo(s) && !TR.curIpo(s).sub ? ' ●' : ''}`], ['mgr', '投资经理']]) { const b = h('button', 'tab' + (k === tab ? ' on' : ''), n); b.onclick = () => { tab = k; draw(); }; tb.appendChild(b); }
    wrap.appendChild(tb);
    if (tab === 'market') market(s, wrap, draw); else if (tab === 'trade') renderTradeTab(s, wrap, draw); else if (tab === 'fund') renderFunds(s, wrap, draw); else if (tab === 'hold') hold(s, wrap); else mgr(s, wrap, draw, t);
  };
  ctx.onCleanup(liveRender(wrap, draw, (fn) => game.onChange(fn), body));
}

function market(s, wrap, draw) {
  wrap.appendChild(watchRow(s, draw));   // 第 P-06 项：看盘开局就能派
  const st = h('div', 'tabs');
  for (const n of ['全部', ...SK.SECTORS]) { const b = h('button', 'tab' + (n === sector ? ' on' : ''), n); b.onclick = () => { sector = n; draw(); }; st.appendChild(b); }
  const sb = h('button', 'tab', sortBy === 'chg' ? '按涨跌幅 ↓' : '按市值 ↓'); sb.onclick = () => { sortBy = sortBy === 'chg' ? 'cap' : 'chg'; draw(); }; st.appendChild(sb);
  wrap.appendChild(st);
  const list = SK.live(s.mkt).filter((x) => sector === '全部' || x.sector === sector).sort((a, b) => (sortBy === 'chg' ? chg(s, b.code) - chg(s, a.code) : SK.marketCap(s, b.code) - SK.marketCap(s, a.code)));
  for (const x of list) {
    const c = chg(s, x.code); const hd = s.mkt.hold[x.code];
    const r = h('button', 'sk-row', `${logo(x.code)}<div class="sk-name"><b>${x.name}</b><small>${x.code} · ${x.sector}${hd ? `　持 ${hd.n.toLocaleString()} 股` : ''}</small></div><div class="sk-px"><b>${SK.price(s, x.code).toFixed(2)}</b><small class="${cls(c)}">${pct(c)}</small></div>`);
    r.onclick = () => openStock(x.code); wrap.appendChild(r);
  }
}
function hold(s, wrap) {
  const hs = SK.holdings(s); const v = hs.reduce((a, x) => a + x.value, 0), p = hs.reduce((a, x) => a + x.pnl, 0);
  wrap.appendChild(h('div', 'sum-card', `<div><small>持仓市值</small><b>${fmtMoney(v)}</b></div><div><small>浮动盈亏</small><b class="${cls(p)}">${fmtMoney(p)}</b></div>`));
  for (const x of hs) {
    const st = SK.stake(s, x.code);
    const r = h('button', 'sk-row', `${logo(x.code)}<div class="sk-name"><b>${SK.BY[x.code].name}</b><small>${x.n.toLocaleString()} 股　成本 ${x.cost.toFixed(2)}${st.pct >= 0.001 ? `　占 ${(st.pct * 100).toFixed(2)}%` : ''}</small></div><div class="sk-px"><b>${fmtMoney(x.value)}</b><small class="${cls(x.pnl)}">${fmtMoney(x.pnl)}</small></div>`);
    r.onclick = () => openStock(x.code); wrap.appendChild(r);
  }
  if (!hs.length) wrap.appendChild(h('div', 'empty', '还没有持仓：去「行情」挑一只'));
  wrap.appendChild(h('div', 'tr-gain', '股票只能用个人现金；买卖收佣金 0.025%（最低 5 元）、过户费 0.001%，卖出另收印花税 0.05%；A 股差价免个税，分红按持有时间扣个税（不到 1 个游戏月 20%、满 1 个游戏月 10%、满 1 个游戏年免）'));
}
function mgr(s, wrap, draw, t) {
  const w = holder(s, 'invest'); const g = s.mkt.mgr;
  if (!w) { wrap.appendChild(h('div', 'empty', '还没有投资经理：去「秘书 → 职位」任命（智慧高的打星）')); return; }
  wrap.appendChild(h('div', 'tr-gain', `${isSec(w) ? `投资经理：${SEC_BY_ID[w].name}（智慧 ${s.secs[w].attrs ? s.secs[w].attrs.wit : ''}）` : '外包：券商投顾（按智慧 50 算）'}。你划一笔钱给她，按风格配组合，跑赢大盘的部分看智慧（智慧低于 50 会跑输）；每 30 分钟汇报一次，超额收益的 10% 是她的提成（公司付）。${isSec(w) ? '她看盘时会提前提醒新闻。' : ''}`));
  if (g) wrap.appendChild(h('div', 'sum-card', `<div><small>她手上</small><b>${fmtMoney(g.value)}</b><small>${SK.MGR.styles[g.style].name}${g.stopped ? '　已止损（现金类）' : `　止损 ${Math.round(g.stop * 100)}%`}</small></div><div><small>本金 / 盈亏</small><b class="${cls(g.value - g.principal)}">${fmtMoney(g.value - g.principal)}</b><small>本金 ${fmtMoney(g.principal)}</small></div>`));
  let style = (g && g.style) || 'mid', stop = (g && g.stop) || 0.2;
  const box = h('div'); wrap.appendChild(box);
  const rd = () => {
    box.innerHTML = `<div class="sd-rec-title">风格</div><div class="tabs">${Object.entries(SK.MGR.styles).map(([k, v]) => `<button class="tab ${k === style ? 'on' : ''}" data-st="${k}">${v.name}</button>`).join('')}</div>
      <div class="tr-gain">稳健：货币 + 债券 + 金融红利基金；平衡：指数 + 债券 + 行业基金；进取：科技 + 新能源 + 私募对冲（配基金，跟基金净值走）</div>
      <div class="sd-rec-title">止损线</div><div class="tabs">${[0.1, 0.2, 0.3].map((k) => `<button class="tab ${k === stop ? 'on' : ''}" data-sp="${k}">亏 ${k * 100}% 就停</button>`).join('')}</div>
      <div class="ind-btns" style="margin-top:8px"><button class="btn gold" data-a="1e5">划 10 万</button><button class="btn gold" data-a="1e6">划 100 万</button><button class="btn gold" data-a="1e7">划 1000 万</button>${g ? '<button class="btn back">全部收回</button>' : ''}</div>`;
    box.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { style = b.dataset.st; rd(); }));
    box.querySelectorAll('[data-sp]').forEach((b) => (b.onclick = () => { stop = +b.dataset.sp; rd(); }));
    box.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { const r = SK.giveMgr(s, +b.dataset.a, style, stop, now()); if (!r.ok) { toast(r.why); return; } toast('划过去了'); AS.recalc(s); game.changed(); game.save(); draw(); }));
    const bk = box.querySelector('.back'); if (bk) bk.onclick = () => { const r = SK.takeBack(s, now()); if (!r.ok) { toast(r.why); return; } toast(`收回 ${fmtMoney(r.amount)}`); AS.recalc(s); game.changed(); game.save(); draw(); };
  };
  rd();
}

/** 个股 */
export function openStock(code) {
  const s = game.state; const x = SK.BY[code]; const p = openPanel(`${x.name}（${code}）`);
  let range = 'recent', n = 100;
  const render = () => {
    SK.advance(s, now());
    const m = s.mkt; const px = SK.price(s, code); const c = chg(s, code); const hd = m.hold[code]; const vis = bossAttrs(s).vision;
    const ind = SK.indicators(s, code, vis); const st = SK.stake(s, code);
    const qb = SK.quote(s, code, n, 'buy'), qs = hd ? SK.quote(s, code, Math.min(n, hd.n), 'sell') : null;
    p.body.innerHTML = `<div class="sk-top">${logo(code, 'sk-logo big')}<div><b class="${cls(c)}" style="font-size:24px">${px.toFixed(2)}</b> <small class="${cls(c)}">${pct(c)}</small>${x.desc ? `<div class="tr-gain">${x.desc}（新股）</div>` : ''}<div class="tr-gain">${x.sector} · 市值 ${fmtMoney(SK.marketCap(s, code))} · 股息率 ${(x.div * 100).toFixed(1)}% / 年</div></div></div>
      <div class="tabs"><button class="tab ${range === 'recent' ? 'on' : ''}" data-r="recent">1 小时</button><button class="tab ${range === 'long' ? 'on' : ''}" data-r="long">全部</button></div>
      ${spark(range === 'recent' ? m.hist[code] : m.long[code])}
      <div class="tr-gain">${ind.length ? ind.map(([k, v]) => `${k} <b>${v}</b>`).join('　') : '技术指标：老板眼光每 10 点多看一档（均线 → 成交活跃度 → 资金流向）'}</div>
      ${hd ? `<div class="tr-course"><div><b>持有 ${hd.n.toLocaleString()} 股</b><div class="tr-gain">成本 ${hd.cost.toFixed(2)}　市值 ${fmtMoney(hd.n * px)}　盈亏 <span class="${cls(px - hd.cost)}">${fmtMoney((px - hd.cost) * hd.n)}</span>${st.pct >= 0.0001 ? `　占总股本 ${(st.pct * 100).toFixed(3)}%（举牌 5%、要约收购进度 ${(st.toTender * 100).toFixed(0)}%）` : ''}</div></div></div>` : ''}
      <div class="sd-rec-title">股数</div><div class="tabs">${[100, 1000, 10000, 100000, 1000000].map((k) => `<button class="tab ${k === n ? 'on' : ''}" data-n="${k}">${k >= 10000 ? k / 10000 + ' 万' : k} 股</button>`).join('')}</div>
      <div class="tr-gain">买 ${n.toLocaleString()} 股：成交价 ${qb.exec}${qb.impact ? `（大单滑点 +${(qb.impact * 100).toFixed(2)}%）` : ''}，佣金过户费 ${fmtMoney(qb.fees)}，共 <b>${fmtMoney(qb.total)}</b>${qs ? `<br>卖 ${Math.min(n, hd.n).toLocaleString()} 股：到手 <b>${fmtMoney(qs.total)}</b>（含印花税 ${fmtMoney(qs.stamp)}）` : ''}</div>
      <div class="ind-btns"><button class="btn gold buy">买入</button>${hd ? '<button class="btn sell">卖出</button>' : ''}</div>
      <div class="tr-orders"></div>
      <div class="sd-rec-title">相关新闻</div>${m.news.filter((y) => y.target === code || y.target === x.sector || y.kind === 'market').slice(-5).reverse().map((y) => `<div class="tr-gain ${y.good ? 'up' : 'down'}">${y.title} ${pct(y.jump)}</div>`).join('') || '<div class="tr-gain">最近没有</div>'}`;
    if (SK.unlocked(s) || (m.hold[code])) { const ib = p.body.querySelector('.ind-btns'); if (ib) ib.after(takeoverBlock(s, code, render)); }   // 第 3-05 项
    const ob = p.body.querySelector('.tr-orders'); if (ob) ob.replaceWith(orderBlock(s, code, n, render));   // 第 P-06 项：条件单、融资买入
    p.body.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { range = b.dataset.r; render(); }));
    p.body.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { n = +b.dataset.n; render(); }));
    p.body.querySelector('.buy').onclick = () => { const co = buyerOf() === 'co'; const r = co ? TKO.coBuy(s, code, n, now()) : SK.buy(s, code, n, now()); if (!r.ok) { toast(r.why); return; } toast(`${co ? '公司' : ''}买好了：${r.slip.no}`); if (r.stake && r.stake.notice) say(s.current, `老板，公司成了${x.name}的举牌股东——持股到 ${Math.round(r.stake.level * 100)}%，要发公告了！`, 4200); AS.recalc(s); game.changed(); game.save(); render(); };
    const sb = p.body.querySelector('.sell'); if (sb) sb.onclick = () => { const r = SK.sell(s, code, Math.min(n, hd.n), now()); if (!r.ok) { toast(r.why); return; } toast(`卖了，${r.gain >= 0 ? '赚' : '亏'} ${fmtMoney(Math.abs(r.gain))}（${r.slip.no}）`); AS.recalc(s); game.changed(); game.save(); render(); };
  };
  render();
}

// 每秒：走到现在、分红、经理汇报、大新闻和看盘提醒
game.addTicker((s) => {
  if (!SK.unlocked(s) && !s.mkt) return;
  const t = now(); const r = SK.advance(s, t, { live: true });
  TR.tick(s, t); const g = s.mkt.margin; if (g && g.warnNew) { g.warnNew = false; const w = TR.wisest(s); if (w) say(w, '老板，融资那块的担保比例快到警戒线了，要不要先还一点？', 4200); }   // 第 P-06 项
  for (const x of TKO.tick(s, t)) toast(x, 3000);   // 第 3-05 项：要约期满
  for (const n of r.news) if (Math.abs(n.jump) >= 0.05 && r.ticks <= 2) INB.addMsg(s, { kind: 'system', type: 'stock_news', title: `${n.title} ${n.jump > 0 ? '+' : ''}${(n.jump * 100).toFixed(1)}%`, body: '财富 → 投资' }, t);
  if (r.ticks > 2 && r.news.length) { const big = r.news.slice().sort((a, b) => Math.abs(b.jump) - Math.abs(a.jump)).slice(0, 5); INB.addMsg(s, { kind: 'system', type: 'stock_news', title: '你不在的时候，股市里……', body: big.map((n) => `${n.title} ${(n.jump * 100).toFixed(1)}%`).join('\n') }, t); }
  for (const hnt of r.hints) say(hnt.who, hnt.text, 4200);
  const dv = SK.dividends(s, t); if (dv.length) toast(`股票分红到账 ${fmtMoney(dv.reduce((a, x) => a + x.amt - x.tax, 0))}`, 2600);
  const rep = SK.mgrReport(s, t); if (rep) INB.addMsg(s, { kind: 'report', type: 'invest_report', from: isSec(rep.who) ? rep.who : '', title: '投资经理汇报', body: rep.text + (rep.fee ? `（提成 ${fmtMoney(rep.fee)}）` : '') }, t);
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
