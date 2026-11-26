// 存档迁移（core/save.js 的 MIGRATIONS 用）。只依赖记账，不引别的玩法模块（避免循环引用）
import { receive } from './ledger.js?v=9a2bf56f';

/** saveV 1 → 2（V0.2，设计30 取消换汇和境外账户）：
 *  境外账户余额全部转回个人现金、香港子公司（ODI）的钱转回公司账户，各记一笔流水；开户 / 购汇 / ODI 记录删掉；
 *  地标在审批里的 ODI 那一步删掉；红筹架构删掉「香港中间控股公司」那一步 */
export function v1to2(s, t = Date.now()) {
  const off = s.offshore || 0; const A = s.abroad || {}; const hk = A.hk || 0;
  s.offshore = 0;
  if (off >= 0.01) receive(s, { wallet: 'personal', cat: 'offshore_back', amount: off, party: '汇峰银行（香港）', note: '境外账户取消，余额转回个人现金' }, t);
  if (hk >= 0.01) receive(s, { wallet: 'company', cat: 'offshore_back_co', amount: hk, party: '香港子公司', note: '香港子公司（ODI）取消，钱转回公司账户' }, t);
  delete s.offshore;
  s.abroad = { appr: A.appr || {}, ...(A.visa ? { visa: A.visa } : {}), ...(A.taxAt != null ? { taxAt: A.taxAt } : {}) };
  for (const d of Object.values((s.landmark && s.landmark.deals) || {})) {
    if (!Array.isArray(d.steps)) continue;
    const had = d.steps.length; d.steps = d.steps.filter((x) => x.key !== 'odi'); if (d.steps.length === had) continue;
    if (d.stage === 'approve') { const nx = d.steps.find((x) => x.ok == null); if (!nx) d.stage = 'ready'; else if (!nx.at) nx.at = t; }
  }
  const R = s.group && s.group.red;
  if (R) { if (Array.isArray(R.done)) R.done = R.done.filter((k) => k !== 'hk'); if (R.step === 'hk') { R.step = null; R.at = 0; } }
  return s;
}
