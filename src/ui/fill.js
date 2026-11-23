// V0.2.2 开店那一刻问招不招人（设计34 第五节）：补满（立刻到岗）/ 先不招
import * as ST from '../core/staff.js?v=b3791cdb';
import { PAY } from '../core/staff.js?v=b3791cdb';
import { IND_BY_ID } from '../config/industries.js?v=b3791cdb';
import { now } from '../core/clock.js?v=b3791cdb';
import { game } from '../game.js?v=b3791cdb';
import { openPanel, toast, h } from './dom.js?v=b3791cdb';

/** 一键补满，弹一句结果 */
export function doFill(id) {
  const s = game.state; const r = ST.fillUp(s, id, now());
  if (!r.ok) { toast(r.why, 2200); return false; }
  toast(`${IND_BY_ID[id].name}补了 ${r.n} 个人（${PAY.channels[r.channel].name}），立刻到岗`, 2600); game.changed(); game.save(); return true;
}
/** 开完店调用：缺人就问 */
export function askFill(id) {
  const s = game.state; const n = ST.needTotal(s, id); if (!n) return;
  const ch = PAY.channels[ST.fillChannel(s)];
  const p = openPanel('招人');
  p.body.appendChild(h('div', 'tr-gain', `这家店要 ${n} 个人才能开门，现在招吗？<br><small>${s.title ? `${ch.name}，立刻到岗；工资每月加 ${Math.round(ch.markup * 100)}% 派遣费` : `${ch.name}，免费，立刻到岗`}</small>`));
  const ok = h('button', 'btn gold big', '补满（立刻到岗）'); ok.onclick = () => { doFill(id); p.close(); };
  const no = h('button', 'btn big', '先不招'); no.onclick = () => p.close();
  p.body.append(ok, no);
}
