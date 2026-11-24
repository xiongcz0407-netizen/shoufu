// 「资产」页签（第 12 项，设计18 第四节 4、设计19）：横滑标签 车库 / 房产 / 机库 / 码头 / 穿戴 / 收藏；
// 上展示（场景背景 + 最贵的那件）下列表；点一件 → 详情抽屉（参数、编号、买入价 / 卖回价、持有成本、出租、卖回、合同）；
// 「去买」→ 商店（车：现货 / 订单 / 邀请 / 拍卖 / 定制；房子：上海 / 广州 / 北京 / 深圳 / 香港 / 海外；飞机：现货）
import { TIER_NAMES } from '../config/vehicles.js?v=5ca34d35';
import { CHANNEL_NAME } from '../config/carmeta.js?v=5ca34d35';
import * as AS from '../core/assets.js?v=5ca34d35';
import * as PW from '../core/postwork.js?v=5ca34d35';
import { bossAttrs } from '../core/boss.js?v=5ca34d35';
import { fmtMoney, fmtDuration } from '../core/format.js?v=5ca34d35';
import { asset, hasAsset } from '../platform/assets.js?v=5ca34d35';
import { game } from '../game.js?v=5ca34d35';
import { now } from '../core/clock.js?v=5ca34d35';
import { h, openPanel, toast, liveRender } from './dom.js?v=5ca34d35';
import { openFull } from './shell.js?v=5ca34d35';
import { openContract } from './contract.js?v=5ca34d35';
import { nextContractNo } from '../core/contracts.js?v=5ca34d35';
import { renderYachtTab } from './yacht.js?v=5ca34d35';
import { renderWearTab } from './luxury.js?v=5ca34d35';
import { renderCollectTab } from './antique.js?v=5ca34d35';
import { abroadCard } from './offshore.js?v=5ca34d35';
import { renderAuctionHouse } from './auction.js?v=5ca34d35';
import * as OFS from '../core/offshore.js?v=5ca34d35';
import { renderLandmarkGroup } from './landmark.js?v=5ca34d35';
import * as CF from '../core/carfilter.js?v=5ca34d35';
import { confirmBox } from './confirm.js?v=5ca34d35'; // 设计37 第一节：游戏样式确认框

const imgPath = (it) => `assets/${it.kind}/${it.id}.webp`;
function pic(it, cls = 'as-img') {
  const p = imgPath(it);
  return hasAsset(p) ? `<img class="${cls}" src="${asset(p)}" alt="">` : `<div class="${cls} as-ph">${it.kind === 'house' ? it.city : it.brand}<small>${it.kind === 'house' ? it.name : it.model}</small></div>`;
}
const label = AS.label;
const RAR = { limited: ['badge_limited', '限量'], unique: ['badge_unique', '孤品'] };
function badges(it) {
  const r = AS.rarityOf(it); let out = '';
  if (RAR[r]) out += `<span class="badge ${r}">${hasAsset(`assets/ui/${RAR[r][0]}.webp`) ? `<img src="${asset(`assets/ui/${RAR[r][0]}.webp`)}" alt="">` : ''}${RAR[r][1]}${it.limit && it.limit > 1 ? `<small>全球 ${it.limit} 台</small>` : it.limit === 1 ? '<small>全球唯一</small>' : ''}</span>`;
  if (AS.channelOf(it) === 'auction') out += `<span class="badge auction">${hasAsset('assets/ui/badge_auction.webp') ? `<img src="${asset('assets/ui/badge_auction.webp')}" alt="">` : ''}拍卖</span>`;
  return out;
}
const frameCls = (it) => 'fr-' + (AS.rarityOf(it) === 'normal' ? (AS.channelOf(it) === 'auction' ? 'auction' : 'normal') : AS.rarityOf(it));

const TABS = [
  { key: 'car', name: '车库', bg: 'bg_garage', list: 'cars' },
  { key: 'house', name: '房产', bg: null, list: 'houses' },
  { key: 'plane', name: '机库', bg: 'bg_hangar', list: 'planes' },
  { key: 'yacht', name: '码头' }, // 第 2-11 项：ui/yacht.js
  { key: 'wear', name: '穿戴' }, // 第 2-12 项：ui/luxury.js
  { key: 'collect', name: '收藏' }, // 第 2-13 项：ui/antique.js
];
let curTab = 'car';

export function renderAssets(body, ctx) {
  const wrap = h('div'); body.appendChild(wrap);
  const draw = () => {
    const s = game.state; const g = s.garage; wrap.innerHTML = '';
    const all = [...g.cars, ...g.planes, ...g.houses].filter((id) => AS.ITEM[id]);
    const rent = Object.keys(s.rented || {}).reduce((a, id) => a + (AS.ITEM[id] ? PW.rentYear(s, AS.ITEM[id]) : 0), 0);
    const b = bossAttrs(s);
    wrap.appendChild(h('div', 'sum-card', `<div><small>资产总值（卖回价）</small><b>${fmtMoney(s.assetValue || 0)}</b></div><div><small>件数</small><b>${all.length + AS.hookCount(s)}</b></div>
      <div><small>每年持有成本</small><b class="neg">${fmtMoney(AS.upkeepYearAll(s))}</b></div><div><small>每年租金</small><b class="pos">${fmtMoney(rent)}</b></div>`));
    wrap.appendChild(h('div', 'tr-gain', `老板属性：气场 <b>${b.aura}</b>（车、游艇、表、西装）· 人脉 <b>${b.network}</b>（豪宅、收购、游艇、古董）· 眼光 <b>${b.vision}</b>（飞机、分店、称号、古董）　个人现金 ${fmtMoney(s.cash)}${AS.frozen(s) ? `（冻结 ${fmtMoney(AS.frozen(s))}）` : ''}`));
    const tabs = h('div', 'as-tabs');
    for (const tb of TABS) { const x = h('button', 'tab' + (tb.key === curTab ? ' on' : '') + (tb.lock ? ' locked' : ''), tb.name + (tb.lock ? ' 🔒' : '')); x.onclick = () => (tb.lock ? toast(tb.lock) : ((curTab = tb.key), draw())); tabs.appendChild(x); }
    wrap.appendChild(tabs);
    if (curTab === 'yacht') { renderYachtTab(wrap, draw); return; }
    if (curTab === 'wear') { renderWearTab(wrap, draw); return; }
    if (curTab === 'collect') { renderCollectTab(wrap, draw); return; }
    const tab = TABS.find((x) => x.key === curTab);
    const all0 = g[tab.list].map((id) => AS.ITEM[id]).filter(Boolean).sort((a, b2) => b2.price - a.price);
    const GF = tab.key === 'car' ? CF.garagePrefs(s) : null;   // 设计27：车库按类型、品牌筛，买入时间 / 价格排
    const mine = GF ? CF.garageList(s, GF) : all0;
    const stage = h('div', 'as-stage ' + tab.key);
    if (tab.bg && hasAsset(`assets/bg/${tab.bg}.webp`)) stage.style.backgroundImage = `url("${asset(`assets/bg/${tab.bg}.webp`)}")`;
    stage.innerHTML = all0.length ? `<div class="as-hero ${frameCls(all0[0])}">${pic(all0[0], 'as-hero-img')}</div><div class="as-hero-name">${label(all0[0])} ${badges(all0[0])}</div>` : `<div class="as-empty">${tab.name}还是空的</div>`;
    if (all0.length) stage.onclick = () => showcase(all0[0]);
    wrap.appendChild(stage);
    if (GF && all0.length) garageFilterBar(s, wrap, GF, all0, draw);
    const list = h('div', 'as-grid');
    for (const it of mine) {
      const m = (g.meta || {})[it.id] || {};
      const c = h('button', 'as-card ' + frameCls(it), `${pic(it)}${badges(it)}${it.body ? `<em class="body-tag">${CF.BODY_NAME[it.body]}</em>` : ''}<b>${label(it)}</b><small>${m.no ? `No.${String(m.no).padStart(3, '0')} / ${it.limit} · ` : ''}卖回 ${fmtMoney(AS.sellPrice(s, it.id))}</small>${PW.isRented(s, it.id) ? '<em class="rented">出租中</em>' : ''}`);
      c.onclick = () => openItem(it.id, draw);
      list.appendChild(c);
    }
    if (GF && all0.length && !mine.length) list.appendChild(h('div', 'empty', '没有符合的车'));
    wrap.appendChild(list);
    const go = h('button', 'btn gold big', `去买${tab.key === 'house' ? '房' : tab.key === 'car' ? '车' : '飞机'}`); go.onclick = () => openShop(tab.key, draw);
    wrap.appendChild(go);
    if (tab.key === 'house') renderLandmarkGroup(wrap, draw);   // 第 3-07 项：地标一组（公司买）
  };
  ctx.onCleanup(liveRender(wrap, draw, (fn) => game.onChange(fn), body));
}

/** 详情抽屉 */
function openItem(id, done) {
  const s = game.state; const it = AS.ITEM[id]; const m = (s.garage.meta || {})[id] || {};
  const p = openPanel(label(it));
  const render = () => {
    const sp = AS.spec(it);
    p.body.innerHTML = `<div class="as-detail ${frameCls(it)}">${pic(it, 'as-hero-img')}</div><div class="as-badges">${badges(it)}${m.no ? `<b class="as-no">No.${String(m.no).padStart(3, '0')} / ${it.limit}</b>` : ''}</div>
      <div class="staff-tbl">
        ${it.kind === 'house' ? `<div><span>城市</span><b>${it.city}</b></div><div><span>面积</span><b>${it.area} ㎡</b></div>` : `<div><span>品牌</span><b>${it.brand}（${it.origin}）</b></div><div><span>档次</span><b>${TIER_NAMES[it.tier] || ''}</b></div>`}
        ${sp ? `<div><span>动力</span><b>约 ${sp.hp} 匹</b></div><div><span>排量档</span><b>${sp.disp}</b></div>` : ''}
        <div><span>买入价</span><b>${fmtMoney(m.price || it.price)}</b></div><div><span>卖回价</span><b>${fmtMoney(AS.sellPrice(s, id))}</b></div>
        <div><span>每年持有成本</span><b>${fmtMoney(AS.upkeepYear(s, id))}</b></div><div><span>合同</span><b>${m.contract || '—'}</b></div>
      </div>
      <div class="tr-gain">卖回按买价 70%（有资产管家最高 80%），不交税${(m.channel === 'invite' || m.channel === 'custom') ? '；<span class="neg">邀请 / 定制买的签过不转卖协议，卖了这个品牌会拉黑</span>' : ''}。车和房子不能贷款、不能抵押。</div>
      <div class="ind-btns" style="margin-top:10px">${it.kind !== 'car' ? `<button class="btn rent">${PW.isRented(s, id) ? '收回（出租中）' : '交给资产管家出租'}</button>` : ''}<button class="btn sell">卖回 ${fmtMoney(AS.sellPrice(s, id))}</button></div>`;
    const r = p.body.querySelector('.rent'); if (r) r.onclick = () => { const x = PW.setRent(s, id, !PW.isRented(s, id)); if (!x.ok) toast(x.why); game.changed(); game.save(); render(); };
    p.body.querySelector('.sell').onclick = async () => {
      if (!(await confirmBox({ body: `把「${label(it)}」卖回去，拿 ${fmtMoney(AS.sellPrice(s, id))}？`, title: '卖回', ok: '卖', danger: true }))) return;
      const x = AS.sell(s, id, now()); if (!x.ok) { toast(x.why); return; }
      toast(`卖回 ${fmtMoney(x.amount)}${x.black ? `；${it.brand}把你拉黑了` : ''}`); game.changed(); game.save(); p.close(); done && done();
    };
  };
  render();
}

/** 商店（全屏）：按渠道 / 城市分段，卡片显示价格、税费合计和条件（不够的灰掉写差什么） */
export function openShop(kind, done) {
  setTimeout(() => import('./guide.js?v=5ca34d35').then((g) => g.hint('contract')), 400);
  const p = openFull(kind === 'house' ? '买房' : kind === 'car' ? '车行' : '飞机');
  const segBar = h('div', 'seg-bar'); const body = h('div', 'page-body');
  p.body.append(segBar, body);
  const SEGS = kind === 'car' ? [['all', '全部'], ...Object.entries(CHANNEL_NAME)] : kind === 'house' ? [['上海', '上海'], ['广州', '广州'], ['北京', '北京'], ['深圳', '深圳'], ['香港', '香港'], ['海外', '海外']] : [['spot', '现货']];
  let seg = SEGS[0][0];
  const F = kind === 'car' ? CF.shopPrefs(game.state) : null;   // 设计27：车行三排叠加筛选，条件记在存档 s.ui.carShop
  if (F) seg = F.ch;
  const CARS_ALL = Object.values(AS.ITEM).filter((it) => it.kind === 'car');
  const items = () => kind === 'car' ? CF.shopList(game.state, F, now(), CARS_ALL) : Object.values(AS.ITEM).filter((it) => it.kind === kind).filter((it) => (kind === 'house' ? (seg === '海外' ? it.region === 'overseas' : it.city === seg) : true))
    .sort((a, b) => (AS.rarityOf(b) !== 'normal') - (AS.rarityOf(a) !== 'normal') || a.price - b.price);
  const draw = () => {
    const s = game.state; const t = now();
    segBar.innerHTML = '';
    if (kind === 'car') carFilterBar(s, segBar, F, CARS_ALL, () => { seg = F.ch; body.scrollTop = 0; game.save(); draw(); }, SEGS);
    else for (const [k, n] of SEGS) { const b = h('button', 'seg' + (k === seg ? ' on' : ''), n); b.onclick = () => { seg = k; body.scrollTop = 0; draw(); }; segBar.appendChild(b); }
    body.innerHTML = `<div class="tr-gain">个人现金 ${fmtMoney(AS.freeCash(s))}${AS.frozen(s) ? `（另有 ${fmtMoney(AS.frozen(s))} 冻结认筹中）` : ''}；车、房、飞机只能个人现金全款，不能贷款、不能抵押</div>`;
    if (kind === 'car' && seg === 'auction') { renderAuctionHouse(body, draw, F.body !== 'all' || F.brand !== 'all' ? (it) => CF.match(it, { ...F, ch: 'all' }) : null); return; }   // 类型、品牌对拍卖会的车单也生效 // 车和古董同一个按场次的拍卖会（第 2-14b 项）
    const grid = h('div', 'as-grid shop');
    const LIST = items();
    if (kind === 'car' && !LIST.length) body.appendChild(h('div', 'empty', '没有符合的车，换个条件看看'));
    for (const it of LIST) {
      if (OFS.isAbroad(it)) { grid.appendChild(abroadCard(it, draw, pic, badges, frameCls)); continue; } // 香港 / 海外：个人现金付、到「老板」（第 2-14 项、设计30）
      const own = AS.owns(s, it.id); const why = own ? null : AS.whyNotBuy(s, it.id, t, { forOrder: AS.channelOf(it) === 'order' }); const q = AS.quote(s, it.id);
      const f = AS.freezeOf(s, it.id); const o = AS.orderOf(s, it.id); const ch = AS.channelOf(it);
      let act = '';
      if (own) act = '<em class="owned">已拥有</em>';
      else if (f) act = t >= f.until ? '<button class="btn gold buy">认筹到期，签合同</button>' : `<button class="btn cancel">冻结中 还剩 ${fmtDuration((f.until - t) / 1000)}（放弃）</button>`;
      else if (o) act = t >= o.at ? '<button class="btn gold buy">到货了，签合同</button>' : `<button class="btn" disabled>${ch === 'invite' ? '等品牌来电' : '排队中'} 还剩 ${fmtDuration((o.at - t) / 1000)}</button>`;
      else if (why) act = `<div class="sc-cond">${why}</div>`;
      else if (it.kind === 'house' && (it.check === 'verify' || it.check === 'proof')) act = '<button class="btn gold verify">验资认筹（立刻出结果）</button>';
      else if (ch === 'auction') act = '<button class="btn gold auction">去拍卖会</button>';
      else if (AS.QUEUE_MIN[ch]) act = `<button class="btn gold order two">${ch === 'invite' ? '登记，等邀请' : ch === 'custom' ? '提交定制委托' : `付定金 ${fmtMoney(it.price * AS.ORDER.deposit)} 下单`}<small>立刻交付</small></button>`; // 两行：上主字、下小字
      else act = '<button class="btn gold buy">签合同</button>';
      const c = h('div', 'as-card ' + frameCls(it) + (why && !own && !f && !o ? ' dim' : ''), `${pic(it)}${badges(it)}${it.body ? `<em class="body-tag">${CF.BODY_NAME[it.body]}</em>` : ''}<b>${label(it)}</b>
        <small>${fmtMoney(it.price)}　税费合计 ${fmtMoney(q.total - it.price)}${it.area ? `　${it.area} ㎡` : ''}</small>${it.note ? `<small class="note">${it.note}</small>` : ''}${act}`);
      const on = (sel, fn) => { const x = c.querySelector(sel); if (x) x.onclick = fn; };
      on('.buy', () => contractBuy(it, null, null, draw, f ? 'verify' : o ? 'order' : null));
      on('.verify', () => { const r = AS.startVerify(s, it.id, now()); if (!r.ok) { toast(r.why); return; } toast(`开了存款证明，冻结 ${fmtMoney(AS.freezeOf(s, it.id).amount)}`); game.changed(); game.save(); draw(); });
      on('.cancel', () => { AS.cancelVerify(s, it.id); toast('放弃认筹，钱退回了'); game.changed(); game.save(); draw(); });
      on('.order', () => { const r = AS.placeOrder(s, it.id, now()); if (!r.ok) { toast(r.why); return; } toast(r.deposit ? `付了定金 ${fmtMoney(r.deposit)}，现在就能签合同付尾款` : '好了，现在就能签合同'); game.changed(); game.save(); draw(); });
      on('.auction', () => openAuction(it, draw));
      grid.appendChild(c);
    }
    body.appendChild(grid);
  };
  const off = liveRender(body, draw, (fn) => game.onChange(fn), body);
  const close0 = p.close; p.close = () => { off(); close0(); done && done(); };
}

/** 拍卖会：设最高出价 → 对手举牌 → 落槌；赢了签合同（成交价 + 佣金 + 税） */
function openAuction(it, done) {
  const s = game.state; const start = Math.round(it.price * (it.kind === 'house' ? 1 : 1.5));
  const p = openPanel(`拍卖 · ${label(it)}`);
  const bg = hasAsset('assets/bg/bg_auction.webp') ? ` style="background-image:url('${asset('assets/bg/bg_auction.webp')}')"` : '';
  let mult = 1.5;
  const render = () => {
    p.body.innerHTML = `<div class="auc-head"${bg}><b>${label(it)}</b><small>起拍 ${fmtMoney(start)}${it.kind === 'house' ? `　进场保证金 ${fmtMoney(start * 0.1)}` : ''}</small></div>
      <div class="sd-rec-title">你最多出到</div><div class="tabs">${[1.2, 1.5, 2, 3].map((k) => `<button class="tab ${k === mult ? 'on' : ''}" data-k="${k}">${fmtMoney(start * k)}</button>`).join('')}</div>
      <div class="tr-gain">成交另付买家佣金（分段 26% / 20% / 15%）和税费；拍卖买的以后可以再拍卖卖出</div><button class="btn gold big go">举牌</button>`;
    p.body.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { mult = +b.dataset.k; render(); }));
    p.body.querySelector('.go').onclick = () => {
      const max = start * mult; if (AS.freeCash(s) < max) { toast('个人现金不够你的最高出价'); return; }
      const r = AS.auction(s, it.id, max);
      p.body.innerHTML = `<div class="auc-head"${bg}><b>${label(it)}</b></div>${r.steps.map((x) => `<div class="tr-gain">🔨 ${x}</div>`).join('')}<div class="rate">${r.won ? `成交 <b>${fmtMoney(r.price)}</b>` : '没拍到'}</div>`;
      if (r.won) { const b = h('button', 'btn gold big', '签成交确认书'); b.onclick = () => { p.close(); contractBuy(it, r.price, 'auction', done); }; p.body.appendChild(b); }
    };
  };
  render();
}

/** 全屏合同 → 签字付款 */
function contractBuy(it, price, channel, done, via) {
  const s = game.state; const q = AS.quote(s, it.id, price); const prem = channel === 'auction' ? Math.round(AS.premium(price)) : 0;
  const rows = [...q.rows]; if (prem) rows.push(['拍卖买家佣金', prem, '按成交价分段']);
  const dep = via === 'order' ? ((AS.orderOf(s, it.id) || {}).deposit || 0) : 0; if (dep) rows.push(['已付定金（抵车款）', -dep, '下单时付的 10%']);
  openContract({ title: it.kind === 'house' ? (channel === 'auction' ? '拍卖成交确认书' : '商品房买卖合同（网签）') : it.kind === 'car' ? (channel === 'auction' ? '拍卖成交确认书' : '汽车买卖合同') : '航空器买卖合同',
    no: nextContractNo(s, it.kind === 'house' ? 'FC' : it.kind === 'car' ? 'GC' : 'FJ', now()), signer: s.bossName || '老板',
    parties: [['买方', s.bossName || '老板'], ['卖方', it.kind === 'house' ? `${it.city}开发商${channel === 'auction' ? '（拍卖行代理）' : ''}` : `${it.brand}${channel === 'auction' ? '（拍卖行代理）' : '授权经销商'}`]],
    subject: `${label(it)}${it.area ? `，建筑面积 ${it.area} ㎡` : ''}${it.limit ? `（全球${it.limit === 1 ? '唯一' : `限量 ${it.limit} 台`}）` : ''}`,
    rows, total: q.total + prem - dep, // 定金下单时已付，这次付尾款
    terms: ['买方以个人现金一次性全款支付，本合同不涉及贷款、抵押。', ...(AS.channelOf(it) === 'invite' || AS.channelOf(it) === 'custom' ? ['买方承诺不转卖；转卖视为违约，品牌不再向买方供货。'] : []), '税费按国家规定由买方承担，开具发票和完税凭证。'],
    onSign: () => {
      const r = via === 'verify' ? AS.buyAfterVerify(s, it.id, now()) : via === 'order' ? AS.buyOrdered(s, it.id, now()) : AS.buy(s, it.id, now(), { price, channel, skipCheck: channel === 'auction' });
      if (!r.ok) { toast(r.why); return; }
      toast(`签好了：${r.contract.no}`); game.changed(); game.save(); showcase(it); done && done();
    } });
}

/** 展示：车开近 → 点头 → 车灯闪 → 反光；飞机 / 房子镜头慢慢推近 */
export function showcase(it) {
  const el = h('div', 'showcase ' + it.kind);
  const p = imgPath(it); const has = hasAsset(p);
  el.innerHTML = `<div class="sc-floor"></div><div class="sc-obj">${pic(it, 'sc-img')}${it.kind === 'car' ? '<i class="lamp l"></i><i class="lamp r"></i>' : ''}<i class="shine"${has ? ` style="-webkit-mask-image:url('${asset(p)}');mask-image:url('${asset(p)}')"` : ''}></i></div>
    <div class="sc-title">${label(it)}</div><div class="sc-price">${fmtMoney(it.price)}</div><div class="story-hint">点一下关掉</div>`;
  document.querySelector('#phone').appendChild(el);
  document.body.classList.add('story-open');
  requestAnimationFrame(() => el.classList.add('go'));
  el.onclick = () => { el.remove(); document.body.classList.remove('story-open'); };
}

// ---------- 设计27：车行 / 车库的筛选条 ----------
const COUNTRY2 = { 德国: '德', 英国: '英', 意大利: '意', 法国: '法', 日本: '日', 美国: '美', 瑞典: '瑞', 克罗地亚: '克', 中国: '中' };
function pills(row, opts, cur, on) { for (const [k, n] of opts) { const b = h('button', 'tab' + (k === cur ? ' on' : ''), n); b.onclick = () => on(k); row.appendChild(b); } requestAnimationFrame(() => showOn(row)); }
/** 横滑的一排：把选中的那个滑到看得见的位置（居中），不动页面的上下滚动 */
function showOn(row) { const b = row.querySelector('.tab.on'); if (!b || row.scrollWidth <= row.clientWidth) return; const r = row.getBoundingClientRect(), x = b.getBoundingClientRect(); if (x.left >= r.left && x.right <= r.right) return; row.scrollLeft += x.left - r.left - (r.width - x.width) / 2; }
/** 车行：类型 / 品牌（按国家分组）/ 渠道 三排 + 价格排序 + 只看买得起的 */
function carFilterBar(s, bar, F, cars, redraw, SEGS) {
  const bc = CF.bodyCount(cars);
  const r1 = h('div', 'tabs cf-row'); pills(r1, [['all', `全部 ${bc.all}`], ...CF.BODIES.map((b) => [b, `${CF.BODY_NAME[b]} ${bc[b]}`])], F.body, (k) => { F.body = k; if (F.brand !== 'all' && !CF.brands(cars, k).some((x) => x.key === F.brand)) F.brand = 'all'; redraw(); });
  const r2 = h('div', 'tabs cf-row'); pills(r2, [['all', '全部品牌'], ...CF.brands(cars, F.body).map((x) => [x.key, `${x.name}<small class="cf-c">${COUNTRY2[x.country] || x.country}</small>`])], F.brand, (k) => { F.brand = k; redraw(); });
  const r3 = h('div', 'tabs cf-row'); pills(r3, SEGS, F.ch, (k) => { F.ch = k; redraw(); });
  const r4 = h('div', 'cf-opts', `<button class="tab cf-sort">${F.sort === 'desc' ? '价格 高→低' : '价格 低→高'}</button><label class="cf-afford"><input type="checkbox" ${F.afford ? 'checked' : ''}> 只看买得起的</label>`);
  r4.querySelector('.cf-sort').onclick = () => { F.sort = F.sort === 'desc' ? 'asc' : 'desc'; redraw(); };
  r4.querySelector('input').onchange = (e) => { F.afford = e.target.checked; redraw(); };
  bar.classList.add('cf-bar'); bar.append(r1, r2, r3, r4);
}
/** 车库：统计 + 类型 / 品牌（只显示自己有的）+ 排序 */
function garageFilterBar(s, wrap, GF, mine, redraw) {
  const st = CF.garageStats(s);
  wrap.appendChild(h('div', 'tr-gain cf-stat', `一共 <b>${st.n}</b> 辆：轿车 ${st.sedan}、SUV ${st.suv}、跑车 ${st.sports}、超跑 ${st.hyper}　总价值（卖回价）<b>${fmtMoney(st.value)}</b>`));
  const set = (k, v) => { GF[k] = v; if (k === 'body' && GF.brand !== 'all' && !CF.brands(mine, v).some((x) => x.key === GF.brand)) GF.brand = 'all'; game.save(); redraw(); };
  const bc = CF.bodyCount(mine);
  const r1 = h('div', 'tabs cf-row'); pills(r1, [['all', `全部 ${bc.all}`], ...CF.BODIES.filter((b) => bc[b]).map((b) => [b, `${CF.BODY_NAME[b]} ${bc[b]}`])], GF.body, (k) => set('body', k));
  const r2 = h('div', 'tabs cf-row'); pills(r2, [['all', '全部品牌'], ...CF.brands(mine, GF.body).map((x) => [x.key, `${x.name} ${x.n}`])], GF.brand, (k) => set('brand', k));
  const r3 = h('div', 'tabs cf-row'); pills(r3, [['time', '按买入时间'], ['price', '按价格']], GF.sort, (k) => set('sort', k));
  wrap.append(r1, r2, r3);
}
game.on('tabHome', () => { curTab = 'car'; }); // 从底下导航点进来：回到第一个小页签
