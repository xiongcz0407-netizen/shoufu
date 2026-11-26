// V3-02 / V3-03 小场景播放器（不动开发1 的 ui/story.js）：全屏、背景、立绘、一句一句点；'#黑屏' 转场；中间可以停下来让你选（选完接着播选了以后的话）
// steps：字符串（「」开头当她说话，其余旁白）、{ who, text, fx }、'#黑屏'、{ choice: { q, opts: [label…] }, then(i) → 接下来的 steps }
import { SEC_BY_ID } from '../config/secretaries.js?v=06229def';
import { asset, hasAsset } from '../platform/assets.js?v=06229def';
import { h } from './dom.js?v=06229def';
import { storyPortrait } from './portrait.js?v=06229def';   // 设计66：立绘跟主页同一个 layout（开发1 加）

export function playScene(steps, opts = {}) {
  return new Promise((done0) => { if (document.querySelector('.story')) { const w = setInterval(() => { if (!document.querySelector('.story')) { clearInterval(w); playScene(steps, opts).then(done0); } }, 500); return; } const done = done0; // V0.2.3：有剧情在放就排队
    const q = steps.slice(); const sec = opts.sec;
    const el = h('div', 'story sc-scene' + (opts.bg ? ' has-bg' : ''));
    const bgUrl = (b) => (b && hasAsset(`assets/bg/${b}.webp`) ? `linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.1) 30%, rgba(0,0,0,.6)), url("${asset(`assets/bg/${b}.webp`)}")` : '');
    const setBg = (b, label) => { const u = bgUrl(b); el.style.backgroundImage = u; const ph = el.querySelector('.story-bgph'); if (ph) ph.remove(); if (!u && label) { const d = h('div', 'story-bgph', `${label}<small>（背景图还没到）</small>`); el.insertBefore(d, el.firstChild); } };
    el.style.backgroundImage = bgUrl(opts.bg);
    el.innerHTML = `${opts.title ? `<div class="story-title"><span>${opts.title}</span></div>` : ''}
      <div class="sc-black"></div><div class="story-box"><div class="story-name"></div><div class="story-text"></div><div class="story-hint">点一下继续</div></div>`;
    document.querySelector('#phone').appendChild(el); document.body.classList.add('story-open');
    const sp = sec ? storyPortrait(el, sec, opts.outfit || 'c1', el.querySelector('.sc-black')) : null;
    const box = el.querySelector('.story-box'); const black = el.querySelector('.sc-black'); let waiting = false;
    const show = (who, text) => {
      const name = who === 'me' ? '我' : who === 'narr' ? '' : SEC_BY_ID[who] ? SEC_BY_ID[who].name : who;
      el.querySelector('.story-name').textContent = name; el.querySelector('.story-name').style.display = name ? '' : 'none';
      const tx = el.querySelector('.story-text'); tx.textContent = text; tx.classList.toggle('narr', who === 'narr'); tx.classList.remove('pop'); void tx.offsetWidth; tx.classList.add('pop');
    };
    const next = () => {
      if (waiting) return;
      const x = q.shift();
      if (x === undefined) { el.classList.add('out'); setTimeout(() => { el.remove(); if (!document.querySelector('.story')) document.body.classList.remove('story-open'); done(); }, 250); return; }
      if (x === '#黑屏') { black.classList.add('on'); el.classList.add('dark'); return next(); }
      if (x && x.outfit) { if (sp) sp.show(x.outfit); if (!x.bg) return next(); }
      if (x && x.bg) { setBg(x.bg, x.label); black.classList.remove('on'); el.classList.remove('dark'); if (sp && x.sec != null) sp.el.style.display = x.sec ? '' : 'none'; return next(); }
      if (x && x.choice) {
        waiting = true; show(x.choice.who || 'narr', x.choice.q); el.querySelector('.story-hint').style.display = 'none';
        const cb = h('div', 'story-choices'); x.choice.opts.forEach((lab, i) => { const b = h('button', 'btn' + (i === 0 ? ' gold' : ''), lab); b.onclick = (e) => { e.stopPropagation(); cb.remove(); waiting = false; el.querySelector('.story-hint').style.display = ''; q.unshift(...(x.then(i) || [])); next(); }; cb.appendChild(b); });
        el.appendChild(cb); return;
      }
      if (typeof x === 'string') { const her = x.startsWith('「'); if (!black.classList.contains('on') || her) { /* 黑屏上旁白照样显示 */ } show(her && sec ? sec : 'narr', x); if (her && black.classList.contains('on')) { /* 关灯后她说话，屏还黑着 */ } }
      else show(x.who, x.text);
      if (x && x.fx) { const o = el.querySelector('.story-fx'); if (o) o.remove(); el.appendChild(h('div', 'story-fx', x.fx)); }   // 设计83：约会「♥ +N」
      if (x && x.light) { black.classList.remove('on'); el.classList.remove('dark'); }
    };
    el.addEventListener('click', () => { if (!waiting) next(); });
    next();
  });
}
