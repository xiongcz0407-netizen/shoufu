// 收购款分期（验收阶段二 2-08b 第三轮）：股权转让协议选「一次付清」或「分期」
// 分期：首付 ≥ 30%（商务总监在任 20%）付完就算收购成功；余款 12 个游戏月每月月底付一期（协议写清每期金额和日期）
// 没付完的记「应付股权转让款」（负债，身价里减）；逾期按日 0.05% 违约金；连续 3 期付不上 → 对方解除协议：
// 股权收回、已付的扣 20% 违约金后退回、并进来的店和员工退回去（跳槽的秘书不退）
import { live } from './rivalgrow.js?v=6993e46b';
import { INSTALL, RIVAL_BY_ID } from '../config/rivals.js?v=6993e46b';
import { IND_BY_ID } from '../config/industries.js?v=6993e46b';
import { pay, receive, canPay, canPayMust } from './ledger.js?v=6993e46b';
import { MONTH_MS, monthIndex } from './gametime.js?v=6993e46b';
import { addMsg } from './inbox.js?v=6993e46b';

const r2 = (x) => Math.round(x * 100) / 100;
export const deals = (s) => (s.equityDeals = s.equityDeals || []);
export const activeDeals = (s) => deals(s).filter((d) => d.status === 'open');
/** 应付股权转让款（负债） */
export const equityOwed = (s) => activeDeals(s).reduce((a, d) => a + d.left + (d.lateFee || 0), 0);
/** 首付比例：商务总监在任 20%，否则 30% */
export const downRate = (s) => ((s.positions || {}).biz ? INSTALL.downBiz : INSTALL.down);
export const downOf = (s, value) => r2(value * downRate(s));
/** 分期表：第 k 期在收购那个月之后第 k 个月底付 */
export function schedule(s, value, t, down = downOf(s, value)) {
  const left = r2(value - down); const per = r2(left / INSTALL.months); const m0 = monthIndex(s, t);
  return Array.from({ length: INSTALL.months }, (_, i) => ({ k: i + 1, due: s.createdAt + (m0 + i + 1) * MONTH_MS, amount: i === INSTALL.months - 1 ? r2(left - per * (INSTALL.months - 1)) : per }));
}
/** 收购成功（首付已付）后建一笔分期 */
export function openDeal(s, rivalId, t, { down, merged, av, boost, contract }) {
  const r = live(s, rivalId); // P-00：按收购那一刻的估值
  const d = { id: deals(s).length + 1, rival: rivalId, name: r.name, total: r.value, down, paid: down, left: r2(r.value - down), plan: schedule(s, r.value, t, down), k: 0, missed: 0, overdue: 0, lateFee: 0, merged, av, boost, contract, status: 'open', t };
  deals(s).push(d); return d;
}
/** 月底：付到期的一期（连同欠着的和违约金）；付不上记一次，连续 3 次解除 */
export function monthEquity(s, m, end) {
  for (const d of activeDeals(s)) {
    const due = d.plan.filter((x) => x.k > d.k && x.due <= end + 1);
    if (!due.length && !d.overdue) continue;
    if (d.overdue) d.lateFee = r2(d.lateFee + d.overdue * INSTALL.lateDaily * 30); // 欠着的按日 0.05%，一个月 30 天
    const amt = r2(due.reduce((a, x) => a + x.amount, 0));
    const need = r2(d.overdue + amt + d.lateFee);
    if (canPayMust(s, 'company', need)) {
      if (d.overdue + amt > 0) pay(s, { wallet: 'company', cat: 'acquire', amount: d.overdue + amt, party: d.name, ref: d.contract, note: `收购${d.name}分期款 第 ${due.map((x) => x.k).join('、') || d.k} 期` }, end);
      if (d.lateFee > 0) pay(s, { wallet: 'company', cat: 'penalty', amount: d.lateFee, party: d.name, ref: d.contract, note: `收购${d.name}分期逾期违约金（按日 0.05%）` }, end);
      d.paid = r2(d.paid + d.overdue + amt); d.left = r2(d.left - d.overdue - amt); d.overdue = 0; d.lateFee = 0; d.missed = 0; d.k = due.length ? due.at(-1).k : d.k;
      if (d.left <= 0.01) { d.status = 'done'; addMsg(s, { kind: 'system', type: 'equity', title: `收购${d.name}的分期款付清了`, body: `一共 ${Math.round(d.total)} 元，协议 ${d.contract}` }, end); }
    } else {
      d.overdue = r2(d.overdue + amt); d.k = due.length ? due.at(-1).k : d.k; d.missed += 1;
      if (d.missed >= INSTALL.missMax) breach(s, d, end);
      else addMsg(s, { kind: 'system', type: 'equity', title: `⚠️ 收购${d.name}的分期款没付上（连续 ${d.missed} 期）`, body: `欠 ${Math.round(d.overdue)} 元，按日 0.05% 违约金；连续 ${INSTALL.missMax} 期付不上对方会解除协议，股权收回。` }, end);
    }
  }
}
/** 对方解除协议：股权收回、已付的扣 20% 退回、店和员工退回去；跳槽的秘书不退 */
export function breach(s, d, t) {
  d.status = 'breached';
  const back = r2(d.paid * (1 - INSTALL.breachKeep));
  if (back > 0) receive(s, { wallet: 'company', cat: 'refund', amount: back, party: d.name, ref: d.contract, note: `${d.name}解除股权转让协议，退回已付款（扣 ${INSTALL.breachKeep * 100}% 违约金）` }, t);
  for (const x of d.merged || []) { const ind = s.inds[x.ind]; if (!ind) continue; ind.branches = Math.max(0, ind.branches - x.n); for (const [role, n] of Object.entries(x.roles || {})) ind.staff[role] = Math.max(0, (ind.staff[role] || 0) - n); }
  s.acquiredValue = Math.max(0, (s.acquiredValue || 0) - (d.av || 0));
  if (d.boost && s.flags.indBoost) for (const [k, v] of Object.entries(d.boost)) s.flags.indBoost[k] = (s.flags.indBoost[k] || 0) - v;
  const st = (s.rivals || {})[d.rival]; if (st) { st.acquired = false; st.wins = 0; }
  if (s.flags.acquired) delete s.flags.acquired[d.rival];
  const r = RIVAL_BY_ID[d.rival]; if (r.final && s.flags.finalBeaten) delete s.flags.finalBeaten[r.stage];
  d.overdue = 0; d.lateFee = 0; d.left = 0;
  addMsg(s, { kind: 'system', type: 'equity', title: `${d.name}解除了股权转让协议`, body: `连续 ${INSTALL.missMax} 期没付分期款：股权收回，并进来的${(d.merged || []).map((x) => `${IND_BY_ID[x.ind].name} ${x.n} 家`).join('、') || '店'}和员工退回去，已付的退回 ${Math.round(back)} 元（扣 ${INSTALL.breachKeep * 100}% 违约金）。` }, t);
}
