// V0.2.16（开发2）：联动单里的孤儿卖单——同组既没有买单、也没有股票（g.sh / o.sh）的出场卖单，永远不会生效还占挂单名额，撤掉。
// 里面没有钱（出场卖单不划钱），撤了不用退。不 import 别的模块：读档（save.upgrade）和每跳（trade.js）都用。
/** 撤掉孤儿单，返回撤了几张 */
export function dropOrphans(m) {
  if (!m || !Array.isArray(m.orders) || !m.orders.length) return 0; const G = m.grps || {};
  const bad = m.orders.filter((o) => o.grp && o.role === 'out' && o.kind !== 'buy' && !(o.sh && o.sh.n) && !(G[o.grp] && G[o.grp].sh && G[o.grp].sh.n) && !m.orders.some((x) => x.grp === o.grp && x.kind === 'buy'));
  if (!bad.length) return 0;
  m.orders = m.orders.filter((o) => !bad.includes(o));
  for (const g of new Set(bad.map((o) => o.grp))) if (m.grps && !m.orders.some((x) => x.grp === g)) delete m.grps[g];
  return bad.length;
}
