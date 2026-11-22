// 地产详情（公司 → 产业 → 地产，全屏）：土地市场 | 我的项目 | 持有物业；举牌在底部抽屉
import * as RE from '../core/realestate.js?v=1236a42d';
import * as ST from '../core/staff.js?v=1236a42d';
import * as PO from '../core/posts.js?v=1236a42d';
import { SEC_BY_ID } from '../config/secretaries.js?v=1236a42d';
import { fmtMoney, fmtDuration } from '../core/format.js?v=1236a42d';
import { now } from '../core/clock.js?v=1236a42d';
import { game } from '../game.js?v=1236a42d';
import { h, openPanel, toast, liveRender } from './dom.js?v=1236a42d';
import { openFull } from './shell.js?v=1236a42d';
import { openHire, cityRows, bindCityRows } from './company.js?v=1236a42d';
import { openPost } from './posts.js?v=1236a42d';
import { asset, hasAsset } from '../platform/assets.js?v=1236a42d';
import { MONTH_MS } from '../core/gametime.js?v=1236a42d';
import { gm } from '../core/calib.js?v=1236a42d';
import { hint } from './guide.js?v=1236a42d';
import { hintLater } from './guide2.js?v=1236a42d';

const C = RE.RE_CFG;
const city = (k) => C.cities[k].name;
const wan = (x) => fmtMoney(x);
let seg = 'market'; let citiesOpen = false;

export function openRealEstate() {
  const p = openFull('地产');
  const bar = h('div', 'seg-bar'); const body = h('div', 'page-body');
  p.body.append(bar, body);
  const draw = () => {
    const s = game.state; const t = now(); RE.refreshMarket(s, t);
    bar.innerHTML = '';
    for (const [k, name] of [['market', '土地市场'], ['projects', '我的项目'], ['held', '持有物业']]) {
      const n = k === 'projects' ? RE.activeProjects(s).length : k === 'held' ? RE.re(s).projects.filter((x) => x.stage === 'held').length : RE.re(s).listings.filter((l) => l.status === 'open').length;
      const b = h('button', 'seg' + (k === seg ? ' on' : ''), `${name}${n ? ` <i class="segn">${n}</i>` : ''}`); b.onclick = () => { seg = k; draw(); }; bar.appendChild(b);
    }
    body.innerHTML = '';
    summary(body, s, t);
    if (seg === 'market') market(body, s, t); else if (seg === 'projects') projects(body, s, t); else held(body, s, t);
  };
  liveRender(body, draw, (fn) => game.onChange(fn));
  setTimeout(() => hint('realestate'), 400);
}

function summary(body, s, t) {
  const R = RE.re(s); const H = RE.heatOf(s); const act = RE.activeProjects(s);
  const esc = act.reduce((a, p) => a + p.escrow, 0);
  const mgr = PO.holder(s, 'manager_realestate');
  body.appendChild(h('div', 'sum-card', `<div><small>楼市</small><b class="${R.heat === 'hot' ? 'pos' : R.heat === 'cold' ? 'neg' : ''}">${H.name}</b></div>
    <div><small>在做项目</small><b>${act.length} / ${RE.maxProjects(s)}</b></div>
    <div><small>监管账户</small><b>${wan(esc)}</b></div>
    <div><small>项目公司在岗</small><b class="${ST.staffFactor(s, 'realestate') < 1 ? 'neg' : ''}">${ST.onDuty(s, 'realestate')} / ${ST.estTotal(s, 'realestate')}</b></div>`));
  const row = h('div', 'ind-btns');
  row.innerHTML = `<button class="btn mgr">地产经理：${PO.isSec(mgr) ? SEC_BY_ID[mgr].name : mgr ? '职业经理人' : '空缺'} ›</button><button class="btn hire">招聘${Object.keys(ST.shortage(s, 'realestate')).length ? '（缺人）' : ''}</button>`;
  row.querySelector('.mgr').onclick = () => openPost('manager_realestate');
  row.querySelector('.hire').onclick = () => openHire('realestate');
  body.appendChild(row);
  cityRows.ind = null; { const c = h('details', 'cities', `<summary class="tr-gain">城市分公司（${Object.keys(s.cities || {}).length}/4）：要在哪个城市拿地，先注册那里的分公司 ›</summary>${cityRows(s, null)}`); c.open = citiesOpen; c.ontoggle = () => { citiesOpen = c.open; }; bindCityRows(c, s, null, () => {}); body.appendChild(c); }
  body.appendChild(h('div', 'tr-gain', `去化率 = 楼市 ${Math.round(H.sell * 100)}% × 在岗 × 经理加成，现在约 <b>${Math.round(RE.sellRate(s) * 100)}%</b>。每个在做的项目一套班子（项目经理 1、工程 5、置业顾问 8、财务 2）；施工外包给总包，算成本不算员工。`));
}

const imgOf = (type) => { const k = `assets/ind/ind_realestate_${type === 'residential' ? 1 : 2}.webp`; return hasAsset(k) ? `<img class="ind-img" src="${asset(k)}" alt="">` : `<div class="ind-img ph">${C.types[type].name}</div>`; };

function market(body, s, t) {
  const R = RE.re(s); const open = R.listings.filter((l) => l.status === 'open');
  body.appendChild(h('div', 'tr-gain', `每个游戏月挂一批地（下一批 ${fmtDuration(((R.listMonth + 1) * MONTH_MS + s.createdAt - t) / 1000)} 后）。挂牌竞价：起拍价报名，别的开发商会举牌，最多 3 轮。<b>土地款只能用自有资金</b>（公司账户），成交另付契税 3% + 印花税。`));
  if (!open.length) body.appendChild(h('div', 'empty', '这个月的地都挂完了'));
  for (const l of open) {
    const T = C.types[l.type];
    const c = h('button', 'ind-card line', `${imgOf(l.type)}<div class="ind-info"><div class="ind-name">${city(l.city)} · ${l.district}<small>${T.name}</small></div>
      <div class="ind-line">${T.use} ${l.landArea.toLocaleString()} ㎡ · 容积率 ${l.far} · 可建 ${l.gfa.toLocaleString()} ㎡</div>
      <div class="ind-line">起拍楼面价 ${l.floorPrice.toLocaleString()} 元/㎡ · 起拍 ${wan(l.start)}</div>
      <div class="ind-line">${l.leader === 'npc' ? `<span class="neg">${l.npcName} 举牌 ${wan(l.cur)}</span>` : l.leader === 'me' ? `<span class="pos">你最高 ${wan(l.cur)}</span>` : '还没人报名'}</div></div>`);
    c.onclick = () => openBid(l.id);
    body.appendChild(c);
  }
}

function openBid(id) {
  const p = openPanel('挂牌竞价'); hintLater('land');
  const render = () => {
    const s = game.state; const l = RE.re(s).listings.find((x) => x.id === id);
    if (!l || l.status !== 'open') { p.close(); return; }
    const T = C.types[l.type]; const first = l.leader == null;
    const opts = first ? [[0, `按起拍价报名 ${wan(l.start)}`]] : C.market.raiseStep.map((k) => [k, `加价 ${Math.round(k * 100)}%：${wan(Math.round(l.cur * (1 + k)))}`]);
    const est = RE.priceOf(s, { floorPrice: l.floorPrice, type: l.type });
    p.body.innerHTML = `<div class="tr-gain">${city(l.city)} ${l.district} · ${T.name} · 可建 ${l.gfa.toLocaleString()} ㎡　预计售价约 ${est.toLocaleString()} 元/㎡，建安 ${T.buildCost} 元/㎡</div>
      <div class="sum-card"><div><small>现在最高</small><b>${l.leader ? wan(l.cur) : '—'}</b></div><div><small>谁</small><b>${l.leader === 'npc' ? l.npcName : l.leader === 'me' ? '你' : '没人'}</b></div>
      <div><small>折合楼面价</small><b>${Math.round(l.cur / l.gfa).toLocaleString()}</b></div><div><small>别人还能举几次</small><b>${C.market.npcRounds - l.npcRaises}</b></div></div>
      ${opts.map(([k, label]) => { const price = first ? l.start : Math.round(l.cur * (1 + k)); const why = RE.whyNotBid(s, l, price, now()); return `<button class="tr-course go" data-k="${k}" ${why ? 'disabled' : ''}><div><b>${label}</b><div class="tr-gain">${why || `成交要付 ${wan(RE.landTotal(price))}（含契税 3%、印花税）`}</div></div></button>`; }).join('')}
      ${l.leader === 'npc' ? '<button class="btn quit" style="width:100%;margin-top:6px">不跟了</button>' : ''}`;
    p.body.querySelectorAll('.go').forEach((b) => (b.onclick = () => {
      const r = RE.bid(game.state, id, +b.dataset.k, now());
      if (!r.ok) { toast(r.why); return; }
      if (r.won) { toast(`拿下了！${r.project.name}，去办四证（${gm(C.time.permit)} 个游戏月）`, 3000, { top: true }); seg = 'projects'; game.changed(); game.save(); p.close(); return; }
      toast(`${l.npcName} 跟了：${wan(r.npc)}`); game.changed(); game.save(); render();
    }));
    const q = p.body.querySelector('.quit'); if (q) q.onclick = () => { RE.giveUp(game.state, id); toast(`这块地给了${l.npcName}`); game.changed(); p.close(); };
  };
  render();
}

const bar = (f) => `<div class="bar" style="margin-top:4px"><i style="width:${Math.max(0, Math.min(100, f * 100))}%"></i></div>`;
function projects(body, s, t) {
  const list = RE.re(s).projects.filter((p) => p.stage !== 'held').slice().reverse();
  if (!list.length) body.appendChild(h('div', 'empty', '还没有项目，去「土地市场」拿地'));
  for (const p of list) {
    const T = C.types[p.type]; const left = p.at ? Math.max(0, (p.at - t) / 1000) : 0;
    const bm = RE.buildMonths(p) * MONTH_MS; const prog = p.stage === 'build' && p.buildEnd ? 1 - (p.buildEnd - t) / bm : null; // 建设进度
    let act = '';
    if (p.stage === 'ready') { const why = RE.whyNotStart(s, p); act = `<button class="btn gold start" ${why ? 'disabled' : ''}>开工（总包预付 50%：${wan(Math.round(p.build * C.buildPrepay))}）</button>${why ? `<div class="sc-cond">${why}</div>` : ''}`; }
    if (p.stage === 'built') act = `<div class="ind-btns"><button class="btn gold sell">开盘卖掉</button><button class="btn hold">自己持有收租（估值 ${wan(RE.totalInvest(p) * C.hold.valueK)}）</button></div>`;
    const R = p.result;
    const c = h('div', 'ind-card', `${imgOf(p.type)}<div class="ind-info"><div class="ind-name">${p.name}<small>${city(p.city)} · ${T.name} · ${p.gfa.toLocaleString()} ㎡</small></div>
      <div class="ind-line"><b>${RE.STAGE[p.stage]}</b>${p.stage === 'presale' || (p.stage === 'build' && p.batch) ? `（已开盘 ${p.batch}/${C.batches} 批）` : ''}${left ? `　下一步还剩 ${(left * 1000 / MONTH_MS).toFixed(1)} 个游戏月（${fmtDuration(left)}）` : ''}</div>${prog != null ? bar(Math.max(0, Math.min(1, prog))) : ''}
      <div class="ind-line">总投资 ${wan(RE.totalInvest(p))}（地 ${wan(p.land)} + 建安 ${wan(p.build)}）</div>
      ${p.batch ? `<div class="ind-line">已售 ${p.sold.toLocaleString()} / ${p.gfa.toLocaleString()} ㎡ · 回款 ${wan(p.received)} · 监管 ${wan(p.escrow)}</div><div class="tr-gain">${p.batches.map((b, i) => `第${i + 1}批 ${b.area.toLocaleString()} ㎡ × ${b.price.toLocaleString()}（去化 ${Math.round(b.rate * 100)}%）`).join('；')}${p.tail ? `；尾盘特价 ${p.tail.area.toLocaleString()} ㎡ × ${p.tail.price.toLocaleString()}` : ''}</div>` : ''}
      ${R ? `<div class="tr-gain">清算：销售额 ${wan(R.sales)}，增值税 ${wan(R.vat)}，附加 ${wan(R.surcharge)}，土地增值税 ${R.latExempt ? '免征（普通住宅增值率 ≤ 20%，预征的退回）' : `${wan(R.lat)}（增值率 ${Math.round(R.latRatio * 100)}%，税率 ${Math.round(R.latRate * 100)}%）`}，所得税约 ${wan(R.citEst)}（进本季度）<br><b class="${R.net >= 0 ? 'pos' : 'neg'}">净赚约 ${wan(R.net)}（${(R.net / R.sales * 100).toFixed(1)}%）</b></div>` : ''}
      ${act}</div>`);
    const st = c.querySelector('.start'); if (st) st.onclick = () => { const r = RE.startBuild(game.state, p.id, now()); if (!r.ok) toast(r.why); else { toast(`开工了，${RE.buildMonths(p)} 个游戏月竣工${C.types[p.type].canHold ? '' : `，满 ${gm(C.time.presaleFrom)} 个月开盘`}`); game.changed(); game.save(); } };
    const se = c.querySelector('.sell'); if (se) se.onclick = () => { RE.chooseHold(game.state, p.id, false, now()); game.changed(); game.save(); };
    const ho = c.querySelector('.hold'); if (ho) ho.onclick = () => { RE.chooseHold(game.state, p.id, true, now()); toast('转为持有，每个游戏月收租'); seg = 'held'; game.changed(); game.save(); };
    body.appendChild(c);
  }
}

function held(body, s) {
  const list = RE.re(s).projects.filter((p) => p.stage === 'held');
  body.appendChild(h('div', 'tr-gain', `商业综合体（企业家）竣工后可以不卖、自己持有：每个游戏月收租（年回报 ${C.hold.rentYield * 100}%），房产税按租金 12%，物业外包 10%；按估值算进身价。`));
  if (!list.length) body.appendChild(h('div', 'empty', '还没有持有的物业'));
  for (const p of list) {
    const rent = p.value * C.hold.rentYield / 12;
    body.appendChild(h('div', 'ind-card', `${imgOf(p.type)}<div class="ind-info"><div class="ind-name">${p.name}<small>${city(p.city)} · ${p.gfa.toLocaleString()} ㎡</small></div>
      <div class="ind-line">估值 ${wan(p.value)} · 月租 ${wan(rent)}</div><div class="ind-line">房产税 ${wan(rent * C.tax.propertyTaxRent)}/月 · 累计收租 ${wan(p.rentTotal || 0)}</div></div>`));
  }
}
