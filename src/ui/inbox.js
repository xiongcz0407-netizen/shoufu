// 消息中心（铃铛）：请示 / 月报 / 邀请拍卖 / 系统；请示直接批准 / 驳回
import * as I from '../core/inbox.js?v=1236a42d';
import { SEC_BY_ID } from '../config/secretaries.js?v=1236a42d';
import { asset } from '../platform/assets.js?v=1236a42d';
import { now } from '../core/clock.js?v=1236a42d';
import { game } from '../game.js?v=1236a42d';
import { h, toast } from './dom.js?v=1236a42d';
import { openFull } from './shell.js?v=1236a42d';
import { bump } from '../core/daily.js?v=1236a42d';
import { openEventMsg } from './event.js?v=1236a42d';

/** 页签那一排放不下时，把选中的滑到中间 */
function showOn(row) { const b = row.querySelector('.seg.on'); if (!b || row.scrollWidth <= row.clientWidth) return; const r = row.getBoundingClientRect(), x = b.getBoundingClientRect(); if (x.left >= r.left && x.right <= r.right) return; row.scrollLeft += x.left - r.left - (r.width - x.width) / 2; }
export function openInbox(kind) {
  const p = openFull('消息');
  let cur = kind || Object.entries(I.counts(game.state)).find(([, v]) => v.open)?.[0] || 'request';
  const bar = h('div', 'seg-bar'); const list = h('div', 'page-body');
  p.body.append(bar, list);
  const render = () => {
    const s = game.state; const c = I.counts(s);
    bar.innerHTML = '';
    for (const [k, name] of Object.entries(I.KINDS)) {
      const n = I.NEEDS_ACTION[k] ? c[k].open : c[k].unread;
      const b = h('button', 'seg' + (k === cur ? ' on' : ''), `${name}${n ? ` <i class="segn ${I.NEEDS_ACTION[k] ? 'red' : ''}">${n}</i>` : ''}`);
      b.onclick = () => { cur = k; render(); };
      bar.appendChild(b);
    }
    requestAnimationFrame(() => showOn(bar)); // 选中的页签滑到中间（照车行筛选）
    list.innerHTML = '';
    const items = (s.inbox || []).filter((m) => m.kind === cur);
    if (!items.length) list.appendChild(h('div', 'empty', '没有消息'));
    for (const m of items) {
      const from = SEC_BY_ID[m.from];
      const card = h('div', 'msg' + (m.read ? '' : ' unread'), `${from ? `<img src="${asset(`assets/sec/${m.from}/c1.webp`)}" alt="">` : '<i class="msg-ico">📄</i>'}
        <div class="msg-main"><div class="msg-title">${m.title}</div><div class="msg-body">${m.body}</div>
        <div class="msg-foot">${[from ? from.name : '', m.type === 'biz_event' && m.status === 'done' ? `已处理：${m.choice || ''}` : m.status === 'approved' ? '已批准' : m.status === 'rejected' ? '已驳回' : ''].filter(Boolean).join(' · ')}</div>
        ${m.status === 'open' ? `<div class="ind-btns">${m.actions.map((a) => `<button class="btn ${a.key === 'approve' ? 'gold' : ''}" data-a="${a.key}">${a.label}</button>`).join('')}</div>` : ''}</div>`);
      card.onclick = (e) => {
        const a = e.target.dataset && e.target.dataset.a;
        if (a === 'open' && m.type === 'event') { I.markRead(s, m.id); openEventMsg(m, render); } // 事件：播剧情 + 选择（选完才算处理）
        else if (a) { const lab = (m.actions.find((x) => x.key === a) || {}).label || ''; if (I.act(s, m.id, a, now())) toast(m.type === 'biz_event' ? `已处理：${lab}${m.result ? `\n${m.result}` : ''}` : a === 'reject' ? '已驳回' : '已批准', m.type === 'biz_event' ? 3200 : undefined); else toast('办不了（钱不够或已经过期）'); }
        else { if (m.kind === 'report' && !m.read) bump(s, now(), 'report'); I.markRead(s, m.id); }
        game.changed(); game.save(); render();
      };
      list.appendChild(card);
    }
  };
  render();
}
