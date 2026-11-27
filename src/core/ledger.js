// 流水账（设计15 第一节）：所有钱的进出都走 post()，不准直接改余额
// 钱包：personal 个人现金（s.cash）/ company 公司账户（s.company）
// 每条：{ id, t, wallet, dir: 'in'|'out', cat, amount, tax, party, ref, by, note }
export const WALLET_NAME = { personal: '个人现金', company: '公司账户', offshore: '境外账户', invest: '投资账户' }; // invest：设计62 投资账户（s.invest），股票、打新、投资经理都走它 // offshore：第 2-14 项，按人民币等值记（s.offshore）
// 类别（设计15）：key → [中文, 归属]
export const CATS = {
  // 公司收入
  revenue: ['营业收入', 'company'], prepaid: ['预收账款（会员卡 / 储值卡）', 'company'], franchise: ['加盟费', 'company'], acquired_revenue: ['收购来的产业收入', 'company'], capital: ['注册资本', 'company'], battle_bonus: ['商战奖金', 'company'], refund: ['退款', 'company'], investInterest: ['投资账户利息', 'invest'], tax_refund: ['退税', 'company'], presale: ['预售 / 售房回款', 'company'], rent_co: ['租金收入（公司）', 'company'], escrow_out: ['监管账户解冻', 'company'],
  // 公司支出
  prepaid_used: ['会员卡消费冲预收', 'company'], ads: ['广告投放费', 'company'],
  cogs: ['进货成本', 'company'], payroll: ['员工工资', 'company'], social: ['社保公积金', 'company'], agency: ['劳务派遣费', 'company'], severance: ['裁员赔偿', 'company'], bonus: ['年终奖', 'company'], iit_withheld: ['代扣个税', 'company'], rent: ['房租', 'company'], opex: ['水电物业和杂费', 'company'], expand: ['升级 / 开分店', 'company'], recruit: ['招聘费', 'company'],
  training: ['员工培训费', 'company'], acquire: ['收购款', 'company'], investment: ['融资款（限公司用）', 'company'], option_strike: ['秘书行权缴款', 'company'], penalty: ['违约金', 'company'], tax_company: ['公司税费', 'company'], dividend_out: ['分红给老板', 'company'], sec_salary: ['秘书工资', 'company'], accrued: ['计提应付（备忘）', 'company'], loss: ['经营损失', 'company'], outsource: ['外包服务费', 'company'], welfare: ['职工福利费', 'company'], land: ['土地款', 'company'], construction: ['建安工程款', 'company'], re_cost: ['地产开发费用', 'company'], escrow_in: ['转入监管账户', 'company'], fleet: ['车队购置', 'company'], rnd: ['研发费用', 'company'], film_cost: ['影视制作 / 宣发', 'company'], filing: ['注册登记 / 代办费', 'company'], loan_in: ['借款到账', 'company'], deposit_in: ['存入银行', 'company'], deposit_out: ['银行取出', 'company'], interest_in: ['存款利息', 'company'], loan_out: ['还本金', 'company'], interest: ['利息', 'company'], rnd_extra: ['研发加计扣除（备忘）', 'company'], depreciation: ['折旧（备忘）', 'company'],
  // 个人收入
  dividend: ['分红', 'personal'], sell: ['卖东西', 'personal'], reward: ['奖励', 'personal'], rent_income: ['租金收入', 'personal'], savings: ['个人存款（开局）', 'personal'],
  // 个人支出
  car: ['车', 'personal'], house: ['房', 'personal'], plane: ['飞机', 'personal'], yacht: ['游艇', 'personal'], watch: ['名表', 'personal'], suit: ['西装', 'personal'], bag: ['名包（送秘书）', 'personal'], antique: ['古董藏品', 'personal'], fx_out: ['个人购汇', 'personal'], fx_in: ['购汇汇入', 'offshore'], dividend_abroad: ['境外分红', 'offshore'], odi_out: ['境外投资汇出（ODI）', 'company'], stock_buy: ['买股票', 'personal'], stock_sell: ['卖股票', 'personal'], stock_fee: ['股票佣金 / 印花税', 'personal'], stock_div: ['股票分红', 'personal'], order_hold: ['挂单划款（股票条件单）', 'personal'], order_back: ['挂单退回 / 转付股款', 'personal'], inv_out: ['划给投资经理', 'personal'], inv_in: ['投资经理还回', 'personal'], gift: ['礼物', 'personal'], token: ['定情信物（送秘书）', 'personal'], clothes: ['衣服', 'personal'],
  capital_out: ['注资到公司', 'personal'], buyback: ['对赌回购', 'personal'], pledge_repay: ['质押物处置还款', 'personal'], date: ['约会', 'personal'], upkeep: ['维护 / 物业费', 'personal'], tax_personal: ['个人税费', 'personal'],
  debug: ['调试', 'personal'],
  commission: ['销售提成', 'company'], family_office: ['家族办公室开支', 'personal'], // 第 2-15 项
  landmark: ['地标收购', 'company'], // 第 3-07 项
  odi_dividend: ['境外子公司分红', 'company'], // 第 3-06 项
  landmark_sale: ['地标出售', 'company'],
  co_stock: ['公司买股票', 'company'], co_stock_sell: ['公司卖股票', 'company'], // 验收阶段三：公司买的才能举牌、要约、控股
  ipo: ['上市募资', 'company'], ipo_fee: ['承销保荐和发行费用', 'company'], reduce: ['减持股票', 'personal'], // 第 3-04 项
  counter: ['老板站柜台', 'company'], // V2-04 站柜台（设计28 第一节）
  meeting: ['经营会预算', 'company'], buyback: ['回购股票', 'company'], // V2-13 每周经营会（设计29 第五节）
  charity: ['慈善捐款', 'personal'], trip: ['出差（机票酒店）', 'personal'], // V3-02 日程表、V3-03 出差
  offshore_back: ['境外账户取消，余额转回', 'personal'], offshore_back_co: ['香港子公司取消，钱转回公司', 'company'], // V0.2 设计30：存档迁移用
  newbie: ['新手奖励', 'personal'], ipo_pay: ['新股中签缴款', 'personal'], // 第 P-06 项
  transfer_in: ['转入', 'personal'], transfer_out: ['转出', 'personal'], // 设计62：个人 ↔ 投资账户转账（两头各记一笔，wallet 写明是哪个账户）
};
export const KEEP_GAME_YEARS = 3;
import { capAdd } from './cap.js?v=b846574c';   // 设计79
import { bookRow } from './books.js?v=b846574c';   // 设计79 第三版：记账时顺手累加（s.books），数字都从这里拿
/** 每记一笔都要顺手做的事（今日日常计数、新手目标的免费课等）：fn(s, row) */
const POST_HOOKS = [];
export const addPostHook = (fn, replay = false) => { POST_HOOKS.push({ fn, replay }); };   // replay：老存档迁移时也拿全部明细跑一遍（只放纯计数的）
export function replayHooks(s, rows) { for (const r of rows) for (const h of POST_HOOKS) if (h.replay) h.fn(s, r); }
/** 设计79：明细只留最近 300 条给人看；同时记进 books、跑挂钩 */
function record(s, row) { capAdd(s, 'ledger', (s.ledger = s.ledger || []), row); bookRow(s, row); for (const h of POST_HOOKS) h.fn(s, row); return row; }
import BANKCFG from '../config/bank.json?v=b846574c' with { type: 'json' };
const USE_CATS = BANKCFG.useCats;

const bal = (s, w) => (w === 'company' ? s.company : w === 'offshore' ? (s.offshore || 0) : w === 'invest' ? (s.invest || 0) : s.cash);
export const balance = bal;
/** 个人现金里冻结的（买房验资认筹）不能花 */
const frozenCash = (s) => (s.freezes || []).reduce((a, f) => a + f.amount, 0);
/** 必须付的（工资、房租、税、还贷、分期）：只看余额 */
export const canPayMust = (s, wallet, amount) => bal(s, wallet) - (wallet === 'personal' ? frozenCash(s) : 0) >= amount - 1e-9;
/** V0.2.9 工资锁：公司账户自己选着花的钱，一律要留够两个月工资 + 社保 + 房租（cashflow.js 挂上来）；必须付的用 canPayMust */
let companyFloor = null;
export const setCompanyFloor = (fn) => { companyFloor = fn; };
/** 工资锁的状态：strict = 自动的（每秒逻辑、离线结算），一律锁；click = 玩家点的那一下，锁住后界面问「照样花吗」；bypass = 玩家点了「照样花」；last = 最近被锁住的那笔 */
export const lockState = { strict: false, click: false, bypass: false, last: null };
export const canPay = (s, wallet, amount) => {
  if (!canPayMust(s, wallet, amount)) return false;
  if (wallet !== 'company' || !companyFloor || lockState.bypass || !(lockState.strict || lockState.click)) return true;   // 平时画界面不锁（按钮不灰），点下去才问
  return !companyFloor(s, amount);
};

/** 记一笔并改余额。out 时余额不够返回 null（不扣）；force 允许扣成负数（欠工资、欠税） */
export function post(s, e, t = Date.now()) {
  const amount = Math.round((e.amount || 0) * 100) / 100;
  if (!(amount > 0) && !(e.memo && e.zero)) return null; // V0.2.4：备忘行可以是 0 元（人事贴招聘补员也要留一笔流水）
  const wallet = e.wallet || (CATS[e.cat] ? CATS[e.cat][1] : 'personal');
  if (e.dir === 'out' && !e.force && !e.memo && !canPayMust(s, wallet, amount)) return null;
  const k = e.dir === 'out' ? -1 : 1;
  if (e.memo) { /* 备忘行（代扣个税等）：只记账不动余额 */ } else if (wallet === 'company') s.company = (s.company || 0) + k * amount; else if (wallet === 'offshore') s.offshore = (s.offshore || 0) + k * amount; else if (wallet === 'invest') s.invest = (s.invest || 0) + k * amount; else s.cash = (s.cash || 0) + k * amount;
  s.ledgerSeq = (s.ledgerSeq || 0) + 1;
  if (e.dir === 'out' && wallet === 'company' && !e.memo && s.bank && s.bank.restricted > 0 && USE_CATS.includes(e.cat)) s.bank.restricted = Math.max(0, s.bank.restricted - amount); // 贷款资金先花在产业上（专款专用）
  const row = { id: s.ledgerSeq, t, wallet, dir: e.dir, cat: e.cat, amount, memo: !!e.memo, tax: e.tax || 0, party: e.party || '', ref: e.ref || '', by: e.by || '', note: e.note || '' };
  return record(s, row);
}
export const pay = (s, e, t) => post(s, { ...e, dir: 'out' }, t);
/** 设计40 收益流水（开发2 core/flow.js 挂）：一笔一笔进来的钱 fn(s, row) */
const RECEIVE_HOOKS = [];
export const addReceiveHook = (fn) => { RECEIVE_HOOKS.push(fn); };
export const receive = (s, e, t) => { const r = post(s, { ...e, dir: 'in' }, t); if (r) for (const fn of RECEIVE_HOOKS) fn(s, r); return r; };

/** 按秒产生的收入（每秒一条太多）：先攒着，flushAccruals 时合成一条 */
export function accrue(s, key, wallet, cat, amount, note = '', dir = 'in') {
  if (!(amount > 0)) return;
  const k = dir === 'out' ? -1 : 1;
  if (wallet === 'company') s.company = (s.company || 0) + k * amount; else if (wallet === 'offshore') s.offshore = (s.offshore || 0) + k * amount; else if (wallet === 'invest') s.invest = (s.invest || 0) + k * amount; else s.cash = (s.cash || 0) + k * amount;
  const a = (s.accruals = s.accruals || {});
  const x = (a[key] = a[key] || { wallet, cat, amount: 0, note, dir });
  x.amount += amount;
}
/** 开发2 设计72：余额已经一点一点加过的（投资账户利息），按游戏天补一条流水 */
export function bookAccrued(s, x, t = Date.now()) {
  if (!(x.amount >= 0.01)) return null;
  s.ledgerSeq = (s.ledgerSeq || 0) + 1; const row = { id: s.ledgerSeq, t, wallet: x.wallet, dir: x.dir || 'in', cat: x.cat, amount: Math.round(x.amount * 100) / 100, tax: 0, party: x.party || '', ref: '', by: '', note: x.note || '' };
  return record(s, row);
}
/** 把攒着的收入写成流水（余额已经加过了，只补账） */
export function flushAccruals(s, t = Date.now()) {
  const a = s.accruals || {};
  for (const [key, x] of Object.entries(a)) {
    if (x.amount >= 0.01) {
      s.ledgerSeq = (s.ledgerSeq || 0) + 1;
      record(s, { id: s.ledgerSeq, t, wallet: x.wallet, dir: x.dir || 'in', cat: x.cat, amount: Math.round(x.amount * 100) / 100, tax: 0, party: '', ref: '', by: '', note: x.note || key });
    }
  }
  s.accruals = {};
}

/** 太老的流水按游戏月合并成汇总行（明细保留最近 3 个游戏年） */
export function compact(s, monthOf, nowMonth) {
  const keepFrom = nowMonth - KEEP_GAME_YEARS * 12;
  const old = []; const keep = [];
  for (const r of s.ledger || []) (monthOf(r.t) < keepFrom && !r.summary ? old : keep).push(r);
  if (!old.length) return 0;
  const groups = {};
  for (const r of old) {
    const k = [monthOf(r.t), r.wallet, r.dir, r.cat].join('|');
    const g = (groups[k] = groups[k] || { ...r, amount: 0, tax: 0, summary: true, count: 0, note: '月汇总' });
    g.amount += r.amount; g.tax += r.tax; g.count += 1;
  }
  s.ledger = [...Object.values(groups), ...keep].sort((a, b) => a.t - b.t);
  return old.length;
}

/** 查流水明细（只有最近 300 条，给人看的；要算数用 core/books.js）：{ wallet, cat, by, from, to } */
export function query(s, f = {}) {
  return (s.ledger || []).filter((r) => (!f.wallet || r.wallet === f.wallet) && (!f.cat || r.cat === f.cat) && (!f.by || r.by === f.by)
    && (f.from == null || r.t >= f.from) && (f.to == null || r.t < f.to));
}
export function sum(rows, dir) { return rows.filter((r) => !dir || r.dir === dir).reduce((a, r) => a + (r.dir === 'out' ? -r.amount : r.amount) * (dir ? (r.dir === 'out' ? -1 : 1) : 1), 0); }
