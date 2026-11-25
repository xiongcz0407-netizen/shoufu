// 设计45 / 65（开发2）：「到了赚 +¥X，+x%」红 /「到了亏 −¥X，−x%」绿 —— 持仓页、照她说的挂单、⅓/半/全仓弹框、个股页条件单都用这一个写法
import { fmtMoney } from '../core/format.js?v=8c602723';
export const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');   // 红涨绿跌
export const sgnMoney = (v) => `${v >= 0 ? '+' : '−'}${fmtMoney(Math.abs(v))}`;
export const sgnPct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(Math.abs(v) < 0.001 ? 2 : 1)}%`;
export const earn = (g, p = null) => `<span class="${cls(g)} nw">到了${g < 0 ? '亏' : '赚'} ${sgnMoney(g)}${p != null ? `，${sgnPct(p)}` : ''}</span>`;
/** 价 px 相对 base 卖 n 股：到了赚多少、百分之几（base 没有就 null） */
export const earnAt = (px, base, n) => (base > 0 && px > 0 ? earn(Math.round((px - base) * n * 100) / 100, px / base - 1) : '');
/** 设计65 小改：卖出交割单在合同列表里直接写「赚 +¥870（+2.9%）」，用交割单里存的「这笔赚了」（买入的、V0.2.22 以前的老交割单没有这一行，不写） */
export const sellGain = (c) => { const r = (c.rows || []).find((x) => x[0] === '这笔赚了'); if (!r || typeof r[1] !== 'number') return ''; const g = r[1]; const co = (c.rows.find((x) => x[0] === '成本') || [])[1]; const up = g >= 0;
  return `<span class="fn-doc-pl ${up ? 'up' : 'down'}">${up ? '赚' : '亏'} ${up ? '+' : '−'}${fmtMoney(Math.round(Math.abs(g)))}${co > 0 ? `（${up ? '+' : '−'}${Math.abs(g / co * 100).toFixed(1)}%）` : ''}</span>`; };
