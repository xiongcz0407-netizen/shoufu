// 小工具：建元素、弹层、提示
export function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

let toastTimer = null;
export function toast(text, ms = 1800, { top = false } = {}) {
  let t = document.querySelector('.toast');
  if (!t) { t = h('div', 'toast'); document.querySelector('#phone').appendChild(t); }
  t.textContent = text; t.classList.add('show'); t.classList.toggle('top', top);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/** 从底部弹出的面板；返回 { el, body, close } */
export function openPanel(title, { onClose } = {}) {
  const mask = h('div', 'panel-mask');
  const panel = h('div', 'panel');
  const head = h('div', 'panel-head', `<span>${title}</span>`);
  const x = h('button', 'panel-close', '×');
  head.appendChild(x);
  const body = h('div', 'panel-body');
  panel.append(head, body);
  mask.appendChild(panel);
  document.querySelector('#phone').appendChild(mask);
  requestAnimationFrame(() => mask.classList.add('open'));
  const close = () => { mask.classList.remove('open'); setTimeout(() => mask.remove(), 200); onClose && onClose(); };
  x.onclick = close;
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  return { el: panel, body, close };
}

// 每秒刷新的面板（验收第六节第 2 次 #2）：手指按着时不重画（免得按钮被换掉点不到），保留滚动位置
let pressing = false;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => { pressing = true; }, true);
  for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, () => setTimeout(() => { pressing = false; }, 80), true);
}
/** draw() 先画一次，之后每秒（onChange 每秒一次）重画；el 不在页面上了自动停。返回停止函数 */
export function liveRender(el, draw, subscribe, scroller = el) {
  draw();
  let last = Date.now();
  const off = subscribe(() => {
    if (!el.isConnected) { off(); return; }
    if (pressing || Date.now() - last < 900) return;
    last = Date.now();
    const y = scroller.scrollTop; draw(); scroller.scrollTop = y;
  });
  return off;
}
