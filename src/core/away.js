// 离开期间（设计21 第六节、设计22 第七节）：离线不封顶，按游戏日一段段补算
// 每段：产钱（营收、进货）→ 招的人到岗 → 计提工资房租 → 店长 / 财务总监干活 → 各产业到点的事 → 月结（发工资、报税、月报）
// 回来出「离开期间」账单：这段时间流水按类别汇总（2-08c 的账单界面用同一份数据 s.awayBill）
import ECO from '../config/economy.json?v=b7d8e042' with { type: 'json' };
import { CATS, flushAccruals } from './ledger.js?v=b7d8e042';
import { offlineIncome, netWorth } from './economy.js?v=b7d8e042';
import { accruePayables } from './accrual.js?v=b7d8e042';
import { processHires } from './staff.js?v=b7d8e042';
import { tickPosts } from './postwork.js?v=b7d8e042';
import { processPeriods, MONTH_MS } from './gametime.js?v=b7d8e042';

const DAY_MS = MONTH_MS / 30;

/** 补算 from → to。opts：{ secById, ticks: [(s, t) => …]（各产业到点的事）, rnd }。返回账单 */
export function settleAway(s, from, to, opts = {}) {
  const seq0 = s.ledgerSeq || 0; const nw0 = netWorth(s); const co0 = s.company || 0; const cash0 = s.cash || 0;
  const step = DAY_MS * (ECO.offline.stepDays || 1);
  let t = from, months = 0;
  while (t < to) {
    const mEnd = s.createdAt + (Math.floor((t - s.createdAt) / MONTH_MS) + 1) * MONTH_MS; // 不跨月：月底那一刻先结算
    const t2 = Math.min(to, t + step, mEnd);
    if (t2 <= t) break;
    processHires(s, t2);
    offlineIncome(s, (t2 - t) / 1000, opts.secById, t2);
    accruePayables(s, t2);
    tickPosts(s, t2, opts.rnd);
    for (const fn of opts.ticks || []) fn(s, t2);
    months += processPeriods(s, t2);
    t = t2;
  }
  flushAccruals(s, to);
  return makeBill(s, seq0, { from, to, months, nw0, co0, cash0 });
}

/** 把 seq0 之后的流水按「钱包 + 方向 + 类别」汇总 */
export function makeBill(s, seq0, x) {
  const rows = (s.ledger || []).filter((r) => r.id > seq0 && !r.memo);
  const g = {};
  for (const r of rows) { const k = `${r.wallet}|${r.dir}|${r.cat}`; (g[k] = g[k] || { wallet: r.wallet, dir: r.dir, cat: r.cat, name: (CATS[r.cat] || [r.cat])[0], amount: 0, n: 0 }); g[k].amount += r.amount; g[k].n += 1; }
  const lines = Object.values(g).map((l) => ({ ...l, amount: Math.round(l.amount * 100) / 100 })).sort((a, b) => b.amount - a.amount);
  const sumOf = (w, d) => lines.filter((l) => l.wallet === w && l.dir === d).reduce((a, l) => a + l.amount, 0);
  const bill = {
    from: x.from, to: x.to, sec: (x.to - x.from) / 1000, days: (x.to - x.from) / DAY_MS, months: x.months,
    lines, companyIn: sumOf('company', 'in'), companyOut: sumOf('company', 'out'), personalIn: sumOf('personal', 'in'), personalOut: sumOf('personal', 'out'),
    company: [x.co0, s.company || 0], cash: [x.cash0, s.cash || 0], netWorth: [x.nw0, netWorth(s)],
  };
  s.awayBill = bill;
  return bill;
}
