// 设计41 / 46 / 47 看盘界面（开发2）：看盘那一块（开始 / 现在看一眼 / 结束）、看盘消息弹框（⅓仓 / 半仓 / 全仓）、照她说的挂单（条件单表）、消息「重要」里的按钮
import * as SK from '../core/stocks.js?v=d17576a6';
import * as TR from '../core/trade.js?v=d17576a6';
import * as LK from '../core/look.js?v=d17576a6';
import * as I from '../core/inbox.js?v=d17576a6';
import { SEC_BY_ID } from '../config/secretaries.js?v=d17576a6';
import { fmtMoney } from '../core/format.js?v=d17576a6';
import { asset, hasAsset } from '../platform/assets.js?v=d17576a6';
import { game } from '../game.js?v=d17576a6';
import { now } from '../core/clock.js?v=d17576a6';
import { h, openPanel, toast } from './dom.js?v=d17576a6';
import { addActionUi } from './inbox.js?v=d17576a6';
import * as WSM from '../core/ws.js?v=d17576a6';   // 设计47
import { attrs as secAttrs } from '../core/posts.js?v=d17576a6';
import { isTraining } from '../core/training.js?v=d17576a6';

const W = SK.SCFG.watch; const WSC = W.ws;
const WS_wit = (s, id) => secAttrs(s, id).wit;
const done = (msg) => { if (msg) toast(msg); game.changed(); game.save(); };
const head = (who, title) => `<div class="lk-head">${who && hasAsset(`assets/sec/${who}/c1.webp`) ? `<img src="${asset(`assets/sec/${who}/c1.webp`)}" alt="">` : ''}<b>${title}</b></div>`;
const yuan = (v) => `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const busy = () => !!document.querySelector('.story, .panel-mask, .full, .naming, .cf-mask, .ub-mask');

/** 设计46：⅓仓 / 半仓 / 全仓 三个按钮（按这一刻的个人现金算；不够 1 股的灰掉；三个都不够写「钱不够」） */
function posBtns(s, code, px, i = 0, edit = false) {
  const ed = edit ? `<button class="btn sm lk-edit" data-i="${i}">改</button>` : '';
  const ops = LK.posOptions(s, code, px); if (!ops.some((o) => o.n >= 1)) return `<div class="lk-pos"><span class="lk-none">钱不够</span>${ed}</div>`;
  return `<div class="lk-pos">${ops.map((o) => `<button class="btn sm ${o.n >= 1 ? 'gold' : ''}" data-i="${i}" data-q="${o.k}" ${o.n >= 1 ? '' : 'disabled'}>${o.name}<small>${o.n >= 1 ? `${fmtMoney(o.amt)}·${o.n.toLocaleString()}股` : '不够 1 股'}</small></button>`).join('')}${ed}</div>`;
}

/** 照她说的挂单：条件单表填好（价、股数都能改），点「挂单」才挂 */
export function openOrderSheet(legs, title, onPlace) {
  const p = openPanel(title || '照她说的挂单'); const L = legs.map((x) => ({ ...x }));
  const draw = () => {
    p.body.innerHTML = `<div class="tr-gain">这几张连在一起：${L[0].kind === 'buy' ? '买进成交以后，止盈、止损才生效；一张成交，另一张自动撤' : '卖出成交以后，抄底那张才生效'}。价和股数都能改。</div>
      ${L.map((x, i) => `<div class="lk-leg"><span class="${x.kind === 'buy' ? '' : TR.toneOf(x.px, L[0].kind === 'buy' ? L[0].px : ((game.state.mkt.hold[x.code] || {}).cost ?? null), x.kind)}">${TR.KIND[x.kind]}${x.role === 'out' ? '<small>（等前面成交）</small>' : ''}</span><input type="number" step="0.01" data-p="${i}" value="${x.px.toFixed(2)}"><span>元</span><input type="number" step="1" data-n="${i}" value="${x.n}"><span>股</span></div>${i === 0 ? `<div class="lk-pos">${LK.POS.map((q) => `<button class="btn sm" data-q="${q.k}">${x.kind === 'buy' ? q.name : q.sell}</button>`).join('')}</div>` : ''}`).join('')}
      <div class="tr-gain">约 ${fmtMoney(L[0].px * L[0].n)}${L[0].kind === 'buy' ? `（挂上就从个人现金扣 ${fmtMoney(TR.buyCost(game.state, L[0].code, L[0].px, L[0].n))}，现在 ${fmtMoney(TR.availCash(game.state))}）` : ''}</div>
      <button class="btn gold lk-go" style="width:100%">挂单</button>`;
    p.body.querySelectorAll('[data-p]').forEach((el) => (el.onchange = () => { L[+el.dataset.p].px = +el.value; }));
    p.body.querySelectorAll('[data-n]').forEach((el) => (el.onchange = () => { const n = Math.max(1, Math.floor(+el.value)); for (const x of L) x.n = n; draw(); }));
    p.body.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { const s = game.state; const x = L[0]; const q = LK.POS_BY[b.dataset.q]; const n = x.kind === 'buy' ? LK.posShares(s, x.code, x.px, q.k) : Math.floor(TR.sellable(s, x.code) * q.f); if (n < 1) { toast(x.kind === 'buy' ? '不够 1 股' : '没有能卖的'); return; } for (const y of L) y.n = n; draw(); }));   // 设计46：⅓ / 半 / 全
    p.body.querySelector('.lk-go').onclick = () => { const r = onPlace(L); if (!r.ok) { toast(r.why); return; } p.close(); done('挂好了，离线也会触发'); };
  };
  draw(); return p;
}

// ---------- 设计47 看盘改成时间段 ----------
const DAY_MS = TR.DAY;
const hm = (ms) => { const m = Math.max(0, Math.round(ms / 60e3)); if (m < 1) return "不到 1 分钟"; return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`; };
/** 「还剩 8 天（3 小时 12 分）」：游戏天 + 现实时间 */
export const leftText = (ms) => `${Math.floor(Math.round(ms / 60e3) * 60e3 / DAY_MS + 1e-9)} 天（${hm(ms)}）`;
const secName = (id) => (SEC_BY_ID[id] ? SEC_BY_ID[id].name : '她');

/** 点「看盘」：先选哪个秘书（默认智慧最高的；上课中的不能选），开始盯 6 小时 */
export function pickAndStart(after) {
  const s = game.state; const p = openPanel('派谁看盘');
  const ids = Object.keys(s.secs).sort((a, b) => WS_wit(s, b) - WS_wit(s, a));
  p.body.innerHTML = `<div class="tr-gain">看盘 ${WSC.hours * 60 / 24 | 0} 天（${WSC.hours} 小时）· ${W.look.energy} 精力${s.mkt.freeHint ? `（送的看盘 ${s.mkt.freeHint} 次：这次不花精力）` : ''}。这段时间她一直帮你盯着：每 30 分钟扫一次接下来 2 小时，有涨停、利好（新闻前 15 分钟）、一波、或者你手里的要跌，就发消息到「重要」。看盘中随时能让她「现在看一眼」。</div>`;
  ids.forEach((id, i) => {
    const tr = isTraining(s, id); const b = h('button', `sk-row ${tr ? 'dim' : ''}`, `${hasAsset(`assets/sec/${id}/c1.webp`) ? `<img class="sk-logo" src="${asset(`assets/sec/${id}/c1.webp`)}" alt="" style="object-fit:cover;object-position:top;border-radius:50%">` : ''}<div class="sk-name"><b>${secName(id)}${i === 0 ? '<small>（智慧最高）</small>' : ''}</b><small>智慧 ${WS_wit(s, id)}　每次看得到 ${Math.min(30, Math.floor(W.look.seeBase + Math.min(100, WS_wit(s, id)) / W.look.seeDiv))} 只${tr ? '　在上课，不能看盘' : ''}</small></div>`);
    if (tr) b.disabled = true;
    b.onclick = () => { const r = WSM.startWatch(s, id, now()); if (!r.ok) { toast(r.why); return; } p.close(); done(`${secName(id)}开始看盘了${r.free ? '（送的，不花精力）' : ''}`); if (after) after(); };
    p.body.appendChild(b);
  });
  return p;
}
/** 「让她现在看一眼」：不花精力；有新的直接弹开，没有说一句 */
export function lookNowUi(after) {
  const s = game.state; const r = WSM.lookOnce(s, now()); if (!r.ok) { toast(r.why); return null; }
  done(); if (after) after();
  if (r.msgs.length) return openWsMsg(r.msgs[0]);
  sayIt(r.who, r.line); return null;
}
let sayIt = (who, text) => toast(`${secName(who)}：${text}`); export const setSay = (fn) => { sayIt = fn; };
/** 看盘那一块（投资 → 股票顶上；今日日常也叫）：没看盘「看盘 · 15 天（6 小时）· 5 精力」；看盘中「XX 看盘中 · 还剩…」+「让XX现在看一眼」+「结束看盘」 */
export function watchBlock(s, redraw) {
  const t = now(); const w = WSM.ws(s, t); const box = h('div', 'fn-card ws-box');
  if (!w) {
    const last = s.mkt.wsLast;
    box.innerHTML = `<div class="ws-top"><div><b>看盘</b><small>选一个秘书盯 ${WSC.hours} 小时：有涨停、利好、一波、你手里的要跌，她发消息给你挂单${s.mkt.freeHint ? `　🎁 送的看盘 ${s.mkt.freeHint} 次` : ''}</small>${last ? `<small>上次：${secName(last.who)}发了 ${last.sent} 条、你挂了 ${last.placed} 条${last.pnl ? `、${last.pnl >= 0 ? '赚' : '亏'} ${fmtMoney(Math.abs(last.pnl))}` : ''}</small>` : ''}</div><button class="btn gold ws-go">看盘 · ${WSC.hours * 60 / 24 | 0} 天（${WSC.hours} 小时）<small>${s.mkt.freeHint ? '送的，不花精力' : `${W.look.energy} 精力`}</small></button></div>`;
    box.querySelector('.ws-go').onclick = () => pickAndStart(redraw);
    return box;
  }
  const cd = WSM.cdLeft(s, t); const nm = secName(w.who);
  box.innerHTML = `<div class="ws-top">${hasAsset(`assets/sec/${w.who}/c1.webp`) ? `<img class="ws-face" src="${asset(`assets/sec/${w.who}/c1.webp`)}" alt="">` : ''}<div><b>${nm}看盘中</b><small>还剩 ${leftText(w.end - t)}</small><small>这次：发了 ${w.sent} 条、你挂了 ${w.placed} 条${w.pnl ? `、${w.pnl >= 0 ? '赚' : '亏'} ${fmtMoney(Math.abs(w.pnl))}` : ''}</small></div></div>
    <div class="ind-btns ws-btns">${cd > 0 ? `<button class="btn ws-now" disabled>刚看过 · ${Math.ceil(cd / 60e3)} 分钟后再看</button>` : `<button class="btn gold ws-now">让${nm}现在看一眼<small>不花精力</small></button>`}<button class="btn ws-stop">结束看盘</button></div>`;
  const nb = box.querySelector('.ws-now'); if (nb && !nb.disabled) nb.onclick = () => lookNowUi(redraw);
  box.querySelector('.ws-stop').onclick = () => { const d = WSM.stopWatch(s, now(), true); done(); showDone(d); if (redraw) redraw(); };
  return box;
}
/** 结束：弹一句台词 + 这段时间战绩 */
let showDoneFn = (d) => toast(`${secName(d.who)}：${d.line}（发了 ${d.sent} 条，你挂了 ${d.placed} 条）`);
export const setShowDone = (fn) => { showDoneFn = fn; };
export const showDone = (d) => { if (d) showDoneFn(d); };

/** 看盘消息弹框：买的 ⅓仓 / 半仓 / 全仓 一点挂上；要跌的 卖 ⅓ / 一半 / 全部 */
const KIND_T = { lu: '🔥 今天会封涨停', news: '有利好', wave: '接下来能涨一波', fall: '要跌' };
export function openWsMsg(msg) {
  const s = game.state; const d = msg.data; const p = openPanel('看盘');
  const draw = () => {
    if (!s.inbox.includes(msg)) { p.close(); return; }
    const left = Math.max(0, d.exp - now());
    if (d.kind === 'fall') {
      const have = TR.sellable(s, d.code);
      p.body.innerHTML = `${head(msg.from, msg.title)}<div class="lk-look"><div class="lk-l1"><b>${SK.BY[d.code].name}</b><em class="down">要跌</em></div>
        <div class="lk-l2"><span>跌破 <b class="${TR.toneOf(d.X, (s.mkt.hold[d.code] || {}).cost ?? null, 'sl')}">${yuan(d.X)}</b> 先卖掉</span><span>你手里能卖 ${have.toLocaleString()} 股</span><span>还剩 ${hm(left)}</span></div>
        <div class="lk-pos">${LK.POS.map((q) => { const n = Math.floor(have * q.f); return `<button class="btn sm ${n >= 1 ? 'gold' : ''}" data-s="${q.k}" ${n >= 1 ? '' : 'disabled'}>卖${q.sell}<small>${n >= 1 ? `${n.toLocaleString()}股` : '没有能卖的'}</small></button>`; }).join('')}</div></div>
        <div class="ind-btns"><button class="btn lk-no">不用了</button></div>`;
      p.body.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { const r = WSM.sellWs(s, msg, b.dataset.s, now()); if (!r.ok) { toast(r.why); return; } p.close(); done(`挂好了：${SK.BY[d.code].name} 跌到 ¥${d.X} 卖 ${r.n.toLocaleString()} 股`); }));
    } else {
      p.body.innerHTML = `${head(msg.from, msg.title)}<div class="lk-look ${d.lu ? 'lu' : ''}">
        <div class="lk-l1"><b>${SK.BY[d.code].name}</b><em class="${d.lu ? 'hot' : ''}">${KIND_T[d.kind]} · +${(d.g * 100).toFixed(1)}%</em></div>
        <div class="lk-l2"><span>${yuan(d.X)} 以内买进</span><span>涨到 <b class="${TR.toneOf(d.Y, d.X, 'tp')}">${yuan(d.Y)}</b> 卖</span><span>止损 <b class="${TR.toneOf(d.Z, d.X, 'sl')}">${yuan(d.Z)}</b></span><span>买入点还剩 ${hm(left)}</span></div>
        ${posBtns(s, d.code, d.X, 0, true)}</div>
        <div class="tr-gain">点一个仓位就挂上三张联动单（买进成交后止盈、止损才生效）；2 小时没买进的单子自动撤。</div>
        <div class="ind-btns"><button class="btn lk-no">不用了</button></div>`;
      p.body.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { const r = WSM.placeWs(s, msg, b.dataset.q, now()); if (!r.ok) { toast(r.why); return; } p.close(); done(`挂好了：${SK.BY[d.code].name} ${r.pos} ${r.n.toLocaleString()} 股`); }));
      const ed = p.body.querySelector('.lk-edit'); if (ed) ed.onclick = () => { const n = Math.max(1, LK.posShares(s, d.code, d.X, 'third')); openOrderSheet(LK.legsOfRow({ code: d.code, X: d.X, Y: d.Y, Z: d.Z, n }), `挂 ${SK.BY[d.code].name}`, (legs) => { const r = TR.addGroup(s, legs, { src: 'watch', exp: now() + WSC.aheadTicks * SK.SCFG.tickSec * 1000, lu: !!d.lu }, now()); if (r.ok) { LK.delMsg(s, msg.id); const w = WSM.ws(s); if (w) { w.placed += 1; w.grps.push(r.grp); } p.close(); } return r; }); };
    }
    p.body.querySelector('.lk-no').onclick = () => { LK.delMsg(s, msg.id); p.close(); done(); };
  };
  draw(); return p;
}

/** 设计47：看盘发了消息，游戏里弹一个小提示条「夏芷晴：平果有机会，去看看」，点了打开那条消息（5 秒后自己收起） */
let tipTimer = null;
export function wsTipBar(x) {
  const s = game.state; const ph = document.querySelector('#phone') || document.body;
  let bar = document.querySelector('.ws-tip'); if (!bar) { bar = h('button', 'ws-tip'); ph.appendChild(bar); }
  bar.innerHTML = `${hasAsset(`assets/sec/${x.who}/c1.webp`) ? `<img src="${asset(`assets/sec/${x.who}/c1.webp`)}" alt="">` : ''}<span><b>${secName(x.who)}</b>：${x.text}</span><i>›</i>`;
  bar.classList.add('show');
  bar.onclick = () => { bar.classList.remove('show'); const m = (s.inbox || []).find((y) => y.id === x.id); if (m) openWsMsg(m); else toast('这条已经过了'); };
  clearTimeout(tipTimer); tipTimer = setTimeout(() => bar.classList.remove('show'), 5000);
}

// 消息「重要」里的按钮
addActionUi((s, m, a, render) => {
  if (m.type === 'stock_ws') { if (a === 'no') { LK.delMsg(s, m.id); done(); render(); return true; } openWsMsg(m); return true; }
  return false;
});
export { I, busy };
