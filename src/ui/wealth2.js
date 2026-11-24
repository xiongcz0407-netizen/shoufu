// 财务页补充（第 2-15 项）：资产负债表、完整资产清单、员工满意度和福利、家族办公室、进项抵扣、年度汇算、欠税
import * as F from '../core/finance.js?v=691ed83a';
import * as FI from '../core/fiscal.js?v=691ed83a';
import * as ST from '../core/staff.js?v=691ed83a';
import { TAX } from '../core/companytax.js?v=691ed83a';
import { bank } from '../core/bank.js?v=691ed83a';
import { YEAR_MS } from '../core/gametime.js?v=691ed83a';
import { fmtMoney } from '../core/format.js?v=691ed83a';
import { SECRETARIES } from '../config/secretaries.js?v=691ed83a';
import { now } from '../core/clock.js?v=691ed83a';
import { game } from '../game.js?v=691ed83a';
import { toast } from './dom.js?v=691ed83a';
import { hintLater } from './guide2.js?v=691ed83a';

const row = (k, v, cls = '') => `<div class="fn-row ${cls}"><span>${k}</span><b>${typeof v === 'number' ? fmtMoney(v) : v}</b></div>`;
const RARE = { unique: '<em class="fn-rare u">孤品</em>', limited: '<em class="fn-rare l">限量</em>' };
const CREDIT = { good: '良好', normal: '一般', bad: '较差' };
const ok = (r, msg) => { if (!r.ok) { toast(r.why); return; } if (msg) toast(msg); game.changed(); game.save(); };

/** 资产负债表 */
function balance(el, s) {
  const b = F.balanceSheet(s); const C = b.company, P = b.personal;
  el.innerHTML = `<div class="sum-card"><div><small>身价（个人净资产）</small><b>${fmtMoney(P.net)}</b></div><div><small>公司所有者权益</small><b class="${C.equity < 0 ? 'neg' : ''}">${fmtMoney(C.equity)}</b></div><div><small>公司资产负债率</small><b>${C.A > 0 ? ((C.L / C.A) * 100).toFixed(1) + '%' : '—'}</b></div></div>
    <div class="sd-rec-title">公司（${s.companyName || '公司'}）</div>
    <div class="fn-card">${row('资产', C.A, 'pos')}${C.assets.map(([k, v]) => row('　' + k, v)).join('')}${row('负债', Math.round(C.L), 'neg')}${C.liabilities.filter(([, v]) => Math.abs(v) >= 0.5).map(([k, v]) => row('　' + k, Math.round(v))).join('') || row('　（没有）', '')}${row('所有者权益 = 资产 − 负债', C.equity, 'sum')}${row('　实收资本（老板注资）', C.paidIn)}${row('　留存收益和估值增值', C.retained)}</div>
    <div class="sd-rec-title">老板个人</div>
    <div class="fn-card">${row('资产', P.A, 'pos')}${P.assets.map(([k, v]) => row('　' + k, v)).join('')}${row('负债', 0)}${row('净资产 = 身价', P.net, 'sum')}</div>
    <div class="tr-gain">车房飞机、游艇、表、西装按现在卖回去能拿到的算；古董按估价；股票基金按现价。公司按 100% 股权、所有者权益算进个人。</div>`;
}
/** 资产清单：所有东西，分组 */
function assets(el, s) {
  const G = F.assetList(s); const gifts = F.giftsBySec(s);
  el.innerHTML = `${G.map((g) => `<div class="sd-rec-title">${g.name}（${g.items.length}）　<small>${g.name.startsWith('送出') ? `买的时候 ${fmtMoney(g.buy)}` : `买入 ${fmtMoney(g.buy)} · 现值 ${fmtMoney(g.now)}`}</small></div>
    <div class="fn-card">${g.items.map((x) => `<div class="fn-asset"><b>${x.name}${x.no ? ` <small>${x.no}</small>` : ''}${x.rare ? RARE[x.rare] : ''}</b><small>${x.given ? `送出 ${fmtMoney(x.buy)}` : `买入 ${fmtMoney(x.buy)} · 现值 ${fmtMoney(x.now)} · 盈亏 <span class="${x.now - x.buy < 0 ? 'neg' : 'pos'}">${fmtMoney(x.now - x.buy)}</span>`}${x.upkeep ? ` · 每年 ${fmtMoney(x.upkeep)}` : ''}${x.rented ? ' · 出租中' : ''}${x.at ? ` · ${new Date(x.at).toLocaleDateString('zh-CN')}` : ''}${x.ref ? ` · ${x.ref}` : ''}</small></div>`).join('')}</div>`).join('') || '<div class="empty">还没有资产</div>'}
    <div class="sd-rec-title">送给秘书的（礼物、衣服、名包）</div><div class="fn-card">${SECRETARIES.filter((c) => s.secs[c.id]).map((c) => { const x = gifts[c.id] || { gift: [0, 0], clothes: [0, 0], bag: [0, 0] }; const n = x.gift[0] + x.clothes[0] + x.bag[0]; return row(c.name, n ? `礼物 ${x.gift[0]} · 衣服 ${x.clothes[0]} · 名包 ${x.bag[0]}　${fmtMoney(x.gift[1] + x.clothes[1] + x.bag[1])}` : '还没送过'); }).join('')}</div>`;
}
/** 总览下面加：员工满意度和福利、家族办公室、进项抵扣、欠税 */
function overviewMore(el, s) {
  const sat = FI.satisfaction(s, ST.avgMgmt(s)); const S = FI.FICFG.satisfaction; const lv = FI.welfareLevel(s); const FO = FI.FICFG.familyOffice;
  const inp = (s.period && s.period.inputDetail) || null; const A = s.taxArrears || { streak: 0 }; const fo = FI.familyOffice(s);
  const box = document.createElement('div');
  box.innerHTML = `<div class="sd-rec-title">员工满意度</div><div class="fn-card">${row('满意度', `<span class="${sat < 40 ? 'neg' : sat >= 65 ? 'pos' : ''}">${sat} / 100</span>　<small>流失率 × ${FI.turnoverMult(sat).toFixed(2)}</small>`)}
      <div class="fn-row"><span>员工福利（每人每月）</span><b class="fn-seg">${S.welfareName.map((n, i) => `<button class="${i === lv ? 'on' : ''}" data-wf="${i}">${n}${S.welfareCost[i] ? ` ${S.welfareCost[i]}元` : ''}</button>`).join('')}</b></div>
      <small class="fn-note">年终奖、福利拉高满意度，拖欠工资拉低；店长管理强也加一点。销售和置业顾问另拿提成（科技 3%、地产 0.3%）。</small></div>
    <div class="sd-rec-title">家族办公室</div><div class="fn-card">${fo ? row('状态', `<span class="pos">已成立</span>（${new Date(s.family.at).toLocaleDateString('zh-CN')}）`) + '<small class="fn-note">资产管家、投资经理、收藏顾问的工资和提成从个人账户出，不算公司费用。</small><button class="btn sm fo-close">解散</button>' : `<small class="fn-note">称号「企业家」起可以成立（${fmtMoney(FO.setupFee)}）。成立后资产管家、投资经理、收藏顾问改由家族办公室雇佣，工资和提成从个人出，不再进公司账。</small><button class="btn sm fo-open" ${s.title < FO.title ? 'disabled' : ''}>成立家族办公室</button>`}</div>
    ${inp && inp.total ? `<div class="sd-rec-title">本月进项抵扣（一般纳税人）</div><div class="fn-card">${row('房租（9%）', inp.rent)}${row('水电杂费（6%）', inp.other)}${row('装修设备（13%）', inp.capex)}${row('合计', inp.total, 'sum')}</div>` : ''}
    ${s.company < 0 || A.streak ? `<div class="tr-gain neg">欠税：公司账户 ${fmtMoney(s.company)}，按日 0.05% 收滞纳金，已连续 ${A.streak} 个月；征信 ${CREDIT[bank(s).credit] || bank(s).credit}</div>` : ''}`;
  el.append(box); if (s.title >= FO.title && !fo) hintLater('family');
  box.querySelectorAll('[data-wf]').forEach((b) => (b.onclick = () => ok(FI.setWelfare(s, +b.dataset.wf), `福利改成「${S.welfareName[+b.dataset.wf]}」`)));
  const o = box.querySelector('.fo-open'); if (o) o.onclick = () => ok(FI.openFamilyOffice(s, now()), '家族办公室成立了');
  const c = box.querySelector('.fo-close'); if (c) c.onclick = () => ok(FI.closeFamilyOffice(s), '家族办公室解散了，相关职位回到公司');
}
/** 纳税页上面加：本年度汇算预估、个人分类所得税 */
function taxMore(el, s, t) {
  const y = Math.floor((t - s.createdAt) / YEAR_MS); const from = s.createdAt + y * YEAR_MS;
  const p = s.citYtd || 0; const small = p <= TAX.cit.smallLimitYear; const due = Math.max(0, p) * (small ? TAX.cit.smallRate : TAX.cit.rate); const paid = s.citPaidYtd || 0;
  const py = FI.personalYear(s, from, t + 1);
  const box = document.createElement('div');
  box.innerHTML = `<div class="sd-rec-title">第 ${y + 1} 年企业所得税（年底汇算清缴，多退少补）</div><div class="fn-card">${row('全年应纳税所得额（到现在）', p)}${row('适用税率', small ? `${TAX.cit.smallRate * 100}%（小型微利）` : `${TAX.cit.rate * 100}%`)}${row('应纳', due)}${row('已预缴', paid)}${row(due - paid >= 0 ? '预计补缴' : '预计退税', Math.abs(due - paid), 'sum')}</div>
    <div class="sd-rec-title">第 ${y + 1} 年个人纳税（分类所得）</div><div class="fn-card">${py.kinds.map(([k, v]) => row(k, v)).join('') || '<div class="empty">今年还没有</div>'}${py.total ? row('合计', py.total, 'sum') : ''}</div>`;
  el.prepend(box);
}
/** 挂到财务页上：加一个「资产负债表」页，资产清单换成完整版，总览和纳税页加内容 */
export function extendFinance(TABS, DRAW) {
  if (!TABS.some((x) => x[0] === 'balance')) TABS.splice(TABS.findIndex((x) => x[0] === 'assets'), 0, ['balance', '资产负债表']);
  DRAW.balance = balance; DRAW.assets = assets; DRAW.group = group;
  if (!TABS.some((x) => x[0] === 'group')) TABS.splice(TABS.findIndex((x) => x[0] === 'balance') + 1, 0, ['group', '集团']);   // 第 3-06 项
  const ov = DRAW.overview; DRAW.overview = (el, s, from, t) => { ov(el, s, from, t); overviewMore(el, s); };
  const tx = DRAW.tax; DRAW.tax = (el, s, from, t) => { tx(el, s, from, t); taxMore(el, s, t); };
}

// ---------- 第 3-06 项：「集团」页（架构、节税、合并报表） ----------
import * as GR from '../core/group.js?v=691ed83a';
import { CAPITAL_SECTIONS } from './capital.js?v=691ed83a';
import * as TKC from '../core/takeover.js?v=691ed83a';
import { allRows as _allRows } from '../core/finance.js?v=691ed83a';
import { fmtDuration } from '../core/format.js?v=691ed83a';
import * as DL3 from '../core/daily.js?v=691ed83a';
const tick36 = (s) => { for (const x of GR.tick(s, now())) toast(x, 2600); };
game.addTicker(tick36);
function groupData(s, from, t) {
  const pl = F.companyPL(s, from, t); const p = { rev: {}, cogs: {}, labor: pl.labor.total, rent: pl.rent, other: pl.opex + pl.misc, surcharge: 0 };
  for (const x of pl.byInd) { p.rev[x.id] = x.rev; p.cogs[x.id] = x.cogs; }
  const lm = F.inPeriod(_allRows(s, t), from).filter((r) => r.cat === 'rent_co' && (r.note || '').startsWith('地标')).reduce((a, r) => a + r.amount, 0); if (lm) p.rev.landmark = lm;
  return p;
}
/** 「财富 → 资本」里的集团架构（验收阶段三：从财务页挪过来；财务页只留合并报表） */
function groupActs(el0) {
  const s = game.state; const t = now(); const el = document.createElement('div'); el0.appendChild(el); el.innerHTML = '<div class="sd-rec-title">集团架构</div>';
  const box = document.createElement('div'); el.appendChild(box); groupView(box, s, F.periodFrom(s, 'month', t), t, 'acts'); hintLater('group');
}
CAPITAL_SECTIONS.push(groupActs);
function group(el, s, from, t) { groupView(el, s, from, t, 'report'); if (!DL3.progress(s, t, 'capview')) DL3.bump(s, t, 'capview'); }
function groupView(el, s, from, t, mode) {
  const C = GR.GCFG; const g = s.group || {}; const hold = GR.holdingReady(s); const R = (g.red || { done: [] }); const hi = GR.hitechActive(s, t);
  const st = (x) => (x ? (x.ready ? '<b class="pos">已成立</b>' : `办理中，还要 ${fmtDur(x.at - t)}`) : '<span class="neg">没有</span>');
  const subs = Object.keys(s.inds || {}).filter((id) => GR.entityName(s, id).includes('有限公司'));
  const tree = `<div class="grp-tree"><div class="grp-node boss">${s.bossName || '老板'}</div>
    <div class="grp-row"><div class="grp-node ${hold ? 'on' : 'off'}">${GR.holdingName(s)}<small>${hold ? '控股公司' : '还没成立'}</small></div>${g.platform ? `<div class="grp-node ${g.platform.ready ? 'on' : 'off'}">${GR.baseName(s)}${C.platform.name}<small>激励池</small></div>` : ''}</div>
    ${hold ? `<div class="grp-subs">${subs.map((id) => `<div class="grp-node sub">${GR.entityName(s, id).replace(/有限公司$/, '')}${id === 'tech' && hi ? '<em>高新 15%</em>' : ''}</div>`).join('')}${s.landmark && Object.keys(s.landmark.own || {}).length ? `<div class="grp-node sub">${GR.entityName(s, 'landmark').replace(/有限公司$/, '')}</div>` : ''}</div>` : ''}
    ${TKC.controlled(s).length ? `<div class="grp-subs">${TKC.controlled(s).map((x) => `<div class="grp-node sub on">${x.name}<em>控股 ${(x.pct * 100).toFixed(1)}%（上市）</em></div>`).join('')}</div>` : ''}
    <div class="grp-row off-shore">${C.redchip.steps.map((x) => `<div class="grp-node ${R.done.includes(x.key) ? 'on' : R.step === x.key ? 'doing' : 'off'}">${x.name.replace(/（.*）/, '')}</div>`).join('<i>→</i>')}</div></div>`;
  const c = GR.consolidated(s, groupData(s, from, t), t);
  const rep = `<div class="sd-rec-title">合并利润表（这段时间，税前；人工房租等按营收分摊）</div><div class="fn-card">${c.rows.map((x) => row(`${x.name}<small>${x.why} ${x.rate * 100}%</small>`, `营收 ${fmtMoney(x.rev)} · 利润 <span class="${x.profit < 0 ? 'neg' : ''}">${fmtMoney(x.profit)}</span><small>所得税约 ${fmtMoney(x.cit)}</small>`)).join('')}
    ${row('集团合计', `营收 ${fmtMoney(c.rev)} · 利润 ${fmtMoney(c.profit)}`, 'sum')}${row(hold ? '按子公司各自报税' : '一家公司报税', c.groupCit)}${hold ? row('要是还是一家公司', c.singleCit) + row('集团架构省下', c.saved, c.saved >= 0 ? 'pos' : 'neg') : ''}</div>
    ${g.lastQ ? `<div class="tr-gain">上个季度预缴：${g.lastQ.map((x) => `${(x.name || '').replace(/有限公司$/, '')} ${fmtMoney(x.cit)}（${x.rate * 100}%）`).join('；')}</div>` : ''}`;
  const hc = GR.hitechCheck(s, t); const nx = GR.nextRedStep(s);
  const acts = `<div class="sd-rec-title">架构</div><div class="fn-card">
    ${row('控股公司', st(g.holding))}<small class="fn-note">每条产业线一家子公司，企业所得税各算（各自判断小型微利），子公司分到控股公司的分红免企业所得税；代价是每家每年代账审计 ${fmtMoney(C.holding.subYearly)}。成立：${fmtMoney(GR.holdingCost(s))}，等 1 个游戏月。</small>${g.holding ? '' : `<button class="btn sm gold g-hold" ${GR.whyNotHolding(s) ? 'disabled' : ''}>成立控股公司</button>${GR.whyNotHolding(s) ? `<small class="fn-note neg">${GR.whyNotHolding(s)}</small>` : ''}`}
    ${row('员工持股平台', st(g.platform))}${g.platform ? '' : `<button class="btn sm g-plat" ${GR.whyNotPlatform(s) ? 'disabled' : ''}>设持股平台（${fmtMoney(C.platform.fee)}）</button>`}
    ${row('高新技术企业', hi ? `<b class="pos">有效</b>（${fmtDur(g.hitech.until - t)}后重新认定）` : st(g.hitech && !g.hitech.ready ? g.hitech : null))}<small class="fn-note">研发占科技收入 ${(hc.rndRatio * 100).toFixed(1)}%（要 ≥ 5%）${hc.scope === 'company' ? `，科技收入占全公司 ${(hc.techShare * 100).toFixed(1)}%（没有控股架构要 ≥ 60%）` : '，科技子公司单独认定'}；企业所得税 15%</small>${hi || (g.hitech && !g.hitech.ready) ? '' : `<button class="btn sm g-hi" ${GR.whyNotHitech(s, t) ? 'disabled' : ''}>申请认定（${fmtMoney(C.hitech.fee)}）</button>${GR.whyNotHitech(s, t) ? `<small class="fn-note neg">${GR.whyNotHitech(s, t)}</small>` : ''}`}
    ${row('红筹架构', GR.redchipDone(s) ? '<b class="pos">搭好了</b>' : `${C.redchip.steps.filter((x) => R.done.includes(x.key)).length} / ${C.redchip.steps.length}${R.step ? `，办理中 ${fmtDur(R.at - t)}` : ''}`)}<small class="fn-note">搭好以后分红：子公司 → 开曼（预提 5%）→ 你的个人现金（个税 20%）。上港股、纳斯达克不用搭这个。</small>
    ${nx ? `<button class="btn sm g-red" ${GR.whyNotRed(s) ? 'disabled' : ''}>下一步：${nx.name}（${fmtMoney(nx.fee)}）</button>${GR.whyNotRed(s) ? `<small class="fn-note neg">${GR.whyNotRed(s)}</small>` : ''}` : ''}
    ${GR.redchipDone(s) ? '<div class="ind-btns"><button class="btn sm g-div" data-a="10000000">红筹分红 1000 万</button><button class="btn sm g-div" data-a="100000000">红筹分红 1 亿</button></div>' : ''}</div>`;
  el.innerHTML = mode === 'acts' ? tree + acts : rep + '<div class="tr-gain">控股公司、持股平台、高新、红筹这些操作在「财富 → 资本 → 集团架构」。</div>';
  const on = (sel, fn) => el.querySelectorAll(sel).forEach((b) => (b.onclick = () => ok(fn(b), '')));
  on('.g-hold', () => GR.startHolding(s, now())); on('.g-plat', () => GR.startPlatform(s, now())); on('.g-hi', () => GR.applyHitech(s, now())); on('.g-red', () => GR.startRed(s, now()));
  el.querySelectorAll('.g-div').forEach((b) => (b.onclick = () => { const r = GR.redDividend(s, +b.dataset.a, now()); if (!r.ok) { toast(r.why); return; } toast(`到你个人现金 ${fmtMoney(r.toYou)}（预提 ${fmtMoney(r.wht)}、个税 ${fmtMoney(r.tax)}）`, 3000); game.changed(); game.save(); }));
}
const fmtDur = (ms) => fmtDuration(Math.max(0, ms / 1000));
