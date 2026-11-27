// 「资产 → 收藏」（第 2-13 项）：收藏室（我的藏品）| 古玩市场 | 拍卖会 | 私洽
import * as AQ from '../core/antique.js?v=5f2b1b8c';
import * as INB from '../core/inbox.js?v=5f2b1b8c';
import { SEC_BY_ID } from '../config/secretaries.js?v=5f2b1b8c';
import { fmtMoney, fmtDuration } from '../core/format.js?v=5f2b1b8c';
import { asset, hasAsset } from '../platform/assets.js?v=5f2b1b8c';
import { game } from '../game.js?v=5f2b1b8c';
import { now } from '../core/clock.js?v=5f2b1b8c';
import { h, openPanel, toast } from './dom.js?v=5f2b1b8c';
import { renderAuctionHouse } from './auction.js?v=5f2b1b8c';

const pic = (x, cls = 'as-img') => (hasAsset(`assets/antique/${x.id}.webp`) ? `<img class="${cls}" src="${asset(`assets/antique/${x.id}.webp`)}" alt="">` : `<div class="${cls} as-ph">${x.name}<small>${AQ.CH_NAME[x.channel]}</small></div>`);
const RAR = { limited: ['badge_limited', '限量'], unique: ['badge_unique', '孤品'] };
const badge = (x) => { const r = AQ.rarityOf(x); if (!RAR[r]) return ''; const ic = `assets/ui/${RAR[r][0]}.webp`; return `<span class="badge ${r}">${hasAsset(ic) ? `<img src="${asset(ic)}" alt="">` : ''}${RAR[r][1]}<small>${x.limit === 1 ? '全球唯一' : `存世 ${x.limit} 瓶`}</small></span>`; };
const frame = (x) => 'fr-' + AQ.rarityOf(x);
const pct = (a, b) => `${a >= b ? '+' : ''}${((a / b - 1) * 100).toFixed(1)}%`;
let seg = 'mine';

/** 资产页「收藏」这一格（ui/assets.js 调） */
export function renderCollectTab(wrap, redraw) {
  const s = game.state; const t = now(); const list = AQ.pieces(s).slice().sort((a, b) => b.est - a.est);
  const stage = h('div', 'as-stage collect');
  const cbg = ['assets/bg/bg_collection.webp', 'assets/bg/bg_auction.webp'].find(hasAsset);   // 收藏室背景（没有就借拍卖厅）
  if (cbg) stage.style.backgroundImage = `url("${asset(cbg)}")`;
  const top = list.find((x) => !x.fake);
  stage.innerHTML = top ? `<div class="as-hero ${frame(AQ.AQ[top.id])}">${pic(AQ.AQ[top.id], 'as-hero-img')}</div><div class="as-hero-name">${AQ.AQ[top.id].name} ${badge(AQ.AQ[top.id])}</div>` : '<div class="as-empty">收藏室还是空的</div>';
  wrap.appendChild(stage);
  const who = AQ.advisor(s); const adv = AQ.advice(s);
  wrap.appendChild(h('div', 'tr-gain', `藏品 ${list.length} 件　估价合计 <b>${fmtMoney(AQ.value(s))}</b>　展柜 ${AQ.cabinets(s)} 个　掌眼 ${Math.round(AQ.eyeRate(s) * 100)}%${who ? `（收藏顾问 ${SEC_BY_ID[who].name}）` : ''}${adv.length ? `<br>💡 ${SEC_BY_ID[who].name}：${adv.map((x) => AQ.AQ[x.id].name).join('、')} 比买的时候涨了 30% 以上，可以考虑拍卖出手` : ''}`));
  const tabs = h('div', 'tabs');
  for (const [k, n] of [['mine', '收藏室'], ['market', '古玩市场'], ['auction', '拍卖会'], ['private', '私洽']]) { const b = h('button', 'tab' + (k === seg ? ' on' : ''), n); b.onclick = () => { seg = k; redraw(); }; tabs.appendChild(b); }
  wrap.appendChild(tabs);
  const grid = h('div', 'as-grid shop');
  if (seg === 'mine') {
    for (const it of list) {
      const x = AQ.AQ[it.id];
      const c = h('button', 'as-card ' + frame(x), `${pic(x)}${badge(x)}${it.fake ? '<span class="badge fake">仿品</span>' : ''}<b>${x.name}</b><small>估价 ${fmtMoney(it.est)}　${it.fake ? '买了 ' + fmtMoney(it.paid) : pct(it.est, it.paid)}</small>`);
      c.onclick = () => openPiece(it.uid, redraw); grid.appendChild(c);
    }
    if (!list.length) grid.appendChild(h('div', 'empty', '还没有藏品：去古玩市场淘，或者等拍卖会'));
  } else if (seg === 'market') {
    const m = AQ.market(s, t);
    wrap.appendChild(h('div', 'tr-gain', `潘家园的摊位，${fmtDuration((m.until - t) / 1000)} 后换一批。这里没有发票，三成是仿品；掌眼 ${Math.round(AQ.eyeRate(s) * 100)}%（老板眼光和收藏顾问智慧取高的）`));
    for (const o of m.offers) {
      const x = AQ.AQ[o.id]; const sus = AQ.suspect(s, o);
      const c = h('div', 'as-card fr-normal' + (o.sold ? ' dim' : ''), `${pic(x)}<b>${x.name}</b><small>摊主要价 ${fmtMoney(o.price)}　行情约 ${fmtMoney(x.est)}</small><small class="${sus ? 'neg' : ''}">${sus ? '⚠ 掌眼看着不对：疑似仿品' : '看着没问题'}</small>${o.sold ? '<em class="owned">卖掉了</em>' : '<button class="btn gold buy">买下</button>'}`);
      const b = c.querySelector('.buy'); if (b) b.onclick = () => { const r = AQ.buyMarket(s, o.oid, now()); if (!r.ok) { toast(r.why); return; } toast(r.fake ? `拿回去请人一看……是仿品，只值 ${fmtMoney(r.item.est)}` : `收了 ${x.name}，是真东西`, 3000); game.changed(); game.save(); redraw(); };
      grid.appendChild(c);
    }
  } else if (seg === 'auction') {
    renderAuctionHouse(wrap, redraw); return;   // 车和古董同一个拍卖会（第 2-14b 项）
  } else {
    for (const x of AQ.ITEMS.filter((y) => y.channel === 'private')) {
      const o = AQ.orderOf(s, x.id); const why = AQ.whyNotPrivate(s, x.id); const own = AQ.ownsUnique(s, x.id);
      const act = own ? '<em class="owned">在你手里</em>' : o ? (t >= o.at ? '<button class="btn gold sign">签私洽协议</button>' : `<button class="btn" disabled>拍卖行私洽部在谈 还剩 ${fmtDuration((o.at - t) / 1000)}</button>`) : why ? `<div class="sc-cond">${why}</div>` : '<button class="btn gold ask">请拍卖行私洽部去谈</button>';
      const c = h('div', 'as-card ' + frame(x) + (why && !o && !own ? ' dim' : ''), `${pic(x)}${badge(x)}<b>${x.name}</b><small>约 ${fmtMoney(x.est)}　只给大藏家，名额 1</small>${act}`);
      const on = (sel, fn) => { const y = c.querySelector(sel); if (y) y.onclick = fn; };
      on('.ask', () => { const r = AQ.startPrivate(s, x.id, now()); if (!r.ok) { toast(r.why); return; } toast('私洽部去联系藏家了，30 分钟后有消息'); game.changed(); game.save(); redraw(); });
      on('.sign', () => { const r = AQ.closePrivate(s, x.id, now()); if (!r.ok) { toast(r.why); return; } toast(`签好了：${r.contract.no}`); game.changed(); game.save(); redraw(); });
      grid.appendChild(c);
    }
  }
  wrap.appendChild(grid);
}

function openPiece(uid, done) {
  const s = game.state; const it = AQ.pieces(s).find((x) => x.uid === uid); const x = AQ.AQ[it.id];
  const p = openPanel(x.name);
  p.body.innerHTML = `<div class="as-detail ${frame(x)}">${pic(x, 'as-hero-img')}</div><div class="as-badges">${badge(x)}</div>
    <div class="staff-tbl"><div><span>怎么来的</span><b>${({ market: '古玩市场', auction: '拍卖', proxy: '收藏顾问代拍', private: '私洽' })[it.via] || ''}</b></div><div><span>凭证</span><b>${it.contract || '—'}</b></div>
      <div><span>买入（含税费）</span><b>${fmtMoney(it.paid)}</b></div><div><span>现在估价</span><b>${fmtMoney(it.est)}</b></div></div>
    <div class="tr-gain">${it.fake ? '<span class="neg">请人看过：这是仿品，只值 5%，拍卖行不收。</span>' : '估价每小时随行情走。再拍卖卖出：成交价随场次浮动，扣卖家佣金 10%，赚了的部分交 20% 财产转让所得个税。藏品不送人。'}</div>
    ${it.fake ? '' : '<button class="btn gold big sell">送拍卖行卖出</button>'}`;
  const b = p.body.querySelector('.sell');
  if (b) b.onclick = () => {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '确定送拍？'; return; }
    const r = AQ.sell(s, uid, now()); if (!r.ok) { toast(r.why); return; }
    toast(`落槌 ${fmtMoney(r.hammer)}，到手 ${fmtMoney(r.net)}${r.tax ? `（交了 ${fmtMoney(r.tax)} 个税）` : ''}`, 3000); game.changed(); game.save(); p.close(); done && done();
  };
}

// 每秒：估价走、私洽到点
game.addTicker((s) => { for (const x of AQ.tick(s, now())) INB.addMsg(s, { kind: 'invite', type: 'asset_ready', title: x, body: '资产 → 收藏 → 私洽', actions: [{ key: 'approve', label: '知道了' }] }, now()); });
