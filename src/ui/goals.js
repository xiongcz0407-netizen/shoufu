// 第 P-06 项：主页顶上「当前目标」条 + 整条链面板 + 做完的剧情（设计25 第四节）
import * as G from '../core/goals.js?v=598ef1ae';
import { fmtMoney } from '../core/format.js?v=598ef1ae';
import { game } from '../game.js?v=598ef1ae';
import { now } from '../core/clock.js?v=598ef1ae';
import { onTap } from '../platform/input.js?v=598ef1ae';
import { h, openPanel, toast } from './dom.js?v=598ef1ae';
import { playStory, isStoryPlaying } from './story.js?v=598ef1ae';

const fmtN = (n) => (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : n >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);
function barHtml(s) {
  const g = G.current(s);
  if (g) {
    const p = G.progress(s, g); const pc = Math.min(100, p.cur / p.need * 100);
    const rw = G.rewardText(g);
    return `<span class="gb-tag">目标 ${G.gl(s).i + 1}/${G.LIST.length}</span><span class="gb-text">${g.text}${p.need > 1 ? `　${fmtN(p.cur)} / ${fmtN(p.need)}` : ''}</span>${rw ? `<span class="gb-rw">🎁 ${rw}</span>` : ''}<i class="gb-bar"><b style="width:${pc}%"></b></i>`;
  }
  const n = G.nextTitle(s); if (!n) return '';
  const pc = Math.min(100, n.nw / n.need * 100);
  return `<span class="gb-tag">下一个称号</span><span class="gb-text">「${n.title}」身价 ${fmtN(n.nw)} / ${fmtN(n.need)}${n.rival ? `　${n.acquired ? '✓' : ''}收购${n.rivalName}` : ''}</span><i class="gb-bar"><b style="width:${pc}%"></b></i>`;
}
export function mountGoals(root) {
  const bar = h('button', 'goal-bar', ''); root.appendChild(bar); document.body.classList.add('has-goal');
  onTap(bar, () => openGoals());
  const draw = () => { const s = game.state; if (!s.flags || !s.flags.introDone) { bar.style.display = 'none'; document.body.classList.remove('has-goal'); return; } const x = barHtml(s); bar.style.display = x ? '' : 'none'; document.body.classList.toggle('has-goal', !!x); if (bar._h !== x) { bar._h = x; bar.innerHTML = x; } };
  draw(); game.onChange(draw);
}
export function openGoals() {
  const s = game.state; const p = openPanel('新手目标');
  const G0 = G.gl(s);
  p.body.innerHTML = `<div class="tr-gain">一步一步来：做完自动领奖。做完整条链以后，这里显示「下一个称号还差什么」。</div>` + G.LIST.map((g, k) => {
    const done = k < G0.i; const cur = k === G0.i; const pr = G.progress(s, g);
    return `<div class="goal-row ${done ? 'done' : cur ? 'cur' : ''}"><b>${done ? '✓' : k + 1}</b><div><div>${g.text}${cur && pr.need > 1 ? `<small>　${fmtN(pr.cur)} / ${fmtN(pr.need)}</small>` : ''}</div><small>奖励：${G.rewardText(g) || '—'}</small>${cur && g.tip ? `<small class="fn-note">💡 ${g.tip}</small>` : ''}</div></div>`;
  }).join('') + (G.finished(s) ? (() => { const n = G.nextTitle(s); return n ? `<div class="sd-rec-title">下一个称号：${n.title}</div><div class="fn-card"><div class="fn-row"><span>身价</span><b>${fmtMoney(n.nw)} / ${fmtMoney(n.need)}</b></div>${n.rival ? `<div class="fn-row"><span>收购</span><b>${n.rivalName}${n.acquired ? ' ✓' : '（商战赢满 3 次再收购）'}</b></div>` : ''}</div>` : ''; })() : '');
}
// 每秒查一次；做完的弹剧情（有台词）或者提示
game.addTicker((s) => {
  if (!s.flags || !s.flags.introDone) return;
  const done = G.check(s, now()); if (!done.length) return;
  for (const g of done) {
    const rw = G.rewardText(g);
    toast(`目标完成：${g.text}${rw ? `（${rw}）` : ''}`, 2600, { top: true });
  }
  game.changed(); game.save();
});
export const storyBusy = isStoryPlaying;
