/* 自动更新（设计22 第五节，照末世超市）
   - version.json 不走缓存取；加载页、登录页发现新版本自动更新（同一个新版本 2 分钟内只自动试一次）
   - 游戏里切回前台、点任意处（5 分钟最多查一次）检查 → 顶部「有新版本，点这里更新」，玩家自己点；更新前先上传存档
   - 更新：先强制重新下载首页覆盖缓存，再原地址重开（带 ?u=时间）
   - 更新后弹一次「这一版新加了什么」 */
import { APP_V } from '../version.js?v=6a9355f4';
import { CHANGELOG } from '../config/changelog.js?v=6a9355f4';
import { storage } from '../platform/storage.js?v=6a9355f4';

export const SEEN_KEY = 'sf_seen_v';
export const upd = { newV: 0, at: 0, beforeUpdate: null };
const isFile = () => typeof location !== 'undefined' && location.protocol === 'file:';

export async function fetchV(f = (u, o) => fetch(u, o)) {
  try { const j = await (await f('version.json?t=' + Date.now(), { cache: 'no-store' })).json(); return +j.v || 0; } catch (e) { return 0; }
}
/** auto = 还在加载页 / 登录页：有新版本直接更新 */
export async function checkUpdate(auto) {
  if (isFile()) return 0; upd.at = Date.now();
  const v = await fetchV(); if (v <= APP_V) return 0;
  if (auto) {
    let tried = null; try { tried = JSON.parse(sessionStorage.getItem('sf_upd') || 'null'); } catch (e) { /* */ }
    if (!(tried && tried.v === v && Date.now() - tried.at < 120000)) { try { sessionStorage.setItem('sf_upd', JSON.stringify({ v, at: Date.now() })); } catch (e) { /* */ } await doUpdate(); return v; }
    return 0;
  }
  if (!upd.newV) banner(v);
  upd.newV = v; return v;
}
export async function doUpdate() {
  if (upd.beforeUpdate) { try { await Promise.race([upd.beforeUpdate(), new Promise((r) => setTimeout(r, 6000))]); } catch (e) { /* 本机已经存好 */ } }
  const base = location.pathname.replace(/index\.html$/, '');
  await Promise.all([base, base + 'index.html'].map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
  const q = new URLSearchParams(location.search); q.set('u', Date.now());
  location.replace(base + '?' + q.toString());
}
function banner(v) {
  if (typeof document === 'undefined' || document.getElementById('sf-upd')) return;
  const el = document.createElement('div'); el.id = 'sf-upd';
  el.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);top:calc(var(--safe-t, 0px) + 6px);z-index:90;padding:6px 14px;border-radius:14px;background:#0f1d33;border:1px solid #b08a45;color:#f2d593;font-size:13px;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,.5)';
  el.textContent = `有新版本（V${Math.floor(v / 100)}.${v % 100}），点这里更新`;
  el.onclick = (e) => { e.stopPropagation(); el.textContent = '正在更新…'; doUpdate(); };
  (document.getElementById('phone') || document.body).appendChild(el);
}
/** 进游戏以后：切回前台、点任意处检查（5 分钟最多一次） */
export function watch() {
  if (isFile()) return;
  const maybe = () => { if (Date.now() - upd.at > 300000) checkUpdate(false); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) maybe(); });
  document.addEventListener('click', maybe, true);
}
/** 比 seen 新的说明条目 */
export function newItems(seen, v = APP_V) { return CHANGELOG.filter((x) => x.v > seen && x.v <= v).flatMap((x) => x.items); }
/** 进游戏后叫：上次玩的版本比现在旧就弹一次；第一次玩只记下版本不弹。返回要弹的条目 */
export function whatsNew() {
  const seen = +storage.get(SEEN_KEY) || 0; storage.set(SEEN_KEY, String(APP_V));
  return seen && seen < APP_V ? newItems(seen) : [];
}
