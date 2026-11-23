// 培训面板：培训位、进度；安排上课（选人 → 选课）
import { SEC_BY_ID, ATTRS } from '../config/secretaries.js?v=b7d8e042';
import { COURSE_BY_ID } from '../config/courses.js?v=b7d8e042';
import * as T from '../core/training.js?v=b7d8e042';
import { isScouting } from '../core/busy.js?v=b7d8e042'; // V2-08
import { fmtMoney, fmtDuration } from '../core/format.js?v=b7d8e042';
import { asset, hasAsset } from '../platform/assets.js?v=b7d8e042';
import { now } from '../core/clock.js?v=b7d8e042';
import { game } from '../game.js?v=b7d8e042';
import { h, openPanel, toast } from './dom.js?v=b7d8e042';

const AN = Object.fromEntries(ATTRS.map((a) => [a.key, a.name]));
const gainText = (g) => Object.entries(g).map(([k, v]) => `${AN[k]}+${v}`).join(' ');

export function openTraining() {
  const p = openPanel('培训中心');
  const render = () => {
    const s = game.state; const t = now();
    const n = T.slotCount(s); const list = s.training || [];
    p.body.innerHTML = `<div class="tr-sum">培训位 ${list.length}/${n}（每升一个称号 +1）</div>`;
    for (let i = 0; i < n; i++) {
      const x = list[i];
      if (x) {
        const pct = Math.min(100, ((t - x.start) / (x.end - x.start)) * 100);
        p.body.appendChild(h('div', 'tr-slot', `<img src="${asset(`assets/sec/${x.sec}/c1.webp`)}" alt="">
          <div class="tr-info"><b>${SEC_BY_ID[x.sec].name}</b> · ${COURSE_BY_ID[x.course].name}
          <div class="bar"><i style="width:${pct}%"></i></div><small>还剩 ${fmtDuration((x.end - t) / 1000)}</small></div>`));
      } else {
        const b = h('button', 'tr-slot empty', '＋ 安排上课');
        b.onclick = () => pickSec(render);
        p.body.appendChild(b);
      }
    }
  };
  render();
  const off = game.onChange(() => { if (!document.body.contains(p.el)) { off(); return; } render(); });
}

export function pickSec(done) {
  const s = game.state;
  const p = openPanel('谁去上课？');
  const grid = h('div', 'sw-grid');
  for (const id of Object.keys(s.secs)) {
    const busy = T.isTraining(s, id) || isScouting(s, id);
    const c = h('button', 'sw-card', `<img src="${asset(`assets/sec/${id}/c1.webp`)}" alt=""><span>${SEC_BY_ID[id].name}</span>${busy ? `<em>${isScouting(s, id) ? '踩点中' : '上课中'}</em>` : ''}`);
    c.disabled = busy;
    c.onclick = () => { p.close(); openCoursePicker(id, done); };
    grid.appendChild(c);
  }
  p.body.appendChild(grid);
}

export function openCoursePicker(secId, done) {
  const p = openPanel(`${SEC_BY_ID[secId].name} 上什么课？`);
  renderCourses(p.body, secId, () => { p.close(); done && done(); });
}
/** 课程表画进 el（培训面板和秘书详情「培养」分段共用）；开课后调 done */
export function renderCourses(el, secId, done) {
  const s = game.state; const r = s.secs[secId];
  const p = { body: el };
  p.body.appendChild(h('div', 'tr-attrs', ATTRS.map((a) => `${a.name} <b>${r.attrs[a.key]}</b>`).join('　') + `　擅长：${AN[SEC_BY_ID[secId].best]}　<small>学费从公司账户扣</small>`));
  for (const c of T.availableCourses(s)) {
    const why = T.whyNot(s, secId, c.id);
    const ic = `assets/ui/icon_course_${c.id}.webp`;
    const row = h('div', 'tr-course', `${hasAsset(ic) ? `<img class="course-ic" src="${asset(ic)}" alt="">` : ''}<div style="flex:1"><b>${c.name}</b><div class="tr-gain">${gainText(T.courseGain(s, secId, c.id))}　${fmtDuration(T.courseTimeSec(s, secId, c.id))}</div></div>
      <button class="btn">${fmtMoney(T.coursePrice(s, secId, c.id))}${why ? `<br><small>${why}</small>` : ''}</button>`);
    const b = row.querySelector('.btn'); b.disabled = !!why;
    b.onclick = () => {
      if (T.startCourse(s, secId, c.id, now())) { toast(`${SEC_BY_ID[secId].name}去上「${c.name}」了`); game.changed(); game.save(); done && done(); }
    };
    p.body.appendChild(row);
  }
}
