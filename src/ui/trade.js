// 第 P-06 项：财富 → 投资 里的「打新」页签、个股页的条件单、行情顶上的看盘（设计25 第五节）
import { earnAt, cls, sgnPct } from './earn.js?v=3839f433';   // 设计65：挂单写百分比
import { whyToast } from './invest.js?v=3839f433';   // 设计62：钱不够一键从个人账户转入
import * as SK from '../core/stocks.js?v=3839f433';
import * as TR from '../core/trade.js?v=3839f433';
import * as LK from '../core/look.js?v=3839f433'; // 设计41
import * as AS from '../core/assets.js?v=3839f433';
import { attrs as secAttrs } from '../core/posts.js?v=3839f433';
import { SEC_BY_ID } from '../config/secretaries.js?v=3839f433';
import { fmtMoney, fmtDuration } from '../core/format.js?v=3839f433';
import { profitMul } from '../core/calib.js?v=3839f433';
import { game } from '../game.js?v=3839f433';
import { now } from '../core/clock.js?v=3839f433';
import { h, openPanel, toast } from './dom.js?v=3839f433';

const C = SK.SCFG; const I = C.ipo;
const COLOR = { 科技: '#3b6fd8', 消费: '#d8823b', 能源: '#3ba86b', 汽车: '#7a5cd6', 金融: '#c9a43b', 传媒: '#d64b7a', 奢侈品: '#8a6a3a' };
/** 新股 logo：板块色块 + 首字（设计另给图之前） */
export const ipoLogo = (c, cls = 'sk-logo') => { const x = SK.BY[c]; return `<i class="${cls} ipo-logo" style="background:${COLOR[x.sector] || '#556'}">${x.name.slice(0, 1)}</i>`; };
const done = (msg) => { toast(msg); AS.recalc(game.state); game.changed(); game.save(); };
const pctTxt = (v) => `${Math.round(v * 100)}%`;

/** 个股页：条件单 */
let kind = 'buy';
export function orderBlock(s, code, n, rerender) {
  const m = TR.tr(s); const px = SK.price(s, code); const el = h('div', 'fn-card ord-box');
  const mine = m.orders.filter((o) => o.code === code);
  const draw = () => {
    const def = kind === 'buy' ? px * 0.95 : kind === 'tp' ? px * 1.1 : px * 0.92;
    /* 设计65：填的价旁边写百分比——买单比现价；止盈 / 止损按成本写「到了赚 +¥X，+x%」（没持仓按现价） */
    const ordPct = (v) => { v = Math.round(+v * 100) / 100; if (!(v > 0)) return ''; if (kind === 'buy') return `比现价 <span class="${cls(v - px)}">${sgnPct(v / px - 1)}</span>`; const my = SK.myShares(s)[code]; const base = my ? my.cost : px; return `${my ? '按成本' : '按现价'} ${earnAt(v, base, Math.min(n, my ? my.n : n))}`; };
    el.innerHTML = `<div class="fn-row"><span><b>条件单</b><small>　不用一直盯盘：到价自动成交（离线也会触发），最多 ${C.orders.max} 张，${C.orders.expireDays} 个游戏天没触发自动撤</small></span></div>
      <div class="tabs">${Object.entries(TR.KIND).map(([k, v]) => `<button class="tab ${k === kind ? 'on' : ''}" data-k="${k}">${v}</button>`).join('')}</div>
      <div class="ord-in"><span class="${kind === 'tp' ? 'up' : kind === 'sl' ? 'down' : ''}">${kind === 'tp' ? '涨到' : '跌到'}</span><input type="text" inputmode="decimal" autocomplete="off" class="ord-px" value="${def.toFixed(2)}"><span>元，${kind === 'buy' ? '买' : '卖'} ${n.toLocaleString()} 股</span><button class="btn sm gold ord-go">挂单</button></div><div class="ord-pct">${ordPct(def)}</div><div class="lk-pos ord-pos">${LK.POS.map((q) => `<button class="btn sm" data-q="${q.k}">${kind === 'buy' ? q.name : q.sell}</button>`).join('')}</div>
      ${mine.map((o) => `<div class="fn-row"><span>${TR.KIND[o.kind]} <b class="${TR.sellTone(s, o)}">${o.px}</b> · ${o.n.toLocaleString()} 股${o.on === false ? '<small>（等前面成交才生效）</small>' : ''}</span><b><button class="btn sm" data-x="${o.id}">撤</button></b></div>`).join('')}`;
    el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { kind = b.dataset.k; draw(); }));
    el.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { const q = LK.POS_BY[b.dataset.q]; const p0 = +el.querySelector('.ord-px').value; const nn = kind === 'buy' ? LK.posShares(s, code, p0, q.k) : LK.sellShares(TR.sellable(s, code), q.k); if (!(nn >= 1)) { toast(kind === 'buy' ? '不够 1 股' : '没有能卖的'); return; } const r = TR.addOrder(s, { code, kind, px: p0, n: nn }, now()); if (!r.ok) { whyToast(r.why); return; } done(`挂好了：${TR.KIND[kind]} ${r.order.px} · ${nn.toLocaleString()} 股（${kind === 'buy' ? q.name : q.sell}）`); rerender(); }));   // 设计46：⅓ / 半仓 / 全仓（卖：⅓ / 一半 / 全部）
    { const ip = el.querySelector('.ord-px'); ip.oninput = () => { el.querySelector('.ord-pct').innerHTML = ordPct(ip.value); }; }   // 设计65：改价跟着变
    el.querySelector('.ord-go').onclick = () => { const r = TR.addOrder(s, { code, kind, px: +el.querySelector('.ord-px').value, n }, now()); if (!r.ok) { whyToast(r.why); return; } done(`挂好了：${TR.KIND[kind]} ${r.order.px}`); rerender(); };
    el.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => { const o = m.orders.find((x) => x.id === +b.dataset.x); TR.cancelOrder(s, +b.dataset.x, false, now()); done(o && (o.back || o.backN) ? `撤了，${o.back ? `${fmtMoney(o.back)} 退回投资账户` : `${o.backN.toLocaleString()} 股退回持仓`}` : '撤了'); rerender(); }));
  };
  draw(); return el;
}

/** 「打新」页签 */
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
    if (!c.sub) { const b = h('button', 'btn gold', why ? `申购（${why}）` : `申购 ${TR.lotsOf(s)} 签（不用先交钱，中了再缴款）`); b.disabled = !!why; b.onclick = () => { const r = TR.subscribe(s, now()); if (!r.ok) { whyToast(r.why); return; } done(`申购了 ${r.lots} 签`); draw(); }; box.appendChild(b); }
  } else box.innerHTML = `<div class="tr-gain">${ip.idx >= I.list.length ? '今年的新股都发完了' : `下一只新股大约 ${fmtDuration(Math.max(0, ip.next - t) / 1000)} 后开始申购`}。申购额度看前 ${I.avgDays} 个游戏天日均持有的股票市值（现在 ${fmtMoney(TR.avgHoldOf(s))}，能申 ${TR.lotsOf(s)} 签）。</div>`;
  wrap.appendChild(box);
  if (ip.done.length) wrap.appendChild(h('div', 'fn-card', ip.done.slice(-5).reverse().map((d) => `<div class="fn-row"><span>${SK.BY[d.code].name}　首日 ${d.pop >= 0 ? '+' : ''}${Math.round(d.pop * 100)}%</span><b>${d.sub ? `申 ${d.sub} 签 · 中 ${d.win}` : '没申购'}</b></div>`).join('')));
  // 条件单
  wrap.appendChild(h('div', 'sd-rec-title', `条件单 ${m.orders.length} / ${C.orders.max}`));
  const ob = h('div', 'fn-card');
  ob.innerHTML = m.orders.length ? m.orders.map((o) => `<div class="fn-row"><span>${SK.BY[o.code].name}　${TR.KIND[o.kind]} <b class="${TR.sellTone(s, o)}">${o.px}</b> · ${o.n.toLocaleString()} 股${o.on === false ? '（等前面成交）' : ''}<small>　现价 ${SK.price(s, o.code).toFixed(2)}</small></span><b><button class="btn sm" data-x="${o.id}">撤</button></b></div>`).join('') : '<div class="tr-gain">还没挂：在个股页挂「到价买入 / 止盈 / 止损」</div>';
  ob.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => { const o = m.orders.find((x) => x.id === +b.dataset.x); TR.cancelOrder(s, +b.dataset.x, false, now()); done(o && (o.back || o.backN) ? `撤了，${o.back ? `${fmtMoney(o.back)} 退回投资账户` : `${o.backN.toLocaleString()} 股退回持仓`}` : '撤了'); draw(); }));
  wrap.appendChild(ob);
  // 周报预览
  const st = TR.weekStat(s);
  wrap.appendChild(h('div', 'sd-rec-title', '这一周（每 7 个游戏天发一次周报）'));
  wrap.appendChild(h('div', 'fn-card', `<div class="fn-row"><span>盈亏</span><b class="${st.pnl > 0 ? 'up' : st.pnl < 0 ? 'down' : ''}">${fmtMoney(st.pnl)}</b></div><div class="fn-row"><span>胜率（卖出的笔数里赚的）</span><b>${st.rate == null ? '还没卖过' : `${Math.round(st.rate * 100)}%（${st.trades} 笔）`}</b></div>${st.best && st.best.pnl > 0 ? `<div class="fn-row"><span>最赚</span><b>${SK.BY[st.best.code].name} ${fmtMoney(st.best.pnl)}</b></div>` : ''}${st.worst && st.worst.pnl < 0 ? `<div class="fn-row"><span>最亏</span><b>${SK.BY[st.worst.code].name} ${fmtMoney(st.worst.pnl)}</b></div>` : ''}`));
}
