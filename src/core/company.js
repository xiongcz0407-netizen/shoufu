// 公司月 / 季 / 年结：挂到游戏时钟上（main.js、econsim、autoplay 都用这一份）
import { onPeriod } from './gametime.js?v=6a9355f4';
import { flushAccruals, pay } from './ledger.js?v=6a9355f4';
import * as ST from './staff.js?v=6a9355f4';
import * as CT from './companytax.js?v=6a9355f4';
import { addMsg } from './inbox.js?v=6a9355f4';
import { takeMonth } from './accrual.js?v=6a9355f4';
import { monthEquity } from './equity.js?v=6a9355f4';
import { monthPosts } from './postwork.js?v=6a9355f4';
import { power } from './posts.js?v=6a9355f4';
// 店长管理高，员工流失少（设计17 第一节 4）
ST.setManagerMgmt((s, id) => power(s, 'manager_' + id) * 100);
import { fmtMoney } from './format.js?v=6a9355f4';
import * as FI from './fiscal.js?v=6a9355f4';
import { bank } from './bank.js?v=6a9355f4';
import * as CF from './cashflow.js?v=6a9355f4';
import * as ADS from './ads.js?v=6a9355f4';
import { YEAR_MS } from './gametime.js?v=6a9355f4';

let hooked = false;
export function hookCompany({ rnd = Math.random, onMonth } = {}) {
  if (hooked) return; hooked = true;
  onPeriod('month', (s, m, end) => {
    flushAccruals(s, end);
    const acc = takeMonth(s, end);
    const pr = ST.monthEnd(s, end, rnd, acc);
    ADS.adsMonth(s, end); // V0.2.3 广告月报
    { const h0 = CF.hr(s).hired || 0; CF.autoFill(s, end); pr.hired = (CF.hr(s).hired || 0) - (CF.hr(s).month0 ?? 0) ; CF.hr(s).month0 = CF.hr(s).hired || 0; pr.hrShort = CF.hr(s).blocked ? CF.hr(s).blocked.n : 0; void h0; } // V0.2.4 月底补一次流失，月报写这个月补了几个
    pr.cf = CF.monthCheck(s, end); // V0.2.3 欠薪停业满 1 个月遣散、公司负数给应急周转贷（设计35）
    if (acc.other >= 0.01) { pay(s, { wallet: 'company', cat: 'opex', amount: acc.other, force: true, note: '门店水电物业、营销和杂费' }, end); s.period = s.period || {}; s.period.other = (s.period.other || 0) + acc.other; pr.opex = acc.other; } // 进本月利润（所得税前扣）
    monthPosts(s, m, end, rnd); // 秘书绩效 / 提成、外包费、店长和资产月报、过期没报的税
    const fb = FI.monthBefore(s, m, end, { staff: ST.totalStaff(s) }); // 销售提成、员工福利、进项抵扣（第 2-15 项）
    const tx = CT.monthTax(s, m, end);
    FI.monthAfter(s, m, end, tx, bank); // 欠税滞纳金和征信、财务总监报税台词
    tx.commission = fb.commission; tx.welfare = fb.welfare;
    flushAccruals(s, end);
    s.yearProfit = (s.yearProfit || 0) + tx.profit;
    const label = `第${Math.floor(m / 12) + 1}年${(m % 12) + 1}月`;
    addMsg(s, { kind: 'report', type: 'month_report', title: `${label}经营月报`, data: { m, ...tx, labor: pr.labor.total, rent: pr.rent, paid: pr.paid },
      body: `营收 ${fmtMoney(tx.rev)} − 进货 ${fmtMoney(tx.cogs)} − 人工 ${fmtMoney(pr.labor.total)} − 房租 ${fmtMoney(pr.rent)}${pr.opex ? ` − 水电杂费 ${fmtMoney(pr.opex)}` : ''} − 增值税和附加 ${fmtMoney(tx.vat + tx.surcharge)} = 利润 ${fmtMoney(tx.profit)}。${pr.paid ? '' : '⚠️ 公司账户不够，工资拖欠了！'}${pr.left ? `这个月走了 ${pr.left} 个员工。` : ''}${pr.hired ? `人事自动补员 ${pr.hired} 人。` : ''}${pr.hrShort ? `⚠️ 还缺 ${pr.hrShort} 人没补（钱只够留两个月工资）。` : ''}` }, end);
    onMonth && onMonth(s, m, { pr, tx });
  });
  onPeriod('month', (s, m, end) => monthEquity(s, m, end)); // 收购分期款（core/equity.js）
  onPeriod('quarter', (s, q, end) => {
    const r = CT.quarterTax(s, q, end);
    if (r.cit > 0) addMsg(s, { kind: 'system', type: 'tax', title: `企业所得税 ${fmtMoney(r.cit)}`, body: `第${Math.floor(q / 4) + 1}年第${(q % 4) + 1}季度利润 ${fmtMoney(r.profit)}，按${r.small ? '小型微利 5%' : '25%'}预缴` }, end);
  });
  onPeriod('year', (s, y, end) => {
    const b = ST.yearBonus(s, end, (s.yearProfit || 0) > 0);
    if (b) addMsg(s, { kind: 'system', type: 'bonus', title: `发年终奖 ${fmtMoney(b)}`, body: '按全年利润发 1 个月工资' }, end);
    const ac = FI.annualCit(s, y, end, CT.settleItem); // 企业所得税年度汇算清缴（第 2-15 项）
    const py = FI.personalYear(s, end - YEAR_MS, end);
    addMsg(s, { kind: 'report', type: 'tax_year', title: `第${y + 1}年年度纳税汇总`, body: `企业所得税：全年应纳税所得额 ${fmtMoney(ac.profit)}，按${ac.small ? '小型微利 5%' : '25%'}应纳 ${fmtMoney(ac.due)}，已预缴 ${fmtMoney(ac.prepaid)}，${ac.diff >= 0 ? `补缴 ${fmtMoney(ac.diff)}` : `退税 ${fmtMoney(-ac.diff)}`}。\n个人：共交 ${fmtMoney(py.total)}${py.kinds.length ? '（' + py.kinds.map(([k, v]) => `${k} ${fmtMoney(v)}`).join('、') + '）' : ''}；没有工资薪金，综合所得不用汇算。` }, end);
    s.yearProfit = 0; CT.yearEnd(s);
  });
}
