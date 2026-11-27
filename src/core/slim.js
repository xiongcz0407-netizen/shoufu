/* 设计79 第三版：明细只留给人看（数字都在 core/books.js 累加好了）
   - 合同 contracts 留 100 份全文，更早的进 s.contractsOld 只留摘要 { no, t, title, party, total, old: true }（留 200 份）
   - 完税凭证 taxes 加进来时顺手记进 books.tax（cap.js 的 onAdd）
   - 做完的地产项目留最近 20 个（还挂着贷款的不动） */
import { setFold, setOnAdd, addTrim, capPush, capOf } from './cap.js?v=3839f433';
import { bookTax } from './books.js?v=3839f433';

export const contractStub = (c) => ({ no: c.no, t: c.t, title: c.title, party: ((c.parties || []).find(([k]) => /乙方|对方|卖方|出让|贷款人|银行/.test(k)) || (c.parties || [])[1] || [, ''])[1] || '', total: c.total, old: true });
export function foldContracts(s, old) { const L = (s.contractsOld = s.contractsOld || []); for (const c of old) capPush(L, c.old ? c : contractStub(c), capOf('contractsOld')); }   // 摘要也有上限（再早的丢掉）
setFold('contracts', foldContracts);
setOnAdd('taxes', bookTax);

export const DONE_KEEP = 20;
addTrim((s, scale) => {
  const R = s.re; if (!R || !Array.isArray(R.projects)) return 0;
  const keep = Math.max(2, Math.floor(DONE_KEEP * scale)); const loanOn = new Set(((s.bank && s.bank.loans) || []).map((l) => l.project).filter(Boolean));
  const done = R.projects.filter((p) => p.stage === 'done' && !loanOn.has(p.id)); if (done.length <= keep) return 0;
  const drop = new Set(done.slice(0, done.length - keep)); R.projects = R.projects.filter((p) => !drop.has(p)); return drop.size;
});
