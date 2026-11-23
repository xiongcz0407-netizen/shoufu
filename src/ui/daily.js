// 每日：签到 + 每日任务
import * as DL from '../core/daily.js?v=f10d7ba9';
import { totalIncome } from '../core/economy.js?v=f10d7ba9';
import { SEC_BY_ID } from '../config/secretaries.js?v=f10d7ba9';
import { fmtMoney } from '../core/format.js?v=f10d7ba9';
import { now } from '../core/clock.js?v=f10d7ba9';
import { game } from '../game.js?v=f10d7ba9';
import { appendCloudSettings } from './cloudset.js?v=f10d7ba9';
import { h, openPanel, toast } from './dom.js?v=f10d7ba9';

export const hasDailyTodo = (s, t) => !DL.signInfo(s, t).signed || DL.doneCount(s, t) > 0;

export function openDaily() {
  const p = openPanel('每日');
  const render = () => {
    const s = game.state; const t = now(); const info = DL.signInfo(s, t);
    p.body.innerHTML = `<div class="sd-rec-title">签到（连续 ${info.signed ? info.streak : info.streak - 1} 天）</div>`;
    const row = h('div', 'sign-row');
    for (let d = 1; d <= 7; d++) {
      const done = d < info.day || (d === info.day && info.signed);
      row.appendChild(h('div', 'sign-day' + (d === info.day ? ' today' : '') + (done ? ' done' : ''), `<small>第${d}天</small><b>${fmtMoney(DL.signReward(d, s.title))}</b>${done ? '<i>✓</i>' : ''}`));
    }
    p.body.appendChild(row);
    const sb = h('button', 'btn big', info.signed ? '今天签过了' : '签到');
    sb.disabled = info.signed;
    sb.onclick = () => { const r = DL.signIn(s, t); if (r.ok) { toast(`签到第 ${r.day} 天，得 ${fmtMoney(r.cash)}`); game.changed(); game.save(); render(); } };
    p.body.appendChild(sb);
    p.body.appendChild(h('div', 'sd-rec-title', '每日任务'));
    for (const task of DL.tasksFor(s)) {
      const pr = Math.min(task.need, DL.progress(s, t, task.id)); const claimed = !!(s.daily && s.daily.tasks[task.id]);
      const r = h('div', 'tr-course', `<div><b>${task.name}</b><div class="tr-gain">${pr}/${task.need}　奖励 ${fmtMoney(DL.taskReward(task, s.title))}</div></div><button class="btn">${claimed ? '领过了' : pr >= task.need ? '领取' : '去完成'}</button>`);
      const b = r.querySelector('.btn'); b.disabled = claimed || pr < task.need;
      b.onclick = () => { const x = DL.claimTask(s, t, task.id); if (x.ok) { toast(`得 ${fmtMoney(x.cash)}`); game.changed(); game.save(); render(); } };
      p.body.appendChild(r);
    }
  };
  render();
}

export function openSettings() {
  const s = game.state;
  const p = openPanel('设置');
  const row = h('div', 'tr-course', `<div><b>人声</b><div class="tr-gain">秘书说话的配音（没有配音文件时只出气泡）</div></div><button class="btn"></button>`);
  const b = row.querySelector('.btn');
  const upd = () => { b.textContent = s.settings.voice === false ? '关' : '开'; };
  b.onclick = () => { s.settings.voice = s.settings.voice === false; upd(); game.save(); };
  upd();
  p.body.append(row);
  appendCloudSettings(p.body); // 登录名、换名字、重新开始、手机里的素材（设计22）
}
