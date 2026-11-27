import { capAdd } from './cap.js?v=5f2b1b8c';   // 设计79：有上限的列表（config/caps.js）
// 合同存档（设计14）：所有签过的合同进档案柜（第 13 项财富 → 档案柜）
export function addContract(s, c, t = Date.now()) {
  s.contractSeq = (s.contractSeq || 0) + 1;
  const no = `${c.prefix || 'HT'}-${new Date(t).getFullYear()}-${String(s.contractSeq).padStart(5, '0')}`;
  const rec = { no, t, title: c.title, ...(c.sub ? { sub: c.sub } : {}), parties: c.parties, subject: c.subject, rows: c.rows, total: c.total, wallet: c.wallet, kind: c.kind || '' };
  capAdd(s, 'contracts', (s.contracts = s.contracts || []), rec);   // 设计79：全文留 100 份，更早的进 contractsOld 只留摘要
  return rec;
}
export const nextContractNo = (s, prefix = 'HT', t = Date.now()) => `${prefix}-${new Date(t).getFullYear()}-${String((s.contractSeq || 0) + 1).padStart(5, '0')}`;
