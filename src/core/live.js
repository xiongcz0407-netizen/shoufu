// 设计55（开发2）：行情 3 秒刷新的循环。只在股票页（行情 / 个股 / 持仓）开着时跑，离开就停；跟 DOM 无关（hasRoot / update / schedule 由界面传进来），方便测试
/** 返回 { start, stop, running }：start 时没有股票页就不跑；每次到点先看股票页还在不在，不在就停、不 update */
export function makeLive({ hasRoot, update, schedule, cancel = () => {}, delay }) {
  let timer = null;
  const loop = () => { timer = null; if (!hasRoot()) return; update(); timer = schedule(loop, delay()); };
  return {
    start() { if (timer != null || !hasRoot()) return false; timer = schedule(loop, delay()); return true; },
    stop() { if (timer != null) cancel(timer); timer = null; },
    running: () => timer != null,
  };
}
/** 下一个 3 秒整点还有几毫秒（对齐小步，多等 60ms 保证跨过去了） */
export const toNextSub = (t, subMs) => subMs - (t % subMs) + 60;
