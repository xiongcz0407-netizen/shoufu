// 数字用中文单位：万、亿、万亿；不写一长串 0
const UNITS = [
  [1e12, '万亿'],
  [1e8, '亿'],
  [1e4, '万'],
];

function trim(x, digits) {
  // 保留 digits 位有效小数，去掉末尾 0
  const t = x.toFixed(digits);
  return t.includes('.') ? t.replace(/\.?0+$/, '') : t;
}

/** 金额 / 大数字：12345 → 1.23万；1.5e12 → 1.5万亿；负数带 - */
export function fmtNum(n) {
  if (!Number.isFinite(n)) return '0';
  const neg = n < 0;
  const a = Math.abs(n);
  let s;
  if (a < 1e4) s = String(Math.floor(a));
  else {
    const [base, unit] = UNITS.find(([b]) => a >= b);
    const x = a / base;
    s = trim(x, x >= 1000 ? 0 : x >= 100 ? 1 : 2) + unit;
  }
  return (neg ? '-' : '') + s;
}

/** 带货币符号 */
export const fmtMoney = (n) => '¥' + fmtNum(n);

/** 时长（秒）：1小时5分 / 3分20秒 / 45秒 */
export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (d) return `${d}天${h ? h + '小时' : ''}`;
  if (h) return `${h}小时${m ? m + '分' : ''}`;
  if (m) return `${m}分${s ? s + '秒' : ''}`;
  return `${s}秒`;
}
