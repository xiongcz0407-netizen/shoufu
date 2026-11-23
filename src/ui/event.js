// 事件弹层（2-01）：消息中心「事件」点「去看看」→ 剧情 + 选择
import * as EV from '../core/events.js?v=daaa7f91';
import { EVENT_BY_ID } from '../config/events.js?v=daaa7f91';
import { game } from '../game.js?v=daaa7f91';
import { now } from '../core/clock.js?v=daaa7f91';
import { playStory } from './story.js?v=daaa7f91';
import { asset, hasAsset } from '../platform/assets.js?v=daaa7f91';
import { toast } from './dom.js?v=daaa7f91';
import { fmtMoney } from '../core/format.js?v=daaa7f91';

const BG = { teambuild: 'bg_teambuild', crisis: 'bg_finance', jobfair: 'bg_meeting' }; // 有背景图的用图（团建的图还没有）
const BG_LABEL = { teambuild: '郊外拓展基地' };

export function openEventMsg(m, onDone) {
  const s = game.state; const id = m.data && m.data.id; const cfg = EVENT_BY_ID[id]; if (!cfg) return;
  const from = EV.reporter(s, cfg);
  const lines = cfg.story.map((l) => ({ ...l, who: l.who === 'from' ? (from || 'narr') : l.who }));
  const choices = cfg.choices.map((c) => {
    const cost = EV.choiceCost(s, c); const why = EV.whyNotChoice(s, c);
    const sub = [cost ? `${c.cost.perStaff ? `人均 ${fmtMoney(c.cost.perStaff)} × ${Math.round(cost / c.cost.perStaff)} 人 = ` : ''}${fmtMoney(cost)}（${c.cost.wallet === 'personal' ? '个人现金' : '公司账户'}）` : '', c.favorAll < 0 ? '大家会有点失望' : c.favorAll > 0 ? `秘书好感 +${c.favorAll}` : '', why || ''].filter(Boolean).join('　');
    return { label: c.label, sub, disabled: !!why };
  });
  const k = BG[id]; const bg = k && hasAsset(`assets/bg/${k}.webp`) ? asset(`assets/bg/${k}.webp`) : null;
  playStory(lines, { sec: from || undefined, title: cfg.name, bg, bgLabel: bg ? null : BG_LABEL[id], choices,
    onChoose: (i) => {
      const r = EV.choose(game.state, id, i, now());
      if (!r.ok) { toast(r.why); return false; }
      if (r.refund) setTimeout(() => toast(`多交的增值税退回 ${fmtMoney(r.refund)}`, 3000, { top: true }), 300);
      if (r.then.length) playStory(r.then, { title: cfg.name, bg, bgLabel: bg ? null : BG_LABEL[id] });
      game.changed(); game.save(); onDone && onDone();
    } });
}
