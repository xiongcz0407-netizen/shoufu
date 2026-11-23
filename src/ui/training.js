// 培养（设计35 第八节）：选人 → 选课；付钱属性立刻加上（一句台词 + 飘字），可以「再上一节」或「上到 N」一次买多节
import { SEC_BY_ID, ATTRS } from '../config/secretaries.js?v=876cadde';
import { GRAD_LINES } from '../config/courses.js?v=876cadde';
import * as T from '../core/training.js?v=876cadde';
import { fmtMoney } from '../core/format.js?v=876cadde';
import { asset, hasAsset } from '../platform/assets.js?v=876cadde';
import { now } from '../core/clock.js?v=876cadde';
import { game } from '../game.js?v=876cadde';
import { h, openPanel, toast } from './dom.js?v=876cadde';

const AN = Object.fromEntries(ATTRS.map((a) => [a.key, a.name]));
const gainText = (g) => Object.entries(g).filter(([, v]) => v > 0).map(([k, v]) => `${AN[k]}+${v}`).join(' ');
const mainOf = (c) => Object.keys(c.gain)[0];

/** 培训中心：先选人 */
export function openTraining() { pickSec(); }

export function pickSec(done) {
  const s = game.state;
  const p = openPanel('给谁上课？');
  p.body.appendChild(h('div', 'tr-gain', '付了学费属性立刻加上；属性越高越贵（擅长那项 8 折、多 +1）'));
  const grid = h('div', 'sw-grid');
  for (const id of Object.keys(s.secs)) {
    const c = h('button', 'sw-card', `<img src="${asset(`assets/sec/${id}/c1.webp`)}" alt=""><span>${SEC_BY_ID[id].name}</span>`);
    c.onclick = () => { p.close(); openCoursePicker(id, done); };
    grid.appendChild(c);
  }
  p.body.appendChild(grid);
}

export function openCoursePicker(secId, done) {
  const p = openPanel(`${SEC_BY_ID[secId].name} 上什么课？`);
  renderCourses(p.body, secId, () => done && done());
}

/** 学完：台词 + 飘字 */
function celebrate(box, secId, row, gain) {
  const say = box.querySelector('.tr-say');
  if (say) { say.querySelector('q').textContent = box._said(GRAD_LINES[secId] || '学完啦！'); say.classList.remove('pop'); void say.offsetWidth; say.classList.add('pop'); }
  if (row) { const f = h('div', 'tr-up', gainText(gain)); row.appendChild(f); setTimeout(() => f.remove(), 1300); }
}

/** 课程表画进 el（培训面板和秘书详情「培养」分段共用）；每上一节调 done */
export function renderCourses(el, secId, done) {
  const box = h('div', 'tr-box'); el.appendChild(box);
  const target = {}; // 每门课「上到 N」的目标
  let said = '学费从公司账户扣，学完属性马上加上。';
  const draw = (fx) => {
    const s = game.state; const r = s.secs[secId];
    box.innerHTML = `<div class="tr-say"><img src="${asset(`assets/sec/${secId}/${r.outfit || 'c1'}.webp`)}" alt=""><q>${said}</q></div>
      <div class="tr-attrs">${ATTRS.map((a) => `${a.name} <b>${r.attrs[a.key]}</b>`).join('　')}　擅长：${AN[SEC_BY_ID[secId].best]}</div>`;
    for (const c of T.availableCourses(s)) {
      const why = T.whyNot(s, secId, c.id); const m = mainOf(c); const cur = r.attrs[m];
      const step = Math.max(1, T.courseGain(s, secId, c.id)[m] || 1);
      if (!(target[c.id] > cur)) target[c.id] = Math.min(100, cur + step * 5); // 默认上 5 节
      const q = T.quoteTo(s, secId, c.id, target[c.id]);
      const ic = `assets/ui/icon_course_${c.id}.webp`;
      const row = h('div', 'tr-course tr-c2', `<div class="tr-head">${hasAsset(ic) ? `<img class="course-ic" src="${asset(ic)}" alt="">` : ''}<div style="flex:1"><b>${c.name}</b><div class="tr-gain">每节 ${gainText(T.courseGain(s, secId, c.id)) || '已满'}</div></div>
        <button class="btn gold tr-one" ${why ? 'disabled' : ''}>${fx === c.id ? '再上一节' : '上一节'}<br><small>${why || fmtMoney(T.coursePrice(s, secId, c.id))}</small></button></div>
        ${cur < 100 ? `<div class="tr-to"><span>上到 ${AN[m]}</span><button class="btn tr-dn">−</button><b>${target[c.id]}</b><button class="btn tr-upb">＋</button>
        <button class="btn tr-many" ${q.n && !T.whyNot(s, secId, c.id) ? '' : 'disabled'}>${q.n} 节 · ${fmtMoney(q.total)}</button></div>` : ''}`);
      row.dataset.c = c.id;
      row.querySelector('.tr-one').onclick = () => {
        const res = T.learn(game.state, secId, c.id, now()); if (!res.ok) { toast(res.why); return; }
        game.changed(); game.save(); draw(c.id); celebrate(box, secId, box.querySelector(`[data-c="${c.id}"]`), res.gain); done && done();
      };
      const dn = row.querySelector('.tr-dn'), up = row.querySelector('.tr-upb'), many = row.querySelector('.tr-many');
      if (dn) dn.onclick = () => { target[c.id] = Math.max(cur + step, target[c.id] - step * 5); draw(fx); };
      if (up) up.onclick = () => { target[c.id] = Math.min(100, target[c.id] + step * 5); draw(fx); };
      if (many) many.onclick = () => {
        const res = T.learnTo(game.state, secId, c.id, target[c.id], now()); if (!res.ok) { toast(res.why); return; }
        toast(`${SEC_BY_ID[secId].name}连上 ${res.n} 节「${c.name}」，花了 ${fmtMoney(res.price)}`);
        game.changed(); game.save(); draw(c.id); celebrate(box, secId, box.querySelector(`[data-c="${c.id}"]`), res.gain); done && done();
      };
      box.appendChild(row);
    }
  };
  box._said = (x) => (said = x);
  draw(null);
}
