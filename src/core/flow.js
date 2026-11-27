// 设计40 收益流水（开发2）：把真实营收切成一笔一笔显示，不另加钱、不改经济
// 在线每秒 tickIncome 的挂钩把每条线的 rev、cogs 交过来 → 每条线攒着，隔 2～5 秒出一笔：
//   进账 = 攒的营收；成本 = 攒的进货 + 这段时间摊到的工资社保、房租、杂费；赚 = 进账 − 成本
// 写哪家店：一家店只写产业名；有分店「城市 + 几号店」随机挑；非零售线写城市（设计40 第二轮，说法、单价不用了）
// 一笔一笔进来的大钱（地产预售、收租、传媒分账、商战奖励）用记账那一笔直接出一条
// 存档 s.flow = { day, sum: { rev, cost }, list: [{ i, t, id, name, text, rev, cost }]（最新在前，最多 60）, seq }；离线不补
import { capAdd } from './cap.js?v=3839f433';   // 设计79：有上限的列表（config/caps.js）
import { IND_BY_ID } from '../config/industries.js?v=3839f433';
import { setIncomeHook } from './economy.js?v=3839f433';
import { addReceiveHook } from './ledger.js?v=3839f433';
import { lineLabor } from './staff.js?v=3839f433';
import { monthlyRent, monthlyOpex } from './accrual.js?v=3839f433';
import { MONTH_MS, gameDate } from './gametime.js?v=3839f433';
import { now } from './clock.js?v=3839f433';
import { lineCities, cityName } from './cities.js?v=3839f433';
import { st as siteSt } from './sites.js?v=3839f433';

export const FLOW_MAX = 60;
const GAP = [2000, 5000];   // 隔 2～5 秒出一笔
const STALE = 15000;        // 断了 15 秒以上（离线、切后台）攒的不算，从现在重新攒
// 一笔一笔进来的：记账类别 → 哪条线、写什么（设计40 第二轮：店名那里写这笔是什么）
const SAY = { presale: '预售回款', rent: '收到租金', sale: '卖出一套房', other: '地产进账' };
const BIG = { presale: { id: 'realestate', say: 'presale' }, rent_co: { id: 'realestate', say: 'rent' }, landmark_sale: { id: 'realestate', say: 'sale' }, revenue: { id: null }, battle_bonus: { id: 'battle' } };

export function fl(s) { if (!s.flow) s.flow = { day: null, sum: { rev: 0, cost: 0 }, list: [], seq: 0 }; return s.flow; }
const dayKey = (s, t) => { const d = gameDate(s, t); return `${d.year}-${d.month}-${d.day}`; };
/** 今天（游戏日）合计：{ rev, cost, profit }；过了 0 点没出过单也是 0 */
export function todaySum(s, t = now()) { const f = fl(s); const z = f.day === dayKey(s, t) ? f.sum : { rev: 0, cost: 0 }; return roundPair(z.rev, z.cost); }
/** 一条的赚（卖 − 成本，按显示的精度算，一元不差） */
export const profitOf = (r) => roundPair(r.rev, r.cost).profit;

const pends = new WeakMap(); // 每个存档在内存里的「待出单」（不存档）
const pendOf = (s) => { let p = pends.get(s); if (!p) pends.set(s, (p = {})); return p; };
const one = (s, id) => ({ ...s, inds: { [id]: s.inds[id] } });
/** 这条线每毫秒摊多少固定成本（工资社保 + 房租 + 杂费） */
export const fixedPerMs = (s, id) => (lineLabor(s, id) + monthlyRent(one(s, id)) + monthlyOpex(one(s, id))) / MONTH_MS;
const between = ([a, b], rnd) => a + (b - a) * rnd();

// —— 写哪家店（设计40 第二轮）——
/** 这条线开着的店，按开店顺序：[{ city, no（这个城市里第几号） }]。没记开店的（第一家、收购来的）算总部，排最前 */
export function shopsOf(s, id) {
  const x = s.inds[id]; if (!x || !(x.branches > 0)) return [];
  const rec = (siteSt(s).lines[id] || []).slice().sort((a, b) => (a.at || 0) - (b.at || 0));
  const cnt = lineCities(s, id); const left = { ...cnt }; for (const r of rec) left[r.city] = (left[r.city] || 0) - 1;
  const list = []; for (const [c, n] of Object.entries(left)) for (let k = 0; k < n; k++) list.push(c);
  for (const r of rec) if ((cnt[r.city] || 0) > 0) list.push(r.city);
  const no = {}; return list.slice(0, x.branches).map((c) => ({ city: c, no: (no[c] = (no[c] || 0) + 1) }));
}
/** 出单写哪家：一家店只写产业名（返回 ''）；有分店从开着的店里随机挑一家「城市 + 几号店」；非零售线写城市（一个城市返回 ''） */
export function whereFor(s, id, rnd = Math.random) {
  const c = IND_BY_ID[id]; if (!c) return '';
  if (c.retail) { const xs = shopsOf(s, id); if (xs.length <= 1) return ''; const x = xs[Math.floor(rnd() * xs.length) % xs.length]; return `${cityName(x.city)} ${x.no} 号店`; }
  const cs = Object.entries(lineCities(s, id)).filter(([, n]) => n > 0).map(([k]) => k);
  return cs.length <= 1 ? '' : cityName(cs[Math.floor(rnd() * cs.length) % cs.length]);
}
/** 数字算得平（第二节第 6 条）：进账、成本各自四舍五入到元（不到 10 元时一位小数，三个一样），赚 = 进账 − 成本 */
export const dec1 = (rev) => Math.abs(rev) < 10;
export const roundPair = (rev, cost) => { const k = dec1(rev) ? 10 : 1; const r = Math.round(rev * k), c = Math.round(cost * k); return { rev: r / k, cost: c / k, profit: (r - c) / k, dec: k === 10 }; };

function push(s, t, row) {
  const f = fl(s); const k = dayKey(s, t); if (f.day !== k) { f.day = k; f.sum = { rev: 0, cost: 0 }; }
  const z = roundPair(row.rev, row.cost);
  f.sum.rev += z.rev; f.sum.cost += z.cost; f.seq += 1;   // 合计用每条取整后的数加，跟一条一条对得上
  capAdd(s, 'flow.list', f.list, { i: f.seq, t, ...row, rev: z.rev, cost: z.cost });
}

/** 一秒一条线的营收进来（tickIncome 的挂钩；测试直接调） */
export function feed(s, id, rev, cogs, sec, t = now(), rnd = Math.random) {
  if (!(sec > 0) || sec > 10) return;              // 离线结算、卡了很久的一下：不补流水
  const P = pendOf(s); let p = P[id];
  if (!p || t - p.last > STALE) p = P[id] = { rev: 0, cogs: 0, since: t - sec * 1000, next: t + between(GAP, rnd), last: t };
  p.rev += rev; p.cogs += cogs; p.last = t;
  if (t < p.next || p.rev < 1) return;              // 不到 1 元先攒着
  const text = whereFor(s, id, rnd);
  const cost = p.cogs + fixedPerMs(s, id) * (t - p.since);
  push(s, t, { id, name: IND_BY_ID[id].name, text, rev: p.rev, cost });
  P[id] = { rev: 0, cogs: 0, since: t, next: t + between(GAP, rnd), last: t };
}
/** 一笔进来的大钱（记账 receive 的挂钩）：只记公司账户、在线时的那几类 */
export function bigIn(s, row, t = now()) {
  const b = BIG[row.cat]; if (!b || row.wallet !== 'company' || !(row.amount > 0)) return;
  if (Math.abs(t - row.t) > STALE) return;          // 离线补算的：不补流水
  let id = b.id; if (!id) id = Object.keys(IND_BY_ID).find((k) => row.note && row.note.startsWith(IND_BY_ID[k].name)) || null;
  const text = b.say ? SAY[b.say] || SAY.other : id === 'battle' ? `赢了${row.party || '对手'}的奖励` : (row.note || '进账').replace(/^娱乐传媒 /, '');
  push(s, row.t, { id: id || 'other', name: id === 'battle' ? '商战' : (IND_BY_ID[id] || {}).name || '其他', text, rev: row.amount, cost: 0, big: true });
}

/** 设计72：按跳一点一点进来的（投资账户利息）每个游戏天合成一行，原地加；只在线时（离线补的不进流水）；不算进公司的「今天合计」 */
export function dailyLine(s, t, key, row, amt) {
  if (!(amt > 0) || Math.abs(now() - t) > STALE) return;
  const f = fl(s); const k = dayKey(s, t); let x = f.list.find((r) => r.daily === key && r.dk === k);
  if (!x) { f.seq += 1; x = { i: f.seq, t, ...row, rev: 0, cost: 0, raw: 0, daily: key, dk: k, noSum: true }; capAdd(s, 'flow.list', f.list, x); }
  x.raw += amt; x.rev = roundPair(x.raw, 0).rev; x.t = t;
}
setIncomeHook((s, id, rev, cogs, sec) => feed(s, id, rev, cogs, sec));
addReceiveHook((s, row) => bigIn(s, row));
