// 「资产 → 穿戴」+ 表行 / 定制店 + 商场「名包」（第 2-12 项）
// 穿戴：上展示戴着的表、穿着的西装；下两格「表柜 / 衣帽间」，点一件 → 详情（戴上 / 穿上、卖回、发票）
// 表行 / 定制店：按品牌分段，顶上写这个品牌的累计消费、配货额度（变差 / 拉黑的可以让商务总监去求情）
// 名包：在商场按秘书分页，买了直接送她（喜欢的牌子 ♥），走个人现金、出发票
import * as LX from '../core/luxury.js?v=701206f7';
import * as INB from '../core/inbox.js?v=701206f7';
import { SEC_BY_ID } from '../config/secretaries.js?v=701206f7';
import { fmtMoney, fmtDuration } from '../core/format.js?v=701206f7';
import { asset, hasAsset } from '../platform/assets.js?v=701206f7';
import { game } from '../game.js?v=701206f7';
import { now } from '../core/clock.js?v=701206f7';
import { h, openPanel, toast, liveRender } from './dom.js?v=701206f7';
import { openFull } from './shell.js?v=701206f7';
import { openContract } from './contract.js?v=701206f7';
import { nextContractNo } from '../core/contracts.js?v=701206f7';
import { say } from './main-screen.js?v=701206f7';
import * as A from '../core/affection.js?v=701206f7';
import * as BI from './brandinv.js?v=701206f7'; // 设计35 第九节 品牌邀请不过期

const imgOf = (x) => `assets/${x.kind}/${x.img || x.id}.webp`;
const pic = (x, cls = 'as-img') => (hasAsset(imgOf(x)) ? `<img class="${cls}" src="${asset(imgOf(x))}" alt="">` : `<div class="${cls} as-ph">${x.brand}<small>${x.model}</small></div>`);
const RAR = { limited: ['badge_limited', '限量'], unique: ['badge_unique', '孤品'] };
function badges(x) {
  const r = LX.rarityOf(x); let out = '';
  if (RAR[r]) { const ic = `assets/ui/${RAR[r][0]}.webp`; out += `<span class="badge ${r}">${hasAsset(ic) ? `<img src="${asset(ic)}" alt="">` : ''}${RAR[r][1]}<small>${x.limit === 1 ? '全球唯一' : `全球 ${x.limit} 只`}</small></span>`; }
  if (x.channel === 'auction') out += `<span class="badge auction">${hasAsset('assets/ui/badge_auction.webp') ? `<img src="${asset('assets/ui/badge_auction.webp')}" alt="">` : ''}拍卖</span>`;
  return out;
}
const frame = (x) => 'fr-' + (LX.rarityOf(x) === 'normal' ? (x.channel === 'auction' ? 'auction' : 'normal') : LX.rarityOf(x));
const sub = (x) => (x.modelEn && x.modelEn !== x.model ? `<small class="en">${x.modelEn}</small>` : '');
let curKind = 'watch';

/** 资产页「穿戴」这一格（ui/assets.js 调） */
export function renderWearTab(wrap, redraw) {
  const s = game.state; const w = LX.worn(s, 'watch'), su = LX.worn(s, 'suit');
  const stage = h('div', 'as-stage wear');
  if (hasAsset('assets/bg/bg_boutique.webp')) stage.style.backgroundImage = `url("${asset('assets/bg/bg_boutique.webp')}")`;
  stage.innerHTML = w || su ? `<div class="wear-pair">${w ? `<div class="as-hero ${frame(w)}">${pic(w, 'as-hero-img')}</div>` : ''}${su ? `<div class="as-hero ${frame(su)}">${pic(su, 'as-hero-img')}</div>` : ''}</div>
    <div class="as-hero-name">${w ? `戴着 ${LX.label(w)}` : '还没戴表'}${su ? `　穿着 ${LX.label(su)}` : ''}</div>` : '<div class="as-empty">还没有名表和西装</div>';
  wrap.appendChild(stage);
  const a = LX.attrs(s);
  wrap.appendChild(h('div', 'tr-gain', `名表和西装：气场 +${a.aura.toFixed(1)}${a.network ? `　人脉 +${a.network.toFixed(1)}（全定制西装）` : ''}　戴着的表、穿着的西装多加一半`));
  const tabs = h('div', 'tabs');
  for (const [k, n] of [['watch', `表柜 ${LX.mine(s, 'watch').length}`], ['suit', `衣帽间 ${LX.mine(s, 'suit').length}`]]) { const b = h('button', 'tab' + (k === curKind ? ' on' : ''), n); b.onclick = () => { curKind = k; redraw(); }; tabs.appendChild(b); }
  wrap.appendChild(tabs);
  const grid = h('div', 'as-grid');
  const list = LX.mine(s, curKind).map((id) => LX.L[id]).sort((p, q) => q.price - p.price);
  for (const x of list) {
    const m = s.lux.meta[x.id] || {}; const on = (LX.worn(s, x.kind) || {}).id === x.id;
    const c = h('button', 'as-card ' + frame(x), `${pic(x)}${badges(x)}<b>${LX.label(x)}</b>${sub(x)}<small>${m.no ? `No.${String(m.no).padStart(3, '0')} / ${x.limit} · ` : ''}卖回 ${fmtMoney(LX.sellPrice(s, x.id))}</small>${on ? `<em class="rented">${x.kind === 'watch' ? '戴着' : '穿着'}</em>` : ''}`);
    c.onclick = () => openItem(x.id, redraw);
    grid.appendChild(c);
  }
  if (!list.length) grid.appendChild(h('div', 'empty', curKind === 'watch' ? '表柜是空的' : '衣帽间是空的'));
  wrap.appendChild(grid);
  const go = h('button', 'btn gold big', curKind === 'watch' ? '去表行' : '去定制店'); go.onclick = () => openLuxShop(curKind, redraw);
  wrap.appendChild(go);
}

function openItem(id, done) {
  const s = game.state; const x = LX.L[id]; const p = openPanel(LX.label(x));
  const render = () => {
    const m = s.lux.meta[id] || {}; const on = (LX.worn(s, x.kind) || {}).id === id;
    p.body.innerHTML = `<div class="as-detail ${frame(x)}">${pic(x, 'as-hero-img')}</div><div class="as-badges">${badges(x)}${m.no ? `<b class="as-no">No.${String(m.no).padStart(3, '0')} / ${x.limit}</b>` : ''}</div>
      <div class="staff-tbl"><div><span>品牌</span><b>${x.brand}</b></div><div><span>型号</span><b>${x.model}${x.modelEn && x.modelEn !== x.model ? `（${x.modelEn}）` : ''}</b></div>
        <div><span>买入价</span><b>${fmtMoney(m.price || x.price)}</b></div><div><span>卖回价</span><b>${fmtMoney(LX.sellPrice(s, id))}</b></div>
        <div><span>怎么买的</span><b>${LX.CH_NAME[m.channel] || ''}</b></div><div><span>发票 / 协议</span><b>${m.inv || '—'}${m.contract ? ` / ${m.contract}` : ''}</b></div></div>
      <div class="tr-gain">卖回按买价 70%（有资产管家最高 80%），不交税。${m.channel === 'alloc' ? '<span class="neg">配货买的一个游戏月内卖掉，这个品牌以后配货要求变高一档。</span>' : ''}${m.channel === 'invite' || m.channel === 'custom' ? '<span class="neg">邀请 / 定制买的卖了，这个品牌会拉黑你。</span>' : ''}</div>
      <div class="ind-btns" style="margin-top:10px"><button class="btn wear" ${on ? 'disabled' : ''}>${on ? (x.kind === 'watch' ? '戴着呢' : '穿着呢') : x.kind === 'watch' ? '戴上' : '穿上'}</button><button class="btn sell">卖回 ${fmtMoney(LX.sellPrice(s, id))}</button></div>`;
    p.body.querySelector('.wear').onclick = () => { LX.wear(s, id); toast(x.kind === 'watch' ? `戴上了 ${LX.label(x)}` : `换上了 ${LX.label(x)}`); game.changed(); game.save(); render(); done && done(); };
    const sb = p.body.querySelector('.sell');
    sb.onclick = () => {
      if (sb.dataset.sure !== '1') { sb.dataset.sure = '1'; sb.textContent = `确定卖回？拿 ${fmtMoney(LX.sellPrice(s, id))}`; return; }
      const r = LX.sell(s, id, now()); if (!r.ok) { toast(r.why); return; }
      toast(`卖回 ${fmtMoney(r.amount)}${r.black ? `；${x.brand}把你拉黑了` : r.worse ? `；${x.brand}的配货要求变高了` : ''}`, 2600); game.changed(); game.save(); p.close(); done && done();
    };
  };
  render();
}

/** 品牌那一行：累计消费、配货额度、变差 / 拉黑 + 求情 */
function brandBar(s, kind, b, redraw) {
  const d = LX.lx(s); const x0 = [...LX.WATCHES, ...LX.SUITS, ...LX.BAGS].find((x) => x.brandKey === b);
  const bar = h('div', 'tr-course', `<div><b>${x0.brand}</b><div class="tr-gain">累计消费 ${fmtMoney(LX.spendOf(s, b))}　配货额度 ${fmtMoney(LX.quotaOf(s, b))}${LX.quotaMult(s) > 1 ? `（商务总监：攒得快 ×${LX.quotaMult(s).toFixed(2)}）` : ''}${d.black[b] ? '　<span class="neg">拉黑了</span>' : d.penalty[b] ? `　<span class="neg">配货要求 +${d.penalty[b]} 倍</span>` : ''}</div></div>${LX.canPlead(s, b) ? '<button class="btn">商务总监去求情</button>' : ''}`);
  const btn = bar.querySelector('.btn');
  if (btn) btn.onclick = () => { const r = LX.plead(s, b, now()); if (!r.ok) { toast(r.why); return; } toast(r.win ? `${SEC_BY_ID[r.who].name}谈下来了：${x0.brand}恢复正常供货` : `${SEC_BY_ID[r.who].name}没谈成（成功率 ${Math.round(r.chance * 100)}%），30 分钟后再去`, 2600); game.changed(); game.save(); redraw(); };
  return bar;
}

/** 表行 / 定制店（全屏）：按品牌分段 */
export function openLuxShop(kind, done) {
  const p = openFull(kind === 'watch' ? '表行' : '高定西装');
  const segBar = h('div', 'seg-bar'); const body = h('div', 'page-body'); p.body.append(segBar, body);
  const brands = LX.BRANDS(kind); let seg = brands[0][0];
  const draw = () => {
    const s = game.state; const t = now();
    segBar.innerHTML = ''; for (const [k, n] of brands) { const b = h('button', 'seg' + (k === seg ? ' on' : ''), n); b.onclick = () => { seg = k; body.scrollTop = 0; draw(); }; segBar.appendChild(b); }
    body.innerHTML = `<div class="tr-gain">个人现金 ${fmtMoney(s.cash)}；${kind === 'watch' ? '热门款要先在这个品牌买别的攒配货额度，买了扣掉' : '成衣现货；半定制量体当场做好；全定制每个品牌每天 1 个预约，量体后试两次衣（当场改好）'}</div>`;
    body.appendChild(brandBar(s, kind, seg, draw));
    const grid = h('div', 'as-grid shop');
    for (const x of (kind === 'watch' ? LX.WATCHES : LX.SUITS).filter((y) => y.brandKey === seg)) grid.appendChild(shopCard(s, x, t, draw, null));
    body.appendChild(grid);
  };
  const off = liveRender(body, draw, (fn) => game.onChange(fn), body);
  const close0 = p.close; p.close = () => { off(); close0(); done && done(); };
}

/** 一张商品卡（表、西装、包通用）；secId：包送给谁 */
function shopCard(s, x, t, draw, secId) {
  const own = x.kind !== 'bag' && LX.owns(s, x.id); const o = LX.orderOf(s, x.id);
  const why = own || o ? null : LX.whyNot(s, x.id, t, { forQueue: LX.queues(x) });
  let act;
  if (own) act = '<em class="owned">已拥有</em>';
  else if (o) act = LX.needFitting(s, x.id, t) ? '<button class="btn gold fit">去试第二次衣</button>' : LX.orderReady(s, x.id, t) ? `<button class="btn gold get">${x.kind === 'bag' ? `到了，送给${SEC_BY_ID[secId].name}` : '到了，付尾款'}</button>` : `<button class="btn" disabled>${o.ch === 'invite' ? '等品牌来电' : x.fittings ? (o.stage ? '第二次试衣' : '量体、第一次试衣') : o.ch === 'custom' ? '定制中' : '排队中'} 还剩 ${fmtDuration((o.at - t) / 1000)}</button>`;
  else if (why) act = `<div class="sc-cond">${why}</div>`;
  else if (x.channel === 'auction') act = '<button class="btn gold auc">去拍卖会</button>';
  else if (LX.queues(x)) act = `<button class="btn gold order two">${x.channel === 'invite' ? '登记，等邀请' : x.channel === 'custom' ? `${x.kind === 'suit' ? '预约量体' : '提交定制委托'}，付定金 ${fmtMoney(x.price * 0.3)}` : x.channel === 'alloc' ? '配货，排队' : x.kind === 'suit' ? '量体下单' : '下单排队'}<small>立刻交付</small></button>`;
  else act = `<button class="btn gold buy">${x.kind === 'bag' ? `买下送给${SEC_BY_ID[secId].name}` : '付款'}</button>`;
  let extra = '';
   // 设计56：名包改在商场「奢侈品」送（ui/gift.js openLux），这里不再显示好感
  const c = h('div', 'as-card ' + frame(x) + (why && !own && !o ? ' dim' : ''), `${pic(x)}${badges(x)}<b>${LX.label(x)}</b>${sub(x)}<small>${fmtMoney(x.price)}　${LX.CH_NAME[x.channel]}${x.quotaX ? `（额度 ${fmtMoney(LX.quotaNeed(s, x))}）` : ''}</small>${extra}${act}`);
  const on = (sel, fn) => { const y = c.querySelector(sel); if (y) y.onclick = fn; };
  on('.buy', () => (x.kind === 'bag' ? giveFlow(x, secId, false, draw) : invoiceBuy(x, draw)));
  on('.get', () => (x.kind === 'bag' ? giveFlow(x, secId, true, draw) : x.channel === 'custom' ? contractBuy(x, draw) : invoiceBuy(x, draw, true)));
  on('.fit', () => { const r = LX.nextFitting(s, x.id, now()); if (!r.ok) { toast(r.why); return; } toast('第二次试衣也好了，可以签了'); game.changed(); game.save(); draw(); });
  on('.order', () => { const r = LX.placeOrder(s, x.id, now()); if (!r.ok) { toast(r.why); return; } toast(r.deposit ? `付了定金 ${fmtMoney(r.deposit)}` : '登记好了，到时间会通知你'); game.changed(); game.save(); draw(); });
  on('.auc', () => openAuction(x, draw));
  return c;
}

/** 发票确认 → 付款 */
function invoiceBuy(x, done, queued = false) {
  const s = game.state; const r0 = LX.invoiceRows(x); const o = queued ? LX.orderOf(s, x.id) : null;
  const p = openPanel(`${x.brand} · 发票`);
  p.body.innerHTML = `<div class="contract small"><div class="ct-title">增值税普通发票</div><div class="ct-party"><span>销售方</span><b>${x.brand}${x.kind === 'suit' ? '定制店' : '专柜'}</b></div><div class="ct-party"><span>购买方</span><b>${s.bossName || '老板'}</b></div>
    <div class="ct-text">${LX.label(x)}${x.modelEn ? `（${x.modelEn}）` : ''} × 1</div>
    <table class="ct-tbl">${r0.rows.map(([k, v, n]) => `<tr><td>${k}${n ? `<small>${n}</small>` : ''}</td><td>${fmtMoney(v)}</td></tr>`).join('')}${o && o.deposit ? `<tr><td>已付定金</td><td>${fmtMoney(-o.deposit)}</td></tr>` : ''}<tr class="sum"><td>价税合计</td><td>${fmtMoney(x.price - ((o && o.deposit) || 0))}</td></tr></table></div>
    <button class="btn gold big">付款 ${fmtMoney(x.price - ((o && o.deposit) || 0))}</button>`;
  p.body.querySelector('.btn').onclick = () => {
    const r = queued ? LX.buyQueued(s, x.id, now()) : LX.buy(s, x.id, now());
    if (!r.ok) { toast(r.why); return; }
    p.close(); toast(`买好了：${r.invoice.no} 已收进档案柜${LX.worn(s, x.kind) && LX.worn(s, x.kind).id === x.id ? (x.kind === 'watch' ? '，戴上了' : '，穿上了') : ''}`, 2600); game.changed(); game.save(); done && done();
  };
}
/** 定制委托协议 → 签字付尾款 */
function contractBuy(x, done) {
  const s = game.state; const o = LX.orderOf(s, x.id); const dep = (o && o.deposit) || 0;
  openContract({ title: '定制委托协议', no: nextContractNo(s, 'DZ', now()), signer: s.bossName || '老板',
    parties: [['委托人', s.bossName || '老板'], ['受托人', `${x.brand}${x.kind === 'suit' ? '定制工坊' : '复杂功能工坊'}`]],
    subject: `${LX.label(x)}${x.modelEn ? `（${x.modelEn}）` : ''}${x.limit === 1 ? '，全球唯一' : ''}`,
    rows: [...LX.invoiceRows(x).rows, ['已付定金 30%', -dep, '委托时付']], total: x.price - dep,
    terms: ['定金 30% 在委托时支付，交付时付清尾款。', '定制品按委托人要求制作，不退不换。', ...(x.kind === 'watch' ? ['委托人承诺不转卖；转卖视为违约，品牌不再接受委托。'] : [])],
    onSign: () => { const r = LX.buyQueued(s, x.id, now()); if (!r.ok) { toast(r.why); return; } toast(`交付了：${LX.label(x)}`); game.changed(); game.save(); done && done(); } });
}
/** 送包 */
function giveFlow(x, secId, queued, done) {
  const s = game.state; const c = SEC_BY_ID[secId];
  const r = queued ? LX.buyQueued(s, x.id, now(), secId) : { ok: false, why: '名包去商场「奢侈品」送' };   // 设计56
  if (!r.ok) { toast(r.why); return; }
  say(secId, r.liked ? `${x.brand}……你怎么知道我喜欢这个？` : `${x.model}？……谢谢老板。`, 3600, 'happy');
  toast(`${c.name} 好感 +${+(r.favor.to - r.favor.from).toFixed(2)}${r.love.to > r.love.from ? `　♥ +${+(r.love.to - r.love.from).toFixed(2)}` : ''}`, 2600, { top: true });
  if (r.favor.stageUp) game.emit('favorUp', secId, r.favor);
  if (r.love.stageUp) game.emit('loveUp', secId, r.love);
  game.changed(); game.save(); done && done();
}
/** 拍卖（彩虹迪通拿） */
function openAuction(x, done) {
  const s = game.state; const start = Math.round(x.price * LX.LCFG.auction.startX); let mult = 1.5;
  const p = openPanel(`拍卖 · ${LX.label(x)}`);
  const render = () => {
    p.body.innerHTML = `<div class="auc-head"><b>${LX.label(x)}</b><small>起拍 ${fmtMoney(start)}</small></div><div class="sd-rec-title">你最多出到</div>
      <div class="tabs">${[1.2, 1.5, 2, 3].map((k) => `<button class="tab ${k === mult ? 'on' : ''}" data-k="${k}">${fmtMoney(start * k)}</button>`).join('')}</div>
      <div class="tr-gain">成交另付买家佣金（分段 28% / 22% / 15%）</div><button class="btn gold big go">举牌</button>`;
    p.body.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { mult = +b.dataset.k; render(); }));
    p.body.querySelector('.go').onclick = () => {
      if (s.cash < start * mult) { toast('个人现金不够你的最高出价'); return; }
      const r = LX.auction(s, x.id, start * mult);
      p.body.innerHTML = `<div class="auc-head"><b>${LX.label(x)}</b></div>${r.steps.map((y) => `<div class="tr-gain">🔨 ${y}</div>`).join('')}<div class="rate">${r.won ? `成交 <b>${fmtMoney(r.price)}</b>` : '没拍到'}</div>`;
      if (r.won) { const b = h('button', 'btn gold big', '签成交确认书，付款'); b.onclick = () => { const y = LX.buy(s, x.id, now(), { price: r.price, channel: 'auction', skipCheck: true }); if (!y.ok) { toast(y.why); return; } p.close(); toast(`拍到了：${y.contract.no}`); game.changed(); game.save(); done && done(); }; p.body.appendChild(b); }
    };
  };
  render();
}

/** 商场「名包」：host 是商场里的格子 */
/** 设计56 以后不用了（商场「奢侈品」= ui/gift.js openLux），留着给老入口 */
export function openBags(secId, host) {
  const s = game.state; const c = SEC_BY_ID[secId]; const likes = [SEC_BY_ID[secId].likeBrand].map((k) => LX.BRANDS('bag').find((b) => b[0] === k)).filter(Boolean).map((b) => b[1]);
  host.body.appendChild(h('div', 'gift-tip', `名包只能送人，不算身价。${c.name}喜欢：<b>${likes.join('、') || '—'}</b>（好感 ×2、爱慕 +1）；爱马士谁都喜欢。香奈尔 CF 每天 1 个，爱马士配货包每天 2 个`));
  const box = h('div'); host.body.appendChild(box);
  const draw = () => {
    box.innerHTML = ''; const t = now();
    box.appendChild(brandBar(game.state, 'bag', 'hermes', draw));
    const grid = h('div', 'as-grid shop');
    for (const x of LX.BAGS) grid.appendChild(shopCard(game.state, x, t, draw, secId));
    box.appendChild(grid);
  };
  draw();
}

/** 老板页「穿戴」那一段 */
export function wearHtml(s) {
  const w = LX.worn(s, 'watch'), su = LX.worn(s, 'suit');
  if (!w && !su) return '<div class="tr-gain">还没有名表和西装（资产 → 穿戴 → 去表行 / 去定制店）</div>';
  const one = (x, k) => `<div class="tr-course wear-row"><div class="boss-wear">${pic(x, 'wear-img')}</div><div><b>${k} ${LX.label(x)}</b><div class="tr-gain">${x.modelEn && x.modelEn !== x.model ? x.modelEn + '　' : ''}${fmtMoney(x.price)}</div></div></div>`;
  return (w ? one(w, '戴着') : '') + (su ? one(su, '穿着') : '');
}

// 每秒：排队到点进消息中心
game.addTicker((s) => {
  for (const x of LX.tick(s, now())) BI.notify(s, 'lux', x.order, x.text, LX.L[x.order.id].kind === 'bag' ? '去「商场 → 奢侈品」送给她。' : '去「资产 → 穿戴」的表行 / 定制店。');
});
game.on('tabHome', () => { curKind = 'watch'; }); // 从底下导航点进来：回到第一个小页签
