// 商场（首页右侧浮动；秘书详情「送礼」直达）：礼物 | 衣服，都按秘书分页，走个人现金
import { SECRETARIES, SEC_BY_ID } from '../config/secretaries.js?v=d17576a6';
import { fmtMoney } from '../core/format.js?v=d17576a6';
import { game } from '../game.js?v=d17576a6';
import { h } from './dom.js?v=d17576a6';
import { asset, hasAsset } from '../platform/assets.js?v=d17576a6';
import { openFull } from './shell.js?v=d17576a6';
import { openGift } from './gift.js?v=d17576a6';
import { openShop } from './outfit.js?v=d17576a6';
import { openBags } from './luxury.js?v=d17576a6';

export function openMall(secId, seg = 'gift') {
  const s = game.state;
  let who = secId && s.secs[secId] ? secId : s.current;
  const p = openFull('商场');
  const segBar = h('div', 'seg-bar'); const top = h('div', 'mall-top'); const body = h('div', 'page-body');
  p.body.append(segBar, top, body);
  const host = { el: body, body, close: () => render() };
  const render = () => {
    segBar.innerHTML = '';
    for (const [k, n] of [['gift', '礼物'], ['bag', '名包'], ['clothes', '衣服']]) {
      const b = h('button', 'seg' + (k === seg ? ' on' : ''), n); b.onclick = () => { seg = k; render(); }; segBar.appendChild(b);
    }
    top.innerHTML = `💰 个人现金 <b>${fmtMoney(game.state.cash)}</b>`;
    const bgk = `assets/bg/${seg === 'gift' ? 'bg_mall' : 'bg_boutique'}.webp`; // 商场 / 服装店背景做页头
    top.style.backgroundImage = hasAsset(bgk) ? `linear-gradient(90deg, rgba(10,14,24,.92) 35%, rgba(10,14,24,.3)), url("${asset(bgk)}")` : '';
    body.innerHTML = '';
    if (seg === 'gift' || seg === 'bag') {
      const tabs = h('div', 'tabs');
      for (const c of SECRETARIES.filter((x) => s.secs[x.id])) { const b = h('button', 'tab' + (c.id === who ? ' on' : ''), c.name); b.onclick = () => { who = c.id; render(); }; tabs.appendChild(b); }
      body.appendChild(tabs);
      const inner = h('div'); body.appendChild(inner);
      if (seg === 'bag') openBags(who, { el: inner, body: inner }); // 第 2-12 项：名包只能送秘书
      else openGift(who, { el: inner, body: inner, close: () => render() });
    } else openShop(who, host);
  };
  render();
  const off = game.onChange(() => { if (!document.body.contains(p.el)) { off(); return; } top.innerHTML = `💰 个人现金 <b>${fmtMoney(game.state.cash)}</b>`; });
}
