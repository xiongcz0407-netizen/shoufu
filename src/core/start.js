// 开局（设计21 第四节）：打工几年攒了 20 万，拿 15 万注册公司、开第一家小店，老板自己看店
// 钱全走记账：个人存款进来 → 注资到公司 → 公司付开店费
import ECO from '../config/economy.json?v=a24b4431' with { type: 'json' };
import { IND_BY_ID } from '../config/industries.js?v=a24b4431';
import { receive, pay } from './ledger.js?v=a24b4431';

/** 新开局才做一次（s.flags.startFunds） */
export function startFunds(s, t) {
  s.flags = s.flags || {};
  if (s.flags.startFunds) return false;
  const id = ECO.start.firstStore; const cfg = IND_BY_ID[id]; const cost = cfg.real[0].invest;
  receive(s, { wallet: 'personal', cat: 'savings', amount: ECO.start.savings, note: '打工几年攒的存款' }, t);
  pay(s, { wallet: 'personal', cat: 'capital_out', amount: cost, party: s.companyName || '公司', note: '注册公司，注资开店' }, t);
  receive(s, { wallet: 'company', cat: 'capital', amount: cost, party: '老板', note: '老板注资' }, t);
  pay(s, { wallet: 'company', cat: 'expand', amount: cost, ref: '开局', party: '房东 / 装修', note: `${cfg.name}开第一家${cfg.lookNames[0]}（转让费、装修、首批货）` }, t);
  s.inds[id].spent = (s.inds[id].spent || 0) + cost;
  const rs = ECO.start.reserve || 0; /* V0.2：2 万注资当公司备用金，开局「可用」不是负的 */
  if (rs > 0) { pay(s, { wallet: 'personal', cat: 'capital_out', amount: rs, party: s.companyName || '公司', note: '注资到公司（公司备用金）' }, t); receive(s, { wallet: 'company', cat: 'capital', amount: rs, party: '老板', note: '老板注资（公司备用金）' }, t); }
  s.paidIn = (s.paidIn || 0) + cost + rs;
  s.flags.startFunds = true;
  return true;
}
/** 新档：还没有流水的才做（老的开发存档不动） */
export const needsStart = (s) => !(s.flags && s.flags.startFunds) && !(s.ledgerSeq || (s.ledger || []).length);   // 设计79：看记过几笔（ledgerSeq），不靠明细
