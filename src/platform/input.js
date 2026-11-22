// 触摸 / 点击包一层：统一用 pointer 事件；tap 有移动阈值，避免滑动误触
export function onTap(el, fn, { moveTol = 10 } = {}) {
  let sx = 0, sy = 0, down = false;
  el.addEventListener('pointerdown', (e) => { down = true; sx = e.clientX; sy = e.clientY; });
  el.addEventListener('pointerup', (e) => {
    if (!down) return; down = false;
    if (Math.hypot(e.clientX - sx, e.clientY - sy) <= moveTol) fn(e);
  });
  el.addEventListener('pointercancel', () => { down = false; });
}
