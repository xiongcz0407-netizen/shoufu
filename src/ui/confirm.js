// 设计37 第一节：游戏样式的确认框 / 输入框，替换浏览器自带的确认框和输入框（深底金边；危险操作红按钮）
// confirmBox(text, { title, ok, cancel, danger }) → Promise<boolean>；inputBox(title, fields: [{ label, value, max }]) → Promise<值数组 | null>
import { h } from './dom.js?v=d69b03f5';

const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const host = () => document.querySelector('#phone') || document.body;

function box(title, inner, btns) {
  const mask = h('div', 'cf-mask');
  const card = h('div', 'cf-box', `${title ? `<div class="cf-title">${esc(title)}</div>` : ''}${inner}<div class="cf-btns">${btns}</div>`);
  mask.appendChild(card); host().appendChild(mask);
  requestAnimationFrame(() => mask.classList.add('open'));
  const close = () => { mask.classList.remove('open'); setTimeout(() => mask.remove(), 150); };
  return { mask, card, close };
}

/** confirmBox({ title, body, ok, cancel, danger }) → Promise<boolean>（也兼容 confirmBox(文字, { title, … })） */
export function confirmBox(arg, opts = {}) {
  const o = typeof arg === 'object' && arg ? arg : { ...opts, body: arg };
  const text = o.body || ''; const title = o.title || ''; const ok = o.ok || '确定'; const cancel = o.cancel || '再想想'; const danger = !!o.danger;
  return new Promise((resolve) => {
    const { mask, card, close } = box(title, `<div class="cf-text">${esc(text).replace(/\n/g, '<br>')}</div>`,
      `<button class="btn cf-no">${esc(cancel)}</button><button class="btn ${danger ? 'cf-danger' : 'gold'} cf-yes">${esc(ok)}</button>`);
    const done = (v) => { close(); resolve(v); };
    card.querySelector('.cf-yes').onclick = () => done(true);
    card.querySelector('.cf-no').onclick = () => done(false);
    mask.onclick = (e) => { if (e.target === mask) done(false); };
  });
}

export function inputBox(title, fields, { ok = '确定', cancel = '取消' } = {}) {
  return new Promise((resolve) => {
    const { mask, card, close } = box(title, fields.map((f, i) => `<label class="cf-field"><span>${esc(f.label)}</span><input data-i="${i}" maxlength="${f.max || 20}" value="${esc(f.value || '')}"></label>`).join(''),
      `<button class="btn cf-no">${esc(cancel)}</button><button class="btn gold cf-yes">${esc(ok)}</button>`);
    const done = (v) => { close(); resolve(v); };
    card.querySelector('.cf-yes').onclick = () => done([...card.querySelectorAll('input')].map((x) => x.value));
    card.querySelector('.cf-no').onclick = () => done(null);
    mask.onclick = (e) => { if (e.target === mask) done(null); };
    const first = card.querySelector('input'); if (first) setTimeout(() => first.focus(), 50);
  });
}
