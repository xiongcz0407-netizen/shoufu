// V3-01：「你亲自拍了一次板」的通知口（core/late.js 接住，攒投入度）。单独一个文件，谁都能 import，不会循环引用
let fn = null;
export const setCredit = (f) => { fn = f; };
export const credit = (s, kind, w = 1, t = null) => (fn ? fn(s, kind, w, t) : 0);
