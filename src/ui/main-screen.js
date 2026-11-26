// 主界面：背景（跟称号换）、顶部条、立绘、台词气泡、底部 5 个按钮
import { asset, hasAsset } from '../platform/assets.js?v=06229def';
import { onTap } from '../platform/input.js?v=06229def';
import { TITLES } from '../config/titles.js?v=06229def';
import { SEC_BY_ID } from '../config/secretaries.js?v=06229def';
import { fmtMoney, fmtNum } from '../core/format.js?v=06229def';
import { gameDate, dateText } from '../core/gametime.js?v=06229def';
import * as PK from '../core/pick.js?v=06229def'; // V2-03 进货挑品
import { bell as bellOf } from '../core/inbox.js?v=06229def';
import { now as nowFn } from '../core/clock.js?v=06229def';
import { game } from '../game.js?v=06229def';
import { h, openPanel, toast } from './dom.js?v=06229def';
import { createPortrait } from './portrait.js?v=06229def';
import { audio } from '../platform/audio.js?v=06229def';
import { voiceFile } from '../config/lines.js?v=06229def';

export const NAV = [
  { key: 'industry', name: '产业', icon: 'icon_industry' },
  { key: 'secretary', name: '秘书', icon: 'icon_secretary' },
  { key: 'battle', name: '商战', icon: 'icon_battle' },
  { key: 'assets', name: '资产', icon: 'icon_assets' },
  { key: 'more', name: '更多', icon: 'icon_more' },
];
const navHandlers = {};
/** 各功能注册自己的底部按钮行为 */
export const onNav = (key, fn) => { navHandlers[key] = fn; };
/** 各功能往顶部条算身价（第 4 项接上） */
export let netWorthOf = (s) => s.cash;
export const setNetWorth = (fn) => { netWorthOf = fn; };
/** 点立绘时说什么（第 7 项接上）；返回台词或 null */
let tapLine = (s, secId, part) => ({ head: '老板，我脸上有东西吗？', body: '老板好！今天也要加油哦！', legs: '老板……看哪里呢！' })[part];
export const setTapLine = (fn) => { tapLine = fn; };
let switchHandler = null; export const setSwitchHandler = (fn) => { switchHandler = fn; };

let ui = null;

export function bgKeyFor(title) {
  for (let i = title; i >= 0; i--) {
    const k = TITLES[i].bg;
    if (hasAsset(`assets/bg/${k}.webp`)) return k;
  }
  return null;
}

// 首页按钮行为（main.js 接上）：key → fn
const homeActions = {};
export const setHomeAction = (key, fn) => { homeActions[key] = fn; };
const run = (k, ...a) => homeActions[k] && homeActions[k](...a);
// 待办条内容（main.js 接上）：返回 { text, onClick }
let todoProvider = () => null;
export const setTodoProvider = (fn) => { todoProvider = fn; };
// 首页浮动按钮：左边签到、限时；右边商场、约会、衣柜（设计18 第三节）
const FLOATS = [
  { key: 'daily', side: 'l', name: '签到', icon: 'icon_checkin' },
  { key: 'routine', side: 'l', name: '今日日常', icon: 'icon_routine' }, // 设计39 第六节（开发2，ui/routine.js）
  { key: 'wallet', side: 'l', name: '卡包', icon: 'icon_wallet' }, // 设计39 第五之二节 卡包（开发2，ui/coupon.js openWallet）
  { key: 'limited', side: 'l', name: '限时', icon: 'icon_invite' },
  { key: 'agenda', side: 'l', name: '日程', icon: 'icon_agenda' }, // V3-02 日程表（开发2，ui/agenda.js）：小老板起显示，红点 = 待定或现在能去的 // V2-04：只在打工人、小老板显示（main.js 的 floatState）
  { key: 'mall', side: 'r', name: '商场', icon: 'icon_mall' },
  { key: 'date', side: 'r', name: '约会', icon: 'icon_date' },
  { key: 'wardrobe', side: 'r', name: '衣柜', icon: 'icon_wardrobe' },
];
let floatState = () => ({}); // key → { show, red, label }
export const setFloatState = (fn) => { floatState = fn; };

/** 老板头像（打工人 / 老板 / 首富 三张）；没图就写名字第一个字 */
export function avatarKey(title) { const list = (TITLES[title] || TITLES[0]).avatar || ['me_1']; return list.find((k) => hasAsset(`assets/me/${k}.webp`)) || list[list.length - 1]; }
export function setAvatar(el, s) {
  const f = `assets/me/${avatarKey(s.title)}.webp`;
  if (hasAsset(f)) { if (el.dataset.k !== f) { el.dataset.k = f; el.innerHTML = `<img src="${asset(f)}" alt="">`; } }
  else el.textContent = (s.bossName || '我').slice(0, 1);
}
export function buildMain(root) {
  root.innerHTML = '';
  const bg = h('div', 'main-bg');
  const top = h('div', 'topbar2', `
    <div class="tb-l1"><button class="tb-avatar">我</button><div class="tb-who"><b class="tb-boss"></b><span class="tb-badge"></span></div>
      <div class="tb-worth-box"><small>身价</small><b class="tb-worth"></b></div></div>
    <div class="tb-l2"><span class="tb-date"></span><span class="tb-cash">💰 个人 <b></b></span><button class="tb-bell">${hasAsset('assets/ui/icon_bell.webp') ? `<img src="${asset('assets/ui/icon_bell.webp')}" alt="">` : '🔔'}<i class="dot"></i><i class="cnt"></i></button></div>`);
  const stage = h('div', 'stage');
  const bubble = h('div', 'bubble hidden', '<div class="bubble-name"></div><div class="bubble-text"></div>');
  const fl = h('div', 'floats l'), fr = h('div', 'floats r');
  for (const f of FLOATS) {
    const icon = `assets/ui/${f.icon}.webp`;
    const b = h('button', 'float', `${hasAsset(icon) ? `<img src="${asset(icon)}" alt=""><span>${f.name}</span>` : `<i class="fl-ph">${f.name}</i>`}<i class="dot"></i>`);
    b.dataset.key = f.key;
    onTap(b, () => run(f.key, game.state.current));
    (f.side === 'l' ? fl : fr).appendChild(b);
  }
  const hintSwipe = h('div', 'swipe-hint', '‹ 左右滑换人 ›');
  const todo = h('button', 'todo-bar', '');
  onTap(todo, () => { const t = todoProvider(game.state); t && t.onClick && t.onClick(); });
  // 底部 5 页签由 ui/shell.js 建
  root.append(bg, stage, top, fl, fr, bubble, hintSwipe, todo);
  const portrait = createPortrait(stage);
  ui = { root, bg, top, stage, bubble, portrait, todo, fl, fr, hintSwipe, bubbleTimer: null, lastTitle: -1, lastSec: null, lastWorth: null };

  // 点 = 互动；长按 = 进她的详情；左右滑 = 换陪着的秘书
  let downT = 0, sx = 0, sy = 0, longTimer = null, longFired = false;
  stage.addEventListener('pointerdown', (e) => {
    downT = Date.now(); sx = e.clientX; sy = e.clientY; longFired = false;
    longTimer = setTimeout(() => { longFired = true; run('detail', game.state.current); }, 600);
  });
  stage.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clearTimeout(longTimer); });
  stage.addEventListener('pointercancel', () => clearTimeout(longTimer));
  stage.addEventListener('pointerup', (e) => {
    clearTimeout(longTimer);
    if (longFired) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { swipe(dx < 0 ? 1 : -1); return; }
    if (Math.hypot(dx, dy) > 10) return;
    const s = game.state;
    if (!portrait.current) return;
    portrait.bounce();
    const r = tapLine(s, s.current, portrait.hitPart(e.clientY));
    if (r && typeof r === 'object') say(s.current, r.line, 3200, r.scene); else if (r) say(s.current, r);
  });
  onTap(top.querySelector('.tb-avatar'), () => run('boss'));
  onTap(top.querySelector('.tb-who'), () => run('boss'));
  onTap(top.querySelector('.tb-bell'), () => run('inbox'));
  refresh(game.state);
  game.onChange(refresh);
  return ui;
}

/** 左右滑：按加入顺序换下一个 / 上一个 */
function swipe(dir) {
  const s = game.state; const ids = Object.keys(s.secs);
  if (ids.length < 2) { say(s.current, '现在就我一个人陪着你呀。'); return; }
  const i = ids.indexOf(s.current);
  switchSecretary(ids[(i + dir + ids.length) % ids.length]);
}

/** 台词气泡；scene 给了就试着放配音（没有文件就算了） */
export function say(secId, text, ms = 3200, scene = null) {
  if (!ui || !text) return;
  if (scene && game.state.settings.voice !== false) {
    const f = voiceFile(secId, scene);
    if (hasAsset(f)) audio.play(asset(f));
  }
  const sec = SEC_BY_ID[secId];
  ui.bubble.querySelector('.bubble-name').textContent = sec ? sec.name : '';
  ui.bubble.querySelector('.bubble-text').textContent = text;
  ui.bubble.classList.remove('hidden', 'pop'); void ui.bubble.offsetWidth; ui.bubble.classList.add('pop');
  clearTimeout(ui.bubbleTimer);
  ui.bubbleTimer = setTimeout(() => ui.bubble.classList.add('hidden'), ms);
}

export function showSecretary(secId) {
  const s = game.state;
  if (!s.secs[secId]) return;
  s.current = secId;
  ui.portrait.show(secId, s.secs[secId].outfit || 'c1');
  ui.lastSec = secId + '/' + s.secs[secId].outfit;
}

/** 换装出场（淡出 → 新衣服亮一下淡入） */
export function dressUp(id, outfit) {
  if (!ui) return;
  ui.portrait.show(id, outfit, { fade: 'dress' });
  ui.lastSec = id + '/' + outfit;
}

/** 换成她陪着（会说问候 / 吃醋） */
export function switchSecretary(id) {
  const changed = id !== game.state.current;
  showSecretary(id);
  if (changed && switchHandler) switchHandler(id);
  game.save();
}


function refresh(s) {
  if (!ui) return;
  const t = nowFn();
  const nw = netWorthOf(s);
  ui.top.querySelector('.tb-boss').textContent = s.bossName || '老板';
  setAvatar(ui.top.querySelector('.tb-avatar'), s);
  const w = ui.top.querySelector('.tb-worth');
  w.textContent = fmtNum(nw);
  if (ui.lastWorth != null && nw > ui.lastWorth * 1.001 + 1) { w.classList.remove('up'); void w.offsetWidth; w.classList.add('up'); }
  ui.lastWorth = nw;
  { const x = PK.today(s, t); ui.top.querySelector('.tb-date').textContent = '📅 ' + dateText(gameDate(s, t)) + ` ${PK.PICK_CFG.weatherIcon[x.weather]}${x.holiday ? ' ' + x.holiday.name : ''}`; } /* V2-03 今天的天气、节日 */
  const fz = (s.freezes || []).reduce((a, f) => a + f.amount, 0);
  const left = fz ? Math.max(0, Math.min(...s.freezes.map((f) => f.until)) - t) / 1000 : 0;
  ui.top.querySelector('.tb-cash b').textContent = fmtNum(s.cash - fz) + (fz ? `（冻结 ${fmtNum(fz)} ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(Math.floor(left % 60)).padStart(2, '0')}）` : '');
  const bell = bellOf(s);
  ui.top.querySelector('.tb-bell .dot').style.display = bell.red ? '' : 'none';
  const c = ui.top.querySelector('.tb-bell .cnt'); c.textContent = bell.badge; c.style.display = !bell.red && bell.badge ? '' : 'none';
  if (s.title !== ui.lastTitle) {
    ui.lastTitle = s.title;
    ui.top.querySelector('.tb-badge').textContent = TITLES[s.title].name;
    const k = bgKeyFor(s.title);
    ui.bg.style.backgroundImage = k ? `url("${asset(`assets/bg/${k}.webp`)}")` : 'none';
  }
  const fs = floatState(s);
  for (const b of [...ui.fl.children, ...ui.fr.children]) {
    const st = fs[b.dataset.key] || {};
    b.style.display = st.show === false ? 'none' : '';
    b.querySelector('.dot').style.display = st.red ? '' : 'none';
    if (st.label) (b.querySelector('span') || b.querySelector('.fl-ph')).textContent = st.label;
  }
  ui.hintSwipe.style.display = Object.keys(s.secs).length >= 2 ? '' : 'none';
  const td = todoProvider(s);
  ui.todo.innerHTML = td ? td.text + ' <i>›</i>' : '';
  ui.todo.style.display = td ? '' : 'none';
  const key = s.current + '/' + (s.secs[s.current] && s.secs[s.current].outfit);
  if (key !== ui.lastSec && s.secs[s.current]) showSecretary(s.current);
}
