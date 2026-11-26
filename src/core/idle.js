// 设计72 投资账户闲钱自动生息（开发2）：投资账户可用余额（s.invest，挂单冻结的、股票、投资经理那份都已经不在里面）按年化 idleRate（游戏年）每跳入账
// 挂在 core/trade.js 的每跳钩子上（stocks.js addStepHook），离线补跳一样走；余额每跳马上加（接着生息），流水按游戏天补一条（ledger bookAccrued，钱包 invest，类别 investInterest，免个税）——不管在线、离线、补几段，一天就是一条
// 存档 s.mkt.idle = { total 累计, day 哪个游戏天, today 今天（还没记流水的就是它） }；收益流水（设计40）每个游戏天合成一行（只在线时）
import ICFG from '../config/invest.js?v=06229def';
import SCFG from '../config/stocks.json?v=06229def' with { type: 'json' };
import { bookAccrued } from './ledger.js?v=06229def';
import { YEAR_MS, gameDate } from './gametime.js?v=06229def';
import { dailyLine } from './flow.js?v=06229def';

const TICK = SCFG.tickSec * 1000;
export const TICKS_PER_YEAR = YEAR_MS / TICK;
export const rate = () => ICFG.idleRate;
const dayKey = (s, t) => { const d = gameDate(s, t); return `${d.year}-${d.month}-${d.day}`; };
export const ix = (s) => (s.mkt.idle = s.mkt.idle || { total: 0, day: null, today: 0 });
/** 每跳：投资账户可用余额生息，返回这一跳的利息 */
export function step(s, tk) {
  if (!s.mkt) return 0; const t = tk * TICK; const I = ix(s); const k = dayKey(s, t);
  if (I.day !== k) { if (I.day != null) bookAccrued(s, { wallet: 'invest', cat: 'investInterest', amount: I.today, party: '投资账户', note: `投资账户闲钱利息（${I.day}，年化 ${Math.round(ICFG.idleRate * 100)}%）` }, t); I.day = k; I.today = 0; }   // 过了一个游戏天：前一天补一条流水
  const v = s.invest || 0; if (!(v > 0) || !(ICFG.idleRate > 0)) return 0;
  const amt = v * ICFG.idleRate / TICKS_PER_YEAR;
  s.invest = v + amt; I.today += amt; I.total += amt;
  dailyLine(s, t, 'investInterest', { id: 'invest', name: '投资账户', text: '投资账户利息' }, amt);
  return amt;
}
/** 今天（游戏天）的利息 */
export const today = (s, t) => { const I = s.mkt && s.mkt.idle; return I && I.day === dayKey(s, t) ? I.today : 0; };
