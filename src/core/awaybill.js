// 离开期间账单（第 2-16a 项）：秘书替你做了什么（从流水的经手人和消息中心数出来）
import { CATS } from './ledger.js?v=691ed83a';
import { SEC_BY_ID } from '../config/secretaries.js?v=691ed83a';
import { postOfSec, postName } from './posts.js?v=691ed83a';

/** 离开这段时间（bill.from ～ bill.to）每个秘书经手的事：按类别合计 + 发来的月报 / 请示 */
export function secWork(s, b) {
  const out = {};
  const one = (id) => (out[id] = out[id] || { id, name: SEC_BY_ID[id].name, post: postOfSec(s, id) ? postName(postOfSec(s, id)) : '', cats: {}, msgs: [] });
  for (const r of s.ledger || []) {
    if (r.memo || !r.by || !SEC_BY_ID[r.by] || r.t < b.from || r.t > b.to) continue;
    const c = one(r.by).cats; const k = `${r.dir}|${r.cat}`;
    const x = (c[k] = c[k] || { name: (CATS[r.cat] || [r.cat])[0], dir: r.dir, wallet: r.wallet, n: 0, amount: 0 }); x.n += 1; x.amount += r.amount;
  }
  for (const m of s.inbox || []) if (m.from && SEC_BY_ID[m.from] && m.t >= b.from && m.t <= b.to) one(m.from).msgs.push({ title: m.title, kind: m.kind, open: m.status === 'open' });
  return Object.values(out).map((x) => ({ ...x, cats: Object.values(x.cats).map((c) => ({ ...c, amount: Math.round(c.amount * 100) / 100 })).sort((a, b2) => b2.amount - a.amount) }))
    .sort((a, b2) => b2.cats.length + b2.msgs.length - a.cats.length - a.msgs.length);
}
