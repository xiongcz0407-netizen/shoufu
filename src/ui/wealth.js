// 「财富 → 财务」（第 13 项，设计15 第三节 + 设计17 第三节、设计18 第四节 5）
// 横滑标签：总览 | 利润表 | 个人收支 | 资产清单 | 纳税 | 流水 | 档案柜；右上角切 今天 / 本月 / 本年 / 全部
import * as EQ from '../core/equity.js?v=ad479e23';
import * as F from '../core/finance.js?v=ad479e23';
import * as E from '../core/economy.js?v=ad479e23';
import * as ST from '../core/staff.js?v=ad479e23';
import * as AC from '../core/accrual.js?v=ad479e23';
import * as AS from '../core/assets.js?v=ad479e23';
import * as PO from '../core/posts.js?v=ad479e23';
import { cityPL } from '../core/citypl.js?v=ad479e23';
import { cityName } from '../core/cities.js?v=ad479e23';
import { IND_BY_ID } from '../config/industries.js?v=ad479e23';
import { CATS, WALLET_NAME } from '../core/ledger.js?v=ad479e23';
import { SEC_BY_ID, SECRETARIES } from '../config/secretaries.js?v=ad479e23';
import { fmtMoney } from '../core/format.js?v=ad479e23';
import { asset, hasAsset } from '../platform/assets.js?v=ad479e23';
import { now } from '../core/clock.js?v=ad479e23';
import { game } from '../game.js?v=ad479e23';
import { h, openPanel, liveRender } from './dom.js?v=ad479e23';
import { giftsTo, spentOn } from './secretary.js?v=ad479e23';
import { extendFinance } from './wealth2.js?v=ad479e23';
import { accountsHtml, bindAccounts } from './invest.js?v=ad479e23';   // 设计62 投资账户

const TABS = [['overview', '总览'], ['pl', '利润表'], ['personal', '个人收支'], ['assets', '资产清单'], ['tax', '纳税'], ['ledger', '流水'], ['archive', '档案柜']];
let tab = 'overview', period = 'month', lf = { wallet: '', cat: '', by: '' };
const pct = (x) => (isFinite(x) ? (x * 100).toFixed(1) + '%' : '—');
const row = (k, v, cls = '') => `<div class="fn-row ${cls}"><span>${k}</span><b>${typeof v === 'number' ? fmtMoney(v) : v}</b></div>`;

/** 财务总监点评（按性格一段话） */
function cfoComment(s, pl, last) {
  const who = PO.holder(s, 'cfo');
  if (!PO.isSec(who)) return who === PO.OUT ? '<div class="fn-cfo"><b>代账公司</b>：只报税，不点评。</div>' : '<div class="fn-cfo">还没有财务总监（「公司 → 职位」安排）。</div>';
  const c = SEC_BY_ID[who]; const lr = pl.rev ? pl.labor.total / pl.rev : 0; const rr = pl.rev ? pl.rent / pl.rev : 0;
  const ch = last != null && last !== 0 ? `，环比 ${pl.profit >= last ? '+' : ''}${(((pl.profit - last) / Math.abs(last)) * 100).toFixed(1)}%` : '';
  const advice = lr > 0.35 ? '人工占比偏高，缺编别急着招满' : rr > 0.15 ? '房租占比偏高，续约时压压价' : AC.available(s) < 0 ? '可用的钱是负的，先别升级开店' : '现金流健康，可以考虑分红或者开新店';
  const t = { 知性: `本期净利润 ${fmtMoney(pl.profit)}${ch}。人工占收入 ${pct(lr)}，房租 ${pct(rr)}。建议：${advice}。`,
    高冷: `净利润 ${fmtMoney(pl.profit)}${ch}。${advice}。`, 元气: `老板！这期赚了 ${fmtMoney(pl.profit)}${ch}！我算了两遍应该没错～ ${advice}！`,
    绿茶: `老板～净利润 ${fmtMoney(pl.profit)}${ch}，比别人管的时候好多了吧？${advice}哦。`, 傲娇: `哼，净利润 ${fmtMoney(pl.profit)}${ch}。${advice}，听我的没错。` }[c.type];
  return `<div class="fn-cfo"><img src="${asset(`assets/sec/${who}/${s.secs[who].outfit}.webp`)}" alt=""><div><b>${c.name}（财务总监）</b><br>${t}</div></div>`;
}
function bars(list, key, labelOf) {
  if (!list.length) return '<div class="empty">还没有完整的月份</div>';
  const max = Math.max(1, ...list.map((x) => Math.abs(x[key])));
  return `<div class="fn-bars">${list.map((x) => `<div class="fn-bar"><i class="${x[key] < 0 ? 'neg' : ''}" style="height:${Math.max(2, Math.abs(x[key]) / max * 100)}%"></i><small>${labelOf(x)}</small></div>`).join('')}</div>`;
}

const DRAW = {
  overview(el, s, from, t) {
    const pl = F.companyPL(s, from, t); const pp = F.personal(s, from, t); const tx = F.taxes(s, -Infinity, t); const nw = E.netWorth(s); const P = AC.payables(s);
    const parts = [['个人现金', s.cash], ['投资账户', s.invest || 0], ['公司账户', Math.max(0, s.company)], ['产业', E.industryValue(s)], ['车房飞机', s.assetValue || 0], ['收购的公司', s.acquiredValue || 0]].filter((x) => x[1] > 0);
    const tot = parts.reduce((a, x) => a + x[1], 0) || 1; let acc = 0; const colors = ['#e8c27a', '#f0a060', '#6fa8ff', '#8fe08f', '#ff8a8a', '#c49cff'];
    const pie = `conic-gradient(${parts.map((x, i) => { const a = acc; acc += x[1] / tot * 360; return `${colors[i]} ${a}deg ${acc}deg`; }).join(',')})`;
    const last = (s.monthly || []).at(-1);
    el.innerHTML = `<div class="fn-hero"${hasAsset('assets/bg/bg_finance.webp') ? ` style="background-image:linear-gradient(90deg,rgba(10,14,24,.9) 45%,rgba(10,14,24,.4)),url('${asset('assets/bg/bg_finance.webp')}')"` : ''}><small>身价</small><b>${fmtMoney(nw)}</b></div>
      ${accountsHtml(s)}<div class="sum-card"><div><small>公司账户可用</small><b>${fmtMoney(Math.max(0, AC.available(s)))}</b>${AC.available(s) < 0 ? `<small class="neg">月底要付 ${fmtMoney(AC.payables(s).total)}，公司账户不够，可以注资</small>` : ''}</div>
        <div><small>负债（应付${EQ.equityOwed(s) ? ' + 应付股权转让款' : ''}）</small><b class="neg">${fmtMoney(P.total + EQ.equityOwed(s))}</b></div><div><small>员工</small><b>${ST.totalStaff(s)} 人 + 秘书 ${Object.keys(s.secs).length}</b></div></div>
      <div class="fn-card">${row('公司收入', pl.rev + pl.other, 'pos')}${row('净利润', pl.profit, pl.profit < 0 ? 'neg' : 'pos')}${row('人工成本', `${fmtMoney(pl.labor.total)}（占收入 ${pct(pl.rev ? pl.labor.total / pl.rev : NaN)}）`)}${row('个人收入', pp.incTotal, 'pos')}${row('累计交税（全部）', tx.company + tx.personalTax)}</div>
      <div class="fn-pie"><i style="background:${pie}"></i><div>${parts.map((x, i) => `<div><em style="background:${colors[i]}"></em>${x[0]} ${pct(x[1] / tot)}</div>`).join('')}</div></div>
      ${cfoComment(s, pl, last && last.profit)}
      <div class="ind-btns"><button class="btn sm fn-inject">注资到公司</button><button class="btn sm gold fn-div">分红到个人</button></div>`;
    el.querySelector('.fn-inject').onclick = () => import('./company.js?v=ad479e23').then((m) => m.openInject());
    el.querySelector('.fn-div').onclick = () => import('./company.js?v=ad479e23').then((m) => m.openDividend());
    bindAccounts(el, () => DRAW.overview(el, game.state, from, now()));   // 设计62：三个账户 + 转账
  },
  pl(el, s, from, t) {
    const pl = F.companyPL(s, from, t);
    el.innerHTML = `<div class="fn-card">${row('营业收入', pl.rev, 'pos')}${pl.byInd.map((x) => row('　' + x.name, `${fmtMoney(x.rev)}（毛利 ${fmtMoney(x.rev - x.cogs)}）`)).join('')}${pl.other ? row('其他收入（商战奖金、退款）', pl.other, 'pos') : ''}
      ${row('进货成本', -pl.cogs, 'neg')}${row('员工工资和社保', -pl.labor.total, 'neg')}${row('　门店和总部员工工资', -pl.labor.staff)}${row('　秘书工资', -pl.labor.sec)}${row('　奖金和提成', -pl.labor.bonus)}${row('　社保公积金（公司部分）', -pl.labor.social)}${row('　招聘、派遣、裁员', -pl.labor.hire)}
      ${row('房租', -pl.rent, 'neg')}${pl.opex ? row('水电物业和杂费', -pl.opex, 'neg') : ''}${row('税费', -pl.tax, 'neg')}${row('培训、外包、经营损失', -pl.misc, 'neg')}${row('净利润', pl.profit, 'sum ' + (pl.profit < 0 ? 'neg' : 'pos'))}</div>
      <div class="tr-gain">升级开店、收购 ${fmtMoney(pl.capex)} 是投资（变成产业价值），不算费用。</div>
      <div class="sd-rec-title">按城市（照现在的规模估一个月，税前、不含地产项目）</div><div class="fn-card">${Object.entries(cityPL(s)).filter(([, x]) => x.rev || x.labor).map(([c, x]) => row(`${cityName(c)}　<small>${Object.entries(x.lines).map(([id, n]) => `${IND_BY_ID[id].name}${IND_BY_ID[id].kind && IND_BY_ID[id].kind !== 'scale' ? '' : ` ${n} 家`}`).join('、')}</small>`, `营收 ${fmtMoney(x.rev)} · 利润 ${fmtMoney(x.profit)}`, x.profit < 0 ? 'neg' : '')).join('') || row('（还没有）', '')}</div>
      <div class="sd-rec-title">每月利润</div>${bars((s.monthly || []).slice(-12), 'profit', (x) => `${(x.m % 12) + 1}月`)}`;
  },
  personal(el, s, from, t) {
    const p = F.personal(s, from, t);
    el.innerHTML = `<div class="fn-card">${row('收入', p.incTotal, 'pos')}${p.inc.filter(([, v]) => Math.abs(v) >= 1).map(([k, v]) => row('　' + k, v)).join('') || row('　（没有）', '')}${row('支出', -p.outTotal, 'neg')}${p.out.filter(([, v]) => Math.abs(v) >= 1).map(([k, v]) => row('　' + k, -v)).join('') || row('　（没有）', '')}${row('结余', p.incTotal - p.outTotal, 'sum')}</div>`;
  },
  assets(el, s) {
    const g = s.garage; const ids = [...g.cars, ...g.houses, ...g.planes].filter((id) => AS.ITEM[id]);
    const kinds = { car: '车', house: '房', plane: '飞机' };
    el.innerHTML = `<div class="fn-card">${ids.map((id) => { const it = AS.ITEM[id]; const m = (g.meta || {})[id] || {}; const now2 = AS.sellPrice(s, id); const buy = m.price || it.price;
      return `<div class="fn-asset"><b>${kinds[it.kind]} · ${AS.label(it)}${m.no ? ` <small>No.${m.no}/${it.limit}</small>` : ''}</b><small>买入 ${fmtMoney(buy)} · 现价 ${fmtMoney(now2)} · 盈亏 <span class="neg">${fmtMoney(now2 - buy)}</span> · 每年 ${fmtMoney(AS.upkeepYear(s, id))}${s.rented && s.rented[id] ? ' · 出租中' : ''}${m.at ? ` · ${new Date(m.at).toLocaleDateString('zh-CN')}` : ''}${m.contract ? ` · ${m.contract}` : ''}</small></div>`; }).join('') || '<div class="empty">还没有车房飞机</div>'}</div>
      <div class="sd-rec-title">送给秘书的</div><div class="fn-card">${SECRETARIES.filter((c) => s.secs[c.id]).map((c) => { const x = spentOn(s, c.id); return row(c.name, `${x.n} 件 · ${fmtMoney(x.amount)}`); }).join('')}</div>`;
  },
  tax(el, s, from, t) {
    const x = F.taxes(s, from, t);
    el.innerHTML = `<div class="sum-card"><div><small>公司交税</small><b>${fmtMoney(x.company)}</b></div><div><small>税负率（公司税 / 营收）</small><b>${pct(x.burden)}</b></div><div><small>个人税费</small><b>${fmtMoney(x.personalTax)}</b></div><div><small>代扣员工个税</small><b>${fmtMoney(x.withheld)}</b><small>不算公司成本</small></div></div>
      ${x.due ? `<div class="tr-gain neg">还有 ${fmtMoney(x.due)} 没申报（消息中心「待申报」）</div>` : ''}
      <div class="fn-card">${x.kinds.map(([k, v]) => row(k, v)).join('') || '<div class="empty">这段时间没交税</div>'}</div>
      <div class="sd-rec-title">完税凭证</div><div class="fn-card">${x.list.slice(-30).reverse().map((c) => row(`${c.cert} · ${c.kind} ${c.period || ''}`, c.amount)).join('') || '<div class="empty">没有</div>'}</div>`;
  },
  ledger(el, s, from, t) {
    const list = F.ledgerView(s, { ...lf, from }, t);
    const secs = Object.keys(s.secs);
    el.innerHTML = `<div class="fn-filter"><select data-f="wallet"><option value="">全部账户</option>${Object.entries(WALLET_NAME).map(([k, v]) => `<option value="${k}" ${lf.wallet === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select data-f="cat"><option value="">全部类别</option>${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${lf.cat === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
      <select data-f="by"><option value="">全部经手人</option>${secs.map((id) => `<option value="${id}" ${lf.by === id ? 'selected' : ''}>${SEC_BY_ID[id].name}</option>`).join('')}</select></div>
      <div class="fn-card">${list.slice(0, 150).map((r) => `<div class="fn-led"><div><b>${CATS[r.cat] ? CATS[r.cat][0] : r.cat}</b>${r.memo ? '<em>备忘</em>' : ''}${r.pending ? '<em>累计中</em>' : ''}<small>${r.note || ''}${r.by && SEC_BY_ID[r.by] ? ` · 经手 ${SEC_BY_ID[r.by].name}` : ''}${r.ref ? ` · ${r.ref}` : ''}</small></div><b class="${r.dir === 'out' ? 'neg' : 'pos'}">${r.dir === 'out' ? '−' : '+'}${fmtMoney(r.amount)}<small>${WALLET_NAME[r.wallet]}</small></b></div>`).join('') || '<div class="empty">没有</div>'}</div>`;
    el.querySelectorAll('select').forEach((x) => (x.onchange = () => { lf[x.dataset.f] = x.value; DRAW.ledger(el, s, from, t); }));
  },
  archive(el, s) {
    const cs = (s.contracts || []).slice().reverse(); const inv = (s.invoices || []).slice().reverse(); const tx = (s.taxes || []).slice().reverse();
    const icon = (k) => (hasAsset(`assets/ui/${k}.webp`) ? `<img class="fn-ic" src="${asset(`assets/ui/${k}.webp`)}" alt="">` : '');
    el.innerHTML = `<div class="sd-rec-title">${icon('icon_contract')}合同（${cs.length}）</div><div class="fn-card">${cs.slice(0, 50).map((c, i) => `<button class="fn-doc" data-i="${i}"><b>${c.title}</b><small>${c.no} · ${c.subject} · ${fmtMoney(c.total)}</small></button>`).join('') || '<div class="empty">没有</div>'}</div>
      <div class="sd-rec-title">${icon('icon_archive')}发票（${inv.length}）</div><div class="fn-card">${inv.slice(0, 50).map((x) => row(`${x.no} · ${x.item}`, `${fmtMoney(x.amount)}<small>含税 ${fmtMoney(x.tax)}</small>`)).join('') || '<div class="empty">没有</div>'}</div>
      <div class="sd-rec-title">${icon('icon_taxcert')}完税凭证（${tx.length}）</div><div class="fn-card">${tx.slice(0, 50).map((x) => row(`${x.cert} · ${x.kind}`, x.amount)).join('') || '<div class="empty">没有</div>'}</div>`;
    el.querySelectorAll('.fn-doc').forEach((b) => (b.onclick = () => { const c = cs[+b.dataset.i]; const p = openPanel(c.title); p.body.innerHTML = `<div class="tr-gain">${c.no} · ${new Date(c.t).toLocaleString('zh-CN', { hour12: false })}</div>${(c.parties || []).map(([k, v]) => row(k, v)).join('')}${row('标的', c.subject)}${(c.rows || []).map(([k, v, , tone, txt]) => (txt != null ? row(k, `<span class="${tone || ''}">${txt}</span>`) : row(k, v))).join('')}${row('合计', c.total, 'sum')}`; }));
  },
};

extendFinance(TABS, DRAW);   // 第 2-15 项：资产负债表、完整资产清单、满意度、家族办公室、汇算

export function renderFinance(body, ctx) {
  const top = h('div', 'fn-top'); const el = h('div'); body.append(top, el);
  const drawTop = () => {
    top.innerHTML = `<div class="as-tabs">${TABS.map(([k, n]) => `<button class="tab ${k === tab ? 'on' : ''}" data-t="${k}">${n}</button>`).join('')}</div>
      ${['archive', 'assets', 'balance'].includes(tab) ? '' : `<div class="fn-period">${F.PERIODS.map(([k, n]) => `<button class="${k === period ? 'on' : ''}" data-p="${k}">${n}</button>`).join('')}</div>`}`;
    top.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { tab = b.dataset.t; drawTop(); draw(); }));
    top.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { period = b.dataset.p; drawTop(); draw(); }));
  };
  const draw = () => { const s = game.state; const t = now(); DRAW[tab](el, s, F.periodFrom(s, period, t), t); };
  drawTop();
  // 流水、档案柜不自动刷新（有筛选和点开）；其他每秒刷新
  ctx.onCleanup(liveRender(el, () => { if (tab !== 'ledger' && tab !== 'archive') draw(); }, (fn) => game.onChange(fn), body));
  if (tab === 'ledger' || tab === 'archive') draw();
}
game.on('tabHome', () => { tab = 'overview'; }); // 从底下导航点进来：回到第一个小页签
