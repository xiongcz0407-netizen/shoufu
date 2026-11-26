// 亲自站柜台（V2-04，设计28 第一节）：上半屏门店图 + 店名 / 今天主推 / 天气；下半屏柜台顾客排队（最多 4 个）；底部今天的统计和「离开柜台」
// 离开页面就停（离线没有）；同一时间只能站一家店
import * as CT from '../core/counter.js?v=a184462c';
import { IND_BY_ID } from '../config/industries.js?v=a184462c';
import { SEC_BY_ID } from '../config/secretaries.js?v=a184462c';
import { fmtMoney } from '../core/format.js?v=a184462c';
import { asset, hasAsset } from '../platform/assets.js?v=a184462c';
import { game } from '../game.js?v=a184462c';
import { now } from '../core/clock.js?v=a184462c';
import { h, toast } from './dom.js?v=a184462c';
import { openFull } from './shell.js?v=a184462c';
import { isStoryPlaying } from './story.js?v=a184462c';
import { openPanel } from './dom.js?v=a184462c';
import * as I from '../core/inbox.js?v=a184462c';
import { actOn } from './inbox.js?v=a184462c';
import * as AGD from '../core/agenda.js?v=a184462c';

// V0.2.3（设计35 第四节）：离开柜台连击保留 2 分钟，2 分钟内回来接着算
const KEEP_MS = 2 * 60e3; let kept = null;
const KIND_TAG = { request: '请示', event: '事件', invite: '邀请' };
/** 柜台顶上的提示条：第一件要你动手的事（经营事件 / 请示 / 邀请 / 急报 …），没有就看日程里现在能去的 */
function pendingThing(s, t) {
  const m = (s.inbox || []).find((x) => x.status === 'open' && I.NEEDS_ACTION[x.kind] && (x.actions || []).length);
  if (m) return { kind: 'msg', m, text: `${m.type === 'biz_event' ? '📋' : m.kind === 'request' ? '✋' : '🔔'} ${m.type === 'biz_event' ? '经营' : KIND_TAG[m.kind] || '消息'}：${m.title.replace(/^经营：/, '')}` };
  try { const it = AGD.unlocked(s) && AGD.ag(s).items.find((x) => !x.ext && ['invite', 'accepted'].includes(x.status) && !AGD.whyAttend(s, x, t)); if (it) return { kind: 'agenda', it, text: `📅 日程：${it.title}（现在能去）` }; } catch (e) { /* 日程没开 */ }
  return null;
}

const C = CT.COUNTER_CFG;
let open = null;   // 正在站的那一个（同一时间只能站一家）
const money = (n) => (n >= 1e4 ? fmtMoney(n) : `¥${n < 10 ? n.toFixed(1) : Math.round(n)}`);

/** 门店线详情里「去站柜台」按钮（ui/company.js 调） */
export function counterBtnHtml(s, id) {
  const why = CT.whyNot(s, id);
  return `<button class="btn ct-go ${why ? '' : 'gold'}" ${why ? 'disabled' : ''}>${why ? why : '去站柜台'}</button>`;
}
export function bindCounterBtn(root, id) { const b = root.querySelector('.ct-go'); if (b) b.onclick = () => openCounter(id); }

export function openCounter(id) {
  const s0 = game.state; const st0 = CT.startSession(s0, id, now()); if (!st0.ok) { toast(st0.why); return; }
  if (open) open.close();
  const cfg = IND_BY_ID[id]; const sess = st0.sess;
  if (kept && now() < kept.until) sess.combo = kept.combo; kept = null; // 2 分钟内回来，连击接着算
  let lastTick = now(), queue = [], nextAt = now() + 1500, secId = null, secLine = null, lastSave = now(), startAt = now(), minuteAt = now() + 60e3, comboShown = sess.combo || 0;
  const p = openFull(`站柜台 · ${cfg.name}`, { onClose: () => { clearInterval(timer); open = null; kept = { combo: sess.combo || 0, until: now() + KEEP_MS }; game.changed(); game.save(); } });
  open = p;
  const lk = CT.lookOf(s0, id); const img = `assets/ind/${cfg.img[lk]}.webp`;
  const top = h('div', 'ct-top', '');
  if (hasAsset(img)) top.style.backgroundImage = `linear-gradient(rgba(8,12,22,.35),rgba(8,12,22,.75)),url('${asset(img)}')`;
  const secs = h('div', 'tabs ct-secs');
  const cap = h('div', 'ct-cap', '今天够忙了，歇会儿吧（顾客照来，不再进账）');
  const alert = h('div', 'ct-alert'); alert.style.display = 'none';
  const q = h('div', 'ct-queue');
  const fl = h('div', 'ct-floats'); // 飘字单独一层：drawQ 不碰它（以前整块重画，飘字动画反复从头播）
  const foot = h('div', 'ct-foot');
  p.body.classList.add('ct-body');
  const qwrap = h('div', 'ct-qwrap'); qwrap.append(q, fl);
  p.body.append(top, alert, secs, cap, qwrap, foot);
  alert.onclick = () => { const x = pendingThing(game.state, now()); if (!x) return; if (x.kind === 'agenda') { import('./agenda.js?v=a184462c').then((A) => A.openAgenda()); return; } openThing(x.m); };
  /** 在柜台上面弹事件卡（同消息里那张，选项一样），选完回柜台 */
  const openThing = (m) => {
    const s = game.state; const from = SEC_BY_ID[m.from];
    const pn = openPanel(m.title);
    pn.body.innerHTML = `${from ? `<div class="tr-gain">${from.name}：</div>` : ''}<div class="ct-ev-body">${m.body}</div><div class="ind-btns" style="margin-top:10px">${m.actions.map((a) => `<button class="btn ${a.key === 'approve' ? 'gold' : ''}" data-a="${a.key}">${a.label}</button>`).join('')}</div>`;
    pn.body.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { const k = b.dataset.a; pn.close(); actOn(game.state, m, k, () => {}); I.markRead(game.state, m.id); game.changed(); game.save(); }));
  };
  const drawSecs = () => {
    const s = game.state;
    secs.innerHTML = `<button class="tab ${secId ? '' : 'on'}" data-s="">自己站</button>` + Object.keys(s.secs).map((k) => { const why = CT.whySec(s, k); return `<button class="tab ${secId === k ? 'on' : ''}" data-s="${k}" ${why ? 'disabled' : ''}>带${SEC_BY_ID[k].name}${why ? (why.includes('踩点') ? '（踩点中）' : '（上课中）') : ''}</button>`; }).join('');
  };
  secs.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b || b.disabled) return; secId = b.dataset.s || null; drawSecs(); });
  drawSecs();
  const drawTop = () => {
    const s = game.state; const t = now(); const pk = CT.pickOf(s, id, t); const w = CT.weatherOf(s, t);
    top.innerHTML = `<div class="ct-name"><b>${cfg.name} · ${cfg.lookNames[lk]}</b>${pk ? `<small>今天主推：${pk.text}${pk.right ? '（对路，来客快些）' : ''}</small>` : ''}${w ? `<small>今天天气：${w}</small>` : ''}${CT.hasManager(s, id) ? '<small>有店长了：你只是搭把手（进账 ×0.5）</small>' : ''}</div>${secLine ? `<div class="ct-say"><b>${SEC_BY_ID[secId] ? SEC_BY_ID[secId].name : ''}</b>${secLine.text}</div>` : ''}`;
  };
  const card = (c, t) => {
    const s = game.state; const left = c.kind === 'thief' ? c.deadline - t : C.patience * 1000 - (t - c.at); const pc = Math.max(0, Math.min(100, left / ((c.kind === 'thief' ? CT.thiefWindow(secId) : C.patience) * 1000) * 100));
    let body = '', btns = '';
    if (c.kind === 'thief') { body = `<b class="neg">${c.say}</b><small>${Math.ceil(left / 1000)} 秒内抓住他</small>`; btns = `<button class="btn gold" data-a="catch" data-q="${c.seq}">抓住</button>`; }
    else if (c.kind === 'change') { body = `<b>${c.say}</b><small>赔就赔 ${money(C.events.change.pay * CT.mulOf(s, id))}；查监控可能是他记错，也可能真是你错</small>`; btns = `<button class="btn" data-a="pay" data-q="${c.seq}">赔给他</button><button class="btn" data-a="check" data-q="${c.seq}">查监控</button>`; }
    else {
      body = `<b>${c.kind === 'chat' ? `${c.who}：${c.say}` : c.say}</b><small>客单价 ¥${c.price}${c.upsell ? `（+${C.events.upsell.add * 100}%，看她要不要）` : ''}</small>`;
      if (c.kind === 'upsell') btns += `<button class="btn ${c.upsell ? 'on' : ''}" data-a="up" data-q="${c.seq}">${c.item}</button>`;
      if (c.kind === 'chat' && !c.chatted) btns += `<button class="btn" data-a="chat" data-q="${c.seq}">聊两句</button>`;
      btns += `<button class="btn gold" data-a="pay-out" data-q="${c.seq}">结账</button>`;
    }
    return `<div class="ct-card ${c.kind === 'thief' ? 'red' : ''}"><i class="ct-av"></i><div class="ct-txt">${body}<i class="ct-pat"><b style="width:${pc}%"></b></i></div><div class="ct-btns">${btns}</div></div>`;
  };
  const drawQ = () => { const t = now(); const hit = sess.combo !== comboShown && sess.combo % C.combo.every === 0; comboShown = sess.combo || 0; q.innerHTML = (sess.combo >= 2 ? `<div class="ct-combo${hit ? ' hit' : ''}">连击 ×${sess.combo}<small>${sess.combo % C.combo.every === 0 ? `这一单 +${Math.round(C.combo.bonus * 100)}%` : `再 ${C.combo.every - (sess.combo % C.combo.every)} 单 +${Math.round(C.combo.bonus * 100)}%`}</small></div>` : '') + queue.map((c) => card(c, t)).join('')  || '<div class="tr-gain" style="text-align:center;margin-top:30px">等客人进门……</div>'; };
  const drawFoot = () => {
    const s = game.state; const d = CT.statToday(s, id, now());
    foot.innerHTML = `<div class="ct-stat"><span>今天接待 <b>${d.n}</b> 位</span><span>今天营业额 <b>${money(d.rev)}</b></span><span>今天赚了 <b>${money(d.earn || 0)}</b></span><span>加购 <b>${d.up}</b>/${d.upTry}</span><span>跑掉 <b class="${d.lost > C.lostRepAt ? 'neg' : ''}">${d.lost}</b> 位</span></div><button class="btn big ct-leave">离开柜台</button>`;
    foot.querySelector('.ct-leave').onclick = () => p.close();
    cap.style.display = CT.leftToday(s, id, now()) <= 0 ? '' : 'none';
  };
  let popN = 0; const pop = (text, neg = false) => { const e = h('i', 'ct-float' + (neg ? ' neg' : ''), text); e.style.top = `${50 + (popN++ % 3) * 26}px`; fl.appendChild(e); setTimeout(() => e.remove(), 1200); };
  const paused = () => isStoryPlaying() || !!document.querySelector('.story, .panel-mask'); // 剧情、事件卡、日程、谈判……盖在柜台上时暂停
  const take = (seq) => { const i = queue.findIndex((c) => c.seq === +seq); return i < 0 ? null : queue.splice(i, 1)[0]; };
  q.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return; e.preventDefault();
    const s = game.state; const t = now(); const a = b.dataset.a; const seq = +b.dataset.q; const c = queue.find((x) => x.seq === seq); if (!c) return;
    if (a === 'up') { c.upsell = !c.upsell; drawQ(); return; }
    if (a === 'chat') { const r = CT.chat(s, sess, t); c.chatted = true; pop(r.rep ? `口碑 +${r.rep}` : '聊得挺开心'); drawQ(); return; }
    take(seq);
    if (a === 'pay-out') { const r = CT.checkout(s, c, sess, t, { secId, upsell: !!c.upsell }); if (!r.ok) { toast(r.why); return; } pop(r.amount > 0 ? `${r.comboHit ? `连击 ×${r.combo}！+${Math.round(C.combo.bonus * 100)}% ` : ''}营业额 +${money(r.sale)} · 赚 ${money(r.amount)}${c.upsell ? (r.upsold ? ' 加购成功' : ' 没加购') : ''}` : '今天够忙了'); }
    else if (a === 'catch') { CT.thief(s, c, sess, t, true); pop(`抓住了！口碑 +${C.events.thief.rep}`); }
    else if (a === 'pay') { const r = CT.change(s, sess, t, 'pay'); pop(`赔了 ${money(r.paid)}`, true); }
    else if (a === 'check') { const r = CT.change(s, sess, t, 'check'); pop(r.his ? `是他记错了，口碑 +${r.rep}` : `真是你找错了，口碑 ${r.rep}`, !r.his); }
    game.changed(); drawQ(); drawFoot();
  });
  const tick = () => {
    const s = game.state; const t = now();
    // 剧情（比如目标完成）盖住柜台时暂停：顾客不走、不来新的
    const th = pendingThing(s, t); alert.style.display = th ? '' : 'none'; if (th) alert.innerHTML = `${th.text}<em>点这里处理（柜台先停着）</em>`;
    if (paused()) { const dt = t - lastTick; lastTick = t; nextAt += dt; minuteAt += dt; for (const c of queue) { c.at += dt; if (c.deadline) c.deadline += dt; } return; }
    lastTick = t;
    if (t >= nextAt) { if (queue.length < C.queueMax) { const c = CT.newCustomer(s, sess, t); if (c.kind === 'thief') c.deadline = t + CT.thiefWindow(secId) * 1000; queue.push(c); } nextAt = t + CT.nextGap(s, id, t) * 1000; }
    for (const c of queue.slice()) {
      if (c.kind === 'thief' && t >= c.deadline) { take(c.seq); const r = CT.thief(s, c, sess, t, false); pop(`没抓到，丢了 ${money(r.loss)} 的货`, true); }
      else if (c.kind === 'change' && t - c.at >= C.patience * 1000) { take(c.seq); const r = CT.change(s, sess, t, 'pay'); pop(`没理他，赔了 ${money(r.paid)}`, true); }
      else if (c.kind !== 'thief' && c.kind !== 'change' && t - c.at >= C.patience * 1000) { take(c.seq); const r = CT.walkout(s, sess, t); pop(r.rep ? '顾客等烦走了（今天跑太多，口碑 −1）' : '顾客等烦走了', true); }
    }
    if (t >= minuteAt) { minuteAt += 60e3; const line = CT.secMinute(s, sess, secId, t); if (line) secLine = { text: line, until: t + 6000 }; }
    if (secLine && t > secLine.until) secLine = null;
    if (t - lastSave > 30e3) { lastSave = t; game.changed(); game.save(); }
    drawTop(); drawQ(); drawFoot();
  };
  // 调试 / 截图用：直接放一位顾客进来（?debug=1 才有 window.__game）
  if (window.__game) window.__counterDbg = { add: (k = 'normal', price = 30) => { const t = now(); const c = CT.newCustomer(game.state, sess, t); c.kind = k; c.price = price; if (k === 'upsell') c.item = C.upsellItem[id][0]; if (k === 'chat') { c.who = C.regulars[0]; c.say = C.regularSay[0]; } if (k === 'thief') { c.say = '有人把东西塞进口袋'; c.deadline = t + CT.thiefWindow(secId) * 1000; } if (k === 'change') c.say = '顾客说你少找了 10 块'; queue.push(c); drawQ(); }, hold: () => { nextAt = Infinity; } };
  const timer = setInterval(tick, 250); tick();
  return p;
}
