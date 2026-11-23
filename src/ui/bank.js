// 财富 → 银行：征信、存款、贷款（经营贷、开发贷、股票质押、艺术品质押）、私人银行；申请和存款在底部抽屉
import ECO from '../config/economy.json?v=598ef1ae' with { type: 'json' };
const PM = ECO.profitMul;
/** 利率后面的小字：游戏年利率 = 现实 × 赚钱倍数（验收 2-16b） */
const rn = (r) => `<small class="rate-note">（游戏年利率；现实 ${(r / PM * 100).toFixed(2).replace(/\.?0+$/, '')}% × 赚钱倍数 ${PM}）</small>`;
import * as BK from '../core/bank.js?v=598ef1ae';
import * as RE from '../core/realestate.js?v=598ef1ae';
import * as PL from '../core/pledge.js?v=598ef1ae';
import * as SK from '../core/stocks.js?v=598ef1ae';
import * as AQ from '../core/antique.js?v=598ef1ae';
import * as LS from '../core/listing.js?v=598ef1ae';
import { fmtMoney, fmtDuration } from '../core/format.js?v=598ef1ae';
import { asset, hasAsset } from '../platform/assets.js?v=598ef1ae';
import { now } from '../core/clock.js?v=598ef1ae';
import { game } from '../game.js?v=598ef1ae';
import { h, openPanel, toast, liveRender } from './dom.js?v=598ef1ae';
import { hint } from './guide.js?v=598ef1ae';
import { hintLater } from './guide2.js?v=598ef1ae';
import { confirmBox } from './confirm.js?v=598ef1ae'; // 设计37 第一节：游戏样式确认框

const C = BK.BANK_CFG;
const logo = (k) => (hasAsset(`assets/org/${C.banks[k].logo}.webp`) ? `<img class="bk-logo" src="${asset(`assets/org/${C.banks[k].logo}.webp`)}" alt="">` : `<div class="bk-logo ph">${C.banks[k].name.slice(0, 2)}</div>`);
const pct = (x) => `${(x * 100).toFixed(2)}%`;

export function renderBank(body, ctx) {
  const wrap = h('div'); body.appendChild(wrap); setTimeout(() => hint('bank'), 400);
  ctx.onCleanup(liveRender(wrap, () => { wrap.innerHTML = ''; draw(wrap); }, (fn) => game.onChange(fn), body));
}
function draw(el) {
  const s = game.state; const t = now(); const X = BK.bank(s);
  el.appendChild(h('div', 'sum-card', `<div><small>征信</small><b class="${X.credit === 'good' ? 'pos' : 'neg'}">${BK.CREDIT_NAME[X.credit].split('（')[0]}</b></div>
    <div><small>存款</small><b>${fmtMoney(BK.depositTotal(s))}</b></div><div><small>贷款余额</small><b class="neg">${fmtMoney(BK.loanDebt(s))}</b></div>
    <div><small>每月要还</small><b>${fmtMoney(BK.monthlyDue(s))}</b></div>`));
  el.appendChild(h('div', 'tr-gain', `银行只借给公司：钱进公司账户，专款专用（贷款资金限用途 <b>${fmtMoney(X.restricted)}</b>，先花在产业经营上，不能拿地、不能分红）。个人买东西一律不能贷款。银行看的年营收 ${fmtMoney(BK.annualRevenue(s))}，经营贷还能贷 ${fmtMoney(BK.bizLimit(s))}。`));
  const tier = PL.privateTier(s); const PV = C.private; if (tier) hintLater('privatebank');
  el.appendChild(h('div', 'tr-course pv-card', `<div style="flex:1"><b>私人银行 ${tier ? `· ${PV[tier].name}客户` : '· 还不是'}</b><div class="tr-gain">金融资产（存款 + 股票 + 基金）${fmtMoney(PL.finAssets(s))}。${PV.zhaoshang.name} ≥ ${fmtMoney(PV.zhaoshang.min)}、${PV.ruixin.name} ≥ ${fmtMoney(PV.ruixin.min)}：那家存款高一档、贷款低一档，拍卖会和限量车优先（人脉 +${PV.network}）${tier ? `；专属：${PV[tier].manager}` : ''}。</div></div>`));
  // 我的贷款
  el.appendChild(h('div', 'sd-rec-title', '我的贷款'));
  for (const a of X.apps.filter((x) => x.status !== 'done')) el.appendChild(h('div', 'tr-course', `<div><b>${C.banks[a.bank].name} · ${a.type === 'dev' ? '开发贷' : '经营贷'} ${fmtMoney(a.amount)}</b><div class="tr-gain">${a.status === 'pending' ? `审批中，还要 ${fmtDuration(Math.max(0, (a.at - t) / 1000))}` : '批了，去消息中心「请示」签合同'}</div></div>`));
  for (const l of X.loans) {
    const c = h('div', 'tr-course', `${logo(l.bank)}<div style="flex:1"><b>${C.banks[l.bank].name} · ${BK.LOAN_NAME[l.type] || '贷款'}</b><div class="tr-gain">本金余额 ${fmtMoney(l.principal)} / ${fmtMoney(l.amount)} · 年利率 ${pct(l.rate)}${rn(l.rate)} · ${loanTail(s, l, t)}${l.overdue ? `<br><span class="neg">逾期 ${l.overdue} 期</span>` : ''}</div></div><button class="btn rp">提前还清</button>`);
    c.querySelector('.rp').onclick = async () => { if (!(await confirmBox({ body: `从公司账户还 ${fmtMoney(l.principal)}？`, title: '提前还贷', ok: '还清' }))) return; const r = BK.repay(s, l.id, now()); toast(r.ok ? '还清了' : r.why); game.changed(); game.save(); };
    el.appendChild(c);
  }
  if (!X.loans.length && !X.apps.some((x) => x.status !== 'done')) el.appendChild(h('div', 'tr-gain', '没有贷款'));
  // 我的存款
  el.appendChild(h('div', 'sd-rec-title', '我的存款'));
  for (const d of X.deposits) {
    const c = h('div', 'tr-course', `${logo(d.bank)}<div style="flex:1"><b>${C.deposits[d.kind].name} ${fmtMoney(d.amount)}</b><div class="tr-gain">${d.wallet === 'company' ? '公司' : '个人'} · 年利率 ${pct(d.rate)}${rn(d.rate)} · 利息到现在 ${fmtMoney(BK.interestOf(d, t))}${d.end ? `<br>${t < d.end ? `还有 ${fmtDuration((d.end - t) / 1000)} 到期（提前取按活期）` : '到期了'}` : ''}</div></div><button class="btn wd">取出</button>`);
    c.querySelector('.wd').onclick = () => { const r = BK.withdraw(s, d.id, now()); toast(r.ok ? `取出来了，利息 ${fmtMoney(r.interest)}${r.early ? '（提前支取按活期）' : ''}` : r.why); game.changed(); game.save(); };
    el.appendChild(c);
  }
  if (!X.deposits.length) el.appendChild(h('div', 'tr-gain', '没有存款'));
  // 银行
  el.appendChild(h('div', 'sd-rec-title', '银行'));
  for (const k of Object.keys(C.banks)) {
    const K = C.banks[k];
    const c = h('div', 'tr-course', `${logo(k)}<div style="flex:1"><b>${K.name}</b>${BK.isPrivateAt(s, k) ? ' <span class="pv-tag">私行客户</span>' : ''}<div class="tr-gain">${K.note}<br>经营贷 ${pct(BK.rateFor(s, k, 'biz', 1))} 起${K.noDev ? '' : ` · 开发贷 ${pct(BK.rateFor(s, k, 'dev'))}`}<br><small class="rate-note">游戏年利率；现实 ${pct(BK.rateFor(s, k, 'biz', 1) / PM)} × 赚钱倍数 ${PM}</small></div></div><div class="ind-btns" style="flex-direction:column"><button class="btn dp">存款</button><button class="btn gold ln">贷款</button>${C.stockPledge.banks.includes(k) ? '<button class="btn sp">股票质押</button>' : ''}${C.artPledge.banks.includes(k) ? '<button class="btn ap">艺术品质押</button>' : ''}</div>`);
    c.querySelector('.dp').onclick = () => openDeposit(k); c.querySelector('.ln').onclick = () => openLoan(k);
    if (c.querySelector('.sp')) c.querySelector('.sp').onclick = () => openStockPledge(k); if (c.querySelector('.ap')) c.querySelector('.ap').onclick = () => openArtPledge(k);
    el.appendChild(c);
  }
}
function loanTail(s, l, t) {
  if (l.type === 'dev') return `每月付息约 ${fmtMoney(l.principal * l.rate / 12)}，预售先还本`;
  if (!l.collateral) return `月供 ${fmtMoney(l.payment)}，还剩 ${l.left} 期`;
  const tail = `每月付息约 ${fmtMoney(l.principal * l.rate / 12)}，${t < l.end ? `还有 ${fmtDuration((l.end - t) / 1000)} 到期还本` : '到期了'}`;
  if (l.collateral.kind === 'art') { const it = AQ.pieces(s).find((x) => x.uid === l.collateral.uid); return `质押：${it ? AQ.AQ[it.id].name : '藏品'}<br>${tail}`; }
  const cv = PL.coverOf(s, l); const cls = cv <= C.stockPledge.warn ? 'neg' : 'pos';
  return `质押：${l.collateral.kind === 'own' ? `自己公司 ${+(l.collateral.pct * 100).toFixed(2)}% 股份` : `${SK.BY[l.collateral.code].name} ${l.collateral.n} 股`} · 履约保障比例 <b class="${cls}">${Math.round(cv * 100)}%</b>（${C.stockPledge.warn * 100}% 预警、${C.stockPledge.liquidate * 100}% 平仓）<br>${tail}`;
}
function openDeposit(bk) {
  const p = openPanel(`${C.banks[bk].name} · 存款`); const o = { kind: 't1y', wallet: 'personal', amount: 1e6 };
  const render = () => {
    const s = game.state; const why = BK.whyNotDeposit(s, bk, o.kind, o.wallet, o.amount);
    p.body.innerHTML = `<div class="sd-rec-title">从哪个钱包</div><div class="tabs"><button class="tab ${o.wallet === 'personal' ? 'on' : ''}" data-w="personal">个人现金 ${fmtMoney(s.cash)}</button><button class="tab ${o.wallet === 'company' ? 'on' : ''}" data-w="company">公司账户 ${fmtMoney(s.company)}</button></div>
      <div class="sd-rec-title">种类</div><div class="tabs">${Object.entries(C.deposits).map(([k, d]) => `<button class="tab ${o.kind === k ? 'on' : ''}" data-k="${k}">${d.name} ${pct(BK.depRate(bk, k))}</button>`).join('')}</div><small class="rate-note">都是游戏年利率；现实 ${pct(BK.depRate(bk, o.kind) / PM)} × 赚钱倍数 ${PM}</small>
      <div class="sd-rec-title">金额（元）</div><input class="amt" type="number" min="0" step="10000" value="${o.amount}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #34425c;background:#18223a;color:var(--paper);font-size:16px">
      <div class="rate">${why ? `<span class="sc-cond">${why}</span>` : `存 ${fmtMoney(o.amount)}，${C.deposits[o.kind].months ? `${C.deposits[o.kind].months} 个游戏月到期自动连本带息回来` : '随时取'}；储蓄存款利息免个税`}</div><button class="btn gold big go" ${why ? 'disabled' : ''}>存进去</button>`;
    p.body.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { o.wallet = b.dataset.w; render(); }));
    p.body.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { o.kind = b.dataset.k; render(); }));
    const a = p.body.querySelector('.amt'); a.onchange = () => { o.amount = Math.floor(+a.value || 0); render(); };
    p.body.querySelector('.go').onclick = () => { const r = BK.deposit(s, bk, o.kind, o.wallet, o.amount, now()); if (!r.ok) { toast(r.why); return; } toast('存好了'); game.changed(); game.save(); p.close(); };
  };
  render();
}
function openLoan(bk) {
  const p = openPanel(`${C.banks[bk].name} · 贷款`); const s0 = game.state;
  const projs = () => RE.re(game.state).projects.filter((x) => ['ready', 'build'].includes(x.stage));
  const o = { bank: bk, type: 'biz', years: 1, amount: Math.max(1e5, Math.floor(BK.bizLimit(s0) / 1e4) * 1e4), project: (projs()[0] || {}).id };
  const render = () => {
    const s = game.state; if (o.type === 'dev' && !o.project) o.project = (projs()[0] || {}).id; if (o.type === 'dev') hintLater('devloan');
    const why = BK.whyNotLoan(s, o); const rate = BK.rateFor(s, bk, o.type, o.years); const pr = projs().find((x) => x.id === o.project);
    p.body.innerHTML = `<div class="tabs"><button class="tab ${o.type === 'biz' ? 'on' : ''}" data-t="biz">经营贷</button>${C.banks[bk].noDev ? '' : `<button class="tab ${o.type === 'dev' ? 'on' : ''}" data-t="dev">开发贷（地产）</button>`}</div>
      ${o.type === 'biz' ? `<div class="tr-gain">额度约年营收 30%，还能贷 ${fmtMoney(BK.bizLimit(s))}；钱只能用在产业经营上（受托支付）；每月等额本息；负债率（每月要还 ÷ 月收入）超过 50% 不批。</div>
        <div class="sd-rec-title">期限</div><div class="tabs">${C.biz.years.map((y) => `<button class="tab ${o.years === y ? 'on' : ''}" data-y="${y}">${y} 年 ${pct(BK.rateFor(s, bk, 'biz', y))}</button>`).join('')}</div>`
      : `<div class="tr-gain">四证齐了才能贷；最多项目总投资 50%，自有资金要 ≥ 30%；土地和在建工程抵押；预售款进监管账户先还贷，交房还清。拿地的钱不能贷。</div>
        <div class="sd-rec-title">项目</div><div class="tabs">${projs().map((x) => `<button class="tab ${o.project === x.id ? 'on' : ''}" data-p="${x.id}">${x.name}（最多 ${fmtMoney(BK.devLimit(s, x))}）</button>`).join('') || '<span class="tr-gain">没有四证齐全的项目</span>'}</div>`}
      <div class="sd-rec-title">金额（元）</div><input class="amt" type="number" min="0" step="100000" value="${o.amount}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #34425c;background:#18223a;color:var(--paper);font-size:16px">
      <div class="rate">年利率 ${pct(rate)}${rn(rate)}（征信${BK.CREDIT_NAME[BK.bank(s).credit].split('（')[0]}${s.positions && s.positions.biz ? '，商务总监谈低了 0.25%' : ''}）${o.type === 'biz' ? `，月供 ${fmtMoney(BK.monthlyPay(o.amount, rate, o.years * 12))}` : `，每月付息约 ${fmtMoney(o.amount * rate / 12)}`}${why ? `<br><span class="sc-cond">${why}</span>` : ''}</div>
      <button class="btn gold big go" ${why ? 'disabled' : ''}>提交申请（马上出结果）</button>`;
    p.body.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { o.type = b.dataset.t; if (o.type === 'dev' && pr) o.amount = BK.devLimit(s, pr); render(); }));
    p.body.querySelectorAll('[data-y]').forEach((b) => (b.onclick = () => { o.years = +b.dataset.y; render(); }));
    p.body.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { o.project = +b.dataset.p; render(); }));
    const a = p.body.querySelector('.amt'); a.onchange = () => { o.amount = Math.floor(+a.value || 0); render(); };
    p.body.querySelector('.go').onclick = () => { const r = BK.applyLoan(s, { ...o }, now()); if (!r.ok) { toast(r.why); return; } toast('申请交了，等银行审批'); game.changed(); game.save(); p.close(); };
  };
  render();
}

/** 股票质押：个人的股票押给银行，钱借给公司 */
function openStockPledge(bk) {
  const p = openPanel(`${C.banks[bk].name} · 股票质押`); hintLater('stockpledge'); const SP = C.stockPledge; const o = { code: null, n: 0 };
  const render = () => {
    const s = game.state; const hs = SK.holdings(s).filter((x) => PL.freeShares(s, x.code) > 0); const own = PL.freeOwn(s) > 1e-6; const OWN = '__own';
    if (!o.code || (o.code === OWN ? !own : !hs.some((x) => x.code === o.code))) { o.code = own ? OWN : (hs[0] || {}).code || null; o.n = o.code === OWN ? +(PL.freeOwn(s) * 100).toFixed(2) : o.code ? PL.freeShares(s, o.code) : 0; }
    const isOwn = o.code === OWN; const k = isOwn ? PL.ownRatio(s) : PL.stockRatio();
    const why = isOwn ? PL.whyNotOwnPledge(s, bk, o.n / 100) : o.code ? PL.whyNotStockPledge(s, bk, o.code, o.n) : '没有可以押的股票（先去股票买）';
    const val = isOwn ? LS.marketCap(s) * o.n / 100 : o.code ? SK.price(s, o.code) * o.n : 0; const amt = Math.floor(val * k); const rate = BK.rateFor(s, bk, 'stock');
    p.body.innerHTML = `<div class="tr-gain">个人的股票押给银行，钱借给<b>公司</b>（专款专用）。质押率 ${SP.ratio * 100}%（上市后自己公司的股 ${SP.ownRatio.map((x) => x * 100).join('～')}%）；按月付息、${SP.years} 个游戏年到期还本。股价跌到履约保障比例 ${SP.warn * 100}% 预警，${SP.liquidate * 100}% 银行强制平仓。押着的股不能卖。</div>
      <div class="sd-rec-title">押哪只</div><div class="tabs">${own ? `<button class="tab ${isOwn ? 'on' : ''}" data-c="${OWN}">自己公司 ${s.listing.listed.name} ${+(PL.freeOwn(s) * 100).toFixed(2)}%</button>` : ''}${hs.map((x) => `<button class="tab ${o.code === x.code ? 'on' : ''}" data-c="${x.code}">${SK.BY[x.code].name} ${PL.freeShares(s, x.code)} 股</button>`).join('') || (own ? '' : '<span class="tr-gain">没有没押的股票</span>')}</div>
      <div class="sd-rec-title">${isOwn ? '押多少（占总股本 %）' : '押多少股'}</div><input class="amt" type="number" min="0" step="${isOwn ? 0.1 : 100}" value="${o.n}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #34425c;background:#18223a;color:var(--paper);font-size:16px">
      <div class="rate">市值 ${fmtMoney(val)} × ${Math.round(k * 100)}%${isOwn ? '（自己公司：市值 100 亿以上 50%，以下 30%）' : ''} = 借 <b>${fmtMoney(amt)}</b>；年利率 ${pct(rate)}${rn(rate)}，每月付息约 ${fmtMoney(amt * rate / 12)}${why ? `<br><span class="sc-cond">${why}</span>` : ''}</div>
      <button class="btn gold big go" ${why ? 'disabled' : ''}>签《股票质押合同》，放款</button>`;
    p.body.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { o.code = b.dataset.c; o.n = o.code === OWN ? +(PL.freeOwn(game.state) * 100).toFixed(2) : PL.freeShares(game.state, o.code); render(); }));
    const a = p.body.querySelector('.amt'); a.onchange = () => { o.n = o.code === OWN ? Math.max(0, +a.value || 0) : Math.floor(+a.value || 0); render(); };
    p.body.querySelector('.go').onclick = () => { const r = o.code === OWN ? PL.pledgeOwn(s, bk, o.n / 100, now()) : PL.pledgeStock(s, bk, o.code, o.n, now()); if (!r.ok) { toast(r.why); return; } toast(`放款 ${fmtMoney(r.amount)}，进公司账户`); game.changed(); game.save(); p.close(); };
  };
  render();
}
/** 艺术品质押：只有瑞鑫私行；孤品 50%、其他 40% */
function openArtPledge(bk) {
  const p = openPanel(`${C.banks[bk].name} · 艺术品质押`); hintLater('artpledge'); const AP = C.artPledge;
  const render = () => {
    const s = game.state; const items = AQ.pieces(s); const rate = BK.rateFor(s, bk, 'art');
    p.body.innerHTML = `<div class="tr-gain">藏品押给瑞鑫私行，按银行估值借 ${AP.ratio.map((x) => x * 100).join('～')}%（孤品 ${AP.ratio[1] * 100}%），钱借给公司（专款专用）。年利率 ${pct(rate)}${rn(rate)}，按月付息、${AP.years} 个游戏年到期还本。押着期间不能卖、不能借展；还不上银行送拍。</div>
      ${items.map((it) => { const why = PL.whyNotArtPledge(s, bk, it.uid); return `<div class="tr-course"><div style="flex:1"><b>${AQ.AQ[it.id].name}${AQ.AQ[it.id].limit === 1 ? ' · 孤品' : ''}</b><div class="tr-gain">估值 ${fmtMoney(it.est)} → 可借 ${fmtMoney(Math.floor(it.est * PL.artRatio(it)))}${why ? `<br><span class="sc-cond">${why}</span>` : ''}</div></div><button class="btn gold pa" data-u="${it.uid}" ${why ? 'disabled' : ''}>质押</button></div>`; }).join('') || '<div class="tr-gain">没有藏品（先去古董买）</div>'}`;
    p.body.querySelectorAll('.pa').forEach((b) => (b.onclick = () => { const r = PL.pledgeArt(s, bk, +b.dataset.u, now()); if (!r.ok) { toast(r.why); return; } toast(`放款 ${fmtMoney(r.amount)}，进公司账户`); game.changed(); game.save(); render(); }));
  };
  render();
}
