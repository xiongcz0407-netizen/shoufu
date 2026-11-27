// 服装店（按秘书分页）和衣柜；换装出场
import { SECRETARIES, SEC_BY_ID } from '../config/secretaries.js?v=b846574c';
import { outfitsOf, priceOf } from '../config/outfits.js?v=b846574c';
import { autoDressRow } from './secretary.js?v=b846574c';   // 设计74
import { LINES } from '../config/lines.js?v=b846574c';
import * as STY from '../core/styles.js?v=b846574c'; // V3-05 衣服名字和款式
import * as O from '../core/outfits.js?v=b846574c';
import { fmtMoney } from '../core/format.js?v=b846574c';
import { asset } from '../platform/assets.js?v=b846574c';
import { game } from '../game.js?v=b846574c';
import { now } from '../core/clock.js?v=b846574c';
import { h, openPanel, toast } from './dom.js?v=b846574c';
import { say, dressUp } from './main-screen.js?v=b846574c';

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
    for (const o of outfitsOf(cur).slice(1)) {   // 设计66：按人几套
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
  const all = outfitsOf(id); const mine = all.filter((o) => O.owns(s, id, o.id));   // 设计70：只放买了的
  for (const o of mine) {
    const ok = O.canWear(s, id, o.id);
    const card = h('div', 'cloth' + (ok ? '' : ' dim') + (s.secs[id].outfit === o.id ? ' on' : ''), `<img src="${asset(`assets/sec/${id}/${o.id}.webp`)}" alt="">
      <div class="cloth-meta">${STY.nameOf(id, o.id)}${STY.styleOf(id, o.id) ? `<em class="cloth-st">${STY.styleOf(id, o.id)}</em>` : ''}${s.secs[id].outfit === o.id ? ' · 穿着' : ''}</div>${ok ? '' : `<div class="cloth-need">${O.needText(o.id)}</div>`}`);
    card.onclick = ok ? () => { O.chooseOutfit(s, id, o.id); p.close(); if (id === s.current) dressUp(id, o.id); game.changed(); game.save(); } : () => toast(O.needText(o.id));
    grid.appendChild(card);
  }
  if (mine.length < all.length) { const b = h('button', 'cloth cloth-mall', '<div class="cloth-mall-in">去商场<br>买衣服 ›</div>'); b.onclick = () => { p.close(); import('./mall.js?v=b846574c').then((m) => m.openMall(id, 'clothes')); }; grid.appendChild(b); }
  p.body.append(h('div', 'tr-gain', `已有 <b>${mine.length} / ${all.length}</b> 套，点一套让她换上`), autoDressRow(s, id, () => { p.close(); openWardrobe(id); }), grid);   // 设计74 开关
}
