// 剧情播放：全屏、立绘淡入、点一下下一句；多段排队
import { SEC_BY_ID } from '../config/secretaries.js?v=3839f433';
import { h } from './dom.js?v=3839f433';
import { storyPortrait } from './portrait.js?v=3839f433';   // 设计66：立绘跟主页同一个 layout
import { asset, hasAsset } from '../platform/assets.js?v=3839f433';
import { TITLES } from '../config/titles.js?v=3839f433';
import { game } from '../game.js?v=3839f433';
/** 设计78：背景图地址（assets/bg/<key>.webp 有就给，没有 null） */
export const bgOf = (key) => (key && hasAsset(`assets/bg/${key}.webp`) ? asset(`assets/bg/${key}.webp`) : null);
/** 设计78：某个称号的办公室背景（没图的往前找最近一张有图的，跟主页一样） */
export function officeBg(title) { for (let i = Math.min(title ?? 0, TITLES.length - 1); i >= 0; i--) { const u = bgOf(TITLES[i].bg); if (u) return u; } return null; }

const queue = [];
let playing = false;

/** lines: [{who, text}]；opts: { sec: 立绘用谁, outfit, title: 顶上小标题, onEnd } */
export function playStory(lines, opts = {}) {
  queue.push({ lines, opts });
  if (!playing) next();
}
export const isStoryPlaying = () => playing;

function next() {
  if (queue.length && document.querySelector('.sc-scene')) { playing = true; setTimeout(next, 800); return; } // V0.2.3（开发2）：日程 / 出差的小场景开着，剧情排队，不叠
  const item = queue.shift();
  if (!item) { playing = false; return; }
  playing = true;
  const { lines, opts } = item;
  const sec = opts.sec || (lines.find((l) => SEC_BY_ID[l.who]) || {}).who;
  const bg = opts.bg || officeBg(game.state ? game.state.title : 0);   // 设计78：没传背景就用当前称号的办公室，不再黑底；也不再写「背景图还没到」
  const el = h('div', 'story' + (bg ? ' has-bg' : ''));
  if (bg) el.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.1) 30%, rgba(0,0,0,.55)), url("${bg}")`;
  el.innerHTML = `${opts.title ? `<div class="story-title"><span>${opts.title}</span></div>` : ''}
    <div class="story-box"><div class="story-name"></div><div class="story-text"></div><div class="story-hint">点一下继续</div></div>`;
  document.querySelector('#phone').appendChild(el);
  if (sec) storyPortrait(el, sec, opts.outfit || 'c1', el.querySelector('.story-box'));
  document.body.classList.add('story-open'); // 藏首页立绘，免得两个人叠影
  let i = -1;
  const step = () => {
    i += 1;
    if (i >= lines.length && opts.choices && !chosen) { showChoices(); return; }
    if (i >= lines.length) {
      el.classList.add('out');
      setTimeout(() => { el.remove(); if (!queue.length) document.body.classList.remove('story-open'); opts.onEnd && opts.onEnd(); next(); }, 250);
      return;
    }
    const l = lines[i];
    if (l.fx) { el.querySelector('.story-fx') && el.querySelector('.story-fx').remove(); const fx = h('div', 'story-fx', l.fx); el.appendChild(fx); }
    const name = l.who === 'me' ? '我' : l.who === 'narr' ? '' : (SEC_BY_ID[l.who] ? SEC_BY_ID[l.who].name : l.who);
    el.querySelector('.story-name').textContent = name;
    el.querySelector('.story-name').style.display = name ? '' : 'none';
    const tx = el.querySelector('.story-text');
    tx.textContent = l.text; tx.classList.toggle('narr', l.who === 'narr');
    tx.classList.remove('pop'); void tx.offsetWidth; tx.classList.add('pop');
  };
  // 选项（事件用）：opts.choices [{ label, sub, disabled }]；选了调 opts.onChoose(i)，返回 false 就不关（比如钱不够）
  let chosen = false;
  const showChoices = () => {
    if (el.querySelector('.story-choices')) return;
    el.querySelector('.story-hint').style.display = 'none';
    const box = h('div', 'story-choices');
    opts.choices.forEach((c, k) => {
      const b = h('button', 'btn' + (k === 0 ? ' gold' : '') + (c.disabled ? ' off' : ''), `${c.label}${c.sub ? `<small>${c.sub}</small>` : ''}`);
      b.onclick = (e) => { e.stopPropagation(); if (c.disabled) return; if (opts.onChoose && opts.onChoose(k) === false) return; chosen = true; box.remove(); step(); };
      box.appendChild(b);
    });
    el.appendChild(box);
  };
  if (opts.skip) { const sk = h('button', 'story-skip', '跳过'); sk.onclick = (e) => { e.stopPropagation(); i = lines.length - 1; step(); }; el.appendChild(sk); } // V0.2.3（开发2）：开场剧情可跳过
  el.addEventListener('click', () => { if (el.querySelector('.story-choices')) return; step(); });
  step();
}
