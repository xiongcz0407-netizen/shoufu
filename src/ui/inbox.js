// 消息中心（铃铛）：请示 / 月报 / 邀请拍卖 / 系统；请示直接批准 / 驳回
import * as I from '../core/inbox.js?v=701a82d3';
import { SEC_BY_ID } from '../config/secretaries.js?v=701a82d3';
import { asset, hasAsset } from '../platform/assets.js?v=701a82d3';
import { now } from '../core/clock.js?v=701a82d3';
import { game } from '../game.js?v=701a82d3';
import { h, toast } from './dom.js?v=701a82d3';
import { openFull } from './shell.js?v=701a82d3';
import { bump } from '../core/daily.js?v=701a82d3';
import { openEventMsg } from './event.js?v=701a82d3';
import * as CP from '../core/coupon.js?v=701a82d3'; // 设计39 再来 10 件
import { refillHtml, bindRefill } from './coupon.js?v=701a82d3'; // 设计39 事件券（开发2）
import { todayCount } from '../core/bizevents.js?v=701a82d3';

/** 页签那一排放不下时，把选中的滑到中间 */
function showOn(row) { const b = row.querySelector('.seg.on'); if (!b || row.scrollWidth <= row.clientWidth) return; const r = row.getBoundingClientRect(), x = b.getBoundingClientRect(); if (x.left >= r.left && x.right <= r.right) return; row.scrollLeft += x.left - r.left - (r.width - x.width) / 2; }
/** 挂钩（V2-06 开发2）：某类消息的某个按钮不直接办，先开一个界面（比如「谈」开谈判）；fn(s, m, action, rerender, closeInbox) 返回 true = 接管了；要跳到页签的先 closeInbox()（页签在消息页下面，不关看不见） */
const ACTION_UI = [];
export const addActionUi = (fn) => { ACTION_UI.push(fn); };
/** V0.2.3（开发2，站柜台里直接处理）：跟消息卡片上点按钮一样办；返回 true = 办了（或交给了挂钩 / 事件剧情） */
export function actOn(s, m, a, render = () => {}) {
  if (a === 'open' && m.type === 'event') { I.markRead(s, m.id); openEventMsg(m, render); return true; }
  if (ACTION_UI.some((fn) => fn(s, m, a, render))) return true;
  const lab = (m.actions.find((x) => x.key === a) || {}).label || '';
  if (I.act(s, m.id, a, now())) { toast(m.type === 'biz_event' ? `已处理：${lab}${m.result ? `\n${m.result}` : ''}` : a === 'reject' ? '已驳回' : a === 'ok' ? '好的' : '已批准', m.type === 'biz_event' ? 3200 : undefined); return true; }
  toast(m.why || '办不了（钱不够或已经过期）'); return false;
}
export function openInbox(kind) {
  const p = openFull('消息');
  // 设计39：有重要的先看「重要」，没有就看「经营」；老的页签名照样能传进来
  const ALIAS = { pending: 'important', request: 'important', event: 'biz' };
  let cur = ALIAS[kind] || (I.TABS[kind] ? kind : null) || (I.important(game.state).length ? 'important' : 'biz');
  const bar = h('div', 'seg-bar'); const list = h('div', 'page-body');
  p.body.append(bar, list);
  const render = () => {
    const s = game.state; const c = I.tabCounts(s);
    bar.innerHTML = '';
    for (const [k, name] of Object.entries(I.TABS)) {
      const n = c[k].n; const red = k === 'important' || k === 'biz';
      const b = h('button', 'seg' + (k === cur ? ' on' : ''), `${name}${n ? ` <i class="segn ${red ? 'red' : ''}">${n}</i>` : ''}`);
      b.onclick = () => { cur = k; render(); };
      bar.appendChild(b);
    }
    requestAnimationFrame(() => showOn(bar)); // 选中的页签滑到中间（照车行筛选）
    list.innerHTML = '';
    const items = I.inTab(s, cur);
    if (cur === 'biz') list.appendChild(bizHead(s, render));
    if (cur === 'system' && items.some((m) => !m.read)) { const b = h('button', 'btn sys-allread', '一键全读'); b.onclick = () => { for (const m of items) if (!m.read) I.markRead(s, m.id); game.changed(); game.save(); render(); }; list.appendChild(b); } // V0.2.9（Arvin）
    if (!items.length) list.appendChild(h('div', 'empty', cur === 'important' ? '没有要你签字拍板的事' : cur === 'biz' ? '今天的经营事件都处理完了' : '没有消息'));
    for (const m of items) {
      const from = SEC_BY_ID[m.from];
      const card = h('div', 'msg' + (m.read ? '' : ' unread'), `${from ? `<img src="${asset(`assets/sec/${m.from}/c1.webp`)}" alt="">` : m.type === 'gift_mail' && hasAsset('assets/ui/icon_gift.webp') ? `<img class="msg-gift" src="${asset('assets/ui/icon_gift.webp')}" alt="">` : '<i class="msg-ico">📄</i>'}
        <div class="msg-main"><div class="msg-title">${m.title}</div><div class="msg-body">${m.body}</div>
        <div class="msg-foot">${[from ? from.name : '', m.type === 'biz_event' && m.status === 'done' ? `已处理：${m.choice || ''}` : m.status === 'approved' ? '已批准' : m.status === 'rejected' ? '已驳回' : ''].filter(Boolean).join(' · ')}</div>
        ${m.status === 'open' ? `<div class="ind-btns">${m.actions.map((a) => `<button class="btn ${a.key === 'approve' ? 'gold' : ''}" data-a="${a.key}">${a.label}</button>`).join('')}</div>` : ''}</div>`);
      card.onclick = (e) => {
        const a = e.target.dataset && e.target.dataset.a;
        if (a === 'open' && m.type === 'event') { I.markRead(s, m.id); openEventMsg(m, render); } // 事件：播剧情 + 选择（选完才算处理）
        else if (a && ACTION_UI.some((fn) => fn(s, m, a, render, p.close))) { /* 交给挂钩（谈判等）*/ }
        else if (a) { const lab = (m.actions.find((x) => x.key === a) || {}).label || ''; if (I.act(s, m.id, a, now())) toast(m.type === 'biz_event' ? `已处理：${lab}${m.result ? `\n${m.result}` : ''}` : a === 'reject' ? '已驳回' : a === 'ok' ? '好的' : '已批准', m.type === 'biz_event' ? 3200 : undefined); else toast(m.why || '办不了（钱不够或已经过期）'); }
        else { if (m.kind === 'report' && !m.read) bump(s, now(), 'report'); I.markRead(s, m.id); }
        game.changed(); game.save(); render();
      };
      list.appendChild(card);
    }
  };
  render();
}

/** 「经营」页顶：今天 6/10 · 0 点换新一批 +「再来 10 件」（设计39 第三节；批次、清掉是开发1 的，这里只数今天的经营事件） */
function bizHead(s, render) {
  const t = now(); const c = todayCount(s, t); // 开发1 的批次：今天 done/total
  const el = h('div', 'biz-head', `<span>今天 <b>${c.done}/${c.total}</b> · 0 点换新一批</span>${refillHtml(s)}`); // 设计39：用事件券（开发2 ui/coupon.js）
  bindRefill(el, render);
  return el;
}
