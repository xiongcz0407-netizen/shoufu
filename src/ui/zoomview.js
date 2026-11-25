// 设计66 第八节：全屏看秘书时跟手机相册看照片一样——两指缩放（1～4 倍）、双击 2.5 倍 / 回 1 倍、放大后拖动（边不进屏幕，带惯性和回弹）。
// 用 Pointer Events 自己算（不引库）；电脑上滚轮缩放、按住拖动。
// createZoomView(box, layer, opts)：box 是接手势的那层（touch-action: none），layer 是被缩放的那层（盖满 box，transform-origin 0 0），
//   opts.rect() 返回图在 layer 里的位置 { x, y, w, h }（1 倍时的样子），拿来算边界。
//   opts.onTap(e)（1 倍单击）、opts.onSwipe(±1)（1 倍左右滑，+1 = 往左滑 = 下一套）、opts.onSwipeUp()（从底部往上滑）、opts.onScale(k)（缩放停下来）
export const ZOOM = { min: 1, max: 4, dbl: 2.5, anim: 250 };

export function createZoomView(box, layer, opts = {}) {
  let s = 1, tx = 0, ty = 0;               // 现在的缩放和平移（layer 坐标 → 屏幕：p × s + t）
  const pts = new Map();                   // 按着的手指 pointerId → { x, y }
  let pinch = null, drag = null, lastTap = null, tapTimer = null, inertia = 0;
  const W = () => box.clientWidth, H = () => box.clientHeight;
  const rect = () => (opts.rect ? opts.rect() : { x: 0, y: 0, w: W(), h: H() });

  const apply = (anim = false) => {
    layer.style.transition = anim ? `transform ${ZOOM.anim}ms ease-out` : 'none';
    layer.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  };
  /** 给定缩放 k，平移 (x, y) 夹到合法范围：图比屏幕大就边不能进屏幕，比屏幕小就居中 */
  function clampT(k, x, y) {
    const r = rect(); const w = r.w * k, hh = r.h * k;
    const fit = (t, pos, size, view) => { const a = pos * k + t; if (size <= view) return (view - size) / 2 - pos * k; if (a > 0) return -pos * k; if (a + size < view) return view - size - pos * k; return t; };
    return [fit(x, r.x, w, W()), fit(y, r.y, hh, H())];
  }
  /** 以屏幕点 (px, py) 为中心缩放到 k */
  function zoomAt(k, px, py, anim) {
    const cx = (px - tx) / s, cy = (py - ty) / s;
    s = k; [tx, ty] = clampT(k, px - cx * k, py - cy * k); apply(anim);
  }
  function settle() {   // 松手：小于 1 弹回 1、大于 4 弹回 4，边弹回去
    const k = Math.min(ZOOM.max, Math.max(ZOOM.min, s));
    if (k !== s) { const c = pinch ? pinch.mid : { x: W() / 2, y: H() / 2 }; const cx = (c.x - tx) / s, cy = (c.y - ty) / s; s = k; tx = c.x - cx * k; ty = c.y - cy * k; }
    if (s < 1.01) { s = 1; }
    [tx, ty] = clampT(s, tx, ty); apply(true); opts.onScale && opts.onScale(s);
  }
  const local = (e) => { const b = box.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  const midDist = () => { const [a, b] = [...pts.values()]; return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; };

  box.addEventListener('pointerdown', (e) => {
    cancelAnimationFrame(inertia); box.setPointerCapture && box.setPointerCapture(e.pointerId);
    const p = local(e); pts.set(e.pointerId, p);
    if (pts.size === 2) { const m = midDist(); pinch = { s0: s, d0: m.d, mid: m.mid, c: { x: (m.mid.x - tx) / s, y: (m.mid.y - ty) / s } }; drag = null; }
    else if (pts.size === 1) drag = { x0: p.x, y0: p.y, x: p.x, y: p.y, t0: performance.now(), tx0: tx, ty0: ty, vx: 0, vy: 0, lt: performance.now(), moved: false };
  });
  box.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e); pts.set(e.pointerId, p);
    if (pinch && pts.size >= 2) {
      const m = midDist(); let k = pinch.s0 * m.d / pinch.d0;
      if (k < ZOOM.min) k = ZOOM.min - (ZOOM.min - k) * 0.4; if (k > ZOOM.max) k = ZOOM.max + (k - ZOOM.max) * 0.4;   // 超出范围有阻力，松手弹回
      s = k; tx = m.mid.x - pinch.c.x * k; ty = m.mid.y - pinch.c.y * k; pinch.mid = m.mid; apply(); return;
    }
    if (!drag) return;
    const dx = p.x - drag.x, dy = p.y - drag.y; const t = performance.now(); const dt = Math.max(1, t - drag.lt);
    drag.vx = dx / dt; drag.vy = dy / dt; drag.x = p.x; drag.y = p.y; drag.lt = t;
    if (Math.hypot(p.x - drag.x0, p.y - drag.y0) > 8) drag.moved = true;
    if (s > 1.01) {   // 放大了：拖着看；边进屏幕时有阻力
      const [cx, cy] = clampT(s, tx + dx, ty + dy);
      tx += cx === tx + dx ? dx : dx * 0.35; ty += cy === ty + dy ? dy : dy * 0.35; apply();
    }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e); pts.delete(e.pointerId);
    if (pinch) { if (pts.size < 2) { settle(); pinch = null; drag = null; if (pts.size === 1) { const q = [...pts.values()][0]; drag = { x0: q.x, y0: q.y, x: q.x, y: q.y, t0: performance.now(), tx0: tx, ty0: ty, vx: 0, vy: 0, lt: performance.now(), moved: true }; } } return; }
    if (!drag) return;
    const d = drag; drag = null;
    const dx = p.x - d.x0, dy = p.y - d.y0, dt = performance.now() - d.t0;
    if (!d.moved && dt < 350) return tap(p, e);
    if (s > 1.01) {   // 惯性
      let vx = d.vx * 16, vy = d.vy * 16;
      const step = () => { vx *= 0.92; vy *= 0.92; const [cx, cy] = clampT(s, tx + vx, ty + vy); if (cx !== tx + vx) vx = 0; if (cy !== ty + vy) vy = 0; tx = cx; ty = cy; apply(); if (Math.abs(vx) + Math.abs(vy) > 0.5) inertia = requestAnimationFrame(step); else settle(); };
      if (Math.abs(vx) + Math.abs(vy) > 1) inertia = requestAnimationFrame(step); else settle();
      return;
    }
    // 1 倍：往上滑（从底部开始）退出；左右滑换衣服
    if (d.y0 > H() - 120 && dy < -60 && Math.abs(dy) > Math.abs(dx)) { opts.onSwipeUp && opts.onSwipeUp(); return; }
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) { opts.onSwipe && opts.onSwipe(dx < 0 ? 1 : -1); return; }
  };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);

  function tap(p, e) {
    const t = performance.now();
    if (lastTap && t - lastTap.t < 300 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 40) {   // 双击
      clearTimeout(tapTimer); lastTap = null;
      if (s > 1.01) reset(true); else zoomAt(ZOOM.dbl, p.x, p.y, true);
      opts.onScale && opts.onScale(s); return;
    }
    lastTap = { t, x: p.x, y: p.y };
    const zoomed = s > 1.01;
    clearTimeout(tapTimer); tapTimer = setTimeout(() => { lastTap = null; if (!zoomed && opts.onTap) opts.onTap(e, p); }, 300);   // 等一下看是不是双击；放大了单击不触发互动
  }
  box.addEventListener('wheel', (e) => {   // 电脑：滚轮缩放
    e.preventDefault(); const p = local(e);
    zoomAt(Math.min(ZOOM.max, Math.max(ZOOM.min, s * Math.exp(-e.deltaY * 0.002))), p.x, p.y, false);
    clearTimeout(box._wt); box._wt = setTimeout(() => opts.onScale && opts.onScale(s), 200);
  }, { passive: false });

  function reset(anim = false) { s = 1; tx = 0; ty = 0; [tx, ty] = clampT(1, 0, 0); apply(anim); }
  return { reset, zoomAt, get scale() { return s; }, get offset() { return { x: tx, y: ty }; } };
}
