// 设计103：单位按钮 + 只填数字的金额框（资金页签注资 / 分红、注资弹框；开发2 的转账弹框也可以用）
import * as UA from '../core/unitamt.js?v=3839f433';
import { fmtMoney } from '../core/format.js?v=3839f433';
import { h } from './dom.js?v=3839f433';

/** max：最多能转（数字，或返回数字的函数）；onChange(state)：每次算完回调（state = { v, empty, over, ok, max }）
 *  返回 { el, state() }。打开时输入框是空的；点进输入框就清空；换单位不清数字 */
export function unitAmount({ max, onChange, overText = (m) => `最多 ${fmtMoney(m)}` } = {}) {
  const getMax = typeof max === 'function' ? max : () => max;
  let unit = UA.defaultUnit(getMax()); let st = null;
  const el = h('div', 'ua-box', `<div class="tabs pk-row ua-units">${UA.UNITS.map(([v, n]) => `<button class="tab ua-u${v === unit ? ' on' : ''}" data-u="${v}">${n}</button>`).join('')}</div>
    <div class="ua-in"><input class="amt ua-num" inputmode="decimal" autocomplete="off" placeholder="填数字" value=""><span class="ua-unit">${UA.unitName(unit)}</span></div>
    <div class="ua-eq"></div>`);
  const inp = el.querySelector('.ua-num'); const eq = el.querySelector('.ua-eq'); const un = el.querySelector('.ua-unit');
  const calc = () => {
    const m = getMax(); st = { ...UA.check(inp.value, unit, m), max: m };
    eq.classList.toggle('neg', st.over);
    eq.textContent = st.empty ? '' : st.over ? `= ${fmtMoney(st.v)}，超过了：${overText(m)}` : `= ${fmtMoney(st.v)}`;
    onChange && onChange(st);
  };
  el.querySelectorAll('.ua-u').forEach((b) => (b.onclick = () => { unit = +b.dataset.u; el.querySelectorAll('.ua-u').forEach((x) => x.classList.toggle('on', x === b)); un.textContent = UA.unitName(unit); calc(); }));
  inp.onfocus = () => { inp.value = ''; calc(); };
  inp.oninput = calc;
  setTimeout(calc, 0);
  return { el, state: () => st || { ...UA.check(inp.value, unit, getMax()), max: getMax() }, unit: () => unit };
}
