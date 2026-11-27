// 商场（首页右侧浮动；秘书详情「送礼」直达）：礼物 | 衣服，都按秘书分页，走个人现金
import { SECRETARIES, SEC_BY_ID } from '../config/secretaries.js?v=b846574c';
import { fmtMoney } from '../core/format.js?v=b846574c';
import { game } from '../game.js?v=b846574c';
import { h } from './dom.js?v=b846574c';
import { asset, hasAsset } from '../platform/assets.js?v=b846574c';
import { openFull } from './shell.js?v=b846574c';
import { openGift, openLux } from './gift.js?v=b846574c';   // 设计56：礼物 / 奢侈品
import { openShop } from './outfit.js?v=b846574c';

export function openMall(secId, seg = 'gift') {
  const s = game.state;
  let who = secId && s.secs[secId] ? secId : s.current;
  const full = (id) => !!(id && s.secs[id] && s.secs[id].favor >= 499);   // 设计76：好感满了默认落在奢侈品
  if (seg === 'gift' && full(who)) seg = 'lux';
  const p = openFull('商场');
  const segBar = h('div', 'seg-bar'); const top = h('div', 'mall-top'); const body = h('div', 'page-body');
  p.body.append(segBar, top, body);
  const host = { el: body, body, close: () => render() };
  const render = () => {
    segBar.innerHTML = '';
    for (const [k, n] of [['gift', '礼物'], ['lux', '奢侈品'], ['clothes', '衣服']]) {
      const b = h('button', 'seg' + (k === seg ? ' on' : ''), n); b.onclick = () => { seg = k; render(); }; segBar.appendChild(b);
    }
    top.innerHTML = `💰 个人现金 <b>${fmtMoney(game.state.cash)}</b>`;
    const bgk = `assets/bg/${seg === 'gift' ? 'bg_mall' : 'bg_boutique'}.webp`; // 商场 / 服装店背景做页头
    top.style.backgroundImage = hasAsset(bgk) ? `linear-gradient(90deg, rgba(10,14,24,.92) 35%, rgba(10,14,24,.3)), url("${asset(bgk)}")` : '';
    body.innerHTML = '';
    if (seg === 'bag') seg = 'lux';
    if (seg === 'gift' || seg === 'lux') {
      const tabs = h('div', 'tabs');
      for (const c of SECRETARIES.filter((x) => s.secs[x.id])) { const b = h('button', 'tab' + (c.id === who ? ' on' : ''), c.name); b.onclick = () => { who = c.id; if (seg === 'gift' && full(who)) seg = 'lux'; render(); }; tabs.appendChild(b); }
      body.appendChild(tabs);
      const inner = h('div'); body.appendChild(inner);
      if (seg === 'lux') openLux(who, { el: inner, body: inner }); // 设计56：奢侈品（名包 + 首饰 / 表 / 酒）只加爱慕
      else openGift(who, { el: inner, body: inner, close: () => render(), toLux: () => { seg = 'lux'; render(); } });
    } else openShop(who, host);
  };
  render();
  const off = game.onChange(() => { if (!document.body.contains(p.el)) { off(); return; } top.innerHTML = `💰 个人现金 <b>${fmtMoney(game.state.cash)}</b>`; });
}
