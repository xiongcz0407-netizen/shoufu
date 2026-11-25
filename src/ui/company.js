// 「公司」页签：产业（摘要卡 + 产业线卡 → 产业线详情）、人事（员工、招聘、裁员）；分红到个人
import * as BK from '../core/books.js?v=c60d881c';   // 设计79 第三版
import { INDUSTRIES, IND_BY_ID } from '../config/industries.js?v=c60d881c';
import { TITLES } from '../config/titles.js?v=c60d881c';
import * as PQ from '../core/prereq.js?v=c60d881c'; // V2-12 前置条件
import { SEC_BY_ID } from '../config/secretaries.js?v=c60d881c';
import * as E from '../core/economy.js?v=c60d881c';
import * as CB from '../core/calib.js?v=c60d881c';
import * as ST from '../core/staff.js?v=c60d881c';
import * as CT from '../core/companytax.js?v=c60d881c';
import { MONTH_MS, monthIndex } from '../core/gametime.js?v=c60d881c';
import { fmtMoney, fmtDuration } from '../core/format.js?v=c60d881c';
import { asset, hasAsset } from '../platform/assets.js?v=c60d881c';
import { now } from '../core/clock.js?v=c60d881c';
import { game } from '../game.js?v=c60d881c';
import { h, openPanel, toast, liveRender } from './dom.js?v=c60d881c';
import * as AC from '../core/accrual.js?v=c60d881c';
import * as PO from '../core/posts.js?v=c60d881c';
import { dividendAdvice } from '../core/postwork.js?v=c60d881c';
import { openPost } from './posts.js?v=c60d881c';
import { openRealEstate } from './realestate.js?v=c60d881c';
import * as RE from '../core/realestate.js?v=c60d881c';
import * as LGI from '../core/logistics.js?v=c60d881c';
import * as TC from '../core/tech.js?v=c60d881c';
import * as MD from '../core/media.js?v=c60d881c';
import * as CY from '../core/cities.js?v=c60d881c';
import * as RVY from '../core/rivalry.js?v=c60d881c';
import { hintLater } from './guide2.js?v=c60d881c';
import * as MG from '../core/manage.js?v=c60d881c'; // P-05 亲自经营
import * as PK from '../core/pick.js?v=c60d881c'; // V2-03 进货挑品
import * as LT from '../core/late.js?v=c60d881c'; // V3-01 后期不挂机
import { isTraining } from '../core/training.js?v=c60d881c';
import { bank } from '../core/bank.js?v=c60d881c'; // V0.2.1 资金页签：贷款限用途
import { openTab } from './shell.js?v=c60d881c';
import { askFill, doFill } from './fill.js?v=c60d881c';
import * as CF from '../core/cashflow.js?v=c60d881c';
import { lockState } from '../core/ledger.js?v=c60d881c'; // V0.2.9 照样花 // V0.2.3 资金链（设计35）
import * as ADS from '../core/ads.js?v=c60d881c'; // V0.2.5 广告升级 // V0.2.2 开店补满人
import { openSitePick, sitesBlockHtml, bindSitesBlock } from './sites.js?v=c60d881c'; // V2-08 选址（开发2）
import { confirmBox } from './confirm.js?v=c60d881c'; // 设计37 第一节：游戏样式确认框
import { autoHtml, bindAuto, potionHtml, bindPotion } from './coupon.js?v=c60d881c'; // 设计39 自动上阵、精力药水（开发2）

const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
/** 本月到现在：营收、进货、预估人工和房租、利润（月底才真正扣人工、房租、税） */
/** 本月到现在（权责）：营收、进货、已计提的人工 / 房租 / 增值税附加、利润 */
export function monthSoFar(s, t) {
  const p = s.period || {}; const frac = ((t - s.createdAt) % MONTH_MS) / MONTH_MS;
  const rev = sum(p.rev), cogs = sum(p.cogs);
  const P = AC.payables(s); const tax = P.vat + P.surcharge;
  return { rev, cogs, labor: P.labor, rent: P.rent, tax, profit: rev - cogs - P.labor - P.rent - tax, frac, laborMonth: ST.monthlyLabor(s).total, rentMonth: AC.monthlyRent(s), P };
}
/** 「可用」显示：小于 0 显示 ¥0，下面红字说月底要付多少、可以注资（V0.2） */
export function availShort(s, av = AC.available(s)) { return av >= 0 ? '' : `<small class="neg">月底要付 ${fmtMoney(AC.payables(s).total)}，公司账户不够，可以注资</small>`; }
/** V0.2.1 灰按钮写原因：公司账户还差多少 */
export const shortText = (s, cost) => (cost > (s.company || 0) ? `<br><span class="neg">公司账户还差 ${fmtMoney(cost - (s.company || 0))}</span>` : CF.cushionShort(s, cost) > 0 ? `<br><span class="neg">要动工资的钱</span>` : ''); /* V0.2.9 只提醒，点了问 */
/** V0.2.3 钱够不够：公司账户不够，或者花完留不够两个月工资（设计35）→ 还差多少（0 = 够） */
export const moneyGap = (s, cost) => Math.max(cost - (s.company || 0), 0); /* V0.2.9 工资锁只提醒，不灰掉 */
/** V0.2.5 产业线详情里的「广告」（设计37 第二节 3）：人流、口碑两行，每行一个升级按钮；不写回本、比例算式 */
function drawAds(box, s, id, done) {
  const who = ADS.autoWho(s, id);
  const row = (cat) => { const n = ADS.lv(s, id, cat); const why = ADS.whyNotUp(s, id, cat); const full = why === '已满';
    const head = cat === 'traffic' ? `人流 <b>${ADS.valText(cat, n)}</b>` : `口碑 <b>${ADS.valText(cat, n)}</b>`;
    return `<div class="fn-row ad-row"><span>${head}<small>（${ADS.chName(s, cat)}）</small></span><button class="btn ${why ? '' : 'gold'} ad-up" data-c="${cat}" ${why && why !== '钱不够（要留工资）' ? 'disabled' : ''}>${full ? '已满' : /^到顶了|^职业经理人/.test(why || '') ? '到顶了' : ADS.btnText(s, id, cat)}</button></div>${why && !full ? `<div class="tr-gain ${why === '钱不够' ? 'neg' : ''}">${why}</div>` : ''}`; };
  box.innerHTML = `<div class="sd-rec-title">广告</div><div class="fn-card">${row('traffic')}${row('rep')}</div>
    ${who && ADS.autoOn(s, id) ? `<div class="tr-gain">${who === PO.OUT ? '职业经理人' : SEC_BY_ID[who].name}会在钱够的时候自动帮你升${who === PO.OUT ? '（只会发传单、点评运营：人流 +25%、口碑 60 为止）' : ''}</div>` : ''}`;
  box.querySelectorAll('.ad-up').forEach((b) => (b.onclick = () => { const r = ADS.upgrade(game.state, id, b.dataset.c, now()); if (!r.ok) { toast(r.why); return; } game.changed(); game.save(); done && done(); }));
}
/** V0.2.3 升级（跨样子先算账：多招几人、每月人工多多少、账上够撑几个月） */
export async function doUpgrade(id, done) {
  const s = game.state; const cost = E.upCostOf(s, id); if (!(await okToSpend(s, cost, '升级'))) return;
  const go = () => { if (E.upgrade(s, id, now())) { game.changed(); game.save(); done && done(); toast(CF.upgradePreview(s, id) && ST.estTotal(s, id) > ST.onDuty(s, id) ? '升级了，编制变大，记得招人' : '升级了'); } else toast(CF.whyCushion(s, cost) || E.whyNotUpgrade(s, id) || '公司账户不够'); };
  const pv = CF.upgradePreview(s, id, cost); if (!pv || !pv.cross) { go(); return; }
  const look = IND_BY_ID[id].lookNames; const nx = E.lookIndex(IND_BY_ID[id], s.inds[id].level + 1);
  const p = openPanel(`升到「${look[nx]}」`);
  p.body.appendChild(h('div', 'rate', `升上去要多招 <b>${pv.addStaff}</b> 人，每月人工房租多 <b>${fmtMoney(pv.addMonthly)}</b><br>升完账上够撑 <b class="${pv.months < 2 ? 'neg' : ''}">${pv.months === Infinity ? '很久' : pv.months.toFixed(1) + ' 个月'}</b>（按升完以后每月工资社保 + 房租算）`));
  const ok = h('button', 'btn gold big', `确认升级（${fmtMoney(cost)}）`); ok.onclick = () => { p.close(); go(); };
  const no = h('button', 'btn big', '先不升'); no.onclick = () => p.close(); p.body.append(ok, no);
}
/** V0.2.1「资金」页签（设计34 一之二）：两个钱包、注资 / 分红、最近 10 笔 */
export function renderFunds(body) {
  const wrap = h('div'); body.appendChild(wrap); let inj = 10000, div = 10000;
  const draw = () => {
    const s = game.state; const free = CT.freeCash(s); const av = Math.max(0, Math.floor(AC.available(s))); const P = AC.payables(s); const rs = (bank(s) && bank(s).restricted) || 0;
    const dmax = Math.max(0, Math.min(CF.divMax(s), Math.floor((s.company || 0) - rs))); /* V0.2.9 留够工资 */ inj = Math.max(0, Math.min(inj, free)); div = Math.max(0, Math.min(div, dmax));
    const quick = (cls, max, cur) => [[10000, '1 万'], [100000, '10 万'], [Math.floor(max / 2), '一半'], [max, '全部']].map(([v, n]) => `<button class="tab ${cls} ${v === cur && v > 0 ? 'on' : ''}" data-v="${v}" ${v > max || max < 1 ? 'disabled' : ''}>${n}</button>`).join('');
    const rows = (s.ledger || []).filter((r) => r.cat === 'capital_out' || (r.wallet === 'company' && r.cat === 'dividend_out')).slice(-10).reverse(); /* 设计62：从投资账户注资（wallet invest）也算 */
    wrap.innerHTML = `<div class="sum-card"><div><small>个人现金</small><b>${fmtMoney(s.cash)}</b>${free < Math.floor(s.cash) ? `<small>能动的 ${fmtMoney(free)}（有冻结）</small>` : ''}</div>
        <div><small>公司账户</small><b>${fmtMoney(s.company)}</b><small>可用 ${fmtMoney(av)} · 应付 ${fmtMoney(P.total)}</small>${rs > 0 ? `<small class="neg">其中贷款 / 融资款限用途 ${fmtMoney(rs)}（不能分红）</small>` : ''}${availShort(s)}</div></div>
      <div class="sd-rec-title">注资到公司 <small>个人 → 公司，不交税；钱进了公司只能分红拿回来</small></div>
      <div class="tabs pk-row">${quick('q-inj', free, inj)}</div>
      <input class="amt f-inj" inputmode="numeric" pattern="[0-9]*" value="${inj}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #34425c;background:#18223a;color:var(--paper);font-size:16px">
      <button class="btn gold big go-inj" ${inj < 1 ? 'disabled' : ''}>注资 ${fmtMoney(inj)}</button>
      <div class="sd-rec-title">分红到个人 <small>最多能分 ${fmtMoney(dmax)}（要留工资，贷款款不能分）</small></div>
      <div class="tabs pk-row">${quick('q-div', dmax, div)}</div>
      <input class="amt f-div" inputmode="numeric" pattern="[0-9]*" value="${div}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #34425c;background:#18223a;color:var(--paper);font-size:16px">
      <div class="rate">代扣个税 20%：${fmtMoney(div * 0.2)}，到手 <b>${fmtMoney(div * 0.8)}</b></div>
      <button class="btn big go-div" ${div < 1 ? 'disabled' : ''}>分红 ${fmtMoney(div)}</button>
      <div class="sd-rec-title">最近 10 笔</div>
      <div class="fn-card">${rows.length ? rows.map((r) => `<div class="fn-row"><span>${r.cat === 'capital_out' ? '注资' : '分红'}　<small>${r.note || ''}</small></span><b class="${r.cat === 'capital_out' ? '' : 'pos'}">${fmtMoney(r.amount)}</b></div>`).join('') : '<div class="fn-row"><span>还没有</span></div>'}</div>`;
    wrap.querySelectorAll('.q-inj').forEach((b) => (b.onclick = () => { inj = +b.dataset.v; draw(); }));
    wrap.querySelectorAll('.q-div').forEach((b) => (b.onclick = () => { div = +b.dataset.v; draw(); }));
    wrap.querySelector('.f-inj').onchange = (e) => { inj = Math.floor(+e.target.value) || 0; draw(); };
    wrap.querySelector('.f-div').onchange = (e) => { div = Math.floor(+e.target.value) || 0; draw(); };
    wrap.querySelector('.go-inj').onclick = () => { const r = AC.injectCapital(s, inj, now()); toast(r.ok ? `已注资 ${fmtMoney(inj)}（${r.no}）` : r.why, 2600); if (r.ok) { game.changed(); game.save(); } draw(); };
    wrap.querySelector('.go-div').onclick = () => { const r = AC.payDividend(s, div, now()); toast(r.ok ? `到手 ${fmtMoney(r.net)}，个税 ${fmtMoney(r.tax)}` : r.why, 2600); if (r.ok) { game.changed(); game.save(); } draw(); };
  };
  draw();
}
/** 花公司的钱之前：超过「可用」就提醒会影响发工资 */
export async function okToSpend(s, cost, what) { // 设计37：返回 Promise<boolean>
  if (cost > (s.company || 0) + 0.5) { /* 公司账户根本不够：提示注资（设计28 第零节） */
    const short = Math.ceil((cost - (s.company || 0)) / 10000) * 10000; const free = CT.freeCash(s);
    toast(`${what}要 ${fmtMoney(cost)}，公司账户只有 ${fmtMoney(s.company)}。${free >= cost - (s.company || 0) ? '可以把个人的钱注资到公司。' : '个人现金也不够，再攒攒。'}`, 3200);
    if (free >= cost - (s.company || 0)) { void short; openTab('company', 'funds'); } /* V0.2.1：直达资金页签 */
    return false;
  }
  if (CF.cushionShort(s, cost) > 0) { /* V0.2.9 工资锁只提醒：说清楚后果，玩家可以照样花 */
    const i = CF.lockInfo(s, cost);
    const yes = await confirmBox({ title: '要动工资的钱吗', body: `${what}要 ${fmtMoney(i.cost)}。\n花完公司剩 ${fmtMoney(i.left)}，要留 ${i.months} 个月${i.months > 1 ? '工资社保和房租' : '工资社保'} ${fmtMoney(i.need)}，还差 ${fmtMoney(i.short)}。\n照样花的话：发不出工资员工会走，拖两个月门店全部停业。`, ok: '照样花', cancel: '先不花', danger: true });
    if (yes) { lockState.bypass = true; setTimeout(() => { lockState.bypass = false; }, 0); }
    return yes;
  }
  const av = AC.available(s);
  if (cost <= av) return true;
  return confirmBox({ body: `${what}要 ${fmtMoney(cost)}，超过可用的 ${fmtMoney(Math.max(0, av))}（余额 ${fmtMoney(s.company)} 里有 ${fmtMoney(AC.payables(s).total)} 是要付的工资、房租和税）。\n花了月底可能发不出工资，还要继续吗？`, title: '超过可用资金', ok: '继续花', danger: true });
}
const lineMonth = (s, id) => { const p = s.period || {}; return { rev: (p.rev || {})[id] || 0, cogs: (p.cogs || {})[id] || 0 }; };
const managerOf = (s, id) => (s.positions || {})['manager_' + id];

function summary(s, t) {
  const m = monthSoFar(s, t);
  const av = s.company - m.P.total;
  const box = h('div', 'sum-card', `
    <div><small>公司账户余额</small><b class="${s.company < 0 ? 'neg' : ''}">${fmtMoney(s.company)}</b></div>
    <div><small>可用（减掉应付）</small><b>${fmtMoney(Math.max(0, av))}</b>${availShort(s, av)}</div>
    <div><small>本月营收</small><b class="pos">${fmtMoney(m.rev)}</b></div>
    <div><small>本月利润（权责）</small><b class="${m.profit < 0 ? 'neg' : 'pos'}">${fmtMoney(m.profit)}</b></div>
    <div><small>员工</small><b>${ST.totalStaff(s)} 人</b></div>
    <div><small>应付</small><b class="neg">${fmtMoney(m.P.total)}</b></div>`);
  const lk = LT.active(s) ? h('div', 'tr-gain', `经营状态：托管水平 ${Math.round(LT.hostK(s) * 100)}%，你的投入 ${LT.lt(s).E.toFixed(1)} → 利润 ×${LT.mult(s, true).toFixed(2)}${LT.mult(s) < LT.mult(s, true) - 0.005 ? `（对手进攻影响中 ×${LT.mult(s).toFixed(2)}）` : ''}。亲自拍板（经营会、商战、事件、谈判、项目节点、应对进攻）能往上走，不管就慢慢掉回托管水平。`) : null; /* V3-01 */
  const tip = h('div', 'tr-gain', `应付 = 已计提的工资社保 ${fmtMoney(m.P.labor)} + 房租 ${fmtMoney(m.P.rent)} + 税 ${fmtMoney(m.P.vat + m.P.surcharge + m.P.cit)}${m.P.owed ? ` + 拖欠工资 ${fmtMoney(m.P.owed)}` : ''}；月底（还有 ${fmtDuration((1 - m.frac) * MONTH_MS / 1000)}）实际付。整月工资 ${fmtMoney(m.laborMonth)}、房租 ${fmtMoney(m.rentMonth)}${s.payroll && s.payroll.arrears ? '　<span class="neg">⚠️ 拖欠工资 ' + s.payroll.arrears + ' 个月</span>' : ''}`);
  return lk ? [box, lk, tip] : [box, tip];
}

export function renderIndustry(body, ctx) {
  const wrap = h('div'); body.appendChild(wrap);
  ctx.onCleanup(liveRender(wrap, () => { wrap.innerHTML = ''; drawIndustry(wrap, ctx); }, (fn) => game.onChange(fn), body));
}
function drawIndustry(body, ctx) {
  const s = game.state; const t = now();
  body.append(...summary(s, t));
  const dv = h('button', 'btn gold big', '分红到个人（代扣 20% 个税）');
  dv.onclick = () => openDividend(ctx);
  const ij = h('button', 'btn big', '注资到公司（个人 → 公司，不交税）');
  ij.onclick = () => openInject(ctx);
  for (const cfg of INDUSTRIES) {
    const ind = s.inds[cfg.id];
    if (!ind) {
      const lk = `assets/ind/${cfg.img[0]}.webp`;
      body.appendChild(h('div', 'ind-card locked', `${hasAsset(lk) ? `<img class="ind-img gray" src="${asset(lk)}" alt="">` : ''}<div class="ind-info"><div class="ind-name">${cfg.name}</div><div class="ind-lock">${PQ.lockInfo(s, cfg.id).map((x) => `${x.ok ? '✓' : '○'} ${x.text}`).join('　')}<br><small>或者收购同行提前解锁</small></div></div>`));
      continue;
    }
    if (E.notOpened(s, cfg.id)) { body.appendChild(emptyCard(s, cfg, ctx)); continue; } /* 设计58：还没开的线灰着，写条件 */
    if (cfg.id === 'realestate') { body.appendChild(reCard(s, cfg)); continue; } // 地产是项目制，卡片和详情另做
    const look = E.lookIndex(cfg, ind.level); const lm = lineMonth(s, cfg.id);
    const est = ST.estTotal(s, cfg.id), on = ST.onDuty(s, cfg.id), f = ST.staffFactor(s, cfg.id);
    const mgr = managerOf(s, cfg.id);
    const card = h('button', 'ind-card line', `${hasAsset(`assets/ind/${cfg.img[look]}.webp`) ? `<img class="ind-img" src="${asset(`assets/ind/${cfg.img[look]}.webp`)}" alt="">` : `<div class="ind-img ph">${cfg.lookNames[look]}</div>`}
      <div class="ind-info"><div class="ind-name">${cfg.name}<small>${cfg.lookNames[look]} · ${ind.level} 级 · ${ind.branches} 家</small></div>
      <div class="ind-line">在岗 <b class="${on < est ? 'neg' : ''}">${on}</b> / 编制 ${est}${f === 0 ? '　<span class="neg">停业</span>' : f < 1 ? `　缺编，收入 ×${Math.round(f * 100)}%` : ''}${ST.pendingHires(s, cfg.id) ? `　<span class="btn tiny go-hiring" role="button">招聘中 ${ST.pendingHires(s, cfg.id)}</span>` : ''}${ST.needTotal(s, cfg.id) ? '　<span class="btn tiny fill-up" role="button">招人</span>' : ''}</div>
      <div class="ind-line">本月营收 ${fmtMoney(lm.rev)}　毛利 ${fmtMoney(lm.rev - lm.cogs)}</div>${cfg.retail ? `<div class="ind-line">人流 ${ADS.valText('traffic', ADS.lv(s, cfg.id, 'traffic'))} · 口碑 ${Math.round(MG.line(s, cfg.id).rep)}</div>` : ''}
      <div class="ind-line">店长：${PO.isSec(mgr) ? `${SEC_BY_ID[mgr].name}（+${Math.round((PO.managerRevMult(s, cfg.id) - 1) * 100)}%）${PO.postMeta(s, 'manager_' + cfg.id).host.on ? ' · 托管中' : ''}` : mgr === PO.OUT ? '职业经理人（外包）' : '没有（点详情里「店长」安排）'}</div></div>`);
    card.onclick = () => openLine(cfg.id, ctx);
    { const fu = card.querySelector('.fill-up'); if (fu) fu.onclick = (e) => { e.stopPropagation(); doFill(cfg.id); }; } /* V0.2.2 一点补满 */
    { const gh = card.querySelector('.go-hiring'); if (gh) gh.onclick = (e) => { e.stopPropagation(); openTab('company', 'hr'); setTimeout(() => { const el = document.getElementById('hiring'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 150); }; } /* V0.2.2 跳到招聘中 */
    { const w0 = cfg.retail && ind.branches <= 1 && E.whyNotBranch(s, cfg.id); if (w0 && !/最多|满了/.test(w0)) card.querySelector('.ind-info').appendChild(h('div', 'ind-line neg', w0)); } /* V2-12 前置条件不够写出来 */
    body.appendChild(card);
  }
  /* V0.2.1：注资 / 分红挪到「资金」页签 */ void dv; void ij;
}

// 设计58：还没开的线（空着起步、0 家）：灰卡写「服装 · 还没开」和条件；条件够了写开店费，点了进详情开店
function emptyCard(s, cfg, ctx) {
  const lk = `assets/ind/${cfg.img[0]}.webp`; const why = E.whyNotBranch(s, cfg.id); const ok = !why;
  const line = ok ? `<div class="ind-line pos">可以开第一家了 · 开店费 ${fmtMoney(E.brCostOf(s, cfg.id))}</div>` : `<div class="ind-line">${why}</div>`;
  const card = h(ok ? 'button' : 'div', `ind-card line locked empty-line${ok ? ' ready' : ''}`, `${hasAsset(lk) ? `<img class="ind-img gray" src="${asset(lk)}" alt="">` : `<div class="ind-img ph">${cfg.name}</div>`}<div class="ind-info"><div class="ind-name">${cfg.name} · 还没开</div>${line}</div>`);
  if (ok) card.onclick = () => openLine(cfg.id, ctx);
  return card;
}
// 地产卡：在做项目、楼市、本月回款
function reCard(s, cfg) {
  const act = RE.activeProjects(s); const k = 'assets/ind/ind_realestate_1.webp';
  const next = act.filter((p) => p.at).sort((a, b) => a.at - b.at)[0]; const ready = act.filter((p) => p.stage === 'ready' || p.stage === 'built').length;
  const rev = BK.rowsOf(BK.cellsOfMonth(s, monthIndex(s, now()))).filter((r) => r.cat === 'presale').reduce((a, r) => a + r.amount, 0);
  const card = h('button', 'ind-card line', `${hasAsset(k) ? `<img class="ind-img" src="${asset(k)}" alt="">` : `<div class="ind-img ph">地产</div>`}
    <div class="ind-info"><div class="ind-name">地产<small>项目制 · 楼市${RE.heatOf(s).name}</small></div>
    <div class="ind-line">在做 ${act.length} / ${RE.maxProjects(s)} 个项目${ready ? `　<span class="pos">${ready} 个等你拍板</span>` : ''}</div>
    <div class="ind-line">${next ? `${next.name}：${RE.STAGE[next.stage]}，还剩 ${fmtDuration(Math.max(0, (next.at - now()) / 1000))}` : act.length ? '' : '去土地市场拿第一块地'}</div>
    <div class="ind-line">本月售房回款 ${fmtMoney(rev)}　在岗 ${ST.onDuty(s, 'realestate')} / ${ST.estTotal(s, 'realestate')}</div></div>`);
  card.onclick = () => openRealEstate();
  return card;
}

// 科技详情：产品（立项 → 研发 → 上线 → 用户 S 曲线 → 止损）
function techBlock(s) {
  const C = TC.TECH_CFG; const t = now(); const X = TC.tech(s);
  const list = X.products.filter((p) => p.stage !== 'closed').map((p) => {
    const D = C.directions[p.dir];
    if (p.stage === 'dev') return `<div class="tr-course"><div><b>${p.name}</b><div class="tr-gain">研发中，还剩 ${fmtDuration(Math.max(0, (p.at - t) / 1000))}（研发费 ${fmtMoney(p.cost)}）</div></div></div>`;
    const cf = TC.capFactor(s, t); const u = TC.usersNow(s, p, t), cap = TC.userCap(p); const rev = TC.productRev(s, p, t) * cf * MONTH_MS / 1000;
    return `<div class="tr-course"><div><b>${p.name}</b><div class="tr-gain">用户 ${u.toLocaleString()}${cf < 1 ? `<span class="neg">（人手不够，用户涨不动了，去招人 / 升级）</span>` : u < cap * 0.97 ? `（还在涨，看势头能到 ${cap.toLocaleString()}）` : '（到顶了）'} · 月收入 ${fmtMoney(rev)}（${D.arpu} 元/人/月）<br>研发费 ${fmtMoney(p.cost)}，累计收入 ${fmtMoney(p.revTotal)}</div></div><button class="btn tc-close" data-i="${p.id}">止损</button></div>`;
  }).join('');
  const dirs = Object.entries(C.directions).map(([k, D]) => { const why = TC.whyNotStart(s, k); return `<button class="tr-course tc-new" data-d="${k}" ${why ? 'disabled' : ''}><div><b>立项：${D.name}</b><div class="tr-gain">${why || `研发费 ${fmtMoney(TC.devCost(s, k))}，研发 ${+CB.gm(D.devMonths).toFixed(1)} 个游戏月、上线后 ${+CB.gm(D.rampMonths).toFixed(1)} 个月爬到顶`}　${D.note}</div></div></button>`; }).join('');
  return `<div class="sd-rec-title">产品（${TC.liveProducts(s).length}/${TC.maxProducts(s)}）</div><div class="tr-gain">人效上限：全部产品月收入 ≤ 在岗 ${ST.onDuty(s, 'tech')} 人 × ${fmtMoney(CB.headCap('tech', ST.lookOf(s, 'tech'), TC.TECH_CFG.real))} = ${fmtMoney(TC.revCapPerSec(s) * MONTH_MS / 1000)}</div>${list || '<div class="tr-gain">还没有产品，先立项。研发期只花钱，上线后用户按 S 曲线涨，毛利 70%；成不成看产品经理（科技经理）的智慧和你的眼光。</div>'}
    ${dirs}<div class="tr-gain">人工占成本大头（程序员 2.5 万、产品经理 2.8 万）；增值税 6%；研发费用（立项费 + 研发人员工资 60%）加计扣除 100%，有财务总监自动申报；电商工具是软件产品，实际税负超 3% 即征即退。有科技以后所有产业管理效率 +3%。</div>`;
}

// 娱乐传媒详情：直播分成、片子
function mediaBlock(s) {
  const C = MD.MEDIA_CFG; const t = now(); const L = C.live; const X = MD.media(s);
  const an = ST.onDutyRole(s, 'media', 'anchor'); const flow = an * L.flowPerAnchor; const live = MD.liveRevPerSec(s) * MONTH_MS / 1000;
  const films = X.films.slice().reverse().slice(0, 8).map((f) => {
    const K = C.kinds[f.kind]; const R = f.result;
    const head = `<b>《${f.title}》</b> ${K.name} · ${f.genre}${f.hot ? '（当月热门）' : ''} · ${C.directors[f.dir].name} · ${C.casts[f.cast].name} · 宣发${C.publicity[f.pub].name}　总成本 ${fmtMoney(f.cost.total)}`;
    if (!R) return `<div class="tr-course"><div>${head}<div class="tr-gain">${f.stage === 'shoot' ? '拍摄中' : f.stage === 'post' ? '后期中' : f.kind === 'film' ? '上映中' : '播出中'}，这一步还剩 ${(Math.max(0, f.at - t) / MONTH_MS).toFixed(1)} 个游戏月</div></div></div>`;
    const body = f.kind === 'film' ? `票房 ${fmtMoney(R.gross)}：专项资金 5% ${fmtMoney(R.fund)}、税金附加 3.3% ${fmtMoney(R.sur)}、院线影院 57% ${fmtMoney(R.cinema)}、发行 4% ${fmtMoney(R.dist)} → 片方 ${fmtMoney(R.producer)} + 网络版权 ${fmtMoney(R.rights)}` : `平台采购 ${fmtMoney(R.fixed)} + 分账 ${fmtMoney(R.share)}`;
    return `<div class="tr-course"><div>${head}<div class="tr-gain">${body}<br><b class="${R.profit >= 0 ? 'pos' : 'neg'}">${R.profit >= 0 ? '赚' : '亏'} ${fmtMoney(Math.abs(R.profit))}</b></div></div></div>`;
  }).join('');
  return `<div class="sd-rec-title">直播</div><div class="tr-gain">在岗主播 ${an} 人 × 月流水 ${fmtMoney(L.flowPerAnchor)} = ${fmtMoney(flow)}；平台抽 50%，进公司 ${fmtMoney(live)}/月，主播再分一半（记在进货成本）。人效上限：在岗 × ${fmtMoney(CB.headCap('media', ST.lookOf(s, 'media'), MD.MEDIA_CFG.real))} / 月。直播里 30% 算广告，交 3% 文化事业建设费。</div>
    <div class="sd-rec-title">投拍（${MD.shooting(s).length}/${MD.slots(s)} 部，这个月观众爱看「${MD.hotGenre(s, t)}」）</div>${films || '<div class="tr-gain">升到 15 级「影视公司」有制片人以后能投拍：每 4 个制片管 1 部。</div>'}
    <button class="btn gold md-shoot" style="width:100%" ${MD.slots(s) <= MD.shooting(s).length ? 'disabled' : ''}>投拍一部</button>
    <div class="tr-gain">增值税 6%。有娱乐传媒以后服装、餐饮收入 +5%（广告），地产开盘去化 +10%（宣发）。</div>`;
}
/** 投拍：选种类、题材、导演、演员、宣发 */
function openShoot() {
  const C = MD.MEDIA_CFG; const o = { kind: 'film', genre: MD.hotGenre(game.state, now()), dir: 1, cast: 1, pub: 1, title: ['长夜', '归途', '风起时', '星河渡口', '无名之辈', '烈火', '海上明月', '逆光'][Math.floor(Math.random() * 8)] };
  const p = openPanel('投拍');
  const row = (label, key, opts) => `<div class="sd-rec-title">${label}</div><div class="tabs">${opts.map(([v, n]) => `<button class="tab ${o[key] === v ? 'on' : ''}" data-k="${key}" data-v="${v}">${n}</button>`).join('')}</div>`;
  const render = () => {
    const s = game.state; const c = MD.costOf(o); const why = MD.whyNotShoot(s, o);
    p.body.innerHTML = `<div class="sd-rec-title">片名</div><input class="md-title" maxlength="12" value="${o.title}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #34425c;background:#18223a;color:var(--paper);font-size:16px">` + row('种类', 'kind', Object.entries(C.kinds).map(([k, K]) => [k, K.name])) + row('题材', 'genre', C.genres.map((g) => [g, g === MD.hotGenre(s, now()) ? g + '🔥' : g]))
      + row('导演', 'dir', C.directors.map((d, i) => [i, `${d.name} ${fmtMoney(d.cost)}`])) + row('演员', 'cast', C.casts.map((d, i) => [i, `${d.name} ${fmtMoney(d.cost)}`])) + row('宣发', 'pub', C.publicity.map((d, i) => [i, `${d.name} ${fmtMoney(d.cost)}`]))
      + `<div class="rate">总成本 ${fmtMoney(c.total)}（制作 ${fmtMoney(c.make)} + 宣发 ${fmtMoney(c.pub)}；演员占 ${Math.round(c.cast / c.total * 100)}%）${why ? `<br><span class="sc-cond">${why}</span>` : ''}</div>
      <div class="tr-gain">${o.kind === 'film' ? '电影看票房：大部分不赚，少数爆款。片方拿票房的约 36%（专项资金、税金附加、院线、发行先分走）。' : '电视剧卖给视频平台：固定价约总成本 1.05 倍，拍得好再分账，稳。'}</div>
      <button class="btn gold big go" ${why ? 'disabled' : ''}>开机（${(() => { const m = MD.filmMonths(o.kind); return o.kind === 'film' ? `拍 ${+m.shoot.toFixed(1)} + 后期 ${+m.post.toFixed(1)} + 上映 ${+m.release.toFixed(1)}` : `拍 ${+m.shoot.toFixed(1)} + 交平台 ${+m.release.toFixed(1)}`; })()} 个游戏月）</button>`;
    const ti = p.body.querySelector('.md-title'); ti.oninput = () => { o.title = ti.value; };
    p.body.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { const k = b.dataset.k; o[k] = ['dir', 'cast', 'pub'].includes(k) ? +b.dataset.v : b.dataset.v; render(); }));
    p.body.querySelector('.go').onclick = () => { const r = MD.shoot(game.state, { ...o }, now()); if (!r.ok) { toast(r.why); return; } toast(`《${r.film.title}》开机了，合同进档案柜`); game.changed(); game.save(); p.close(); };
  };
  render();
}

// 物流详情里的车队、件量、双十一
function logiBlock(s) {
  const C = LGI.LOGI_CFG; const g = LGI.fleetGap(s); const X = LGI.logi(s); const ff = LGI.fleetFactor(s);
  const perDay = Math.round(LGI.baseRevPerSec(s) * ff * LGI.complainMult(s) * (MONTH_MS / 1000) / 30 / C.ticketPrice);
  return `<div class="sd-rec-title">车队（公司资产）</div>
    <div class="tr-gain">运力 ${LGI.fleetUnits(s)} / 需要 ${LGI.fleetNeed(s)}（厢式货车 1、重卡 3；每 ${C.fleet.headsPerUnit} 个人要 1 份运力）${ff < 1 ? `　<span class="neg">缺车，收入 ×${Math.round(ff * 100)}%</span>` : ''}<br>账面价值 ${fmtMoney(LGI.fleetValue(s))}，按 4 年折旧进利润表；买车付购置税 10%，13% 进项抵扣</div>
    ${g.n ? `<button class="btn gold fleet" style="width:100%">补 ${g.n} 辆${g.name}（${fmtMoney(g.price)}/辆，含购置税共 ${fmtMoney(g.cost)}）</button>` : ''}
    <div class="tr-gain">日均件量约 ${perDay.toLocaleString()} 件 × 单票 ${C.ticketPrice} 元；场地按人头 ${fmtMoney(C.rentPerHead)}/人/月；油费路桥、中转包材占营收 34%；增值税运输 9% + 收派 6%。有物流以后便利店、服装进货 −2%。${LGI.complaining(s) ? `<br><b class="neg">双十一爆仓的投诉还没消：件量 −${Math.round(C.d11.complainCut * 100)}%，${fmtDuration(Math.max(0, (X.complain.until - now()) / 1000))}后恢复</b>` : ''}${X.d11 && X.d11.on ? '<br><b class="pos">双十一进行中：件量 ×3</b>' : '<br>双十一（每年 11 月 11 日）件量 ×3，要平时 2 倍的人，提前用劳务派遣补'}</div>`;
}

/** 城市（分公司）一行一个：状态、系数、注册按钮；onPick(c) 给开店用 */
export function cityRows(s, onPick, label = (c) => '') {
  const t = now();
  return CY.CITY_IDS.map((c) => { const st = CY.cityStatus(s, c, t); const x = (s.cities || {})[c] || {};
    const act = st === 'hq' || st === 'ok' ? (onPick ? `<button class="btn gold" data-pick="${c}">${label(c) || '在这开'}</button>` : `<em>${st === 'hq' ? '总部' : '分公司'}</em>`)
      : st === 'pending' ? `<button class="btn" disabled>办理中 ${fmtDuration(Math.max(0, (x.at - t) / 1000))}</button>` : `<button class="btn" data-reg="${c}">注册分公司<br><small>${fmtMoney(CY.CITY_CFG.registerFee)} · ${CY.CITY_CFG.registerMin} 分钟</small></button>`;
    const turf = cityRows.ind ? RVY.turfText(s, cityRows.ind, c) : ''; return `<div class="tr-course"><div><b>${CY.cityName(c)}</b>${st === 'hq' ? ' <small>总部</small>' : ''}<div class="tr-gain">系数 ${CY.cityK(c)}（工资、房租、收入、开店费）${turf ? `<br><span class="neg">${turf}</span>` : ''}</div></div>${act}</div>`; }).join('');
}
export function bindCityRows(el, s, onPick, done) {
  el.querySelectorAll('[data-reg]').forEach((b) => (b.onclick = () => { const r = CY.registerCity(s, b.dataset.reg, now()); if (!r.ok) toast(r.why); else { toast(`${CY.cityName(b.dataset.reg)}分公司在办，${CY.CITY_CFG.registerMin} 分钟`); game.changed(); game.save(); done && done(); } }));
  el.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => onPick(b.dataset.pick)));
}
/** 开分店：选城市 */
function openCityPick(id, done) {
  const p = openPanel(`${IND_BY_ID[id].name} · 开在哪`); hintLater('city');
  const render = () => {
    const s = game.state; const cfg = IND_BY_ID[id]; const ind = s.inds[id]; const cs = CY.lineCities(s, id);
    cityRows.ind = id;
    p.body.innerHTML = `<div class="tr-gain">第一次在一个城市开店要先注册分公司（营业执照、税务登记，代办费照收，马上办好）。广州便宜，但客单价也低。</div>` + cityRows(s, true, (c) => `开第 ${(cs[c] || 0) + 1} 家<br><small>${fmtMoney(E.brCostOf(s, id, c))}</small>`);
    bindCityRows(p.body, s, async (c) => { const cost = E.brCostOf(s, id, c); if (!(await okToSpend(s, cost, '开分店'))) return; if (openSitePick(id, c, okToSpend, () => { p.close(); done && done(); })) return; /* V2-08 先选铺位 */ if (E.openBranch(s, id, now(), '', c)) { toast(`${CY.cityName(c)}开了一家`); game.changed(); game.save(); p.close(); done && done(); askFill(id); } else toast(E.whyNotBranch(s, id) || '公司账户不够'); }, render);
  };
  liveRender(p.body, render, (fn) => game.onChange(fn));
}

/** 产业线详情（底部抽屉）：门店、升级、开分店、编制和招聘 */
export function openLine(id, ctx) {
  const p = openPanel(IND_BY_ID[id].name);
  if (['logistics', 'tech', 'media'].includes(id)) setTimeout(() => import('./guide.js?v=c60d881c').then((G) => G.hint(id)), 400);
  const render = () => {
    const s = game.state; const cfg = IND_BY_ID[id]; const ind = s.inds[id];
    const upC = E.upCostOf(s, id); const brWhy = E.whyNotBranch(s, id); const upWhy = E.whyNotUpgrade(s, id); const brC = brWhy ? null : E.brCostOf(s, id);
    const look = E.lookIndex(cfg, ind.level); const next = cfg.looks[look + 1];
    const est = ST.establishment(s, id); const short = ST.shortage(s, id);
    p.body.innerHTML = `<div class="tr-gain">公司账户 ${fmtMoney(s.company)}（可用 ${fmtMoney(Math.max(0, AC.available(s)))}）${availShort(s)}　本月营收 ${fmtMoney(lineMonth(s, id).rev)}　门店 ${ind.branches} 家 × ${cfg.lookNames[look]}（${ind.level} 级）${next ? `　${next} 级升${cfg.lookNames[look + 1]}（编制会变大）` : ''}</div>
      ${cfg.kind ? '' : `<div class="tr-gain">城市：${Object.entries(CY.lineCities(s, id)).filter(([, n]) => n).map(([c, n]) => `${CY.cityName(c)} ${n} 家`).join(' · ')}（收入、工资、房租按城市系数）</div>`}
      ${cfg.retail ? (ind.branches ? personalHtml(s, id) : '<div class="tr-gain">先开第一家：开了以后每天自动有今天主推，也能亲自上阵。</div>') : ''}
      ${cfg.retail ? sitesBlockHtml(s, id) : ''}
      <div class="ads-box"></div>
      <div class="sd-rec-title">编制和在岗（${id === 'logistics' ? '全部网点' : cfg.kind ? '全公司' : '全部门店'}）</div>
      <div class="staff-tbl">${Object.entries(est).map(([r, n]) => `<div><span>${ST.PAY.roles[r].name}</span><b class="${ST.onDutyRole(s, id, r) < n ? 'neg' : ''}">${ST.onDutyRole(s, id, r)}</b>/${n}<small>${fmtMoney(ST.wage(r))}/月</small></div>`).join('')}</div>
      ${id === 'media' ? mediaBlock(s) : id === 'tech' ? techBlock(s) : id === 'logistics' ? logiBlock(s) : `<div class="tr-gain">房租 ${fmtMoney(cfg.rent[look] * ind.branches)}/月　进货占营收 ${Math.round(E.baseCogs(s, id) * 100)}%${cfg.retail ? `　水电杂费 ${fmtMoney(CB.storeOther(cfg, ind.level) * ind.branches)}/月` : ''}</div>`}
      <button class="btn mgr" style="width:100%;margin-top:8px"${E.notOpened(s, id) ? ' disabled' : ''}>店长：${E.notOpened(s, id) ? '还没开店' : PO.holder(s, 'manager_' + id) ? (PO.isSec(PO.holder(s, 'manager_' + id)) ? SEC_BY_ID[PO.holder(s, 'manager_' + id)].name : '职业经理人') : '空缺'} ›（任命、托管、授权）</button>
      <div class="ind-btns" style="margin-top:10px">
        <button class="btn up">升级<br><small>${upWhy ? upWhy : `${fmtMoney(upC)}${shortText(s, upC)}`}</small></button>
        <button class="btn br">${brC == null ? `开分店<br><small>${brWhy}</small>` : `开分店（${ind.branches}/${E.maxBranches(s, id)}）<br><small>${fmtMoney(brC)}${shortText(s, brC)}</small>`}</button>
        <button class="btn hire ${ST.hireRoles(s, id).length ? 'gold' : ''}">${ST.hireRoles(s, id).length ? `招聘${sum(short) ? `<br><small>缺 ${sum(short)} 人</small>` : ''}` : '不缺人'}</button></div>`;
    { const need = [!upWhy && upC, brC].filter((c) => c && moneyGap(s, c) > 0); if (need.length) { const g = Math.min(...need.map((c) => moneyGap(s, c))); const gb = h('button', 'btn gold go-fund', `去注资（还差 ${fmtMoney(g)}）`); gb.style.width = '100%'; gb.style.marginTop = '6px'; gb.onclick = () => { p.close(); openTab('company', 'funds'); }; p.body.querySelector('.ind-btns:last-of-type').after(gb); } } /* V0.2.1 灰按钮写原因 + 去注资 */
    const up = p.body.querySelector('.up'); up.disabled = !!upWhy || moneyGap(s, upC) > 0;
    up.onclick = () => doUpgrade(id, render); void look; /* V0.2.3 跨样子先算账 */
    const br = p.body.querySelector('.br'); br.disabled = brC == null || moneyGap(s, brC) > 0;
    br.onclick = () => openCityPick(id, render); // 选城市开店（新城市先注册分公司）
    p.body.querySelector('.hire').onclick = () => openHire(id, render);
    { const ab = p.body.querySelector('.ads-box'); if (ab && ADS.isAdLine(s, id)) drawAds(ab, s, id, render); } /* V0.2.5 广告升级 */
    const sh = p.body.querySelector('.md-shoot'); if (sh) sh.onclick = () => openShoot();
    p.body.querySelectorAll('.tc-new').forEach((b) => (b.onclick = () => { const r = TC.startProduct(s, b.dataset.d, now()); if (!r.ok) toast(r.why); else { toast(`立项「${r.product.name}」，研发 ${+CB.gm(TC.TECH_CFG.directions[b.dataset.d].devMonths).toFixed(1)} 个游戏月`); game.changed(); game.save(); } }));
    p.body.querySelectorAll('.tc-close').forEach((b) => (b.onclick = async () => { if (!(await confirmBox({ body: '止损关掉这个产品？研发费收不回来。', title: '止损', ok: '关掉', danger: true }))) return; TC.closeProduct(s, +b.dataset.i, now()); game.changed(); game.save(); }));
    const fb = p.body.querySelector('.fleet'); if (fb) fb.onclick = () => { const r = LGI.buyFleet(s, undefined, now()); if (!r.ok) toast(r.why); else { toast(`买了 ${r.n} 辆车，含购置税 ${fmtMoney(r.cost)}`); game.changed(); game.save(); } };
    p.body.querySelector('.mgr').onclick = () => openPost('manager_' + id);
    bindSitesBlock(p.body, id);   // V2-08 分店铺位、关店转让（开发2，ui/sites.js）
    bindAuto(p.body, id, () => { game.changed(); game.save(); }); // 设计39 自动上阵在这里买（开发2，ui/coupon.js）
    bindPotion(p.body, () => { game.changed(); game.save(); render(); }); // 设计39：精力不够时喝药水 / 去卡包买（设计接手开发1）
    p.body.querySelectorAll('.pa-act').forEach((b) => (b.onclick = () => { const r = MG.doAct(game.state, id, b.dataset.a, now()); /* 设计50：不带秘书 */ toast(r.ok ? r.text : r.why, 3200); game.changed(); game.save(); }));
    /* 设计39：自动券的「用一张 / 接在后面先问 / 去卡包买」都在 autoHtml / bindAuto（开发2，ui/coupon.js；用的是开发1 的 MG.useAutoTicket） */
    p.body.querySelectorAll('.pa-big').forEach((b) => (b.onclick = () => { const r = MG.doBig(game.state, b.dataset.k, now(), id); toast(r.ok ? r.text : r.why, 3200); game.changed(); game.save(); }));
  };
  liveRender(p.body, render, (fn) => game.onChange(fn));
}

/** P-05 亲自上阵：精力、口碑、四个动作（设计50 不带秘书）、行情；老板以后多两件大事 */
function personalHtml(s, id) {
  const t = now(); const L = MG.line(s, id); const A = MG.MANAGE_CFG.actions; const today = MG.dayIndex(s, t);
  const fx = L.fx.filter((f) => f.until > t); const rev = fx.reduce((k, f) => k * (1 + (f.rev || 0)), 1) - 1, cg = fx.reduce((k, f) => k * (1 + (f.cogs || 0)), 1) - 1;
  return `${pickHtml(s, id, t)}<div class="sd-rec-title">亲自上阵 <small>精力 ${Math.floor(MG.energy(s, t))}/${MG.energyMax(s)} · ${MG.tip(s)}</small></div>
    <div class="tr-gain">口碑 ${'★'.repeat(MG.stars(L.rep))}${'☆'.repeat(5 - MG.stars(L.rep))} ${Math.round(L.rep)}（营业额 ${MG.repK(L.rep) >= 1 ? '+' : ''}${((MG.repK(L.rep) - 1) * 100).toFixed(1)}%）${MG.marketText(s) ? `　${MG.marketText(s)}` : ''}${fx.length ? `<br>今天：营业额 ${rev >= 0 ? '+' : ''}${(rev * 100).toFixed(1)}%　进货 ${(cg * 100).toFixed(1)}%` : ''}${MG.autoEff(s, id) ? `<br>店长每天自动砍价（效果 ${Math.round(MG.autoEff(s, id) * 100)}%）` : ''}${L.rep > MG.repFloor(s, id) + 0.01 ? `<br><small>临时加的口碑每 3 个游戏天 −1，掉回广告升的 ${MG.repFloor(s, id)}</small>` : ''}</div>
    <div class="ind-btns pa-grid">${Object.entries(A).map(([k, a]) => { const why = MG.whyNot(s, id, k, t); const on = MG.actLeft(s, id, k, t) > 0; return `<button class="btn pa-act ${why ? '' : 'gold'}" data-a="${k}" ${why ? 'disabled' : ''}>${a.name}<br><small>${on || why ? why : `${MG.E_COST.actHours} 小时 · ${a.energy} 精力`}</small></button>`; /* 设计39：一个动作管 6 小时 */ }).join('')}</div>${autoHtml(s, id)}
    ${MG.energy(s, t) < 5 && !(MG.autoActLeft(s, id, t) > 0) ? `<div class="cp-pot-wrap">精力不够了　${potionHtml(s)}</div>` : ''}
    ${(s.title || 0) >= 2 ? `<div class="ind-btns">${['inspect', 'supplier'].map((k) => `<button class="btn pa-big" data-k="${k}" ${MG.whyNotBig(s, k, t, id) ? 'disabled' : ''}>${MG.MANAGE_CFG.big[k].name}<br><small>${MG.whyNotBig(s, k, t, id) || `精力 ${MG.MANAGE_CFG.big[k].energy}`}</small></button>`).join('')}</div>` : ''}`;
}
/** 设计49 今日主推自动选：只一行，不能点 */
function pickHtml(s, id, t) { const c = PK.current(s, id, t); return c ? `<div class="tr-gain pk-line">${PK.lineText(c)}</div>` : ''; }
/** 招聘：选岗位 → 人数 → 渠道 */
/** V0.2.2 裁员确认：裁几个（1 / 超编 / 全部）、赔多少（N+1）、裁完会不会缺编 */
function openFire(id, r, done) {
  const s = game.state; const rn = ST.PAY.roles[r].name; const p = openPanel(`${IND_BY_ID[id].name} · 裁${rn}`);
  const all = ST.onDutyRole(s, id, r); const ov = ST.overStaff(s, id, r); let k = ov || 1;
  const render = () => {
    const q = ST.fireQuote(s, id, r, k, now());
    const quick = [[1, '1 个'], ...(ov > 1 ? [[ov, `超编的 ${ov} 个`]] : ov === 1 ? [] : []), [all, `全部 ${all} 个`]].filter((v, i, a) => a.findIndex((y) => y[0] === v[0]) === i);
    p.body.innerHTML = `<div class="tabs pk-row">${quick.map(([v, n]) => `<button class="tab ${v === k ? 'on' : ''}" data-v="${v}">${n}</button>`).join('')}</div>
      <div class="rate">裁 ${q.n} 个${rn}${q.ag ? `（先退派遣 ${q.ag} 个，不用赔）` : ''}<br>要赔 <b>${fmtMoney(q.comp)}</b>${q.own ? `<small>（${q.own} 人 × 月薪 ${fmtMoney(ST.wage(r))} × ${q.years + 1}，N+1：干满 ${q.years} 年）</small>` : ''}</div>
      <div class="tr-gain">裁完在岗 ${q.after} / 编制 ${q.est}　${q.short ? `<span class="neg">缺编 ${q.short} 个，收入会打折${ST.onDuty(s, id) - q.n === 0 ? '，这条线会停业' : ''}</span>` : '不缺编'}</div>
      <button class="btn big go-fire" style="border:1px solid var(--neg,#e05a5a);color:var(--neg,#e05a5a)">裁 ${q.n} 个，赔 ${fmtMoney(q.comp)}</button>`;
    p.body.querySelectorAll('.tab').forEach((b) => (b.onclick = () => { k = +b.dataset.v; render(); }));
    p.body.querySelector('.go-fire').onclick = () => { const res = ST.fire(s, id, r, k, now()); if (!res.ok) { toast(res.why); return; } toast(res.comp ? `裁了 ${res.n} 个，赔了 ${fmtMoney(res.comp)}` : `退回了 ${res.n} 个派遣员工`, 2400); game.changed(); game.save(); p.close(); done && done(); };
  };
  render();
}
export function openHire(id, done, pre) {
  const s = game.state; const short = ST.shortage(s, id); const roles = ST.hireRoles(s, id);
  const p = openPanel(`${IND_BY_ID[id].name} · 招聘`);
  if (!roles.length) { p.body.innerHTML = `<div class="tr-gain" style="margin:12px 0">${ST.ownerRun(s, id) ? ST.OWNER_RUN_TEXT : '这条线现在没有编制，不缺人。开分店、升级或者有了项目以后再来招人。'}</div><button class="btn gold big ok">知道了</button>`; p.body.querySelector('.ok').onclick = () => p.close(); return; } // 编制为空（开局第一家小店老板自己看）
  let role = (pre && roles.includes(pre) && pre) || roles.find((r) => short[r]) || roles[0];
  let n = short[role] || 1; let ch = 'door';
  const render = () => {
    const why = ST.whyNotHire(s, id, role, n, ch);
    p.body.innerHTML = `<div class="sd-rec-title">岗位</div><div class="tabs">${roles.map((r) => `<button class="tab ${r === role ? 'on' : ''}" data-r="${r}">${ST.PAY.roles[r].name}${short[r] ? `（缺 ${short[r]}）` : ''}</button>`).join('')}</div>
      <div class="sd-rec-title">人数</div><div class="stepper"><button class="btn m">−</button><b>${n}</b><button class="btn p">＋</button></div>
      <div class="sd-rec-title">渠道</div>${Object.entries(ST.PAY.channels).map(([k, c]) => `<button class="tr-course ch ${k === ch ? 'on' : ''}" data-c="${k}"><div><b>${c.name}</b><div class="tr-gain">${k === 'agency' ? `立刻到岗，每月多付 ${Math.round(c.markup * 100)}%` : '立刻到岗'}${c.roles ? '（只招店长、主管、总部）' : ''}</div></div><span>${k === 'agency' ? '' : fmtMoney(ST.hireCost(k, role, n))}</span></button>`).join('')}
      <div class="rate">${why ? `<span class="sc-cond">${why}</span>` : `招 ${n} 个${ST.PAY.roles[role].name}，月薪 ${fmtMoney(ST.wage(role) * n)} + 社保 30%`}</div>
      <button class="btn gold big go">招聘</button>`;
    p.body.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { role = b.dataset.r; n = short[role] || 1; render(); }));
    p.body.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { ch = b.dataset.c; render(); }));
    p.body.querySelector('.m').onclick = () => { n = Math.max(1, n - 1); render(); };
    p.body.querySelector('.p').onclick = () => { n += 1; render(); };
    const go = p.body.querySelector('.go'); go.disabled = !!why;
    go.onclick = () => { const r = ST.hire(s, id, role, n, ch, now()); if (!r.ok) { toast(r.why); return; } import('../core/daily.js?v=c60d881c').then((D) => D.bump(s, now(), 'hire')); toast(ch === 'agency' ? '派遣员工已到岗' : `${Math.ceil((r.at - now()) / 60000)} 分钟后到岗`); game.changed(); game.save(); p.close(); done && done(); };
  };
  render();
}

/** V0.2.2「招聘中」：每批一行，倒计时 + 加急（多付半个月工资立刻到岗） */
function drawHiring(body, s, ctx) {
  const hs = (s.hires || []).slice().sort((a, b) => a.at - b.at);
  const box = h('div', 'fn-card hiring'); box.id = 'hiring';
  box.innerHTML = `<div class="sd-rec-title">招聘中 ${hs.length ? `<small>${hs.reduce((a, x) => a + x.n, 0)} 人</small>` : ''}</div>` + (hs.length ? hs.map((x, i) => `<div class="fn-row"><span>${IND_BY_ID[x.ind].name} · ${ST.PAY.roles[x.role].name} × ${x.n}<br><small>${(ST.PAY.channels[x.channel] || {}).name || ''} · 还有 <b class="cd" data-at="${x.at}">${fmtDuration(Math.max(0, (x.at - now()) / 1000))}</b></small></span><button class="btn tiny gold rush" data-i="${i}" ${s.company < ST.rushCost(x) ? 'disabled' : ''}>加急<br><small>${fmtMoney(ST.rushCost(x))}</small></button></div>`).join('') : '<div class="fn-row"><span>没有在招的</span></div>');
  box.querySelectorAll('.rush').forEach((b) => (b.onclick = () => { const r = ST.rush(s, hs[+b.dataset.i], now()); toast(r.ok ? `加急了，多付 ${fmtMoney(r.cost)}，人到岗了` : r.why, 2400); if (r.ok) { game.changed(); game.save(); } ctx.rerender && ctx.rerender(); }));
  body.appendChild(box);
  if (hs.length) { const iv = setInterval(() => { if (!box.isConnected) { clearInterval(iv); return; } box.querySelectorAll('.cd').forEach((e) => { e.textContent = fmtDuration(Math.max(0, (+e.dataset.at - now()) / 1000)); }); }, 1000); ctx.onCleanup && ctx.onCleanup(() => clearInterval(iv)); }
}
export function renderHR(body, ctx) {
  const wrap = h('div'); body.appendChild(wrap);
  ctx.onCleanup(liveRender(wrap, () => { wrap.innerHTML = ''; drawHR(wrap, ctx); }, (fn) => game.onChange(fn), body));
}
function drawHR(body, ctx) {
  const s = game.state; const L = ST.monthlyLabor(s);
  { const on = CF.autoOn(s); const H = CF.hr(s); const b = h('div', 'tr-course', `<div><b>自动补员</b><div class="tr-gain">${on ? '开着：员工走了、编制变大，人事马上用贴招聘补满（免费、立刻到岗）' : '关着：缺人要自己点「招聘」'}${on && H.blocked ? `<br><span class="neg">还缺 ${H.blocked.n} 人没补：钱只够留两个月工资</span>` : ''}</div></div><button class="btn ${on ? 'gold' : ''} hr-auto">${on ? '开' : '关'}</button>`);
    b.querySelector('.hr-auto').onclick = () => { CF.setAuto(s, !on); if (!on) CF.autoFill(s, now()); game.changed(); game.save(); ctx.rerender && ctx.rerender(); }; body.appendChild(b); } /* V0.2.4 设计36 第 3 条 */
  const m = monthSoFar(s, now());
  body.appendChild(h('div', 'sum-card', `<div><small>员工总数</small><b>${ST.totalStaff(s)} 人</b></div><div><small>月人工成本</small><b>${fmtMoney(L.total)}</b></div>
    <div><small>占营收（本月）</small><b>${m.rev ? Math.round(m.labor / m.rev * 100) + '%' : '—'}</b></div><div><small>总部</small><b>${ST.hqStaff(s)} 人</b></div>`));
  body.appendChild(h('div', 'tr-gain', `工资 ${fmtMoney(L.wages)} + 社保公积金 30% ${fmtMoney(L.social)}${L.agency ? ` + 派遣 ${fmtMoney(L.agency)}` : ''}；代扣个税 ${fmtMoney(L.iit)}/月（从员工工资里扣，不算公司成本）。门店满 ${ST.PAY.hqFromStaff} 人起有总部员工（6%）。月流失：零售 5%、餐饮 7%`));
  if ((s.hires || []).length) drawHiring(body, s, ctx); /* V0.2.3：招人立刻到岗，只有老存档里在招的才显示 */
  for (const id of Object.keys(s.inds)) {
    const est = ST.establishment(s, id); const x = s.inds[id];
    const roleIds = [...new Set([...Object.keys(est), ...Object.keys(x.staff || {}).filter((r) => x.staff[r] > 0), ...Object.keys(x.agency || {}).filter((r) => x.agency[r] > 0)])].filter((r) => ST.PAY.roles[r]);
    const rows = roleIds.map((r) => { const n = est[r] || 0; const on = ST.onDutyRole(s, id, r); const ov = ST.overStaff(s, id, r); return `<div class="role-row"><span>${ST.PAY.roles[r].name}　<b class="${on < n ? 'neg' : ''}">${on}</b>/${n}${(x.agency || {})[r] ? `<small> 派遣 ${x.agency[r]}</small>` : ''}</span><button class="btn rr-hire" data-r="${r}" ${n ? '' : 'disabled'}>招聘</button><button class="btn rr-fire" data-r="${r}" ${on ? '' : 'disabled'}>${ov ? `裁员<small>超编 ${ov}</small>` : '裁员'}</button></div>`; }).join(''); /* V0.2.2 每个岗位一行：招聘 / 裁员并排 */
    const card = h('div', 'ind-card col', `<div class="ind-name">${IND_BY_ID[id].name}<small>在岗 ${ST.onDuty(s, id)} / 编制 ${ST.estTotal(s, id)}</small></div><div class="staff-rows">${rows || `<div class="tr-gain">${ST.ownerRun(s, id) ? '老板自己看着' : '没有编制'}</div>`}</div><button class="btn ${ST.hireRoles(s, id).length ? 'gold' : ''} hire">${ST.hireRoles(s, id).length ? '招聘' : '不缺人'}</button>`);
    card.querySelector('.hire').onclick = () => openHire(id, ctx.rerender);
    card.querySelectorAll('.rr-hire').forEach((b) => (b.onclick = () => openHire(id, ctx.rerender, b.dataset.r)));
    card.querySelectorAll('.rr-fire').forEach((b) => (b.onclick = () => openFire(id, b.dataset.r, ctx.rerender)));
    body.appendChild(card);
  }
  const bm = s.payroll.bonusMonths ?? 1;
  const b = h('div', 'tr-course', `<div><b>年终奖</b><div class="tr-gain">游戏年底按全年利润发，现在 ${bm} 个月工资（0～3）</div></div><div class="stepper"><button class="btn m">−</button><b>${bm}</b><button class="btn p">＋</button></div>`);
  b.querySelector('.m').onclick = () => { s.payroll.bonusMonths = Math.max(0, bm - 1); game.save(); ctx.rerender(); };
  b.querySelector('.p').onclick = () => { s.payroll.bonusMonths = Math.min(3, bm + 1); game.save(); ctx.rerender(); };
  body.appendChild(b);
}

/** 注资到公司（设计28 第零节）：快捷 1 万 / 5 万 / 全部，或自己填 */
export function openInject(ctx, preset) {
  const s = game.state; let amt = Math.min(preset || 50000, CT.freeCash(s));
  const p = openPanel('注资到公司');
  const render = () => {
    const free = CT.freeCash(s); amt = Math.max(0, Math.min(Math.floor(amt) || 0, free));
    p.body.innerHTML = `<div class="tr-gain">照现实：老板往自己公司增资，不交税。钱从个人现金转进公司账户，记进公司的「实收资本」，出一张《增资确认书》进档案柜。</div>
      <div class="rate">个人现金能动的 <b>${fmtMoney(free)}</b>${(s.freezes || []).length ? '<br><small>冻结中的钱不能动</small>' : ''}<br><small>公司账户 ${fmtMoney(s.company)} · 实收资本 ${fmtMoney(CT.paidIn(s))}</small></div>
      <div class="tabs" style="margin-top:10px">${[[10000, '1 万'], [50000, '5 万'], [free, '全部']].map(([v, n]) => `<button class="tab ${v === amt && amt > 0 ? 'on' : ''}" data-v="${v}" ${v > free || free < 1 ? 'disabled' : ''}>${n}</button>`).join('')}</div>
      <div class="sd-rec-title">金额（元）</div><input class="amt" inputmode="numeric" pattern="[0-9]*" value="${amt}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #34425c;background:#18223a;color:var(--paper);font-size:16px">
      <div class="tr-gain neg">注资以后钱就是公司的了：要拿回个人只能走分红，代扣 20% 个税。</div>
      <button class="btn gold big go">注资 ${fmtMoney(amt)}</button>`;
    p.body.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { amt = +b.dataset.v; render(); }));
    const inp = p.body.querySelector('.amt'); const go = p.body.querySelector('.go');
    inp.onchange = () => { amt = +inp.value; render(); };
    inp.oninput = () => { const v = Math.max(0, Math.min(Math.floor(+inp.value) || 0, CT.freeCash(s))); go.textContent = `注资 ${fmtMoney(v)}`; go.disabled = v < 1; };
    go.disabled = amt < 1;
    go.onclick = () => {
      const v = Math.max(0, Math.min(Math.floor(+inp.value) || 0, CT.freeCash(s)));
      const r = AC.injectCapital(s, v, now()); if (!r.ok) { toast(r.why); return; }
      toast(`已注资 ${fmtMoney(v)}，公司账户 ${fmtMoney(s.company)}（${r.no}）`); game.changed(); game.save(); p.close(); ctx && ctx.rerender && ctx.rerender();
    };
  };
  render();
}

export function openDividend(ctx) {
  const s = game.state; let pct = 30;
  setTimeout(() => import('./guide.js?v=c60d881c').then((g) => g.hint('wallets')), 400);
  const p = openPanel('分红到个人');
  const render = () => {
    const av = CF.divMax(s); /* V0.2.9 留够工资 */
    const amt = Math.floor(av * pct / 100);
    p.body.innerHTML = `<div class="tr-gain">公司的钱和你自己的钱是分开的：车、房、衣服、礼物只能用个人现金。分红时公司代扣 20% 个税。</div>
      <div class="rate">最多能分 <b>${fmtMoney(av)}</b>（要留工资）<br><small>余额 ${fmtMoney(s.company)} − 应付工资房租税 ${fmtMoney(AC.payables(s).total)}</small></div>
      ${PO.isSec(PO.holder(s, 'cfo')) ? `<div class="tr-gain">💬 ${SEC_BY_ID[PO.holder(s, 'cfo')].name}（财务总监）：留够 3 个月工资和房租，这个月能安全分 <b>${fmtMoney(dividendAdvice(s))}</b>。</div>` : ''}
      <div class="tabs" style="margin-top:10px">${[10, 30, 50, 80].map((v) => `<button class="tab ${v === pct ? 'on' : ''}" data-v="${v}">${v}%</button>`).join('')}</div>
      <div class="rate">按可用的 ${pct}% 拿 <b>${fmtMoney(amt)}</b><br><small>代扣个税 ${fmtMoney(amt * 0.2)}，到手 ${fmtMoney(amt * 0.8)}</small></div>
      <div class="tr-gain">月底整月工资大约 ${fmtMoney(ST.monthlyLabor(s).total)}，后半个月还会继续计提，别把可用的分空了</div>
      <button class="btn gold big go">分红</button>`;
    p.body.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { pct = +b.dataset.v; render(); }));
    const go = p.body.querySelector('.go'); go.disabled = amt < 1;
    go.onclick = () => { const r = AC.payDividend(s, amt, now()); if (!r.ok) { toast(r.why); return; } toast(`到手 ${fmtMoney(r.net)}，个税 ${fmtMoney(r.tax)}`); game.changed(); game.save(); p.close(); ctx && ctx.rerender(); };
  };
  render();
}
