// 剧情播放：全屏、立绘淡入、点一下下一句；多段排队
import { SEC_BY_ID } from '../config/secretaries.js?v=47e8f1b5';
import { asset } from '../platform/assets.js?v=47e8f1b5';
import { h } from './dom.js?v=47e8f1b5';

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
  const el = h('div', 'story' + (opts.bg || opts.bgLabel ? ' has-bg' : ''));
  if (opts.bg) el.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.1) 30%, rgba(0,0,0,.55)), url("${opts.bg}")`;
  el.innerHTML = `${!opts.bg && opts.bgLabel ? `<div class="story-bgph">${opts.bgLabel}<small>（背景图还没到）</small></div>` : ''}${opts.title ? `<div class="story-title"><span>${opts.title}</span></div>` : ''}
    ${sec ? `<img class="story-sec" src="${asset(`assets/sec/${sec}/${opts.outfit || 'c1'}.webp`)}" alt="">` : ''}
    <div class="story-box"><div class="story-name"></div><div class="story-text"></div><div class="story-hint">点一下继续</div></div>`;
  document.querySelector('#phone').appendChild(el);
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
