// 首页「今日日常」（设计39 第六节，开发2）：今天还剩什么，做完划掉，点一项直接跳过去
// 开发1 挂钩：setRoutineHooks({ actions(s, t) → '便利店 4 个生效中、餐饮 2 个已到期' })
import * as DL from '../core/daily.js?v=451b6719';
import * as MG from '../core/manage.js?v=451b6719';
import * as CP from '../core/coupon.js?v=451b6719';
import * as A2 from '../core/affection.js?v=451b6719';
import * as I from '../core/inbox.js?v=451b6719';
import * as TR from '../core/trade.js?v=451b6719';
import * as SK from '../core/stocks.js?v=451b6719';
import * as WSM from '../core/ws.js?v=451b6719'; // 设计47 看盘改成时间段
const wsLeft = (ms) => { const m = Math.max(0, Math.round(ms / 60e3)); return `${Math.floor(Math.round(ms / 60e3) * 60e3 / TR.DAY + 1e-9)} 天（${m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`}）`; };
import { todayCount } from '../core/bizevents.js?v=451b6719';
import { talksLeft, dayKey, DAILY_TALKS } from '../core/affection.js?v=451b6719';
import { SEC_BY_ID } from '../config/secretaries.js?v=451b6719';
import { now } from '../core/clock.js?v=451b6719';
import { game } from '../game.js?v=451b6719';
import { h, openPanel } from './dom.js?v=451b6719';
import { openDaily } from './daily.js?v=451b6719';
import { openInbox } from './inbox.js?v=451b6719';
import { asset, hasAsset } from '../platform/assets.js?v=451b6719';
import { openWallet, couponIcon, itemIcon, walletIcon } from './coupon.js?v=451b6719';
import { openDetail } from './secretary.js?v=451b6719';
import { openTab } from './shell.js?v=451b6719';

const H = { actions: null };
export const setRoutineHooks = (o) => Object.assign(H, o);

/** 今天的清单：[{ key, name, text, done, go }] */
export function routine(s, t = now()) {
  const out = []; const si = DL.signInfo(s, t);
  out.push({ key: 'sign', name: '签到', text: si.signed ? '✓' : `第 ${si.day} 天`, done: si.signed, go: openDaily });
  const ts = DL.tasksFor(s); const tk = s.daily && s.daily.day === dayKey(t) ? s.daily.tasks || {} : {}; const claimed = ts.filter((x) => tk[x.id]).length;
  out.push({ key: 'tasks', name: '每日任务', text: `${claimed}/${ts.length}`, done: ts.length > 0 && claimed >= ts.length, go: openDaily });
  const e = Math.floor(MG.energy(s, t)), em = MG.energyMax(s); const act = H.actions ? H.actions(s, t) : '';
  out.push({ key: 'energy', name: '精力', text: `${e}/${em}${act ? `（${act}）` : ''}`, done: e < 5, go: () => openTab('company') });
  const bc = todayCount(s, t); const rf = CP.refillState(s, t);
  out.push({ key: 'biz', name: '经营事件', text: `${bc.done}/${bc.total}${rf.can ? '（可再来 10 件）' : ''}`, done: bc.total > 0 && bc.done >= bc.total && !rf.can, go: () => openInbox('biz') });
  const imp = I.important(s).length;
  out.push({ key: 'important', name: '重要', text: imp ? `${imp} 件` : '没有', done: !imp, go: () => openInbox('important') });
  const secs = Object.keys(s.secs || {});
  const dated = secs.filter((id) => (A2.daily(s, t).dates || {})[id]);
  out.push({ key: 'date', name: '约会', text: `今天约了 ${dated.length} / ${secs.length} 人`, done: dated.length >= secs.length, go: () => openDetail(secs.find((id) => !dated.includes(id)) || s.current, 'info') });
  if (s.mkt) { const w = WSM.ws(s, t); const d = (s.mkt.wsLast && dayKey(s.mkt.wsLast.at) === dayKey(t)) || (w && dayKey(w.start) === dayKey(t)); out.push({ key: 'look', name: '看盘', text: w ? `${SEC_BY_ID[w.who] ? SEC_BY_ID[w.who].name : ''}看盘中 · 还剩 ${wsLeft(w.end - t)}` : `点一下让秘书盯 ${SK.SCFG.watch.ws.hours} 小时（${SK.SCFG.watch.look.energy} 精力）`, done: !!(w || d), go: () => import('./look.js?v=451b6719').then((u) => (w ? u.lookNowUi() : u.pickAndStart())) }); } // 设计47：看盘 = 一个时间段
  out.push({ key: 'talk', name: '互动', text: secs.map((id) => `${SEC_BY_ID[id].name} ${DAILY_TALKS - Math.min(DAILY_TALKS, talksLeft(s, id, t))}/${DAILY_TALKS}`).join('、'), done: secs.every((id) => talksLeft(s, id, t) <= 0), go: () => openDetail(secs.find((id) => talksLeft(s, id, t) > 0) || s.current, 'info') });
  return out;
}
export const routineTodo = (s, t = now()) => routine(s, t).some((x) => !x.done);

// 底下「我的券」：图标下面两个字 + 张数（Arvin 定）
const SHORT = { potion: '药水', battle: '商战', date: '约会', auto: '自动', event: '事件', talk: '互动' };
// 设计39 第七节：每行前面的小图（没图就不放）
const ROW_IC = { look: 'icon_ticket_battle', sign: 'icon_checkin', tasks: 'icon_routine', energy: 'icon_potion', biz: 'icon_ticket_event', important: 'icon_bell', date: 'icon_date', talk: 'icon_ticket_talk' };
const rowIcon = (k) => (ROW_IC[k] && hasAsset(`assets/ui/${ROW_IC[k]}.webp`) ? `<img class="rt-ic" src="${asset(`assets/ui/${ROW_IC[k]}.webp`)}" alt="">` : '');
// 从今日日常点进去的页面 / 窗口全关掉后，回到今日日常（Arvin：不要回到桌面）
const onTop = () => !!document.querySelector('.panel-mask, .full, .page-layer:not(.hidden), .ub-mask, .story, .sc-scene');
let backT = null;
function backHere() {
  clearInterval(backT); let seen = false, n = 0;
  backT = setInterval(() => { if (onTop()) seen = true; else if (seen) { clearInterval(backT); openRoutine(); } else if (++n > 10) clearInterval(backT); }, 300);
}
export function openRoutine() {
  const p = openPanel(`${rowIcon('tasks').replace('rt-ic', 'rt-head-ic')}今日日常`);
  const draw = () => {
    const s = game.state; const list = routine(s);
    p.body.innerHTML = `<div class="tr-gain">每天 0 点重置。点一项直接过去。</div><div class="rt-list">${list.map((x, i) => `<button class="rt-row ${x.done ? 'done' : ''}" data-i="${i}"><span>${rowIcon(x.key)}${x.done ? '✓ ' : ''}${x.name}</span><b>${x.text}</b><i>›</i></button>`).join('')}</div>
      <button class="btn rt-coupon" style="width:100%;margin-top:8px"><span class="rt-cp-t">${walletIcon('rt-ic')}卡包 · ${couponIcon('rt-ic')}${CP.balance(s)}</span><span class="rt-cp-list">${CP.ITEM_KEYS.map((k) => `<i>${itemIcon(k, 'rt-ic')}<em>${SHORT[k]} ${CP.have(s, k)}</em></i>`).join('')}</span> ›</button>`;
    p.body.querySelectorAll('.rt-row').forEach((b) => (b.onclick = () => { const x = list[+b.dataset.i]; p.close(); setTimeout(() => { x.go(); backHere(); }, 220); }));
    p.body.querySelector('.rt-coupon').onclick = () => { p.close(); setTimeout(() => { openWallet(); backHere(); }, 220); };
  };
  draw();
  const off = game.onChange(() => { if (!document.body.contains(p.body)) { off(); return; } draw(); });
}
