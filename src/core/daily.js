// 每日：签到（7 天一轮）、每日任务。奖励小额（设计21：打工人几百到几千），跟着称号涨（economy.json rewards）
import { daily, dayKey } from './affection.js?v=a184462c';
import { receive, addPostHook } from './ledger.js?v=a184462c';
import ECO from '../config/economy.json?v=a184462c' with { type: 'json' };

const R = ECO.rewards;
export const rewardK = (title) => R.byTitle[Math.max(0, Math.min(R.byTitle.length - 1, title | 0))];
export const TASKS = [
  { id: 'talk', name: '和秘书互动 5 次', need: 5, minutes: 10 },
  { id: 'gift', name: '送 1 次礼物', need: 1, minutes: 10 },
  { id: 'course', name: '安排 1 节课', need: 1, minutes: 15 },
  { id: 'battle', name: '打 2 次商战', need: 2, minutes: 20 },
  { id: 'date', name: '约会 1 次', need: 1, minutes: 20 },
  { id: 'report', name: '看一次月报', need: 1, minutes: 10 },
  { id: 'hire', name: '招一次人', need: 1, minutes: 10 },
];
// 第 2-16a 项：每日任务按称号换内容。下面这些从当天的流水数出来（不用到处加 bump）
export const MORE_TASKS = [
  { id: 'open', name: '开摊或升级 1 次', need: 1, minutes: 10, rows: (r) => r.cat === 'expand' && !r.by && r.ref !== '开局' }, // 开局那家店（start.js）不算
  { id: 'branch', name: '开 1 家分店', need: 1, minutes: 20, rows: (r) => r.cat === 'expand' && !r.by && /开第 \d+ 家/.test(r.note || '') },
  { id: 'land', name: '拿 1 块地', need: 1, minutes: 30, rows: (r) => r.cat === 'land' },
  { id: 'film', name: '投拍 1 部电影或剧', need: 1, minutes: 30, rows: (r) => r.cat === 'film_cost' && /制作/.test(r.note || '') },
  { id: 'tech', name: '科技立项 1 个', need: 1, minutes: 30, rows: (r) => r.cat === 'rnd' && /立项/.test(r.note || '') },
  { id: 'invest', name: '买 1 次股票', need: 1, minutes: 10, rows: (r) => r.cat === 'stock_buy' },   // 设计72
  // 第 3-09 项：资本类
  { id: 'costock', name: '公司买卖 1 次股票', need: 1, minutes: 15, rows: (r) => r.cat === 'co_stock' || r.cat === 'co_stock_sell' },
];
/** 资本类里不进流水的（打开页面、谈判）：各页面 bump */
export const CAP_TASKS = [
  { id: 'investor', name: '跟投资人聊 1 次', need: 1, minutes: 20 },
  { id: 'capview', name: '看 1 次股东名册或集团报表', need: 1, minutes: 10 },
];
const ALL = Object.fromEntries([...TASKS, ...MORE_TASKS, ...CAP_TASKS].map((x) => [x.id, x]));
export const ROW_TASKS = Object.values(ALL).filter((x) => x.rows);   // 设计79：要看流水的那几个（测试对数用）
/** 每个称号的每日任务：打工人开摊招人、小老板开分店上课、老板拿地商战、企业家投拍立项 */
export const BY_TITLE = [
  ['talk', 'gift', 'open', 'hire', 'report', 'date'],
  ['talk', 'gift', 'branch', 'course', 'battle', 'report'],
  ['talk', 'date', 'land', 'battle', 'course', 'report', 'investor'],
  ['talk', 'date', 'film', 'tech', 'invest', 'report', 'investor', 'capview', 'costock'],
];
/** 第一个游戏月的月报出来之前，「看一次月报」用「招一次人」顶替 */
export const tasksFor = (s) => {
  const ids = BY_TITLE[Math.max(0, Math.min(BY_TITLE.length - 1, s.title | 0))];
  const early = !(s.clock && s.clock.monthsDone >= 1);
  return ids.filter((id) => (id === 'hire' ? early : id === 'report' ? !early : true)).map((id) => ALL[id]);
};

/** 记一次（各功能调用） */
export function bump(s, t, key, n = 1) {
  const d = daily(s, t); d.count = d.count || {};
  d.count[key] = (d.count[key] || 0) + n;
}
/** 设计79：要看流水的日常（开店、拿地、买股票…）记账时顺手数，按手机日期过天（s.books.rday = { k 哪天, t, n: { 任务: 次数 } }），不再翻明细 */
addPostHook((s, r) => {
  const k = dayKey(r.t); const B = (s.books = s.books || {}); let D = B.rday;
  if (!D || D.k !== k) { if (D && r.t < D.t) return; D = B.rday = { k, t: r.t, n: {} }; }   // 以前那天补记的不算
  for (const x of Object.values(ALL)) if (x.rows && x.rows(r)) D.n[x.id] = (D.n[x.id] || 0) + 1;
}, true);
export const progress = (s, t, id) => {
  const x = ALL[id]; if (x && x.rows) { const D = s.books && s.books.rday; return D && D.k === dayKey(t) ? D.n[id] || 0 : 0; }
  return (daily(s, t).count || {})[id] || 0;
};

/** 签到：连续签到天数（断了从第 1 天来），7 天一轮 */
export function signInfo(s, t) {
  const d = daily(s, t); const g = (s.signin = s.signin || { streak: 0, lastDay: null });
  const yesterday = new Date(t - 86400e3); const yk = `${yesterday.getFullYear()}-${yesterday.getMonth() + 1}-${yesterday.getDate()}`;
  const nextStreak = d.signed ? g.streak : (g.lastDay === yk ? g.streak + 1 : 1);
  return { signed: !!d.signed, day: ((nextStreak - 1) % 7) + 1, streak: nextStreak };
}
/** 签到第 day 天给多少：economy.json rewards.sign × 称号系数 */
export function signReward(day, title = 0) { return R.sign[day - 1] * rewardK(title); }
export function signIn(s, t, title = s.title) {
  const d = daily(s, t); if (d.signed) return { ok: false, why: '今天签过了' };
  const info = signInfo(s, t);
  const cash = signReward(info.day, title);
  receive(s, { wallet: 'personal', cat: 'reward', amount: cash, note: `签到第 ${info.day} 天` }, t); d.signed = true;
  s.signin.streak = info.streak; s.signin.lastDay = d.day;
  return { ok: true, day: info.day, cash, streak: info.streak };
}
/** 每日任务奖励：rewards.task × (minutes / 10) × 称号系数（minutes 只表示轻重） */
export const taskReward = (task, title = 0) => Math.round(R.task * task.minutes / 10) * rewardK(title);
export function claimTask(s, t, id, title = s.title) {
  const task = tasksFor(s).find((x) => x.id === id); const d = daily(s, t);
  if (!task) return { ok: false, why: '没有这个任务' };
  if (d.tasks[id]) return { ok: false, why: '领过了' };
  if (progress(s, t, id) < task.need) return { ok: false, why: '还没完成' };
  const cash = taskReward(task, title); receive(s, { wallet: 'personal', cat: 'reward', amount: cash, note: `每日任务：${task.name}` }, t); d.tasks[id] = true;
  return { ok: true, cash };
}
export const doneCount = (s, t) => tasksFor(s).filter((x) => progress(s, t, x.id) >= x.need && !daily(s, t).tasks[x.id]).length;
