// 设计103：转账 / 注资 / 分红的金额 = 选单位（万 / 十万 / 百万 / 千万 / 亿）× 只填数字
export const UNITS = [[1e4, '万'], [1e5, '十万'], [1e6, '百万'], [1e7, '千万'], [1e8, '亿']];
export const unitName = (u) => (UNITS.find(([v]) => v === u) || [0, ''])[1];
/** 默认单位：最多金额够得着的最大单位（不到 1 万也给「万」） */
export function defaultUnit(max) { let u = UNITS[0][0]; for (const [v] of UNITS) if (max >= v) u = v; return u; }
/** 输入框里的数字 × 单位 → 元（取整到元）；空 / 不是数字 / 负数 → 0 */
export function amountOf(text, unit) {
  const t = String(text ?? '').trim().replace(/[,，\s]/g, ''); if (!t) return 0;
  const n = Number(t); if (!isFinite(n) || n <= 0) return 0;
  return Math.floor(n * unit + 1e-6);
}
/** 状态：{ v, empty, over, ok }（ok = 能点按钮） */
export function check(text, unit, max) {
  const v = amountOf(text, unit); const empty = !String(text ?? '').trim();
  return { v, empty, over: v > max, ok: v >= 1 && v <= max };
}
