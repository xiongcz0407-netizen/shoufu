// 设计66 第七节第 3 条 + 第八节：秘书详情 → 衣柜 → 全屏看她
// 下面的面板和动作条滑走，立绘占满屏幕（全身、原尺寸图）；底部向上箭头 / 从底部往上滑 / 返回键 = 退出。
// 1 倍时左右滑换衣服（只在她买了、能穿的里换），单击弹一下说一句（算互动次数）；两指缩放、双击、拖动见 zoomview.js
import { SEC_BY_ID } from '../config/secretaries.js?v=5f2b1b8c';
import { outfitsOf } from '../config/outfits.js?v=5f2b1b8c';
import * as STY from '../core/styles.js?v=5f2b1b8c';
import * as O from '../core/outfits.js?v=5f2b1b8c';
import { asset, getSecMeta, hasAsset } from '../platform/assets.js?v=5f2b1b8c';
import { game } from '../game.js?v=5f2b1b8c';
import { h } from './dom.js?v=5f2b1b8c';
import { pushBack } from './shell.js?v=5f2b1b8c';
import { createZoomView } from './zoomview.js?v=5f2b1b8c';

/** 这位秘书这一套的全屏图：全身秘书用原尺寸 cN_full.webp，老秘书用 cN.webp */
export const fullSrc = (id, o) => (SEC_BY_ID[id] && SEC_BY_ID[id].fullBody && hasAsset(`assets/sec/${id}/${o}_full.webp`) ? `assets/sec/${id}/${o}_full.webp` : `assets/sec/${id}/${o}.webp`);
/** 能在全屏里换的那几套（衣柜顺序） */
export const wearable = (s, id) => outfitsOf(id).filter((o) => O.owns(s, id, o.id) && O.canWear(s, id, o.id)).map((o) => o.id);

/**
 * host：秘书详情那个全屏层（.full）。bg：背景图地址。
 * onTalk(layer)：单击她（1 倍）→ 互动，返回要说的台词；onDress(o)：换了衣服；onExit()：退出全屏以后
 */
export function openSecFull(host, id, { bg, onTalk, onDress, onExit } = {}) {
  const s = game.state;
  host.classList.add('sf-on');   // 面板、动作条往下滑走（CSS）
  const el = h('div', 'sf-view', `<div class="sf-layer"><img class="sf-img" alt="" draggable="false"></div>
    <div class="sf-label"><b></b><em></em></div><div class="sf-scale"></div>
    <div class="bubble sf-bubble hidden"><div class="bubble-text"></div></div>
    <button class="sf-up" aria-label="退出全屏">︿</button><button class="btn gold sf-wear hidden">让她换上</button>`);
  if (bg) el.style.backgroundImage = `url("${bg}")`;
  host.appendChild(el);
  const layer = el.querySelector('.sf-layer'); const img = el.querySelector('.sf-img');
  let cur = s.secs[id].outfit; let r0 = { x: 0, y: 0, w: 1, h: 1 };

  // 图放在哪：整张 2:3 图塞进屏幕，上下留一点空（上 6%、下 9%，下面让给向上箭头）
  function place() {
    const W = el.clientWidth, H = el.clientHeight; const top = H * 0.06, bot = H * 0.09;
    const meta = (getSecMeta()[id] || {}).outfits || {}; const info = meta[cur] || {};
    const bb = (info.full || info).bbox || [0, 0, 720, 1080];   // 720×1080 坐标
    const ah = H - top - bot; const k = Math.min(ah / (bb[3] - bb[1]), (W * 0.96) / (bb[2] - bb[0]));   // 人物外框塞满
    const w = 720 * k, hh = 1080 * k; const x = W / 2 - ((bb[0] + bb[2]) / 2) * k, y = top + ah - bb[3] * k;
    Object.assign(img.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' });
    r0 = { x: x + bb[0] * k, y: y + bb[1] * k, w: (bb[2] - bb[0]) * k, h: (bb[3] - bb[1]) * k };   // 边界按人物外框算（透明边不算）
  }
  function wearTxt() { const b = el.querySelector('.sf-wear'); if (b) b.classList.toggle('hidden', game.state.secs[id].outfit === cur); }
  function label() { wearTxt(); el.querySelector('.sf-label b').textContent = STY.nameOf(id, cur); el.querySelector('.sf-label em').textContent = STY.styleOf(id, cur) || ''; }
  function setOutfit(o, fade) {
    cur = o; img.src = asset(fullSrc(id, o)); place(); zv.reset(); label();
    if (fade) { el.classList.remove('sf-fade'); void el.offsetWidth; el.classList.add('sf-fade'); }
  }
  let bubbleTimer = null; let scaleTimer = null;
  const bubble = (text) => { if (!text) return; const b = el.querySelector('.sf-bubble'); b.querySelector('.bubble-text').textContent = text; b.classList.remove('hidden', 'pop'); void b.offsetWidth; b.classList.add('pop'); clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => b.classList.add('hidden'), 3200); };
  const zv = createZoomView(el, layer, {
    rect: () => r0,
    onTap: (e, p) => {
      const ir = img.getBoundingClientRect(); const b = el.getBoundingClientRect();
      if (p.x < ir.left - b.left || p.x > ir.right - b.left || p.y < ir.top - b.top || p.y > ir.bottom - b.top) return;   // 没点到她
      img.classList.remove('sf-bounce'); void img.offsetWidth; img.classList.add('sf-bounce');
      bubble(onTalk && onTalk());
    },
    onSwipe: (d) => {
      const list = wearable(game.state, id); if (list.length < 2) return;
      const i = list.indexOf(cur); const o = list[((i < 0 ? 0 : i) + d + list.length) % list.length];
      setOutfit(o, true);   /* 设计74：左右滑只是看，不改她平时穿的；点「让她换上」才改 */
    },
    onSwipeUp: () => exit(false),
    onScale: (k) => { const t = el.querySelector('.sf-scale'); if (k <= 1.01) { t.classList.remove('on'); return; } t.textContent = `${(Math.round(k * 10) / 10).toString()}×`; t.classList.add('on'); clearTimeout(scaleTimer); scaleTimer = setTimeout(() => t.classList.remove('on'), 1000); },
  });
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { place(); zv.reset(); }) : null; ro && ro.observe(el);
  setOutfit(cur, false);
  el.querySelector('.sf-up').addEventListener('pointerdown', (e) => e.stopPropagation());
  const wearBtn = el.querySelector('.sf-wear'); wearBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  wearBtn.onclick = () => { if (!O.chooseOutfit(game.state, id, cur)) return; wearTxt(); onDress && onDress(cur); };
  el.querySelector('.sf-up').onclick = () => exit(false);
  const done = pushBack(() => exit(true));   // 安卓返回键 / 浏览器后退 = 点向上箭头
  let closed = false;
  function exit(fromPop) {
    if (closed) return; closed = true; ro && ro.disconnect(); clearTimeout(bubbleTimer);
    if (!fromPop) done();
    host.classList.remove('sf-on'); el.classList.add('sf-out'); setTimeout(() => el.remove(), 260);
    onExit && onExit(cur);
  }
  return { exit, zoom: zv, get outfit() { return cur; } };
}
