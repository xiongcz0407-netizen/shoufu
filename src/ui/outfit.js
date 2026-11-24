// 服装店（按秘书分页）和衣柜；换装出场
import { SECRETARIES, SEC_BY_ID } from '../config/secretaries.js?v=e379aa95';
import { OUTFITS, priceOf } from '../config/outfits.js?v=e379aa95';
import { LINES } from '../config/lines.js?v=e379aa95';
import * as STY from '../core/styles.js?v=e379aa95'; // V3-05 衣服名字和款式
import * as O from '../core/outfits.js?v=e379aa95';
import { fmtMoney } from '../core/format.js?v=e379aa95';
import { asset } from '../platform/assets.js?v=e379aa95';
import { game } from '../game.js?v=e379aa95';
import { now } from '../core/clock.js?v=e379aa95';
import { h, openPanel, toast } from './dom.js?v=e379aa95';
import { say, dressUp } from './main-screen.js?v=e379aa95';

export function openShop(secId, host) {
  const s = game.state;
  const ids = SECRETARIES.map((c) => c.id).filter((id) => s.secs[id]);
  let cur = secId && s.secs[secId] ? secId : s.current;
  const p = host || openPanel('服装店');
  const tabs = h('div', 'tabs');
  const grid = h('div', 'cloth-grid');
  p.body.append(tabs, grid);
  const render = () => {
    tabs.innerHTML = '';
    for (const id of ids) {
      const t = h('button', 'tab' + (id === cur ? ' on' : ''), SEC_BY_ID[id].name);
      t.onclick = () => { cur = id; render(); };
      tabs.appendChild(t);
    }
    grid.innerHTML = '';
    for (const o of OUTFITS.slice(1)) {
      const own = O.owns(s, cur, o.id); const wear = O.canWear(s, cur, o.id);
      const card = h('div', 'cloth' + (!wear && !own ? ' dim' : ''), `<img src="${asset(`assets/sec/${cur}/${o.id}.webp`)}" alt="">
        <div class="cloth-meta">${STY.nameOf(cur, o.id)}${STY.styleOf(cur, o.id) ? `<em class="cloth-st">${STY.styleOf(cur, o.id)}</em>` : ''}</div>
        ${own ? `<div class="cloth-own">${wear ? '已买 · 能穿' : '已买 · ' + O.needText(o.id)}</div>` : `<div class="cloth-need">${s.secs[cur].favor >= o.needFavor ? '' : O.needText(o.id)}</div><button class="btn">${fmtMoney(priceOf(cur, o.id))}</button>`}`);
      const b = card.querySelector('.btn');
      if (b) {
        b.disabled = s.cash < priceOf(cur, o.id);
        b.onclick = () => {
          const r = O.buyOutfit(s, cur, o.id, now());
          if (!r.ok) { toast(r.why); return; }
          toast(`给${SEC_BY_ID[cur].name}买了「${STY.nameOf(cur, o.id)}」`);
          if (r.favor.stageUp) game.emit('favorUp', cur, r.favor);
          const worn = O.autoWear(s, cur);
          if (worn) { p.close(); wearShow(cur, worn); }
          else if (cur === s.current) say(cur, LINES[cur].gift_cloth, 3600, 'gift_cloth');
          else toast(`${SEC_BY_ID[cur].name}：「${LINES[cur].gift_cloth}」`, 3000);
          game.changed(); game.save(); render();
        };
      }
      grid.appendChild(card);
    }
  };
  render();
}

/** 换上新衣服：如果她正陪着，播换装 + 说 wear；不然提示 */
export function wearShow(id, outfit) {
  const s = game.state;
  if (id === s.current) { dressUp(id, outfit); setTimeout(() => say(id, LINES[id].wear, 3800, 'wear'), 500); }
  else toast(`${SEC_BY_ID[id].name}换上了你送的「${STY.nameOf(id, outfit)}」`, 2600);
  game.changed(); game.save();
}

export function openWardrobe(id) {
  const s = game.state;
  const p = openPanel(`${SEC_BY_ID[id].name} 的衣柜`);
  const grid = h('div', 'cloth-grid');
  for (const o of OUTFITS) {
    if (!O.owns(s, id, o.id)) continue;
    const ok = O.canWear(s, id, o.id);
    const card = h('div', 'cloth' + (ok ? '' : ' dim') + (s.secs[id].outfit === o.id ? ' on' : ''), `<img src="${asset(`assets/sec/${id}/${o.id}.webp`)}" alt="">
      <div class="cloth-meta">${STY.nameOf(id, o.id)}${STY.styleOf(id, o.id) ? `<em class="cloth-st">${STY.styleOf(id, o.id)}</em>` : ''}${s.secs[id].outfit === o.id ? ' · 穿着' : ''}</div>${ok ? '' : `<div class="cloth-need">${O.needText(o.id)}</div>`}`);
    if (ok) card.onclick = () => { O.chooseOutfit(s, id, o.id); p.close(); if (id === s.current) dressUp(id, o.id); game.changed(); game.save(); };
    grid.appendChild(card);
  }
  const shop = h('button', 'btn', '去商场买衣服');
  shop.style.marginTop = '10px'; shop.style.width = '100%';
  shop.onclick = () => { p.close(); import('./mall.js?v=e379aa95').then((m) => m.openMall(id, 'clothes')); };
  p.body.append(grid, shop);
}
