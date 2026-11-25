// 游戏总控：持有存档、每秒走一次逻辑、自动存档、后台停
import { storage } from './platform/storage.js?v=c60d881c';
import { loadGame, saveGame } from './core/save.js?v=c60d881c';
import { now } from './core/clock.js?v=c60d881c';
import { processPeriods } from './core/gametime.js?v=c60d881c';
import { flushAccruals, lockState } from './core/ledger.js?v=c60d881c';

const listeners = new Set();
const tickers = [];        // 每秒逻辑：fn(state, dtSec, t)
const offlineHandlers = []; // 回到游戏时：fn(state, awaySec, t)

export const game = {
  state: null,
  load() { this.state = loadGame(storage, now()); return this.state; },
  save() { if (this.state) saveGame(storage, this.state, now()); },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  changed() { for (const fn of listeners) fn(this.state); },
  addTicker(fn) { tickers.push(fn); },
  addOffline(fn) { offlineHandlers.push(fn); },
  // 简单事件：favorUp / loveUp（好感、爱慕跨阶段）等，后面的功能订阅
  on(ev, fn) { (events[ev] = events[ev] || []).push(fn); },
  emit(ev, ...a) { for (const fn of events[ev] || []) fn(...a); },
};
const events = {};

let timer = null, lastTick = 0, saveCount = 0, flushCount = 0;
function tick() {
  const t = now();
  const dt = Math.min(5, Math.max(0, (t - lastTick) / 1000));
  lastTick = t;
  lockState.strict = true; try { for (const fn of tickers) fn(game.state, dt, t); } finally { lockState.strict = false; }   // V0.2.9 工资锁：自动的一律锁
  processPeriods(game.state, t); // 游戏月 / 季 / 年到点（发工资、报税、月报）
  game.changed();
  if (++saveCount >= 10) { saveCount = 0; game.save(); } // 10 秒存一次
  if (++flushCount >= 600) { flushCount = 0; flushAccruals(game.state, t); } // 10 分钟把攒着的收入写成流水
}

/** 处理离线：从 lastSeen 到现在 */
export function settleOffline() {
  const t = now();
  const away = Math.max(0, (t - (game.state.lastSeen || t)) / 1000);
  lockState.strict = true; try { for (const fn of offlineHandlers) fn(game.state, away, t); } finally { lockState.strict = false; }
  processPeriods(game.state, t); // 离线期间结束的月份按顺序补算
  flushAccruals(game.state, t);
  game.state.lastSeen = t;
  lastTick = t;
  game.changed();
  return away;
}

export function start() {
  if (timer) return;
  settleOffline();
  timer = setInterval(tick, 1000);
}
export function stop() {
  if (timer) { clearInterval(timer); timer = null; }
  game.save();
}
