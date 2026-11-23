// 设计35 第九、十节（开发2）：品牌邀请 / 订单到了 / 定制接受了 = 要你签字的事，不过期。
// 一直挂在消息「邀请」和「待处理」里，直到签了（买了）或者点「婉拒」；同一款只留一张。
import * as I from '../core/inbox.js?v=47e8f1b5';
import * as AS from '../core/assets.js?v=47e8f1b5';
import * as LX from '../core/luxury.js?v=47e8f1b5';
import * as YT from '../core/yacht.js?v=47e8f1b5';
import { fmtMoney } from '../core/format.js?v=47e8f1b5';
import { now } from '../core/clock.js?v=47e8f1b5';
import { game } from '../game.js?v=47e8f1b5';
import { toast } from './dom.js?v=47e8f1b5';
import { addActionUi } from './inbox.js?v=47e8f1b5';

// src：car（车 / 飞机，s.orders）· lux（表 / 西装 / 包，luxury 的 orders）· yacht（s.yachtOrders）
const SRC = {
  car: { item: (id) => AS.ITEM[id], order: (s, id) => AS.orderOf(s, id), cancel: (s, id) => { s.orders = (s.orders || []).filter((o) => o.id !== id); }, label: (x) => AS.label(x) },
  lux: { item: (id) => LX.L[id], order: (s, id) => LX.orderOf(s, id), cancel: (s, id) => LX.cancelOrder(s, id), label: (x) => LX.label(x) },
  yacht: { item: (id) => YT.Y[id], order: (s, id) => YT.orderOf(s, id), cancel: (s, id) => YT.cancelOrder(s, id), label: (x) => YT.label(x) },
};
const CH = { invite: '品牌邀请', custom: '定制委托', order: '订单配额', alloc: '配货' };

/** 邀请里写清楚：价格、要签的不转卖协议、限量几台 */
export function bodyOf(src, x, ch, extra = '') {
  const lim = x.limit === 1 ? '全球唯一' : x.limit ? `全球限量 ${x.limit} ${src === 'yacht' ? '艘' : x.kind === 'car' ? '台' : '只'}` : '';
  const noResale = ch === 'invite' || ch === 'custom' || x.noResale;
  return [`价格 ${fmtMoney(x.price)}${lim ? `（${lim}）` : ''}`,
    noResale ? '要签不转卖协议：以后卖回会被品牌拉黑' : '',
    '邀请一直有效，什么时候签都行；不想要就点「婉拒」', extra].filter(Boolean).join('<br>');
}

/** 到点发一张（同一款已经有一张没处理的就不再发） */
export function notify(s, src, o, title, extra = '') {
  const S = SRC[src]; const x = S.item(o.id); if (!x) return null;
  const has = (s.inbox || []).some((m) => m.type === 'brand_invite' && m.status === 'open' && m.data && m.data.src === src && m.data.id === o.id);
  if (has) return null;
  return I.addMsg(s, { kind: 'invite', type: 'brand_invite', title, body: bodyOf(src, x, o.ch, extra),
    actions: [{ key: 'go', label: x.kind === 'bag' ? '去送给她' : '去签合同' }, { key: 'reject', label: '婉拒' }], data: { src, id: o.id, ch: o.ch } }, now());
}

// 婉拒：撤掉排队（订单定金按原规矩不退）
I.onAction('brand_invite', (s, m, a) => { if (a !== 'reject') return false; const S = SRC[m.data.src]; S && S.cancel(s, m.data.id); return true; });
// 去签：开对应的店，消息不关（签了才关）
addActionUi((s, m, a) => {
  if (m.type !== 'brand_invite' || a !== 'go') return false;
  I.markRead(s, m.id); const { src, id } = m.data; const x = SRC[src].item(id);
  if (src === 'car') import('./assets.js?v=47e8f1b5').then((u) => u.openShop(x.kind, () => game.changed()));
  else if (src === 'yacht') import('./yacht.js?v=47e8f1b5').then((u) => u.openYachtShop(() => game.changed()));
  else if (x.kind === 'bag') toast('去「商场 → 名包」选一位送给她', 2600);
  else import('./luxury.js?v=47e8f1b5').then((u) => u.openLuxShop(x.kind, () => game.changed()));
  return true;
});
/** 签了 / 撤了：对应的邀请消息关掉（不留在待处理） */
export function sync(s) {
  for (const m of s.inbox || []) {
    if (m.type !== 'brand_invite' || m.status !== 'open' || !m.data) continue;
    const S = SRC[m.data.src]; if (!S || !S.order(s, m.data.id)) { m.status = 'done'; m.read = true; }
  }
}
let last = 0;
game.addTicker((s) => { const t = now(); if (t - last < 1000) return; last = t; sync(s); });
