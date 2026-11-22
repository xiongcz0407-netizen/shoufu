// 第 P-06 项：财富 → 投资 里的「打新 · 两融」页签、个股页的条件单 / 融资买入、行情顶上的看盘（设计25 第五节）
import * as SK from '../core/stocks.js?v=1236a42d';
import * as TR from '../core/trade.js?v=1236a42d';
import * as AS from '../core/assets.js?v=1236a42d';
import { attrs as secAttrs } from '../core/posts.js?v=1236a42d';
import { SEC_BY_ID } from '../config/secretaries.js?v=1236a42d';
import { fmtMoney, fmtDuration } from '../core/format.js?v=1236a42d';
import { profitMul } from '../core/calib.js?v=1236a42d';
import { game } from '../game.js?v=1236a42d';
import { now } from '../core/clock.js?v=1236a42d';
import { h, openPanel, toast } from './dom.js?v=1236a42d';

const C = SK.SCFG; const I = C.ipo, MG = C.margin;
const COLOR = { 科技: '#3b6fd8', 消费: '#d8823b', 能源: '#3ba86b', 汽车: '#7a5cd6', 金融: '#c9a43b', 传媒: '#d64b7a', 奢侈品: '#8a6a3a' };
/** 新股 logo：板块色块 + 首字（设计另给图之前） */
export const ipoLogo = (c, cls = 'sk-logo') => { const x = SK.BY[c]; return `<i class="${cls} ipo-logo" style="background:${COLOR[x.sector] || '#556'}">${x.name.slice(0, 1)}</i>`; };
const done = (msg) => { toast(msg); AS.recalc(game.state); game.changed(); game.save(); };
const pctTxt = (v) => `${Math.round(v * 100)}%`;

/** 行情顶上：看盘的人 */
export function watchRow(s, draw) {
  const w = s.mkt.watcher; const ok = TR.watcher(s);
  const odds = w && s.secs[w] ? TR.watchOdds(s, w) : null;
  const el = h('button', 'sk-row watch-row', `<i class="sk-logo ph">看盘</i><div class="sk-name"><b>${w && s.secs[w] ? `${SEC_BY_ID[w].name} 在看盘${ok ? '' : '（在上课，暂停）'}` : '还没派人看盘'}</b><small>${odds ? `新闻出来前提前说一句的概率 ${pctTxt(odds.early)}，说准 ${pctTxt(odds.right)}（看智慧）` : '派一个秘书看盘：新闻出来前可能提前提醒你（智慧越高越准）'}${s.mkt.freeHint ? `　🎁 送的提示 ${s.mkt.freeHint} 次（一定准）` : ''}</small></div><div class="sk-px"><b>${w ? '换人' : '派人'}</b></div>`);
  el.onclick = () => pickWatcher(s, draw);
  return el;
}
function pickWatcher(s, draw) {
  const p = openPanel('派谁看盘');
  const ids = Object.keys(s.secs).sort((a, b) => secAttrs(s, b).wit - secAttrs(s, a).wit);
  p.body.innerHTML = `<div class="tr-gain">看盘像派驻产业一样：派了就不能同时上课（上课期间暂停）。提前概率 = 智慧 / 150，说准 = 50% + 智慧 / 400。智慧最高的排在最前。</div>`;
  for (const id of ids) {
    const o = TR.watchOdds(s, id);
    const b = h('button', 'sk-row', `<div class="sk-name"><b>${SEC_BY_ID[id].name}${s.mkt.watcher === id ? '（正在看）' : ''}</b><small>智慧 ${secAttrs(s, id).wit}　提前 ${pctTxt(o.early)}　准 ${pctTxt(o.right)}</small></div>`);
    b.onclick = () => { const r = TR.setWatch(s, id); if (!r.ok) { toast(r.why); return; } p.close(); done(`${SEC_BY_ID[id].name}去看盘了`); draw(); };
    p.body.appendChild(b);
  }
  if (s.mkt.watcher) { const b = h('button', 'btn back', '不派了'); b.onclick = () => { TR.setWatch(s, null); p.close(); done('撤回来了'); draw(); }; p.body.appendChild(b); }
}

/** 个股页：条件单 + 融资买入 */
let kind = 'buy';
export function orderBlock(s, code, n, rerender) {
  const m = TR.tr(s); const px = SK.price(s, code); const el = h('div', 'fn-card ord-box');
  const mine = m.orders.filter((o) => o.code === code);
  const draw = () => {
    const def = kind === 'buy' ? px * 0.95 : kind === 'tp' ? px * 1.1 : px * 0.92;
    el.innerHTML = `<div class="fn-row"><span><b>条件单</b><small>　不用一直盯盘：到价自动成交（离线也会触发），最多 ${C.orders.max} 张，${C.orders.expireDays} 个游戏天没触发自动撤</small></span></div>
      <div class="tabs">${Object.entries(TR.KIND).map(([k, v]) => `<button class="tab ${k === kind ? 'on' : ''}" data-k="${k}">${v}</button>`).join('')}</div>
      <div class="ord-in"><span>${kind === 'tp' ? '涨到' : '跌到'}</span><input type="number" step="0.01" class="ord-px" value="${def.toFixed(2)}"><span>元，${kind === 'buy' ? '买' : '卖'} ${n.toLocaleString()} 股</span><button class="btn sm gold ord-go">挂单</button></div>
      ${mine.map((o) => `<div class="fn-row"><span>${TR.KIND[o.kind]} ${o.px} · ${o.n.toLocaleString()} 股</span><b><button class="btn sm" data-x="${o.id}">撤</button></b></div>`).join('')}
      ${TR.mg(s) ? `<div class="fn-row"><span><b>融资买入</b>　还能借 ${fmtMoney(TR.room(s))}</span></div><button class="btn sm gold mg-buy">借钱买 ${n.toLocaleString()} 股（约 ${fmtMoney(SK.quote(s, code, n, 'buy').total)}）</button>` : ''}`;
    el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { kind = b.dataset.k; draw(); }));
    el.querySelector('.ord-go').onclick = () => { const r = TR.addOrder(s, { code, kind, px: +el.querySelector('.ord-px').value, n }, now()); if (!r.ok) { toast(r.why); return; } done(`挂好了：${TR.KIND[kind]} ${r.order.px}`); rerender(); };
    el.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => { TR.cancelOrder(s, +b.dataset.x); done('撤了'); rerender(); }));
    const mb = el.querySelector('.mg-buy'); if (mb) mb.onclick = () => { const r = TR.marginBuy(s, code, n, now()); if (!r.ok) { toast(r.why); return; } done(`融资买好了，借 ${fmtMoney(r.borrowed)}`); rerender(); };
  };
  draw(); return el;
}

/** 「打新 · 两融」页签 */
export function renderTradeTab(s, wrap, draw) {
  const m = TR.tr(s); const t = now(); const ip = m.ipo; const c = ip.cur;
  // 打新
  wrap.appendChild(h('div', 'sd-rec-title', '打新股'));
  const box = h('div', 'fn-card');
  if (c) {
    const x = SK.BY[c.code]; const subEnd = c.open + I.subDays * TR.DAY, drawAt = c.open + I.drawDay * TR.DAY, listAt = c.open + I.listDay * TR.DAY;
    const stage = t < subEnd ? `申购中（还有 ${fmtDuration((subEnd - t) / 1000)}）` : !c.drawn ? `等公布中签（${fmtDuration(Math.max(0, drawAt - t) / 1000)} 后）` : `等上市（${fmtDuration(Math.max(0, listAt - t) / 1000)} 后）`;
    box.innerHTML = `<div class="sk-row" style="margin:6px 0">${ipoLogo(c.code)}<div class="sk-name"><b>${x.name}　${x.code}</b><small>${x.desc ? x.desc + ' · ' : ''}${x.sector} · 发行价 ${x.price} · 每签 ${I.lotShares} 股（${fmtMoney(I.lotShares * x.price)}）</small></div></div>
      <div class="fn-row"><span>进度</span><b>${stage}</b></div>
      <div class="fn-row"><span>前 ${I.avgDays} 个游戏天日均持股市值</span><b>${fmtMoney(TR.avgHoldOf(s))}</b></div>
      <div class="fn-row"><span>能申购</span><b>${TR.lotsOf(s)} 签<small>（每 1 万 1 签，最多 ${I.maxLots} 签；每签中签率 ${(I.winRate * 100).toFixed(1)}%）</small></b></div>
      ${c.sub ? `<div class="fn-row"><span>你申购了</span><b>${c.sub.lots} 签${c.drawn ? `　中 ${c.win || 0} 签${c.paid ? `，缴款 ${fmtMoney(c.paid * x.price)}` : ''}` : ''}</b></div>` : ''}`;
    const why = TR.whyNotSub(s, t);
    if (!c.sub) { const b = h('button', 'btn gold', why ? `申购（${why}）` : `申购 ${TR.lotsOf(s)} 签（不用先交钱，中了再缴款）`); b.disabled = !!why; b.onclick = () => { const r = TR.subscribe(s, now()); if (!r.ok) { toast(r.why); return; } done(`申购了 ${r.lots} 签`); draw(); }; box.appendChild(b); }
  } else box.innerHTML = `<div class="tr-gain">${ip.idx >= I.list.length ? '今年的新股都发完了' : `下一只新股大约 ${fmtDuration(Math.max(0, ip.next - t) / 1000)} 后开始申购`}。申购额度看前 ${I.avgDays} 个游戏天日均持有的股票市值（现在 ${fmtMoney(TR.avgHoldOf(s))}，能申 ${TR.lotsOf(s)} 签）。</div>`;
  wrap.appendChild(box);
  if (ip.done.length) wrap.appendChild(h('div', 'fn-card', ip.done.slice(-5).reverse().map((d) => `<div class="fn-row"><span>${SK.BY[d.code].name}　首日 ${d.pop >= 0 ? '+' : ''}${Math.round(d.pop * 100)}%</span><b>${d.sub ? `申 ${d.sub} 签 · 中 ${d.win}` : '没申购'}</b></div>`).join('')));
  // 条件单
  wrap.appendChild(h('div', 'sd-rec-title', `条件单 ${m.orders.length} / ${C.orders.max}`));
  const ob = h('div', 'fn-card');
  ob.innerHTML = m.orders.length ? m.orders.map((o) => `<div class="fn-row"><span>${SK.BY[o.code].name}　${TR.KIND[o.kind]} ${o.px} · ${o.n.toLocaleString()} 股<small>　现价 ${SK.price(s, o.code).toFixed(2)}</small></span><b><button class="btn sm" data-x="${o.id}">撤</button></b></div>`).join('') : '<div class="tr-gain">还没挂：在个股页挂「到价买入 / 止盈 / 止损」</div>';
  ob.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => { TR.cancelOrder(s, +b.dataset.x); done('撤了'); draw(); }));
  wrap.appendChild(ob);
  // 两融
  wrap.appendChild(h('div', 'sd-rec-title', '融资融券（加杠杆）'));
  const g = TR.mg(s); const mb = h('div', 'fn-card');
  if (!g) {
    const why = TR.whyNotOpen(s);
    mb.innerHTML = `<div class="tr-gain">用持仓作担保借钱买股票：最多借持仓净值的 ${MG.maxLever} 倍，年利率 ${(MG.yearRate * 100).toFixed(0)}%（游戏口径 × ${profitMul()}）按小时扣；维持担保比例（持仓市值 ÷ 负债）低于 ${Math.round(MG.call * 100)}% 要追加保证金，${MG.callDays} 个游戏天不补强制平仓，低于 ${Math.round(MG.force * 100)}% 立刻平仓。照现实：账户资产 ≥ 50 万才能开。</div>`;
    const b = h('button', 'btn gold', why ? `开通（${why}）` : '开通（签《融资融券合同》）'); b.disabled = !!why; b.onclick = () => { const r = TR.openMargin(s, now()); if (!r.ok) { toast(r.why); return; } done(`开通了：${r.contract.no}`); draw(); }; mb.appendChild(b);
  } else {
    const r = TR.ratio(s);
    mb.innerHTML = `<div class="fn-row"><span>融资负债</span><b class="${g.debt ? 'neg' : ''}">${fmtMoney(g.debt)}</b></div>
      <div class="fn-row"><span>维持担保比例</span><b class="${r < MG.call ? 'neg' : r < MG.warn ? 'warn' : ''}">${g.debt ? `${Math.round(r * 100)}%` : '—'}</b></div>
      <div class="fn-row"><span>还能借</span><b>${fmtMoney(TR.room(s))}</b></div>
      ${g.call ? `<div class="tr-gain neg">追加保证金：${fmtDuration(Math.max(0, g.call.until - t) / 1000)} 内让比例回到 ${Math.round(MG.call * 100)}% 以上，不然强制平仓</div>` : ''}
      <div class="tr-gain">融资买入在个股页；利息每小时从个人现金扣（年利率 ${(MG.yearRate * profitMul() * 100).toFixed(0)}%，游戏口径）。合同 ${g.no}</div>`;
    if (g.debt > 0) { const row = h('div', 'ind-btns'); for (const a of [1e4, 1e5, g.debt].filter((v, i, arr) => v <= g.debt && arr.indexOf(v) === i)) { const b = h('button', 'btn sm', a === g.debt ? '全部还清' : `还 ${fmtMoney(a)}`); b.onclick = () => { const x = TR.repay(s, a, now()); if (!x.ok) { toast(x.why); return; } done(`还了 ${fmtMoney(x.amount)}`); draw(); }; row.appendChild(b); } mb.appendChild(row); }
  }
  wrap.appendChild(mb);
  // 周报预览
  const st = TR.weekStat(s);
  wrap.appendChild(h('div', 'sd-rec-title', '这一周（每 7 个游戏天发一次周报）'));
  wrap.appendChild(h('div', 'fn-card', `<div class="fn-row"><span>盈亏</span><b class="${st.pnl > 0 ? 'up' : st.pnl < 0 ? 'down' : ''}">${fmtMoney(st.pnl)}</b></div><div class="fn-row"><span>胜率（卖出的笔数里赚的）</span><b>${st.rate == null ? '还没卖过' : `${Math.round(st.rate * 100)}%（${st.trades} 笔）`}</b></div>${st.best && st.best.pnl > 0 ? `<div class="fn-row"><span>最赚</span><b>${SK.BY[st.best.code].name} ${fmtMoney(st.best.pnl)}</b></div>` : ''}${st.worst && st.worst.pnl < 0 ? `<div class="fn-row"><span>最亏</span><b>${SK.BY[st.worst.code].name} ${fmtMoney(st.worst.pnl)}</b></div>` : ''}`));
}
