// 读档时要做一次的整理（各模块自己挂，save.js upgrade 里统一跑）。这个文件不 import 任何东西，免得 save.js 多 import 改了模块加载顺序
const FIX = [];
/** fn(s, t)：读档时跑一次（要自己保证重复跑不出错、不重复发东西） */
export const addLoadFix = (fn) => { FIX.push(fn); };
export function runLoadFix(s, t) { for (const fn of FIX) fn(s, t); }
