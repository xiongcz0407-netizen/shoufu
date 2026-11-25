// 「资产 → 码头」（第 2-11 项）：上展示（码头背景 + 最贵的那艘）下列表；点一艘 → 详情（参数、编号、税单、包租、卖回）；
// 「去买游艇」→ 船厂（现货 / 订单配额 / 邀请 / 定制委托）→ 合同 → 签字付款（合同 + 报关单 + 登记证书进档案柜）
import * as YT from '../core/yacht.js?v=4306ebaa';
import * as PW from '../core/postwork.js?v=4306ebaa';
import * as INB from '../core/inbox.js?v=4306ebaa';
import { fmtMoney, fmtDuration } from '../core/format.js?v=4306ebaa';
import { asset, hasAsset } from '../platform/assets.js?v=4306ebaa';
import { game } from '../game.js?v=4306ebaa';
import { now } from '../core/clock.js?v=4306ebaa';
import { h, openPanel, toast, liveRender } from './dom.js?v=4306ebaa';
import { openFull } from './shell.js?v=4306ebaa';
import { openContract } from './contract.js?v=4306ebaa';
import { nextContractNo } from '../core/contracts.js?v=4306ebaa';
import { showcase } from './assets.js?v=4306ebaa';
import * as BI from './brandinv.js?v=4306ebaa'; // 设计35 第九节 品牌邀请不过期

const TIER = ['', '入门', '中档', '高档', '顶级', '顶级'];
const imgPath = (y) => `assets/yacht/${y.id}.webp`;
const pic = (y, cls = 'as-img') => (hasAsset(imgPath(y)) ? `<img class="${cls}" src="${asset(imgPath(y))}" alt="">` : `<div class="${cls} as-ph">${y.brand}<small>${y.model}</small></div>`);
const RAR = { limited: ['badge_limited', '限量'], unique: ['badge_unique', '孤品'] };
function badges(y) {
  const r = YT.rarityOf(y); if (!RAR[r]) return '';
  const ic = `assets/ui/${RAR[r][0]}.webp`;
  return `<span class="badge ${r}">${hasAsset(ic) ? `<img src="${asset(ic)}" alt="">` : ''}${RAR[r][1]}<small>${y.limit === 1 ? '全球唯一' : `全球 ${y.limit} 艘`}</small></span>`;
}
const frame = (y) => 'fr-' + YT.rarityOf(y);
const noText = (y, m) => (m && m.no ? `No.${String(m.no).padStart(3, '0')} / ${y.limit} · ` : '');

/** 资产页「码头」这一格（ui/assets.js 调） */
export function renderYachtTab(wrap, redraw) {
  const s = game.state; const meta = s.garage.meta || {};
  const list = YT.mine(s).map((id) => YT.Y[id]).sort((a, b) => b.price - a.price);
  const stage = h('div', 'as-stage yacht');
  const bg = ['assets/bg/bg_marina.webp', 'assets/bg/bg_date_3.webp'].find(hasAsset);   // 码头背景没到之前用游艇约会的背景
  const bgPath = (y) => `assets/yachtbg/${y.id}.webp`; const full = list.length && hasAsset(bgPath(list[0]));   // 游艇图本来就带海面：有图就铺满展示区，没游艇才用码头背景
  if (full) { stage.classList.add('full'); stage.style.backgroundImage = `url("${asset(bgPath(list[0]))}")`; } else if (bg) stage.style.backgroundImage = `url("${asset(bg)}")`;
  stage.innerHTML = list.length ? `${full ? '' : `<div class="as-hero ${frame(list[0])}">${pic(list[0], 'as-hero-img')}</div>`}<div class="as-hero-name">${YT.label(list[0])} ${badges(list[0])}</div>` : '<div class="as-empty">码头还是空的</div>';
  if (list.length) stage.onclick = () => showcase(list[0]);
  wrap.appendChild(stage);
  if (list.length) wrap.appendChild(h('div', 'tr-gain', `游艇 ${list.length} 艘　每年维护托管 <b class="neg">${fmtMoney(YT.upkeepYearAll(s))}</b>　包租中 ${list.filter((y) => PW.isRented(s, y.id)).length} 艘`));
  const grid = h('div', 'as-grid');
  for (const y of list) {
    const c = h('button', 'as-card ' + frame(y), `${pic(y)}${badges(y)}<b>${YT.label(y)}</b><small>${noText(y, meta[y.id])}${y.len} 米 · 卖回 ${fmtMoney(YT.sellPrice(s, y.id))}</small>${PW.isRented(s, y.id) ? '<em class="rented">包租中</em>' : ''}`);
    c.onclick = () => openYacht(y.id, redraw);
    grid.appendChild(c);
  }
  wrap.appendChild(grid);
  const go = h('button', 'btn gold big', '去买游艇'); go.onclick = () => openYachtShop(redraw);
  wrap.appendChild(go);
}

/** 详情抽屉 */
function openYacht(id, done) {
  const s = game.state; const y = YT.Y[id];
  const p = openPanel(YT.label(y));
  const render = () => {
    const m = (s.garage.meta || {})[id] || {}; const rented = PW.isRented(s, id);
    p.body.innerHTML = `<div class="as-detail ${frame(y)}">${pic(y, 'as-hero-img')}</div><div class="as-badges">${badges(y)}${m.no ? `<b class="as-no">No.${String(m.no).padStart(3, '0')} / ${y.limit}</b>` : ''}</div>
      <div class="staff-tbl">
        <div><span>船厂</span><b>${y.brand}（${y.origin}）</b></div><div><span>长度 / 档次</span><b>${y.len} 米 · ${TIER[y.tier]}</b></div>${y.speed ? `<div><span>航速</span><b>约 ${y.speed} 节</b></div>` : ''}${y.noResale ? `<div><span>协议</span><b>不转卖</b></div>` : ''}
        <div><span>买入价</span><b>${fmtMoney(m.price || y.price)}</b></div><div><span>卖回价</span><b>${fmtMoney(YT.sellPrice(s, id))}</b></div>
        <div><span>每年维护托管</span><b>${fmtMoney(YT.upkeepYear(s, id))}</b></div><div><span>包租年收入</span><b>${fmtMoney(YT.charterYear(s, id))}</b></div>
        <div><span>合同</span><b>${m.contract || '—'}</b></div><div><span>报关单 / 登记证</span><b>${m.customs || '—'} / ${m.reg || '—'}</b></div>
      </div>
      ${y.noResale ? `<div class="tr-gain neg">签过不转卖协议：卖回就算违约，${y.brand}（车也一样）以后不再卖给你。</div>` : ''}<div class="tr-gain">维护、船员、泊位托管每年约船价 10%（有资产管家打折）；交给资产管家包租，每月收租金（代扣 20% 个税），包租中的游艇不能拿来约会。卖回按买价 70%（资产管家最高 80%），不交税。</div>
      <div class="ind-btns" style="margin-top:10px"><button class="btn rent">${rented ? '收回（包租中）' : '交给资产管家包租'}</button><button class="btn sell">卖回 ${fmtMoney(YT.sellPrice(s, id))}</button></div>`;
    p.body.querySelector('.rent').onclick = () => { const x = YT.setCharter(s, id, !rented); if (!x.ok) toast(x.why); game.changed(); game.save(); render(); };
    const sb = p.body.querySelector('.sell');
    sb.onclick = () => {
      if (sb.dataset.sure !== '1') { sb.dataset.sure = '1'; sb.textContent = y.noResale ? `签过不转卖协议：卖了${y.brand}会拉黑（车也买不了），确定？` : `确定卖回？拿 ${fmtMoney(YT.sellPrice(s, id))}`; return; }   // 点两下：确认一次
      const x = YT.sell(s, id, now()); if (!x.ok) { toast(x.why); return; }
      toast(`卖回 ${fmtMoney(x.amount)}${x.black ? `，${y.brand}把你拉黑了` : ''}`); game.changed(); game.save(); p.close(); done && done();
    };
  };
  render();
}

/** 船厂（全屏）：按渠道分段 */
export function openYachtShop(done) {
  const p = openFull('游艇');
  const segBar = h('div', 'seg-bar'); const body = h('div', 'page-body');
  p.body.append(segBar, body);
  const SEGS = Object.entries(YT.CH_NAME); let seg = 'spot';
  const draw = () => {
    const s = game.state; const t = now();
    segBar.innerHTML = ''; for (const [k, n] of SEGS) { const b = h('button', 'seg' + (k === seg ? ' on' : ''), n); b.onclick = () => { seg = k; body.scrollTop = 0; draw(); }; segBar.appendChild(b); }
    body.innerHTML = `<div class="tr-gain">个人现金 ${fmtMoney(s.cash)}；游艇只能个人现金全款，不能贷款。进口要交关税 10%、消费税 10%（8～90 米）、增值税 13%</div>`;
    const grid = h('div', 'as-grid shop');
    for (const y of YT.YACHTS.filter((x) => x.channel === seg)) {
      const own = YT.owns(s, y.id); const o = YT.orderOf(s, y.id); const why = own || o ? null : YT.whyNot(s, y.id, t, { forOrder: y.channel !== 'spot' }); const q = YT.quote(y.id);
      let act;
      if (own) act = '<em class="owned">已拥有</em>';
      else if (o) act = t >= o.at ? '<button class="btn gold buy">到了，签合同</button>' : `<button class="btn" disabled>${o.ch === 'invite' ? '等船厂来电' : o.ch === 'custom' ? '船厂审核委托' : '排队中'} 还剩 ${fmtDuration((o.at - t) / 1000)}</button>`;
      else if (why) act = `<div class="sc-cond">${why}</div>`;
      else if (y.channel === 'spot') act = '<button class="btn gold buy">签合同</button>';
      else act = `<button class="btn gold order two">${y.channel === 'invite' ? '登记，等邀请' : y.channel === 'custom' ? '提交定制委托' : `付定金 ${fmtMoney(y.price * YT.YCFG.orderDeposit)} 下单`}<small>立刻交付</small></button>`;
      const c = h('div', 'as-card ' + frame(y) + (why ? ' dim' : ''), `${pic(y)}${badges(y)}<b>${YT.label(y)}</b><small>${y.len} 米${y.speed ? ` · 约 ${y.speed} 节` : ''}　${fmtMoney(y.price)}　税费 ${fmtMoney(q.total - y.price)}${y.noResale ? '　签不转卖' : ''}</small>${act}`);
      const on = (sel, fn) => { const x = c.querySelector(sel); if (x) x.onclick = fn; };
      on('.buy', () => contractBuy(y, !!o, draw));
      on('.order', () => { const r = YT.placeOrder(s, y.id, now()); if (!r.ok) { toast(r.why); return; } toast(r.deposit ? `付了定金 ${fmtMoney(r.deposit)}，到时间来签合同付尾款` : '登记好了，到时间船厂会来电'); game.changed(); game.save(); draw(); });
      grid.appendChild(c);
    }
    body.appendChild(grid);
  };
  const off = liveRender(body, draw, (fn) => game.onChange(fn), body);
  const close0 = p.close; p.close = () => { off(); close0(); done && done(); };
}

/** 合同 → 签字 → 付款；签完合同、报关单、登记证书都进档案柜 */
function contractBuy(y, queued, done) {
  const s = game.state; const q = YT.quote(y.id); const o = queued ? YT.orderOf(s, y.id) : null; const dep = (o && o.deposit) || 0;
  const rows = dep ? [...q.rows, ['已付定金（抵船价）', -dep, '下单时付的 10%']] : q.rows;
  openContract({ title: y.channel === 'custom' ? '游艇定制委托协议' : '游艇买卖合同', no: nextContractNo(s, 'YT', now()), signer: s.bossName || '老板',
    parties: [['买方', s.bossName || '老板'], ['卖方', `${y.brand}船厂（${y.origin}）`]],
    subject: `${YT.label(y)}，船长 ${y.len} 米${y.limit === 1 ? '（全球唯一）' : y.limit ? `（全球限量 ${y.limit} 艘）` : ''}；进口报关、船舶登记由卖方协助办理`,
    rows, total: q.total - dep,
    terms: ['买方以个人现金一次性全款支付，本合同不涉及贷款、抵押。', ...(y.noResale ? [`不转卖协议：买方承诺不转卖本船；转卖视为违约，${y.brand}品牌（含汽车）不再向买方供货。`] : []), '游艇从原产国运抵上海港，进口关税、消费税、增值税由买方承担，海关出具进口货物报关单和完税凭证。', '交付后在上海海事局办理船舶所有权登记。', ...(y.channel === 'custom' ? ['定制工期内买方不得转让本协议。'] : [])],
    onSign: () => {
      const r = queued ? YT.buyQueued(s, y.id, now()) : YT.buy(s, y.id, now());
      if (!r.ok) { toast(r.why); return; }
      toast(`签好了：${r.contract.no}，报关单 ${r.customs.no}`); game.changed(); game.save(); showcase(y); done && done();
    } });
}

// 每秒：维护托管费、包租月结、排队到点进消息中心
game.addTicker((s) => {
  for (const x of YT.tick(s, now())) {
    if (typeof x === 'string') { toast(x, 2600); INB.addMsg(s, { kind: 'system', type: 'yacht', title: x, body: '资产 → 码头' }, now()); }
    else BI.notify(s, 'yacht', x.order, x.text, '去「资产 → 码头 → 去买游艇」签合同。'); // 设计35 第九节：不过期，签了才关
  }
});
