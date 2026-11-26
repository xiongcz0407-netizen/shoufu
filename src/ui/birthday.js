// 设计56 秘书生日：首页顶上小条提醒一次（每人每天一次，点了去商场选好她）；日程最上面、今日日常在 ui/agenda.js、ui/routine.js
import * as LV from '../core/love.js?v=a24b4431';
import { SEC_BY_ID } from '../config/secretaries.js?v=a24b4431';
import { dayKey } from '../core/affection.js?v=a24b4431';
import { now } from '../core/clock.js?v=a24b4431';
import { game } from '../game.js?v=a24b4431';
import { h } from './dom.js?v=a24b4431';

let last = 0;
/** 首页（没开别的页）时，今天谁生日、还没提醒过 → 顶上小条 6 秒 */
export function birthdayStrip(s, t = now()) {
  const ids = LV.birthdaysOn(s, t); if (!ids.length) return null; const k = dayKey(t); const seen = (s.flags.bdayStrip = s.flags.bdayStrip || {});
  const id = ids.find((x) => seen[x] !== k); if (!id) return null; seen[id] = k;
  const ph = document.querySelector('#phone') || document.body; const el = h('button', 'bday-strip', `🎂 今天是${SEC_BY_ID[id].name}的生日 · 送礼 ×3 ›`);
  el.onclick = () => { el.remove(); import('./mall.js?v=a24b4431').then((u) => u.openMall(id, 'gift')); };
  ph.appendChild(el); setTimeout(() => el.remove(), 6000); game.save(); return id;
}
game.addTicker((s) => {
  const t = now(); if (t - last < 3000) return; last = t;
  if (!s.flags || !s.flags.introDone || document.querySelector('.full, .story, .panel-mask, .bday-strip')) return;
  birthdayStrip(s, t);
});
