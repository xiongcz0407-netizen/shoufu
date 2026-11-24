// V0.2.3 资金链预警（设计35 第二节 3）：首页红条 + 财务总监急报，4 个选项直达
import * as CF from '../core/cashflow.js?v=701206f7';
import { available } from '../core/accrual.js?v=701206f7';
import { fmtMoney } from '../core/format.js?v=701206f7';
import { game } from '../game.js?v=701206f7';
import { openPanel, h } from './dom.js?v=701206f7';
import { openTab } from './shell.js?v=701206f7';
import * as INB from './inbox.js?v=701206f7';

/** 直达：注资 → 资金页签；经营贷 → 银行；卖股票 / 资产 → 投资；裁员 / 关店 → 人事 */
export function goFund(key) {
  const s = game.state;
  if (key === 'inject') openTab('company', 'funds');
  else if (key === 'loan') openTab('wealth', (s.title || 0) >= 1 ? 'bank' : 'invest');
  else if (key === 'sell') openTab('wealth', 'invest');
  else if (key === 'fire') openTab('company', 'hr');
}
export function openFundHelp() {
  const s = game.state; const w = CF.monthlyWage(s);
  const p = openPanel('公司快发不出工资了');
  p.body.appendChild(h('div', 'rate', `公司可用 <b class="neg">${fmtMoney(available(s))}</b>，一个月工资社保 ${fmtMoney(w)}、房租 ${fmtMoney(CF.burn(s) - w)}<br><small>发不出工资员工会走；拖两个月门店全部停业，停业满一个月员工自动遣散</small>`));
  for (const a of CF.FUND_ACTIONS) { const b = h('button', `btn big ${a.key === 'inject' ? 'gold' : ''}`, a.label); b.onclick = () => { p.close(); goFund(a.key); }; p.body.appendChild(b); }
}
INB.addActionUi((s, m, a, _r, closeInbox) => { if (m.type !== 'fund_low' || !CF.FUND_ACTIONS.some((x) => x.key === a)) return false; m.read = true; if (closeInbox) closeInbox(); goFund(a); return true; }); // 先关消息页：页签开在消息页下面，不关就像按钮点不动

/** 首页红条：可用 < 1 个月工资时一直显示，点了看 4 个选项 */
export function mountFundBar(root) {
  const bar = h('button', 'fund-bar hidden', ''); bar.onclick = () => (bar.dataset.k === 'hr' ? openTab('company', 'hr') : openFundHelp()); root.appendChild(bar);
  const upd = (s) => { const low = CF.fundLow(s); const hb = !low && CF.autoOn(s) && CF.hr(s).blocked; bar.classList.toggle('hidden', !low && !hb); bar.dataset.k = low ? 'low' : hb ? 'hr' : ''; if (low) bar.innerHTML = `⚠ 公司快发不出工资：可用 ${fmtMoney(available(s))}，一个月工资 ${fmtMoney(CF.monthlyWage(s))}<i>点这里 ›</i>`; else if (hb) bar.innerHTML = `⚠ 自动补员停了：还缺 ${CF.hr(s).blocked.n} 人，钱只够留两个月工资<i>点这里 ›</i>`; }; /* V0.2.4 自动补员停了也提示 */
  upd(game.state); game.onChange(upd);
}
