// 送礼（商场「礼物」分段、秘书详情「送礼」直达）：36 件按 4 档分，她最喜欢的 3 样排前面带 ♥；走个人现金、出发票
import { GIFTS, GIFT_TIERS } from '../config/gifts.js?v=77f12d68';
import { SEC_BY_ID } from '../config/secretaries.js?v=77f12d68';
import * as A from '../core/affection.js?v=77f12d68';
import { fmtMoney } from '../core/format.js?v=77f12d68';
import { asset, hasAsset } from '../platform/assets.js?v=77f12d68';
import { now } from '../core/clock.js?v=77f12d68';
import { game } from '../game.js?v=77f12d68';
import { h, openPanel, toast } from './dom.js?v=77f12d68';
import { say } from './main-screen.js?v=77f12d68';

let lastTier = 0; // 0 = 她喜欢的
export function openGift(secId, host) {
  const s = game.state; const c = SEC_BY_ID[secId];
  const p = host || openPanel(`送 ${c.name} 什么？`);
  const tabs = h('div', 'tabs gift-tabs'); const grid = h('div', 'gift-grid');
  p.body.append(h('div', 'gift-tip', `她最喜欢：<b>${c.gifts.join('、')}</b>（好感 ×2、爱慕 +1）${A.favorMult(s) > 1 ? `　老板气场：好感 ×${A.favorMult(s).toFixed(2)}` : ''}`), tabs, grid);
  const render = () => {
    tabs.innerHTML = '';
    ['她喜欢的', ...GIFT_TIERS.slice(1)].forEach((n, i) => { const b = h('button', 'tab' + (i === lastTier ? ' on' : ''), n); b.onclick = () => { lastTier = i; render(); }; tabs.appendChild(b); });
    grid.innerHTML = '';
    const list = GIFTS.filter((g) => (lastTier ? g.tier === lastTier : c.gifts.includes(g.name))).sort((a, b) => a.price - b.price);
    for (const g of list) {
      const liked = c.gifts.includes(g.name); const img = `assets/gift/${g.id}.webp`;
      const fav = Math.round((liked ? g.favor * 2 : g.favor) * A.favorMult(s));
      const card = h('div', 'gift-card' + (liked ? ' liked' : ''), `${hasAsset(img) ? `<img src="${asset(img)}" alt="">` : `<div class="gift-ph">${g.name}</div>`}
        ${liked ? '<i class="gift-heart">♥</i>' : ''}<b>${g.name}</b><small>好感 +${fav}${liked ? '　爱慕 +1' : ''}</small><button class="btn">${fmtMoney(g.price)}</button>`);
      const b = card.querySelector('.btn'); b.disabled = game.state.cash < g.price;
      b.onclick = () => {
        const r = A.giveGift(game.state, secId, g.id, now());
        if (!r.ok) { toast(r.why); return; }
        if (!host) p.close();
        say(secId, r.line, 3600, 'happy');
        toast(`${c.name} 好感 +${r.favor.to - r.favor.from}${r.love.to > r.love.from ? `　♥ +${r.love.to - r.love.from}` : ''}　（${r.invoice.no} 已收进档案柜）`, 2600, { top: true });
        if (r.favor.stageUp) game.emit('favorUp', secId, r.favor);
        if (r.love.stageUp) game.emit('loveUp', secId, r.love);
        game.changed(); game.save(); render();
      };
      grid.appendChild(card);
    }
    if (!list.length) grid.appendChild(h('div', 'empty', '没有'));
  };
  render();
}
