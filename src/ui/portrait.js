// 秘书立绘：按人物外框缩放、下边对齐；呼吸、眨眼、点一下弹一下
import { asset, getSecMeta } from '../platform/assets.js?v=ad479e23';

export function createPortrait(stage) {
  const wrap = document.createElement('div');
  wrap.className = 'portrait';
  const breathe = document.createElement('div');
  breathe.className = 'breathe';
  const img = document.createElement('img');
  img.className = 'sec-img'; img.draggable = false; img.alt = '';
  const blink = document.createElement('img');
  blink.className = 'sec-blink'; blink.draggable = false; blink.alt = '';
  breathe.append(img, blink);
  wrap.appendChild(breathe);
  stage.appendChild(wrap);

  let cur = null, blinkTimer = null, info = null;
  const SRC_W = 720, SRC_H = 1080;

  function layout() {
    if (!info) return;
    const W = stage.clientWidth, H = stage.clientHeight;
    const [x0, y0, x1, y1] = info.bbox;
    const bw = x1 - x0, bh = y1 - y0;
    // 人物外框塞进舞台：高最多占满，宽最多 96%；躺着的图按宽算
    const k = Math.min(H / bh, (W * 0.96) / bw);
    const w = SRC_W * k, h = SRC_H * k;
    const left = W / 2 - (x0 + bw / 2) * k;   // 人物居中
    const top = H - y1 * k;                     // 人物下边贴舞台底
    Object.assign(breathe.style, { width: w + 'px', height: h + 'px', left: left + 'px', top: top + 'px',
      transformOrigin: `${(x0 + bw / 2) * k}px ${y1 * k}px` });
    const b = info.blink;
    if (b) Object.assign(blink.style, { left: b.x * k + 'px', top: b.y * k + 'px', width: b.w * k + 'px', height: b.h * k + 'px' });
  }

  function scheduleBlink() {
    clearTimeout(blinkTimer);
    if (!info || !info.blink || document.hidden) return;
    blinkTimer = setTimeout(() => {
      blink.style.visibility = 'visible';
      setTimeout(() => { blink.style.visibility = 'hidden'; scheduleBlink(); }, 120);
    }, 3000 + Math.random() * 3000);
  }

  function show(secId, outfit = 'c1', { fade = true } = {}) {
    const meta = getSecMeta()[secId];
    info = meta && meta.outfits[outfit];
    if (!info) info = { bbox: [0, 0, SRC_W, SRC_H], blink: null };
    cur = { secId, outfit };
    img.src = asset(`assets/sec/${secId}/${outfit}.webp`);
    blink.style.visibility = 'hidden';
    if (info.blink) blink.src = asset(`assets/sec/${secId}/${outfit}_blink.webp`); else blink.removeAttribute('src');
    layout();
    const cls = fade === 'dress' ? 'dress' : 'fade-in';
    if (fade) { wrap.classList.remove('fade-in', 'dress'); void wrap.offsetWidth; wrap.classList.add(cls); }
    scheduleBlink();
  }

  /** 点一下弹一下；返回点到的部位：head / body / legs（按人物外框的高度比例） */
  function hitPart(clientY) {
    const r = breathe.getBoundingClientRect();
    const [, y0, , y1] = info.bbox; const k = r.height / SRC_H;
    const t = (clientY - (r.top + y0 * k)) / ((y1 - y0) * k);
    return t < 0.22 ? 'head' : t < 0.6 ? 'body' : 'legs';
  }
  function bounce() { breathe.classList.remove('bounce'); void breathe.offsetWidth; breathe.classList.add('bounce'); }

  // 舞台大小变了（包括主界面从隐藏变成显示）就重新摆
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(layout).observe(stage); else window.addEventListener('resize', layout);
  document.addEventListener('visibilitychange', () => (document.hidden ? clearTimeout(blinkTimer) : scheduleBlink()));
  /** 不用了（秘书详情关掉）：停掉眨眼 */
  function stop() { clearTimeout(blinkTimer); info = null; }
  return { el: wrap, imgEl: img, show, layout, bounce, hitPart, stop, get current() { return cur; } };
}
