// 设计41 秘书看盘给价（开发2）：新闻提醒弹框、「看盘」结果弹框、照她说的挂单（条件单表填好，玩家能改再挂）、消息「重要」里的按钮
import * as SK from '../core/stocks.js?v=d69b03f5';
import * as TR from '../core/trade.js?v=d69b03f5';
import * as LK from '../core/look.js?v=d69b03f5';
import * as I from '../core/inbox.js?v=d69b03f5';
import { SEC_BY_ID } from '../config/secretaries.js?v=d69b03f5';
import { fmtMoney } from '../core/format.js?v=d69b03f5';
import { asset, hasAsset } from '../platform/assets.js?v=d69b03f5';
import { game } from '../game.js?v=d69b03f5';
import { now } from '../core/clock.js?v=d69b03f5';
import { h, openPanel, toast } from './dom.js?v=d69b03f5';
import { addActionUi } from './inbox.js?v=d69b03f5';

const W = SK.SCFG.watch;
const done = (msg) => { if (msg) toast(msg); game.changed(); game.save(); };
const head = (who, title) => `<div class="lk-head">${who && hasAsset(`assets/sec/${who}/c1.webp`) ? `<img src="${asset(`assets/sec/${who}/c1.webp`)}" alt="">` : ''}<b>${title}</b></div>`;
const yuan = (v) => `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const busy = () => !!document.querySelector('.story, .panel-mask, .full, .naming, .cf-mask, .ub-mask');

/** 照她说的挂单：条件单表填好（价、股数都能改），点「挂单」才挂 */
export function openOrderSheet(legs, title, onPlace) {
  const p = openPanel(title || '照她说的挂单'); const L = legs.map((x) => ({ ...x }));
  const draw = () => {
    p.body.innerHTML = `<div class="tr-gain">这几张连在一起：${L[0].kind === 'buy' ? '买进成交以后，止盈、止损才生效；一张成交，另一张自动撤' : '卖出成交以后，抄底那张才生效'}。价和股数都能改。</div>
      ${L.map((x, i) => `<div class="lk-leg"><span>${TR.KIND[x.kind]}${x.role === 'out' ? '<small>（等前面成交）</small>' : ''}</span><input type="number" step="0.01" data-p="${i}" value="${x.px.toFixed(2)}"><span>元</span><input type="number" step="1" data-n="${i}" value="${x.n}"><span>股</span>${i === 0 ? `<button class="btn sm lk-max">${x.kind === 'buy' ? '全仓' : '全部'}</button>` : ''}</div>`).join('')}
      <div class="tr-gain">约 ${fmtMoney(L[0].px * L[0].n)}（现在个人现金 ${fmtMoney(game.state.cash)}）</div>
      <button class="btn gold lk-go" style="width:100%">挂单</button>`;
    p.body.querySelectorAll('[data-p]').forEach((el) => (el.onchange = () => { L[+el.dataset.p].px = +el.value; }));
    p.body.querySelectorAll('[data-n]').forEach((el) => (el.onchange = () => { const n = Math.max(1, Math.floor(+el.value)); for (const x of L) x.n = n; draw(); }));
    p.body.querySelector('.lk-max').onclick = () => { const s = game.state; const x = L[0]; const n = x.kind === 'buy' ? Math.max(1, Math.floor(SK.maxBuyN(s, x.code, Math.max(0, s.cash)) * SK.price(s, x.code) / Math.max(x.px, 0.01))) : SK.maxSellMe(s, x.code); for (const y of L) y.n = Math.max(1, n); draw(); };   // 全仓 / 全部（任务板第 1e 项）
    p.body.querySelector('.lk-go').onclick = () => { const r = onPlace(L); if (!r.ok) { toast(r.why); return; } p.close(); done('挂好了，离线也会触发'); };
  };
  draw(); return p;
}

/** 新闻提醒弹框 */
export function openTip(msg) {
  const s = game.state; const d = msg.data; const L = d.legs; const p = openPanel('看盘提醒');
  const rows = d.kind === 'up' ? `<div class="lk-row"><b>${SK.BY[d.code].name}</b><span>${yuan(L[0].px)} 以内买进</span><span>涨到 ${yuan(L[1].px)} 卖</span><span>跌破 ${yuan(L[2].px)} 走</span><span>买 ${L[0].n.toLocaleString()} 股（约 ${fmtMoney(L[0].px * L[0].n)}）</span></div>`
    : d.kind === 'down' ? `<div class="lk-row"><b>${SK.BY[d.code].name}</b><span>${yuan(L[0].px)} 以下先卖掉 ${L[0].n.toLocaleString()} 股</span><span>跌到 ${yuan(L[1].px)} 再接回来</span></div>` : '';
  p.body.innerHTML = `${head(msg.from, msg.title)}<div class="lk-say">「${d.say}」</div>${rows}<div class="ind-btns">${L.length ? '<button class="btn gold lk-place">照她说的挂单</button>' : ''}<button class="btn lk-no">${L.length ? '不用了' : '好，不碰'}</button></div>`;
  const pl = p.body.querySelector('.lk-place'); if (pl) pl.onclick = () => { p.close(); openOrderSheet(L, `照${SEC_BY_ID[msg.from] ? SEC_BY_ID[msg.from].name : '她'}说的挂单`, (legs) => LK.placeLegs(s, msg, 0, legs, now())); };
  p.body.querySelector('.lk-no').onclick = () => { LK.delMsg(s, msg.id); p.close(); done(); };
  return p;
}

/** 看盘结果弹框 */
export function openLookMsg(msg) {
  const s = game.state; const d = msg.data; const p = openPanel('看盘');
  const draw = () => {
    if (!s.inbox.includes(msg)) { p.close(); return; }
    p.body.innerHTML = `${head(msg.from, msg.title)}${d.rows.length ? d.rows.map((r, i) => `<div class="lk-look ${r.lu ? 'lu' : ''}">
        <div class="lk-l1"><b>${r.lu ? '🔥 ' : ''}${SK.BY[r.code].name}</b><em class="${r.lu ? 'hot' : ''}">+${(r.g * 100).toFixed(1)}%${r.lu ? '，要涨停了！' : ''}</em></div>
        <div class="lk-l2"><span>${yuan(r.X)} 以内买进</span><span>涨到 ${yuan(r.Y)} 卖</span><span>止损 ${yuan(r.Z)}</span></div>
        <div class="lk-l3"><span>${r.n >= 1 ? `买 ${r.n.toLocaleString()} 股（约 ${fmtMoney(r.n * r.X)}）` : '钱不够'}</span><button class="btn sm ${r.placed ? '' : 'gold'}" data-i="${i}" ${r.placed || !(r.n >= 1) ? 'disabled' : ''}>${r.placed ? '已挂' : '挂单'}</button></div></div>`).join('') : ''}
      <div class="lk-say">「${d.say}」</div><div class="tr-gain">接下来 2 小时内都能成交；2 小时没买进的单子自动撤，买进了的止盈止损不撤。</div>
      <div class="ind-btns">${d.rows.some((r) => !r.placed && r.n >= 1) ? '<button class="btn gold lk-all">一键全挂</button>' : ''}<button class="btn lk-no">不用了</button></div>`;
    p.body.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { const i = +b.dataset.i; openOrderSheet(LK.legsOfRow(d.rows[i]), `挂 ${SK.BY[d.rows[i].code].name}`, (legs) => { const r = LK.placeLegs(s, msg, i, legs, now()); setTimeout(draw, 50); return r; }); }));
    const a = p.body.querySelector('.lk-all'); if (a) a.onclick = () => { const r = LK.placeAll(s, msg, now()); done(r.n ? `挂了 ${r.n} 组，放着就行` : r.why); draw(); };
    p.body.querySelector('.lk-no').onclick = () => { LK.delMsg(s, msg.id); p.close(); done(); };
  };
  draw(); return p;
}

/** 点「看盘」：扣 5 精力，马上出结果 */
export function doLook() {
  const s = game.state; const r = LK.lookNow(s, now());
  if (r.why) { toast(r.why === '精力不够' ? `精力不够（看一次要 ${W.look.energy}）` : r.why); return null; }
  done(); return openLookMsg(r.msg);
}

/** 新闻提醒来了（ui/stocks.js 的 ticker 叫）：进「重要」，没别的界面开着就弹 */
export function onTip(s, hnt, say) {
  const msg = LK.tipMsg(s, hnt, now()); game.changed();
  if (!busy()) openTip(msg); else say(hnt.who, `${SK.BY[hnt.code].name}：${msg.data.say}（在消息「重要」里）`, 4200);
}

// 消息「重要」里的按钮
addActionUi((s, m, a, render) => {
  if (m.type === 'stock_tip') { if (a === 'no') { LK.delMsg(s, m.id); done(); render(); return true; } openTip(m); return true; }
  if (m.type === 'stock_look') { if (a === 'no') { LK.delMsg(s, m.id); done(); render(); return true; } openLookMsg(m); return true; }
  return false;
});
export { I };
