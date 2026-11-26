// 设计41 / 46 / 47 看盘界面（开发2）：看盘那一块（开始 / 结束；设计63 去掉了「现在看一眼」）、看盘消息弹框（⅓仓 / 半仓 / 全仓）、照她说的挂单（条件单表）、消息「重要」里的按钮
import { earnAt } from './earn.js?v=a24b4431';   // 设计65：挂单写百分比
import { whyToast } from './invest.js?v=a24b4431';   // 设计62：钱不够一键从个人账户转入
import * as SK from '../core/stocks.js?v=a24b4431';
import * as TR from '../core/trade.js?v=a24b4431';
import * as LK from '../core/look.js?v=a24b4431';
import * as I from '../core/inbox.js?v=a24b4431';
import { SEC_BY_ID } from '../config/secretaries.js?v=a24b4431';
import { fmtMoney } from '../core/format.js?v=a24b4431';
import { asset, hasAsset } from '../platform/assets.js?v=a24b4431';
import { game } from '../game.js?v=a24b4431';
import { now } from '../core/clock.js?v=a24b4431';
import { h, openPanel, toast } from './dom.js?v=a24b4431';
import { addActionUi } from './inbox.js?v=a24b4431';
import * as WSM from '../core/ws.js?v=a24b4431';   // 设计47
import { attrs as secAttrs } from '../core/posts.js?v=a24b4431';
import { isTraining } from '../core/training.js?v=a24b4431';
import { itemIcon, goBuyHtml, bindGoBuy } from './coupon.js?v=a24b4431';   // 设计53 投资券

const W = SK.SCFG.watch; const WSC = W.ws;
const SCAN_MIN = WSC.scanTicks * SK.SCFG.tickSec / 60;   // 设计67：每 2.5 分钟自动看一次（不取整）
const GUARD_MIN = WSC.scanTicks * WSC.guard.scans * SK.SCFG.tickSec / 60;   // 最多 5 分钟一定有一条
const WS_wit = (s, id) => secAttrs(s, id).wit;
const done = (msg) => { if (msg) toast(msg); game.changed(); game.save(); };
const head = (who, title) => `<div class="lk-head">${who && hasAsset(`assets/sec/${who}/c1.webp`) ? `<img src="${asset(`assets/sec/${who}/c1.webp`)}" alt="">` : ''}<b>${title}</b></div>`;
const yuan = (v) => `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const busy = () => !!document.querySelector('.story, .panel-mask, .full, .naming, .cf-mask, .ub-mask');

/** 设计46：⅓仓 / 半仓 / 全仓 三个按钮（按这一刻的投资账户现金算；不够 1 股的灰掉；三个都不够写「钱不够」） */
function posBtns(s, code, px, i = 0, edit = false, lock = false, tp = null) {   // 设计65：tp 给了就在每个按钮下面写「到了赚 +¥X，+x%」
  const ed = edit ? `<button class="btn sm lk-edit" data-i="${i}" ${lock ? 'disabled' : ''}>改</button>` : '';
  const ops = LK.posOptions(s, code, px); if (!ops.some((o) => o.n >= 1)) return `<div class="lk-pos"><span class="lk-none">钱不够</span>${ed}</div>`;
  return `<div class="lk-pos">${ops.map((o) => `<button class="btn sm ${o.n >= 1 && !lock ? 'gold' : ''}" data-i="${i}" data-q="${o.k}" ${o.n >= 1 && !lock ? '' : 'disabled'}>${o.name}<small>${o.n >= 1 ? `${fmtMoney(o.amt)}·${o.n.toLocaleString()}股` : '不够 1 股'}</small>${o.n >= 1 && tp ? `<small class="lk-earn">${earnAt(tp, px, o.n)}</small>` : ''}</button>`).join('')}${ed}</div>`;
}

/** 照她说的挂单：条件单表填好（价、股数都能改），点「挂单」才挂 */
export function openOrderSheet(legs, title, onPlace) {
  const p = openPanel(title || '照她说的挂单'); const L = legs.map((x) => ({ ...x }));
  /* 设计65：止盈 / 止损每行写「到了赚 +¥X，+x%」：相对买入那张的价（卖单相对成本），改价格跟着变 */
  const baseOf = () => (L[0].kind === 'buy' ? L[0].px : ((SK.myShares(game.state)[L[0].code] || {}).cost ?? null));
  const pctOf = (i) => { const b = baseOf(); return b ? earnAt(L[i].px, b, L[i].n) : ''; };
  const repct = () => p.body.querySelectorAll('[data-pc]').forEach((el) => { el.innerHTML = pctOf(+el.dataset.pc); });
  const draw = () => {
    p.body.innerHTML = `<div class="tr-gain">这几张连在一起：${L[0].kind === 'buy' ? '买进成交以后，止盈、止损才生效；一张成交，另一张自动撤' : '卖出成交以后，抄底那张才生效'}。价和股数都能改。</div>
      ${L.map((x, i) => `<div class="lk-leg"><span class="${x.kind === 'buy' ? '' : TR.toneOf(x.px, L[0].kind === 'buy' ? L[0].px : ((SK.myShares(game.state)[x.code] || {}).cost ?? null), x.kind)}">${TR.KIND[x.kind]}${x.role === 'out' ? '<small>（等前面成交）</small>' : ''}</span><input type="text" inputmode="decimal" autocomplete="off" data-p="${i}" value="${x.px.toFixed(2)}"><span>元</span><input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-n="${i}" value="${x.n}"><span>股</span></div>${x.kind !== 'buy' ? `<div class="lk-pct" data-pc="${i}">${pctOf(i)}</div>` : ''}${i === 0 ? `<div class="lk-pos">${LK.POS.map((q) => `<button class="btn sm" data-q="${q.k}">${x.kind === 'buy' ? q.name : q.sell}</button>`).join('')}</div>` : ''}`).join('')}
      <div class="tr-gain">约 ${fmtMoney(L[0].px * L[0].n)}${L[0].kind === 'buy' ? `（挂上就从投资账户扣 ${fmtMoney(TR.buyCost(game.state, L[0].code, L[0].px, L[0].n))}，现在 ${fmtMoney(TR.availCash(game.state))}）` : ''}</div>
      <button class="btn gold lk-go" style="width:100%">挂单</button>`;
    p.body.querySelectorAll('[data-p]').forEach((el) => { el.oninput = () => { const v = +el.value; if (v > 0) { L[+el.dataset.p].px = v; repct(); } }; el.onchange = () => { L[+el.dataset.p].px = +el.value; repct(); }; });
    p.body.querySelectorAll('[data-n]').forEach((el) => (el.onchange = () => { const n = Math.max(1, Math.floor(+el.value)); for (const x of L) x.n = n; draw(); }));
    p.body.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { const s = game.state; const x = L[0]; const q = LK.POS_BY[b.dataset.q]; const n = x.kind === 'buy' ? LK.posShares(s, x.code, x.px, q.k) : Math.floor(TR.sellable(s, x.code) * q.f); if (n < 1) { toast(x.kind === 'buy' ? '不够 1 股' : '没有能卖的'); return; } for (const y of L) y.n = n; draw(); }));   // 设计46：⅓ / 半 / 全
    p.body.querySelector('.lk-go').onclick = () => { const r = onPlace(L); if (!r.ok) { whyToast(r.why); return; } p.close(); done('挂好了，离线也会触发'); };
  };
  draw(); return p;
}

// ---------- 设计47 看盘改成时间段 ----------
const DAY_MS = TR.DAY;
const hm = (ms) => { const m = Math.max(0, Math.round(ms / 60e3)); if (m < 1) return WSM.secTxt(ms) || "0 秒";   /* 设计75：不到 1 分钟写秒 */ return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`; };
/** 「还剩 8 天（3 小时 12 分）」：游戏天 + 现实时间 */
export const leftText = (ms) => `${Math.floor(Math.round(ms / 60e3) * 60e3 / DAY_MS + 1e-9)} 天（${hm(ms)}）`;
const secName = (id) => (SEC_BY_ID[id] ? SEC_BY_ID[id].name : '她');

/** 点「看盘」：先选哪个秘书（默认智慧最高的；上课中的不能选），开始盯 6 小时 */
export function pickAndStart(after) {
  const s = game.state; const p = openPanel('派谁看盘');
  const ids = Object.keys(s.secs).sort((a, b) => WS_wit(s, b) - WS_wit(s, a));
  p.body.innerHTML = `<div class="tr-gain">看盘 ${WSC.hours * 60 / 24 | 0} 天（${WSC.hours} 小时）· ${W.look.energy} 精力${s.mkt.freeHint ? `（送的看盘 ${s.mkt.freeHint} 次：这次不花精力）` : ''}。这段时间她一直帮你盯着：每 ${SCAN_MIN} 分钟自动看一次，最多 ${GUARD_MIN} 分钟一定有一条能跟的；有涨停、利好、一波、或者你手里的要跌，就列在股票页看盘卡片下面。</div>`;
  ids.forEach((id, i) => {
    const tr = isTraining(s, id); const b = h('button', `sk-row ${tr ? 'dim' : ''}`, `${hasAsset(`assets/sec/${id}/c1.webp`) ? `<img class="sk-logo" src="${asset(`assets/sec/${id}/c1.webp`)}" alt="" style="object-fit:cover;object-position:top;border-radius:50%">` : ''}<div class="sk-name"><b>${secName(id)}${i === 0 ? '<small>（智慧最高）</small>' : ''}</b><small>智慧 ${WS_wit(s, id)}　每次看得到 ${WSM.pickInfo(s, id).see} 只　说对 ${Math.round(WSM.pickInfo(s, id).right * 100)}%${tr ? '　在上课，不能看盘' : ''}</small></div>`);
    if (tr) b.disabled = true;
    b.onclick = () => { const r = WSM.startWatch(s, id, now()); if (!r.ok) { whyToast(r.why); return; } p.close(); done(`${secName(id)}开始看盘了${r.free ? '（送的，不花精力）' : ''}`); if (after) after(); };
    p.body.appendChild(b);
  });
  return p;
}
let sayIt = (who, text) => toast(`${secName(who)}：${text}`); export const setSay = (fn) => { sayIt = fn; };
/** 看盘那一块（投资 → 股票顶上；今日日常也叫）：没看盘「看盘 · 15 天（6 小时）· 5 精力」；看盘中「XX 看盘中 · 还剩…」+「结束看盘」（设计63：去掉「让她现在看一眼」，本来每 2.5 分钟自动扫，设计67） */
export function watchBlock(s, redraw) {
  const t = now(); const w = WSM.ws(s, t); const box = h('div', 'fn-card ws-box');
  const withTips = () => { const L = tipList(s, w, t, redraw); if (L) box.appendChild(L); return box; };
  if (!w) {
    const last = s.mkt.wsLast;
    box.innerHTML = `<div class="ws-top"><div><b>看盘</b><small>选一个秘书盯 ${WSC.hours} 小时：有涨停、利好、一波、你手里的要跌，她发消息给你挂单${s.mkt.freeHint ? `　🎁 送的看盘 ${s.mkt.freeHint} 次` : ''}</small>${last ? `<small>上次：${secName(last.who)}发了 ${last.sent} 条、你挂了 ${last.placed} 条${last.pnl ? `、${last.pnl >= 0 ? '赚' : '亏'} ${fmtMoney(Math.abs(last.pnl))}` : ''}</small>` : ''}</div><button class="btn gold ws-go">看盘 · ${WSC.hours * 60 / 24 | 0} 天（${WSC.hours} 小时）<small>${s.mkt.freeHint ? '送的，不花精力' : `${W.look.energy} 精力`}</small></button></div>`;
    box.querySelector('.ws-go').onclick = () => pickAndStart(redraw);
    return withTips();
  }
  const nm = secName(w.who);
  box.innerHTML = `<div class="ws-top">${hasAsset(`assets/sec/${w.who}/c1.webp`) ? `<img class="ws-face" src="${asset(`assets/sec/${w.who}/c1.webp`)}" alt="">` : ''}<div><b>${nm}看盘中</b><small>还剩 ${leftText(w.end - t)}</small><small>这次：发了 ${w.sent} 条、你挂了 ${w.placed} 条${w.pnl ? `、${w.pnl >= 0 ? '赚' : '亏'} ${fmtMoney(Math.abs(w.pnl))}` : ''}</small></div></div>
    <div class="ind-btns ws-btns"><button class="btn ws-stop">结束看盘</button></div>`;
  box.querySelector('.ws-stop').onclick = () => { const d = WSM.stopWatch(s, now(), true); done(); showDone(d); if (redraw) redraw(); };
  return withTips();
}
/** 设计48：看盘卡片下面「XX给的 N 条」：每条两行，整行点开弹挂单弹框；没有提示时（看盘中）灰字 */
function tipList(s, w, t, redraw) {
  const L = WSM.tips(s); if (!L.length && !w) return null;
  const box = h('div', 'ws-tips');
  const fs = WSM.followState(s, t);   // 设计53：今天还能免费跟几单 / 投资券还有几张
  const fl = fs.free > 0 ? `今天还能免费跟 <b>${fs.free}</b> 单` : `今天免费的用完了 · ${itemIcon('invest', 'cp-mini ws-inv-ic')}投资券还有 <b>${fs.coupons}</b> 张`;
  if (!L.length) { box.innerHTML = `<div class="ws-follow ${fs.free > 0 ? '' : 'out'}">${fl}</div><div class="ws-none">${w ? `这会儿没有新的机会，我继续盯着～<small class="ws-auto">每 ${SCAN_MIN} 分钟自动看一次，最多 ${GUARD_MIN} 分钟一定有一条</small>` : '她正盯着，有机会会告诉你'}</div>`; return box; }
  const by = w ? w.who : L[0].from;
  box.innerHTML = `<div class="ws-follow ${fs.free > 0 ? '' : 'out'}">${fl}</div><div class="ws-tips-t">${secName(by)}给的 ${L.length} 条</div>` + L.map((x) => { const d = x.data; const nm = SK.BY[d.code].name;
    let l1, l2;
    if (d.pre) { l1 = `<b>${nm}</b>　有利好，马上要出`; l2 = `等能「现在买、${Math.ceil(WSC.win / 2)} 分钟内卖」时出按钮`; }
    else if (d.kind === 'fall') { l1 = `<b>${nm}</b>　要跌 · 你手里 ${TR.sellable(s, d.code).toLocaleString()} 股`; l2 = `现在卖 <span class="down">${yuan(d.X)}</span> · 不卖还要跌 ${Math.abs(d.g * 100).toFixed(1)}%`; }
    else { l1 = `${d.kind === 'lu' ? '🔥 ' : ''}<b>${nm}</b>　${KIND_T[d.kind].replace('🔥 ', '')} · +${(d.g * 100).toFixed(1)}%`; l2 = `${yuan(d.X)} 买 → <span class="${TR.toneOf(d.Y, d.X, 'tp')}">${yuan(d.Y)}</span> 卖<small class="ws-low">${cdSpan(d)} · 约 ${d.mins} 分钟内完成 · 止损 <span class="${TR.toneOf(d.Z, d.X, 'sl')}">${yuan(d.Z)}</span></small>`; }   // 设计59
    return `<button class="ws-tip-row ${d.pre ? 'pre' : ''}" data-t="${x.id}" data-c="${d.code}"><div><div class="l1">${l1}${x.seen || d.pre ? '' : '<i class="ws-new">新</i>'}</div><div class="l2">${l2}</div></div><i>›</i></button>`; }).join('');
  box.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { const m = WSM.tipById(s, +b.dataset.t); const code = m ? m.data.code : b.dataset.c; gotoTipFn(code, +b.dataset.t, true); }));   // 设计80：点一条也打开个股页
  return box;
}

/** 结束：弹一句台词 + 这段时间战绩 */
let showDoneFn = (d) => toast(`${secName(d.who)}：${d.line}（发了 ${d.sent} 条，你挂了 ${d.placed} 条）`);
export const setShowDone = (fn) => { showDoneFn = fn; };
export const showDone = (d) => { if (d) showDoneFn(d); };

/** 设计67 / 75：「还能跟 X」——离低点那一跳还有多久（现实时间，写到秒：2 分 30 秒、35 秒）；不到 1 分钟橙色；到了「低点过了，等下一条」 */
const TICK_MS = SK.SCFG.tickSec * 1000;
export const lowLeft = (d, t = now()) => (d && d.lowTk != null ? d.lowTk * TICK_MS - t : null);
const followTxt = WSM.followTxt;
const cdSpan = (d, big = false) => { secClock(); const x = followTxt(lowLeft(d)); return `<span class="ws-cd${big ? ' big' : ''} ${x.cls}" data-lowtk="${d.lowTk}">${x.text}</span>`; };
/** 每秒刷新所有「还能跟」；弹框里到了：按钮变灰、写「低点过了，等下一条」 */
function cdTick() {
  const t = now();
  document.querySelectorAll('.ws-cd[data-lowtk]').forEach((el) => {
    const x = followTxt(+el.dataset.lowtk * TICK_MS - t); if (el.textContent !== x.text) el.textContent = x.text; el.classList.toggle('soon', x.cls === 'soon'); el.classList.toggle('past', x.cls === 'past');
    if (x.cls === 'past') { const box = el.closest('.lk-look'); if (box && !box.classList.contains('past')) pastLook(box); }
  });
}
function pastLook(box) { box.classList.add('past'); box.querySelectorAll('.lk-pos button').forEach((b) => { b.disabled = true; b.classList.remove('gold'); }); }
/** 设计75：股票页上的倒计时（看盘提示「还能跟」、持仓页 .eta）共用一个每秒计时器：只改这几处文字；页面上没有了（离开股票页）就停掉，下次画出来再开 */
const SEC_FNS = []; export const addSecTick = (fn) => { SEC_FNS.push(fn); };
let secIv = null;
const anyLive = () => [...document.querySelectorAll('.eta[data-eta], .ws-cd[data-lowtk], .ord-left[data-end]')].some((el) => el.isConnected && el.offsetParent !== null);
export function secClock() {
  if (secIv || typeof document === 'undefined' || typeof setInterval === 'undefined') return;
  secIv = setInterval(() => { if (!anyLive()) { clearInterval(secIv); secIv = null; return; } cdTick(); for (const fn of SEC_FNS) fn(); }, 1000);
}
export const secClockOn = () => !!secIv;
/** 弹框标题：秘书写全名（设计53 第四节） */
/** 提示的种类文字 */
const KIND_T = { lu: `🔥 ${Math.ceil(WSC.win / 2)} 分钟内封涨停`, news: '有利好', wave: '能涨一波', fall: '要跌' };
/** 设计80：个股页最上面的「看盘提示」卡（原来 openWsMsg 小面板的内容）：买的 ⅓仓 / 半仓 / 全仓，要跌的 卖 ⅓ / 一半 / 全部；
    这只没有没过期的提示就不出；点进来那条过了写灰字「这条已经过了，等下一条」；挂完变「已挂单 ✓」；预告写灰字、能买了按钮自己出来。
    返回 { el, stop }：el 放在个股页最上面；每跳（价钱变）自己刷新，个股页关了自己停 */
export const tipOf = (s, code) => WSM.tips(s).find((x) => x.data.code === code) || null;
export function wsCard(code, tipId = null, onChange = null) {   // onChange：挂了单 / 收起了，个股页跟着刷新（投资账户、挂单）
  const s = game.state; const el = h('div', 'ws-card'); let placed = '', gone = false, iv = null;
  const mark = () => { let ch = false; for (const x of WSM.tips(s)) if (x.data.code === code && WSM.seeTip(s, x.id)) ch = true; if (ch) game.changed(); };   // 设计48：打开就算看过（红点减）
  const draw = () => {
    if (placed) { el.className = 'ws-card done'; el.innerHTML = `<div class="ws-card-t">看盘提示</div><div class="ws-card-done">已挂单 ✓<small>${placed}</small></div>`; return; }
    const msg = tipOf(s, code);
    if (!msg) {
      if (tipId != null || gone) { el.className = 'ws-card past'; el.innerHTML = `<div class="ws-card-t">看盘提示</div><div class="ws-card-past">这条已经过了，等下一条</div>`; } else { el.className = 'ws-card hide'; el.innerHTML = ''; }
      return;
    }
    gone = true; mark(); const d = msg.data; el.className = `ws-card${d.lu ? ' lu' : ''}`;
    const top = `<div class="ws-card-t">${head(msg.from, `${secName(msg.from)}：${d.kind === 'fall' ? '要跌' : KIND_T[d.kind].replace('🔥 ', '')}`)}</div>`;
    if (d.pre) { el.innerHTML = `${top}<div class="lk-look pre"><div class="lk-l1"><b>${SK.BY[code].name}</b><em>有利好，马上要出</em></div><div class="ws-card-past">等能「现在买、${Math.ceil(WSC.win / 2)} 分钟内卖」时出按钮</div></div>`; return; }
    if (d.kind === 'fall') {
      const have = TR.sellable(s, code);
      el.innerHTML = `${top}<div class="lk-look"><div class="lk-l1"><b>${SK.BY[code].name}</b><em class="down">要跌</em></div>
        <div class="lk-l2"><span>现在卖 <b class="${TR.toneOf(d.X, (SK.myShares(s)[code] || {}).cost ?? null, 'sl')}">${yuan(d.X)}</b>（1 分钟内卖掉）</span><span>不卖还要跌 ${Math.abs(d.g * 100).toFixed(1)}%</span><span>你手里能卖 ${have.toLocaleString()} 股</span></div>
        <div class="lk-pos">${LK.POS.map((q) => { const n = Math.floor(have * q.f); return `<button class="btn sm ${n >= 1 ? 'gold' : ''}" data-s="${q.k}" ${n >= 1 ? '' : 'disabled'}>卖${q.sell}<small>${n >= 1 ? `${n.toLocaleString()}股` : '没有能卖的'}</small></button>`; }).join('')}</div></div>
        <button class="lk-no">不用了</button>`;
      el.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { const r = WSM.sellWs(s, msg, b.dataset.s, now()); if (!r.ok) { whyToast(r.why); return; } placed = `现在卖 ${yuan(d.X)} · ${r.n.toLocaleString()} 股`; draw(); if (onChange) onChange(); done(`挂好了：${SK.BY[code].name} 现在卖 ¥${d.X} · ${r.n.toLocaleString()} 股`); }));
    } else {
      const fs = WSM.followState(s, now()); const lock = !fs.ok;   // 设计53：免费用完用投资券；没券按钮灰、去卡包买
      const fl = fs.free > 0 ? `<div class="ws-follow-s">今天还能免费跟 ${fs.free} 单</div>` : fs.coupons > 0 ? `<div class="ws-follow-s coupon">${itemIcon('invest', 'cp-card-ic ws-inv-big')}用 1 张投资券跟<small>（还有 ${fs.coupons} 张）</small></div>` : `<div class="ws-follow-s none">${itemIcon('invest', 'cp-card-ic ws-inv-big')}今天免费的 ${WSC.freePerDay} 单用完了，没有投资券${goBuyHtml('invest')}</div>`;
      el.innerHTML = `${top}<div class="lk-look ${d.lu ? 'lu' : ''}">
        <div class="lk-l1"><b>${SK.BY[code].name}</b><em class="${d.lu ? 'hot' : ''}">${KIND_T[d.kind]} · +${(d.g * 100).toFixed(1)}%</em></div>
        ${d.lowTk != null ? `<div class="ws-cd-row">${cdSpan(d, true)}</div>` : ''}<div class="lk-l2"><span><b>${yuan(d.X)}</b> 买 → <b class="${TR.toneOf(d.Y, d.X, 'tp')}">${yuan(d.Y)}</b> 卖 · 约 ${d.mins} 分钟内完成</span><span>止损 <b class="${TR.toneOf(d.Z, d.X, 'sl')}">${yuan(d.Z)}</b></span></div>
        ${fl}${posBtns(s, code, d.X, 0, true, lock, d.Y)}</div>
        <div class="tr-gain">点一个仓位就按她给的价挂上三张联动单：到低点那一刻买进（没买进自动撤、钱退回），从挂单起 ${Math.ceil(WSC.win / 2)} 分钟内卖掉（止盈 / 止损 / 到时按现价卖）。价钱每跳跟着变。</div>
        <button class="lk-no">不用了</button>`;
      bindGoBuy(el, () => {});
      el.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { const r = WSM.placeWs(s, msg, b.dataset.q, now()); if (!r.ok) { whyToast(r.why); draw(); return; } placed = `${r.pos} ${r.n.toLocaleString()} 股 · ${yuan(d.X)} 买 → ${yuan(d.Y)} 卖${r.coupon ? '（用了 1 张投资券）' : ''}`; draw(); if (onChange) onChange(); done(`挂好了：${SK.BY[code].name} ${r.pos} ${r.n.toLocaleString()} 股${r.coupon ? '（用了 1 张投资券）' : ''}`); }));
      const ed = el.querySelector('.lk-edit'); if (ed) ed.onclick = () => { const n = Math.max(1, LK.posShares(s, code, d.X, 'third')); openOrderSheet(LK.legsOfRow({ code, X: d.X, Y: d.Y, Z: d.Z, n }), `挂 ${SK.BY[code].name}`, (legs) => { const r = WSM.placeLegs(s, msg, legs, now()); if (r.ok) { placed = `按改过的挂了 ${legs[0].n.toLocaleString()} 股`; draw(); if (onChange) onChange(); } return r; }); };
    }
    el.querySelector('.lk-no').onclick = () => { WSM.dismissTip(s, msg.id); gone = false; tipId = null; draw(); done('收起了，这次看盘她不再说这只'); };
  };
  draw();
  let lastTick = s.mkt.tick;
  iv = setInterval(() => { if (!el.isConnected) { if (iv && el.dataset.on) { clearInterval(iv); iv = null; } return; } el.dataset.on = '1'; if (s.mkt.tick !== lastTick) { lastTick = s.mkt.tick; if (!document.querySelector('.lk-leg')) draw(); } }, 500);   // 设计51：价钱每跳刷新
  return { el, redraw: draw, stop: () => { clearInterval(iv); iv = null; } };
}

/** 设计47：看盘发了消息，游戏里弹一个小提示条「夏芷晴：平果有机会，去看看」，点了打开那条消息（5 秒后自己收起） */
let tipTimer = null; let gotoTipFn = () => {}; export const setGotoTip = (fn) => { gotoTipFn = fn; };   // 设计80：stocks.js 挂：打开那只的个股页
export function wsTipBar(x) {
  const s = game.state; const ph = document.querySelector('#phone') || document.body;
  let bar = document.querySelector('.ws-tip'); if (!bar) { bar = h('button', 'ws-tip'); ph.appendChild(bar); }
  bar.innerHTML = `${hasAsset(`assets/sec/${x.who}/c1.webp`) ? `<img src="${asset(`assets/sec/${x.who}/c1.webp`)}" alt="">` : ''}<span><b>${secName(x.who)}</b>：${x.text}</span><i>›</i>`;
  bar.classList.add('show');
  bar.onclick = () => { bar.classList.remove('show'); gotoTipFn(x.code, x.id); };   // 设计80：直接打开那只的个股页（过了的也打开，卡片写「这条已经过了」）
  clearTimeout(tipTimer); tipTimer = setTimeout(() => bar.classList.remove('show'), 5000);
}

export { I, busy };
