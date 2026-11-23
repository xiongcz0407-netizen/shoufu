// 拍卖会界面（第 2-14b 项）：车行「拍卖」分段和收藏「拍卖会」页签都画这一个（车和古董同一场）
import * as AU from '../core/auction.js?v=f10d7ba9';
import * as AQ from '../core/antique.js?v=f10d7ba9';
import * as AS from '../core/assets.js?v=f10d7ba9';
import * as INB from '../core/inbox.js?v=f10d7ba9';
import { SEC_BY_ID } from '../config/secretaries.js?v=f10d7ba9';
import { fmtMoney, fmtDuration } from '../core/format.js?v=f10d7ba9';
import { asset, hasAsset } from '../platform/assets.js?v=f10d7ba9';
import { game } from '../game.js?v=f10d7ba9';
import { now } from '../core/clock.js?v=f10d7ba9';
import { h, openPanel, toast } from './dom.js?v=f10d7ba9';
import { showcase } from './assets.js?v=f10d7ba9';
import { hintLater } from './guide2.js?v=f10d7ba9';

let bidX = 1.3;
const pic = (l) => {
  const p = l.kind === 'car' ? `assets/car/${l.id}.webp` : `assets/antique/${l.id}.webp`;
  return hasAsset(p) ? `<img class="as-img" src="${asset(p)}" alt="">` : `<div class="as-img as-ph">${l.name}<small>${l.kind === 'car' ? '停产限量' : '古董'}</small></div>`;
};

/** 画进 wrap；redraw：外面的整页重画 */
export function renderAuctionHouse(wrap, redraw, carFilter = null) {   // 设计27：车行的类型 / 品牌筛选传进来（有筛选时只列符合的车）
  hintLater('auction');
  const s = game.state; const t = now(); const c = AU.catalog(s, t); const who = AQ.advisor(s);
  const top = h('div', 'auc-head');
  if (hasAsset('assets/bg/bg_auction.webp')) top.style.backgroundImage = `url("${asset('assets/bg/bg_auction.webp')}")`;
  top.innerHTML = `<b>苏富笔 · 佳得 联合拍卖会</b><small>这一场 ${fmtDuration((c.until - t) / 1000)} 后落幕，下一场换图录${c.hidden ? `；还有 ${c.hidden} 件人脉不够、没收到图录` : ''}</small>`;
  wrap.appendChild(top);
  // 拍到了还没付的
  for (const w of AU.wonList(s)) {
    const tot = AU.wonTotal(s, w);
    const r = h('div', 'tr-course', `<div><b>${w.private ? '私洽谈成' : '拍到了'}：${w.name}</b><div class="tr-gain">落槌 ${fmtMoney(w.hammer)}，连佣金税费 ${fmtMoney(tot)}；<span class="neg">${fmtDuration(Math.max(0, w.deadline - t) / 1000)} 内不付款算违约，人脉 −${AU.AUCFG.defaultNetwork}</span></div></div><button class="btn gold">签确认书付款</button>`);
    r.querySelector('.btn').onclick = () => {
      const x = AU.pay(s, w.lot, now()); if (!x.ok) { toast(x.why); return; }
      toast(`成交：${x.contract.no}`); game.changed(); game.save();
      if (w.kind === 'car') showcase(AS.ITEM[w.id]); redraw();
    };
    wrap.appendChild(r);
  }
  wrap.appendChild(h('div', 'tr-gain', `车和古董同一场；人脉够才收到图录。成交另付买家佣金（分段 26% / 20% / 15%）；车加购置税等，海外拍回来的古董加进口关税和增值税。拍到了 ${AU.AUCFG.payMin} 分钟内要付款`));
  const bx = h('div', 'tabs');
  for (const k of [1, 1.3, 1.6, 2]) { const b = h('button', 'tab' + (k === bidX ? ' on' : ''), `最多出到起拍价 ×${k}`); b.onclick = () => { bidX = k; redraw(); }; bx.appendChild(b); }
  wrap.appendChild(bx);
  const grid = h('div', 'as-grid shop');
  for (const l of c.lots.filter((x) => !carFilter || (x.kind === 'car' && AS.ITEM[x.id] && carFilter(AS.ITEM[x.id])))) {
    const max = Math.round(l.start * bidX);
    const card = h('div', 'as-card fr-auction', `${pic(l)}<span class="badge auction">${hasAsset('assets/ui/badge_auction.webp') ? `<img src="${asset('assets/ui/badge_auction.webp')}" alt="">` : ''}拍卖</span><b>${l.name}</b><small>起拍 ${fmtMoney(l.start)}　${l.kind === 'car' ? `原价 ${fmtMoney(l.base)}` : `估价 ${fmtMoney(l.base)}`}　人脉 ≥ ${l.need}</small><small>你最多出 ${fmtMoney(max)}</small><button class="btn gold me">举牌</button><button class="btn priv">私洽（直接找卖家谈）</button>${l.kind === 'antique' && who ? `<button class="btn proxy">交给${SEC_BY_ID[who].name}代拍</button>` : ''}`);
    const go = (proxy) => {
      if (s.cash < max) { toast('个人现金不够你的最高出价'); return; }
      const r = AU.bid(s, l.lot, max, now(), { proxy }); if (!r.ok) { toast(r.why); return; }
      const p = openPanel(`拍卖 · ${l.name}`);
      p.body.innerHTML = `<div class="tr-gain">🔨 起拍 ${fmtMoney(l.start)}${proxy ? `，${SEC_BY_ID[who].name}替你举牌` : ''}</div><div class="tr-gain">🔨 对手最高出到 ${fmtMoney(r.npc)}</div><div class="rate">${r.won ? `落槌 <b>${fmtMoney(r.w.hammer)}</b>` : '没拍到'}</div>${r.won ? `<div class="tr-gain">连佣金税费 ${fmtMoney(r.total)}，${AU.AUCFG.payMin} 分钟内付款</div><button class="btn gold big">签确认书付款</button>` : ''}`;
      const pb = p.body.querySelector('.btn'); if (pb) pb.onclick = () => { const x = AU.pay(s, r.w.lot, now()); if (!x.ok) { toast(x.why); return; } p.close(); toast(`成交：${x.contract.no}`); game.changed(); game.save(); if (l.kind === 'car') showcase(AS.ITEM[l.id]); redraw(); };
      game.changed(); game.save(); redraw();
    };
    card.querySelector('.me').onclick = () => go(false); card.querySelector('.priv').onclick = () => import('./negotiate.js?v=f10d7ba9').then((N) => N.openPrivateAuction(l, redraw)); const pp = card.querySelector('.proxy'); if (pp) pp.onclick = () => go(true);
    grid.appendChild(card);
  }
  if (!c.lots.length) grid.appendChild(h('div', 'empty', '这一场没有你能举的（人脉不够、或者都举过了）'));
  wrap.appendChild(grid);
}

// 每秒：违约检查
game.addTicker((s) => { for (const x of AU.tick(s, now())) { toast(x, 3000); INB.addMsg(s, { kind: 'system', type: 'auction', title: x, body: '资产 → 车库 → 去买车 → 拍卖' }, now()); } });
