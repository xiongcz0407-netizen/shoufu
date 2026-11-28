// 设计62 投资账户（开发2）：股票页顶上的「投资账户 ¥X」条、转账弹框、钱不够一键转入、财务页三个账户、老存档第一次说明
import * as IV from '../core/invest.js?v=6a9355f4';
import * as BK from '../core/books.js?v=6a9355f4';   // 设计79 第三版
import * as SK from '../core/stocks.js?v=6a9355f4';
import * as TR from '../core/trade.js?v=6a9355f4';
import * as IDLE from '../core/idle.js?v=6a9355f4';   // 设计72
import { fmtMoney } from '../core/format.js?v=6a9355f4';
import { game } from '../game.js?v=6a9355f4';
import { now } from '../core/clock.js?v=6a9355f4';
import { h, openPanel, toast } from './dom.js?v=6a9355f4';

const DIRS = [['personal', 'invest', '个人 → 投资'], ['invest', 'personal', '投资 → 个人'], ['invest', 'company', '投资 → 公司'], ['company', 'invest', '公司 → 投资']];
const NOTE = {
  'personal>invest': '免费，马上到。股票、打新、投资经理都只用投资账户里的钱；没在用的钱自动生息，年化 8%。',
  'invest>personal': '免费，马上到。挂单里冻着的钱、持仓不能转，先卖掉或撤单。',
  'invest>company': '算注资：不交税，记进公司「实收资本」，出一张《增资确认书》。钱进了公司只能分红拿回来。',
  'company>invest': '算分红：公司代扣 20% 个税，到手 80% 进投资账户。要留够两个月工资，贷款资金不能分。',
};
const done = () => { game.changed(); game.save(); };
/** 投资账户市值：现金 + 持仓 + 挂单 + 投资经理 */
export function investTotal(s) { return (s.invest || 0) + (s.mkt ? SK.holdings(s).reduce((a, x) => a + x.value, 0) + TR.orderValue(s) + ((s.mkt.mgr && s.mkt.mgr.value) || 0) : 0) ; }

/** 设计81：投资账户总额 = 现金 + 股票市值（含卖单里的）+ 买单里放着的钱 + 投资经理手上的钱；pxOf：股价怎么取（股票页按 3 秒跳的显示价） */
const r2 = (v) => Math.round(v * 100) / 100;
export function investParts(s, pxOf = null) {
  const cash = IV.cashOf(s); if (!s.mkt) return { cash, stock: 0, order: 0, mgr: 0, total: cash };
  const stock = r2(Object.entries(SK.myShares(s)).reduce((a, [c, x]) => a + x.n * (pxOf ? pxOf(c) : SK.price(s, c)), 0));
  const order = TR.inOrders(s).cash, mgr = r2((s.mkt.mgr && s.mkt.mgr.value) || 0);
  return { cash, stock, order, mgr, total: r2(cash + stock + order + mgr) };
}
/** 「投资账户总额 ¥T」+ 小字组成（是 0 的不写） */
export function totalHtml(s, pxOf = null) {
  const P = investParts(s, pxOf);
  const parts = [['现金', P.cash], ['股票', P.stock], ['挂单', P.order], ['投资经理', P.mgr]].filter(([, v]) => Math.abs(v) >= 0.005).map(([k, v]) => `<span>${k} ${fmtMoney(v)}</span>`);
  return `投资账户总额 <b>${fmtMoney(P.total)}</b>${parts.length ? `<small>${parts.join('<i>·</i>')}</small>` : ''}`;
}

/** 股票页顶上：投资账户 ¥X　[转入] [转出] */
export function investBar(s, redraw) {
  const td = IDLE.today(s, now());
  const el = h('div', 'iv-bar', `<div><small>投资账户（可用现金）</small><b>${fmtMoney(IV.cashOf(s))}</b><small>个人现金 ${fmtMoney(s.cash)}</small></div><button class="btn sm gold iv-in">转入</button><button class="btn sm iv-out">转出</button>
    <div class="iv-total" data-ivtotal>${totalHtml(s)}</div>    <div class="iv-idle">闲钱自动生息 · 年化 ${Math.round(IDLE.rate() * 100)}% · 今天 <b>+${td >= 100 ? fmtMoney(td) : `¥${td.toFixed(2)}`}</b></div>`);   // 设计72
  el.querySelector('.iv-in').onclick = () => openTransfer('personal', 'invest', redraw);
  el.querySelector('.iv-out').onclick = () => openTransfer('invest', 'personal', redraw);
  return el;
}

// —— 设计103 金额：先选单位（万 / 十万 / 百万 / 千万 / 亿），输入框只填数字，金额 = 数字 × 单位 ——
export const UNITS = [[1e4, '万'], [1e5, '十万'], [1e6, '百万'], [1e7, '千万'], [1e8, '亿']];
/** 默认单位：最多能转的金额够得着的最大单位（不到 1 万也用「万」） */
export const defaultUnit = (max) => UNITS.reduce((u, [v]) => (max >= v - 1e-9 ? v : u), UNITS[0][0]);
/** 数字 × 单位（可以填小数、逗号；空的 / 不是正数 → 0），到分 */
export function amountOf(txt, unit) { const n = parseFloat(String(txt == null ? '' : txt).replace(/[,，\s]/g, '')); return n > 0 ? Math.round(n * unit * 100) / 100 : 0; }
/** 这一笔：{ v 金额, max 最多能转, over 超了, ok 能转 }（超过最多不自动改成最多） */
export function checkAmt(s, from, txt, unit) { const v = amountOf(txt, unit); const max = IV.maxOut(s, from); const over = v > max + 1e-9; return { v, max, over, ok: v >= 0.01 && !over }; }

/** 转账弹框：选方向，再选单位、填数字（设计103，六个方向都一样） */
export function openTransfer(from = 'personal', to = 'invest', after) {
  const s = game.state; const p = openPanel('转账'); let unit = defaultUnit(IV.maxOut(s, from)); let num = '';
  const render = () => {
    const max = IV.maxOut(s, from); const key = `${from}>${to}`; const uName = UNITS.find(([v]) => v === unit)[1];
    p.body.innerHTML = `<div class="iv-acc3">${['personal', 'invest', 'company'].map((k) => `<div class="${k === from ? 'from' : k === to ? 'to' : ''}"><small>${IV.ACC[k]}</small><b>${fmtMoney(k === 'personal' ? s.cash : k === 'invest' ? IV.cashOf(s) : s.company)}</b></div>`).join('')}</div>
      <div class="sd-rec-title">从哪转到哪</div><div class="tabs iv-dirs">${DIRS.map(([f, t, n]) => `<button class="tab ${f === from && t === to ? 'on' : ''}" data-d="${f}>${t}">${n}</button>`).join('')}</div>
      <div class="tr-gain">${NOTE[key]}</div>
      <div class="rate">${IV.ACC[from]}最多能转 <b>${fmtMoney(max)}</b></div>
      <div class="sd-rec-title">单位</div><div class="iv-units">${UNITS.map(([v, n]) => `<button class="btn iv-unit ${v === unit ? 'on' : ''}" data-u="${v}">${n}</button>`).join('')}</div>
      <div class="sd-rec-title">金额</div><div class="iv-amt-row"><input class="amt iv-amt" type="text" inputmode="decimal" autocomplete="off" placeholder="填数字" value="${num}"><span class="iv-unit-lab">${uName}</span></div>
      <div class="tr-gain iv-conv"></div>
      ${to === 'invest' && from === 'company' ? '<div class="tr-gain">到手 <b class="iv-net"></b>（代扣个税 <span class="iv-tax"></span>）</div>' : ''}
      <button class="btn gold big go"></button>`;
    p.body.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { [from, to] = b.dataset.d.split('>'); unit = defaultUnit(IV.maxOut(s, from)); num = ''; render(); }));
    p.body.querySelectorAll('[data-u]').forEach((b) => (b.onclick = () => { unit = +b.dataset.u; render(); }));   // 换单位不清数字，只重算
    const inp = p.body.querySelector('.amt'); const go = p.body.querySelector('.go'); const conv = p.body.querySelector('.iv-conv');
    const upd = () => {
      num = inp.value; const c = checkAmt(s, from, num, unit);
      conv.textContent = c.over ? `最多能转 ${fmtMoney(c.max)}` : c.v > 0 ? `= ${fmtMoney(c.v)}` : ''; conv.classList.toggle('neg', c.over);
      go.textContent = `转 ${fmtMoney(c.v)}`; go.disabled = !c.ok;
      const nt = p.body.querySelector('.iv-net'); if (nt) { nt.textContent = fmtMoney(c.v * 0.8); p.body.querySelector('.iv-tax').textContent = fmtMoney(c.v * 0.2); }
    };
    inp.oninput = upd;
    inp.onfocus = () => { inp.value = ''; upd(); };   // 一点进输入框就清空
    upd();
    go.onclick = () => {
      const c = checkAmt(s, from, inp.value, unit); if (!c.ok) return;   // 超过最多：不转、不自动改成最多
      const v = c.v; const r = IV.transfer(s, from, to, v, now()); if (!r.ok) { toast(r.why); return; }
      toast(from === 'company' ? `分红 ${fmtMoney(v)}，代扣个税 ${fmtMoney(r.tax)}，到手 ${fmtMoney(r.net)} 进投资账户` : to === 'company' ? `已注资 ${fmtMoney(v)}（${r.no}）` : `转好了：${fmtMoney(v)} 到${IV.ACC[to]}`, 2600);
      done(); p.close(); after && after();
    };
  };
  render();
}

/** 钱不够：「投资账户不够，差 ¥X」+ 一键从个人账户转入差额；别的原因照旧 toast */
export function whyToast(why, after) {
  const short = IV.shortOf(why); if (!(short > 0)) { toast(why); return; }
  const s = game.state; const free = IV.personalFree(s); const amt = Math.min(Math.ceil(short * 100) / 100, free);
  const p = openPanel('投资账户不够');
  p.body.innerHTML = `<div class="iv-short">投资账户不够，差 <b>${fmtMoney(short)}</b></div>
    <div class="iv-acc3"><div><small>投资账户</small><b>${fmtMoney(IV.cashOf(s))}</b></div><div><small>个人现金</small><b>${fmtMoney(free)}</b></div></div>
    ${free >= short - 1e-9 ? '<div class="tr-gain">从个人账户转差额进来（免费、马上到），转好再点一次就行。</div>' : free > 0 ? `<div class="tr-gain neg">个人现金也不够，只能先转 ${fmtMoney(free)}。</div>` : '<div class="tr-gain neg">个人现金也没钱了。</div>'}
    <button class="btn gold big go" ${amt > 0 ? '' : 'disabled'}>从个人账户转入 ${fmtMoney(amt)}</button>`;
  p.body.querySelector('.go').onclick = () => { const r = IV.topUpFromPersonal(s, short, now()); if (!r.ok) { toast(r.why); return; } toast(`转入 ${fmtMoney(r.amount)}，投资账户 ${fmtMoney(IV.cashOf(s))}`); done(); p.close(); after && after(); };
}

/** 财务页「总览」：三个账户并排 + 转账 */
export function accountsHtml(s) {
  return `<div class="fn-card iv-accs"><div class="iv-acc3"><div><small>个人账户</small><b>${fmtMoney(s.cash)}</b><small>车房、衣服、礼物用</small></div><div><small>投资账户</small><b>${fmtMoney(IV.cashOf(s))}</b><small>含持仓 ${fmtMoney(investTotal(s))}</small></div><div><small>公司账户</small><b>${fmtMoney(s.company)}</b><small>产业、工资用</small></div></div><button class="btn sm gold iv-go">转账</button></div>`;
}
export function bindAccounts(el, redraw) { const b = el.querySelector('.iv-go'); if (b) b.onclick = () => openTransfer('personal', 'invest', redraw); }

/** 老存档第一次进股票页：弹一次说明 */
export function firstNote(s, redraw) {
  const u = (s.ui = s.ui || {}); if (u.investNote) return; u.investNote = 1; done();
  const old = Object.values(BK.books(s).total).some((o) => Object.keys(o).some((k) => /^(stock_|order_|inv_|ipo_)/.test(k))) || (s.mkt && Object.keys(s.mkt.hold || {}).length);
  if (!old) return;   // 新开局没炒过股的不弹（只给老存档）
  const p = openPanel('投资账户');
  p.body.innerHTML = `<div class="iv-short">股票现在走投资账户，先从个人账户转钱进来</div>
    <div class="tr-gain">买股票、条件单、补仓、看盘跟单、打新、投资经理，都只用投资账户里的钱；卖出、撤单退回、分红也回投资账户。个人 ↔ 投资账户互转免费、马上到。${SK.holdings(s).length || (s.mkt && s.mkt.orders && s.mkt.orders.length) ? '<br>你原来的持仓和挂单已经算到投资账户名下。' : ''}</div>
    <button class="btn gold big go">去转钱</button><button class="btn big later">知道了</button>`;
  p.body.querySelector('.go').onclick = () => { p.close(); openTransfer('personal', 'invest', redraw); };
  p.body.querySelector('.later').onclick = () => p.close();
}
