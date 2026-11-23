// V0.2.9 产业「收益」页（Arvin）：每条线本月到现在 卖出 − 成本 = 盈利，每秒跟着变
// 卖出、进货是本月真实累计（s.period）；工资社保、房租、水电杂费按本月过去了多少分摊
import { IND_BY_ID } from '../config/industries.js?v=daaa7f91';
import * as ST from '../core/staff.js?v=daaa7f91';
import { monthlyRent, monthlyOpex } from '../core/accrual.js?v=daaa7f91';
import { MONTH_MS } from '../core/gametime.js?v=daaa7f91';
import { fmtMoney } from '../core/format.js?v=daaa7f91';
import { now } from '../core/clock.js?v=daaa7f91';
import { game } from '../game.js?v=daaa7f91';
import { h, liveRender } from './dom.js?v=daaa7f91';

const one = (s, id) => ({ ...s, inds: { [id]: s.inds[id] } });
export function profitRows(s, t = now()) {
  const f = Math.min(1, Math.max(0, ((t - (s.createdAt || 0)) % MONTH_MS) / MONTH_MS)); const P = s.period || {};
  const rows = Object.keys(s.inds || {}).filter((id) => s.inds[id] && (s.inds[id].branches || 0) > 0).map((id) => {
    const rev = (P.rev || {})[id] || 0, cogs = (P.cogs || {})[id] || 0;
    const fixed = (ST.lineLabor(s, id) + monthlyRent(one(s, id)) + monthlyOpex(one(s, id))) * f;
    return { id, name: IND_BY_ID[id].name, rev, cost: cogs + fixed, profit: rev - cogs - fixed };
  });
  const lab = ST.monthlyLabor(s).total - Object.keys(s.inds || {}).reduce((a, id) => a + ST.lineLabor(s, id), 0);
  return { rows, hq: Math.max(0, lab) * f, f };
}
export function renderProfit(body) {
  const wrap = h('div'); body.appendChild(wrap);
  const draw = () => {
    const s = game.state; const { rows, hq, f } = profitRows(s);
    const sum = rows.reduce((a, r) => ({ rev: a.rev + r.rev, cost: a.cost + r.cost, profit: a.profit + r.profit }), { rev: 0, cost: 0, profit: 0 });
    const cell = (x) => `<b class="${x < 0 ? 'neg' : ''}">${fmtMoney(x)}</b>`;
    wrap.innerHTML = `<div class="tr-gain">本月到现在（这个月过了 ${Math.round(f * 100)}%）。成本 = 进货 + 工资社保 + 房租 + 水电杂费。</div>
      <div class="pf-table"><div class="pf-row pf-head"><span>产业</span><span>卖出</span><span>成本</span><span>盈利</span></div>
      ${rows.map((r) => `<div class="pf-row"><span>${r.name}</span><span>${fmtMoney(r.rev)}</span><span>${fmtMoney(r.cost)}</span><span>${cell(r.profit)}</span></div>`).join('') || '<div class="empty">还没有开店</div>'}
      ${hq > 0.5 ? `<div class="pf-row pf-sub"><span>总部和秘书工资</span><span></span><span>${fmtMoney(hq)}</span><span>${cell(-hq)}</span></div>` : ''}
      <div class="pf-row pf-sum"><span>合计</span><span>${fmtMoney(sum.rev)}</span><span>${fmtMoney(sum.cost + hq)}</span><span>${cell(sum.profit - hq)}</span></div></div>`;
  };
  liveRender(wrap, draw, (fn) => game.onChange(fn), body);
}
