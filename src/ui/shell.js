// 界面框架（设计18）：首页层 + 页面层叠加；底部 5 页签；二级分段；记住上次分段；逐步开放和锁；红点
import { asset, hasAsset } from '../platform/assets.js?v=876cadde';
import { onTap } from '../platform/input.js?v=876cadde';
import { game } from '../game.js?v=876cadde';
import { h, toast } from './dom.js?v=876cadde';

export const TABS = [
  { key: 'company', name: '公司', icon: 'icon_industry' },
  { key: 'secretary', name: '秘书', icon: 'icon_secretary' },
  { key: 'battle', name: '商战', icon: 'icon_battle' },
  { key: 'assets', name: '资产', icon: 'icon_assets' },
  { key: 'wealth', name: '财富', icon: 'icon_tab_wealth' },
];
// 逐步开放（设计18 第六节）：返回 null = 开了；否则是条件文字
export const LOCKS = {
  company: () => null,
  secretary: () => null,
  battle: (s) => ((s.inds.store && s.inds.store.branches >= 2) || s.ui.unlocked.battle ? null : '便利店开到 2 家开放'),
  assets: (s) => (s.flags.cash100k || s.ui.unlocked.assets ? null : '个人现金第一次到 10 万开放'),
  wealth: (s) => ((s.clock && s.clock.monthsDone >= 1) || s.ui.unlocked.wealth ? null : '第一个游戏月结束（第一次发工资、交税）开放'),
};
const pages = {};      // key → { title, segments: [{ key, name, visible?(s), lock?(s), render(body, ctx) }], help? }
const badges = {};     // key → fn(s) → { red, count }
let navEl = null, layer = null, current = null;
const overlays = []; let ignorePop = 0; // 全屏层的栈（返回键一层层关）

export const registerPage = (key, def) => { pages[key] = def; };
export const registerBadge = (key, fn) => { (badges[key] = badges[key] || []).push(fn); };
export const currentTab = () => current && current.key;

/** 底部导航 */
export function buildNav(root) {
  navEl = h('div', 'nav');
  for (const t of TABS) {
    const icon = `assets/ui/${t.icon}.webp`;
    const b = h('button', 'nav-btn', `${hasAsset(icon) ? `<img src="${asset(icon)}" alt="">` : `<i class="nav-ph">${t.name[0]}</i>`}<span>${t.name}</span><i class="lock">🔒</i><i class="dot"></i><i class="cnt"></i>`);
    b.dataset.key = t.key;
    onTap(b, () => openTab(t.key));
    navEl.appendChild(b);
  }
  root.appendChild(navEl);
  layer = h('div', 'page-layer hidden');
  root.appendChild(layer);
  // 手机返回键 / 浏览器后退：先关最上面的全屏层（秘书详情、合同、商场……），再关底部抽屉，最后关页签
  window.addEventListener('popstate', () => {
    if (ignorePop > 0) { ignorePop -= 1; return; }
    const top = overlays.pop(); if (top) { top.close(true); return; }
    const mask = [...document.querySelectorAll('.panel-mask')].pop(); if (mask) { mask.querySelector('.panel-close')?.click(); if (current || overlays.length) history.pushState({ keep: 1 }, ''); return; }
    if (current) closeTab(true);
  });
  refreshNav(game.state);
  game.onChange(refreshNav);
}

/** 锁、红点、刚开放 */
export function refreshNav(s) {
  if (!navEl) return;
  for (const t of TABS) {
    const b = navEl.querySelector(`[data-key=${t.key}]`);
    const why = LOCKS[t.key](s);
    if (!why && !s.ui.unlocked[t.key]) { s.ui.unlocked[t.key] = true; game.emit('tabUnlocked', t.key); }
    b.classList.toggle('locked', !!why);
    let red = 0, count = 0;
    for (const fn of badges[t.key] || []) { const r = fn(s) || {}; red += r.red || 0; count += r.count || 0; }
    b.querySelector('.dot').style.display = !why && red ? '' : 'none';
    const c = b.querySelector('.cnt'); c.textContent = count > 99 ? '99+' : count; c.style.display = !why && !red && count ? '' : 'none';
    b.classList.toggle('on', !!current && current.key === t.key);
  }
}
export function flashTab(key) {
  const b = navEl && navEl.querySelector(`[data-key=${key}]`);
  if (b) { b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); }
}

/** 打开页签：标题栏（返回）+ 分段 + 内容；记住上次分段 */
export function openTab(key, segKey) {
  const s = game.state; const why = LOCKS[key](s);
  if (why) { toast(`🔒 ${why}`); return; }
  const def = pages[key]; if (!def) { toast('还在做'); return; }
  if (!current) history.pushState({ page: key }, '');
  const segs = def.segments.filter((x) => !x.visible || x.visible(s));
  let seg = segKey || s.ui.lastSeg[key] || segs[0].key;
  if (!segs.find((x) => x.key === seg)) seg = segs[0].key;
  current = { key, seg, cleanup: [] };
  layer.classList.remove('hidden');
  layer.innerHTML = '';
  const head = h('div', 'page-head', `<button class="page-back">‹</button><b>${def.title}</b><span class="page-help">${def.help ? '?' : ''}</span>`);
  head.querySelector('.page-back').onclick = () => closeTab();
  if (def.help) head.querySelector('.page-help').onclick = () => (typeof def.help === 'function' ? def.help() : toast(def.help, 3500)); // V0.2.3：help 可以是打开面板的函数（开发2）
  const segBar = h('div', 'seg-bar' + (segs.length <= 1 ? ' hidden' : ''));
  const body = h('div', 'page-body');
  layer.append(head, segBar, body);
  const show = (k) => {
    for (const fn of current.cleanup) fn(); current.cleanup = [];
    current.seg = k; s.ui.lastSeg[key] = k;
    segBar.innerHTML = '';
    for (const x of segs) {
      const lk = x.lock && x.lock(s);
      const b = h('button', 'seg' + (x.key === k ? ' on' : '') + (lk ? ' locked' : ''), x.name + (lk ? ' 🔒' : ''));
      b.onclick = () => (lk ? toast(`🔒 ${lk}`) : show(x.key));
      segBar.appendChild(b);
    }
    body.innerHTML = ''; body.scrollTop = 0;
    const ctx = { onCleanup: (fn) => current.cleanup.push(fn), rerender: () => show(k), tab: key, seg: k };
    segs.find((x) => x.key === k).render(body, ctx);
  };
  show(seg);
  refreshNav(s);
  game.emit('tabOpened', key);
}
export function closeTab(fromPop = false) {
  if (!current) return;
  for (const fn of current.cleanup) fn();
  current = null;
  layer.classList.add('hidden'); layer.innerHTML = '';
  if (!fromPop && history.state && history.state.page) history.back();
  refreshNav(game.state);
  game.emit('tabClosed');
}
/** 直接回首页（秘书详情「陪着我」）：关掉所有全屏层和页签，它们的历史一次退掉，不用多按返回 */
export function goHome() {
  let n = 0;
  while (overlays.length) { overlays.pop().close(true); n += 1; }
  if (current) { closeTab(true); n += 1; }
  document.querySelectorAll('.panel-mask').forEach((x) => x.remove());
  if (n) { ignorePop += 1; history.go(-n); }
}
/** 让已有的「面板式」渲染函数画进页签里：给一个假的 panel */
export const hostPanel = (body, ctx) => ({ el: body, body, close: () => ctx && ctx.rerender && ctx.rerender() });

/** 全屏弹层（秘书详情、合同等）；返回 { el, body, close } */
export function openFull(title, { onClose } = {}) {
  const el = h('div', 'full');
  const head = h('div', 'page-head', `<button class="page-back">‹</button><b>${title}</b><span></span>`);
  const body = h('div', 'full-body');
  el.append(head, body);
  document.querySelector('#phone').appendChild(el);
  let closed = false;
  history.pushState({ full: 1 }, '');
  const entry = { close: (fromPop) => close(fromPop) };
  overlays.push(entry);
  // fromPop：返回键触发的，历史已经退了；点「‹」关的要把自己那一条历史退掉（并且忽略这次 popstate）
  const close = (fromPop = false) => {
    if (closed) return; closed = true; el.remove(); onClose && onClose();
    const i = overlays.indexOf(entry); if (i >= 0) overlays.splice(i, 1);
    if (fromPop !== true && history.state && history.state.full) { ignorePop += 1; history.back(); }
  };
  head.querySelector('.page-back').onclick = () => close(false);
  return { el, body, close };
}
