// 卡包（金券 + 六种券，唯一买券的地方）、顶栏金券数、各处「用券」小块（设计39 第五节、第五之二节，开发2）
// 各页面只用券不买券：有券写「还有 N 张 · 用一张」，没券写「去卡包买 XX」→ 跳卡包定位到那格（闪金框），右上角「返回」回原页面
// 开发1 用：potionHtml(s) 精力不够时按钮旁那一小块；bindPotion(el, after) 绑上点击
import * as CP from '../core/coupon.js?v=0553afd8';
import { IND_BY_ID } from '../config/industries.js?v=0553afd8';
import { dateText, gameDate } from '../core/gametime.js?v=0553afd8';
import { now } from '../core/clock.js?v=0553afd8';
import { game } from '../game.js?v=0553afd8';
import { h, toast, openPanel } from './dom.js?v=0553afd8';
import { openFull, openTab } from './shell.js?v=0553afd8';
import { confirmBox } from './confirm.js?v=0553afd8';
import { asset, hasAsset } from '../platform/assets.js?v=0553afd8';

const IT = CP.ITEMS;
/** 图标（设计39 第七节）：有图用图，没有用表情 */
const img = (key, alt, cls = 'cp-ic') => (hasAsset(`assets/ui/${key}.webp`) ? `<img class="${cls}" src="${asset(`assets/ui/${key}.webp`)}" alt="">` : alt);
export const couponIcon = (cls) => img('icon_coupon', '🎫', cls);
export const walletIcon = (cls) => img('icon_wallet', '👛', cls);
export const itemIcon = (k, cls) => img(IT[k].img, IT[k].icon, cls);
const saved = (after) => { game.changed(); game.save(); after && after(); };

/** 顶栏现金旁边的金券数：点了进卡包 */
export function mountCouponChip() {
  const row = document.querySelector('#screen-main .tb-l2'); if (!row || row.querySelector('.tb-coupon')) return;
  const b = h('button', 'tb-coupon', `${couponIcon('tb-cp-ic')} <b></b>`); const cash = row.querySelector('.tb-cash'); row.insertBefore(b, cash ? cash.nextSibling : null);
  b.onclick = () => openWallet();
  const draw = () => { b.querySelector('b').textContent = CP.balance(game.state); };
  draw(); game.onChange(draw);
}

/** 没券时：「去卡包买 XX」（各页面不放买的按钮） */
export const goBuyHtml = (k, cls = '') => `<button class="btn sm cp-go ${cls}" data-k="${k}">去卡包买${IT[k].name}<small>没有${IT[k].name}了</small></button>`;
export function bindGoBuy(el, after) { el.querySelectorAll('.cp-go').forEach((x) => (x.onclick = (e) => { e.stopPropagation(); openWallet({ focus: x.dataset.k, back: after }); })); }

/** 精力不够时按钮旁：有药水「喝一瓶（还有 N 瓶）」；没有「去卡包买药水」 */
export function potionHtml(s) {
  const n = CP.potions(s);
  return n > 0 ? `<button class="btn sm gold cp-pot">喝一瓶药水<small>精力 +${IT.potion.energy}（还有 ${n} 瓶）</small></button>` : goBuyHtml('potion');
}
export function bindPotion(el, after) {
  el.querySelectorAll('.cp-pot').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const r = CP.drink(game.state, now()); toast(r.ok ? `精力 +${r.energy}` : r.why); saved(after); }));
  bindGoBuy(el, after);
}

const left = (ms) => { const h = Math.ceil(ms / 3600e3); const d = Math.floor(h / 24), hh = h % 24; return d ? `${d} 天${hh ? ` ${hh} 小时` : ''}` : `${hh} 小时`; };
/** 自动券：没在生效直接用；生效中先问「接在后面」 */
async function useAutoAsk(id, after) {
  const s = game.state; const t = now(); const l = CP.autoLeft(s, id, t); const nm = IND_BY_ID[id].name;
  if (l > 0 && !(await confirmBox({ title: '自动上阵', body: `${nm}自动上阵还剩 ${left(l)}，再用一张会接在后面，变成还剩 ${left(l + IT.auto.days * 86400e3)}。`, ok: `用一张（还有 ${CP.have(s, 'auto')} 张）`, cancel: '先不用' }))) return;
  const r = CP.useAuto(game.state, id, now()); if (!r.ok) toast(r.why); saved(after); /* 成了不弹提示（会盖住门店面板），那一块闪一下金框 */
  if (r.ok) setTimeout(() => document.querySelectorAll('.cp-auto-box, .cp-line').forEach((x) => { if (!x.closest('.cp-line') || x.dataset.id === id) { x.classList.add('cp-flash'); setTimeout(() => x.classList.remove('cp-flash'), 1200); } }), 30);
}
/** 门店线详情「亲自上阵」4 个动作下面：「自动上阵：用 1 张自动券（还有 N 张）」；没券「去卡包买自动券」；生效中写「自动上阵中 · 还剩 X 天 X 小时」 */
export function autoHtml(s, id) {
  const l = CP.autoLeft(s, id, now()); const n = CP.have(s, 'auto');
  return `<div class="cp-auto-box"><span>${l ? `<b>自动上阵中</b> · 还剩 ${left(l)}` : '<b>自动上阵</b>'}<small>4 个动作到期自动续上，不花精力（1 张管 1 天）</small></span>
    ${n ? `<button class="btn sm gold cp-auto">${l ? '再用 1 张' : '用 1 张自动券'}<small>还有 ${n} 张</small></button>` : goBuyHtml('auto')}</div>`;
}
export function bindAuto(el, id, after) {
  const b = el.querySelector('.cp-auto'); if (b) b.onclick = () => useAutoAsk(id, after);
  bindGoBuy(el, after);
}
/** 商战页顶上：有券开打先用券；没券「去卡包买商战券」 */
export function ticketHtml(s) { return CP.tickets(s) ? '' : goBuyHtml('battle'); }
export function bindTicket(el, after) { bindGoBuy(el, after); }

/** 约会面板顶上：今天约过她了用约会券再约（每个秘书每天最多 3 张） */
export function dateTicketHtml(s, id) {
  const d = CP.dateState(s, id, now()); if (d.free) return '';
  if (!d.left) return `<div class="cp-date off">今天跟她约了 ${d.dated} 次，约会券用满 ${IT.date.perSecDay} 张 · <b>明天再约</b></div>`;
  return d.have ? `<div class="cp-date">今天约过了 · 用约会券再约<small>还有 ${d.have} 张，她今天还能 ${d.left} 次；照样花精力</small></div>`
    : `<div class="cp-date">今天约过了 · 再约要 1 张约会券<small>她今天还能 ${d.left} 次</small>${goBuyHtml('date')}</div>`;
}
export const bindDateTicket = bindGoBuy;

/** 经营页顶上「再来 10 件 · 用 1 张事件券（还有 N 张，今天还能 2 次）」；没券「去卡包买事件券」 */
export function refillHtml(s) {
  const rf = CP.refillState(s, now());
  if (!rf.can) return `<button class="btn sm biz-refill" disabled>再来 10 件<small>${rf.why}</small></button>`;
  return rf.have ? `<button class="btn sm gold biz-refill">再来 10 件<small>用 1 张事件券（还有 ${rf.have} 张，今天还能 ${rf.left} 次）</small></button>` : goBuyHtml('event');
}
export function bindRefill(el, after) {
  const b = el.querySelector('.biz-refill'); if (b) b.onclick = () => { const r = CP.useRefill(game.state, now()); toast(r.ok ? '又来了 10 件' : r.why); saved(after); };
  bindGoBuy(el, after);
}

/** 「去用」：药水直接喝；商战券去商战页；约会券、互动券去秘书列表；自动券选哪条线；事件券去经营页 */
function goUse(k, close, redraw) {
  const s = game.state;
  if (k === 'potion') { const r = CP.drink(s, now()); toast(r.ok ? `精力 +${r.energy}` : r.why); saved(redraw); return; }
  if (k === 'auto') { openPickLine(redraw); return; }
  close();
  setTimeout(() => {
    if (k === 'battle') import('./battle.js?v=0553afd8').then((u) => u.openBattle());
    else if (k === 'event') import('./inbox.js?v=0553afd8').then((u) => u.openInbox('biz'));
    else openTab('secretary');
  }, 220);
}
/** 自动券「去用」：选哪条门店线 */
function openPickLine(after) {
  const p = openPanel('自动券用在哪条线？');
  const draw = () => {
    const s = game.state; const t = now(); const ids = Object.keys(s.inds || {}).filter((id) => IND_BY_ID[id] && s.inds[id].branches);
    p.body.innerHTML = `<div class="tr-gain">一张管 1 天：4 个动作到期自动续上，不花精力。还有 <b>${CP.have(s, 'auto')}</b> 张</div>${ids.map((id) => { const l = CP.autoLeft(s, id, t); return `<div class="cp-line" data-id="${id}"><span>${IND_BY_ID[id].name}<small>${l ? `自动上阵中 · 还剩 ${left(l)}` : '没在自动上阵'}</small></span><button class="btn sm gold" data-id="${id}" ${CP.have(s, 'auto') ? '' : 'disabled'}>${l ? '再用 1 张' : '用 1 张'}</button></div>`; }).join('') || '<div class="empty">还没有门店线</div>'}`;
    p.body.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => useAutoAsk(b.dataset.id, () => { draw(); after && after(); })));
  };
  draw();
}

/** 卡包：金券余额 +「怎么得」；我的券 6 格（每格 1 / 10 / 50 张三个买的按钮 +「去用」）；最近收支。
 *  focus：从别的页面「去卡包买」进来，定位到那格闪一下金框；back：右上角「返回」回原页面（关掉时也会调） */
export function openWallet({ focus, back } = {}) {
  const p = openFull('卡包', { onClose: () => back && back() }); p.el.classList.add('wallet');
  if (back) { const r = p.el.querySelector('.page-head span'); r.innerHTML = '<button class="btn sm cp-back">返回</button>'; r.querySelector('.cp-back').onclick = () => p.close(); }
  const body = h('div', 'page-body cp-page'); p.body.appendChild(body);
  let showEarn = false;
  const render = () => {
    const s = game.state; const t = now(); const c = CP.cp(s); const lf = CP.todayLeft(s, t); const E = CP.COUPON_CFG.earn, G = CP.COUPON_CFG.gift; const b = CP.balance(s);
    body.innerHTML = `<div class="cp-top"><div class="cp-bal">${couponIcon('cp-bal-ic')}<span>金券</span><b>${c.bal}</b></div><button class="btn sm cp-earn-t">${showEarn ? '收起' : '怎么得'}${lf.sign || lf.tasks ? ' ·<em>今天还能领</em>' : ''}</button></div>
      ${showEarn ? `<div class="cp-list">
        <div class="${lf.sign ? 'cp-now' : ''}"><span>每天签到</span><b>${E.sign}（连签第 7 天 ${E.sign7}；第 3 天送 ${CP.giftText(G.sign3)}、第 5 天 ${CP.giftText(G.sign5)}、第 7 天 ${CP.giftText(G.sign7)}）</b>${lf.sign ? '<em>今天还没签</em>' : ''}</div>
        <div class="${lf.tasks ? 'cp-now' : ''}"><span>每日任务全部做完</span><b>${E.tasksAll}（${Math.round(G.tasksAllP * 100)}% 送 ${CP.giftText(G.tasksAll)}）</b>${lf.tasks ? `<em>今天 ${lf.tasks}</em>` : ''}</div>
        <div><span>新手目标每完成一个</span><b>${E.goal}</b></div>
        <div><span>秘书好感升一阶</span><b>${E.favorStage}（送 ${CP.giftText(G.favorStage)}）</b></div>
        <div><span>第一次赢一个对手</span><b>送 ${CP.giftText(G.firstWin)}</b></div>
        <div><span>第一次收购最终对手</span><b>${E.finalAcquire}</b></div>
        <div><span>升称号</span><b>${E.title}（送 ${CP.giftText(G.title)}）</b></div></div>` : ''}
      <div class="tr-gain">金券不能用游戏币买，也不能换成游戏币。券只在这里买，都能攒；10 张九折、50 张八折。</div>
      <div class="sd-rec-title">我的券</div><div class="cp-cards">${CP.ITEM_KEYS.map((k) => { const n = CP.have(s, k); return `<div class="cp-card" data-card="${k}">
        <div class="cp-card-h"><span>${itemIcon(k, 'cp-card-ic')}${IT[k].name}</span><b>${n}<small> ${IT[k].unit}</small></b></div><small>${IT[k].what}</small>
        <div class="cp-card-b">${CP.PACKS.map((m) => { const pr = CP.packPrice(k, m); return `<button class="btn sm ${b >= pr ? 'gold' : ''} cp-buy" data-k="${k}" data-n="${m}" ${b >= pr ? '' : 'disabled'}>${m} ${IT[k].unit}<small>${couponIcon('cp-mini')}${pr}</small></button>`; }).join('')}<button class="btn sm cp-use" data-k="${k}" ${n ? '' : 'disabled'}>去用<small>${k === 'potion' ? '喝一瓶' : '&nbsp;'}</small></button></div></div>`; }).join('')}</div>
      <div class="sd-rec-title">最近收支</div><div class="cp-log">${c.log.slice(0, 20).map((x) => `<div><span>${x.why}</span><small>${dateText(gameDate(s, x.t))}</small><b class="${x.n > 0 ? 'pos' : x.n < 0 ? 'neg' : ''}">${x.n > 0 ? '+' : ''}${x.n || ''}</b></div>`).join('') || '<div class="empty">还没有</div>'}</div>`;
    body.querySelector('.cp-earn-t').onclick = () => { showEarn = !showEarn; render(); };
    body.querySelectorAll('.cp-buy').forEach((x) => (x.onclick = () => { const k = x.dataset.k; const r = CP.buy(game.state, k, +x.dataset.n, now()); toast(r.ok ? `买了 ${IT[k].name} ×${r.n}（${r.price} 金券）${back ? '，右上角「返回」去用' : ''}` : r.why); saved(render); }));
    body.querySelectorAll('.cp-use').forEach((x) => (x.onclick = () => goUse(x.dataset.k, p.close, render)));
  };
  render();
  if (focus) { const card = body.querySelector(`[data-card="${focus}"]`); if (card) { setTimeout(() => card.scrollIntoView({ block: 'center' }), 60); card.classList.add('cp-flash'); setTimeout(() => card.classList.remove('cp-flash'), 1600); } }
  return p;
}
/** 老入口：金券页、金券商店都并进卡包 */
export const openCoupon = () => openWallet();
export const openShop = () => openWallet();
export const openBuy = (k, after) => openWallet({ focus: k, back: after });
