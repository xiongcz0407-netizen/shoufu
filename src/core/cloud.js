/* 云端存档（设计22 第三节，照半亩山居 cloud.js）：GitHub 私有仓库 + 名字 + 6 位口令 + 本机一份，只有一个存档
     shoufu/users/u_<sha256('sf|'+名字)前40位>.json   名字、口令哈希、存档摘要 { brief, savedAt, gid }、建号时间
     shoufu/saves/<id>.json                           唯一的那份存档
     shoufu/saves/arch_<年月日-时分秒>_<随机>.json     「重新开始」时旧的一局匿名留一份（不带用户 ID，调数值用）
   - 本机一直存一份（core/save.js 的 SAVE_KEY），断网照常玩，联网后补传；两次上传至少隔 1 分钟，切后台、关页面时补传
   - 本地 file:// 打开、或令牌为空：只用本机存档
   - io.fetch、本机存储都能换成假的（node 测试）
   设计79：存档上传前 gzip 压缩，云端文件写成 { "z": 1, "d": "<base64>" }（读的时候认 z: 1 解压，老的明文照读；浏览器没有 CompressionStream 就照旧传明文）；
     读文件用原始内容方式（Accept: application/vnd.github.raw，能读到 100 MB），sha 要用时再取（meta）；
     压缩后超过 5 MB 才算太大：先把有上限的列表砍一半再传（core/cap.js shrinkHalf），砍到 1/16 还传不上才报 size */
import { GH_SAVE } from '../ghcfg.js?v=a24b4431';
import { storage } from '../platform/storage.js?v=a24b4431';
import { SAVE_KEY, deserialize } from './save.js?v=a24b4431';
import { shrinkHalf } from './cap.js?v=a24b4431';

export const GAP = 60000;        // 两次上传至少隔多久（GitHub 接口频率限制）
export const NAME_MAX = 8;
export const ACCT_KEY = 'sf_acct', OWNER_KEY = SAVE_KEY + '_owner', AT_KEY = SAVE_KEY + '_cloudAt';
export const LIMIT = 5 * 1024 * 1024;   // 设计79：压缩后超过 5 MB 才算太大（GitHub 原始内容能读 100 MB）
export const cfg = { ...GH_SAVE };
export const io = { fetch: (u, o) => fetch(u, o), now: () => Date.now(), hidden: () => typeof document !== 'undefined' && document.hidden };
export const cloudCan = () => typeof fetch !== 'undefined' && !(typeof location !== 'undefined' && location.protocol === 'file:') && !!(cfg.owner && cfg.repo && cfg.k && cfg.k !== '@@GHK@@');

const tok = () => atob(cfg.k.split('').reverse().join(''));
const b64e = (s) => { const b = new TextEncoder().encode(s); let x = ''; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(x); };
const bytesB64 = (b) => { let x = ''; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(x); };
async function pipe(bytes, Stream, fmt) { const r = new Response(new Blob([bytes]).stream().pipeThrough(new Stream(fmt))); return new Uint8Array(await r.arrayBuffer()); }
/** 设计79：存档文本 → 云端文件（能压就压：{"z":1,"d":base64(gzip)}） */
export async function pack(text) {
  if (typeof CompressionStream === 'undefined') return text;
  try { return JSON.stringify({ z: 1, d: bytesB64(await pipe(new TextEncoder().encode(text), CompressionStream, 'gzip')) }); } catch (e) { return text; }
}
/** 云端文件 → 存档文本（老的明文原样返回） */
export async function unpack(text) {
  if (text == null || !/^\s*\{\s*"z"\s*:\s*1\s*,/.test(text.slice(0, 20))) return text;
  const j = JSON.parse(text); const b = Uint8Array.from(atob(j.d), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(await pipe(b, DecompressionStream, 'gzip'));
}
export async function sha256(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }

/* ---------- GitHub 读写 ---------- */
const shas = {};
class GhErr extends Error { constructor(code) { super(code); this.code = code; } }
async function req(method, path, body, keep, raw) {
  const ac = !keep && typeof AbortController !== 'undefined' ? new AbortController() : null, to = ac && setTimeout(() => ac.abort(), 15000);
  try {
    const r = await io.fetch(`${cfg.api || 'https://api.github.com'}/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.dir || ''}${path}` + (method === 'GET' ? `?t=${io.now()}` : ''), {
      method, cache: 'no-store', keepalive: !!keep, signal: ac ? ac.signal : undefined,
      headers: { Authorization: 'Bearer ' + tok(), Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 || r.status === 403) throw new GhErr('token');
    return r;
  } catch (e) { if (e instanceof GhErr) throw e; throw new GhErr('net'); } finally { to && clearTimeout(to); }
}
/** 读文件：原始内容方式（设计79：不卡 1 MB），压缩过的解开 */
async function get(path) {
  const r = await req('GET', path, null, false, true); if (r.status === 404) { delete shas[path]; return null; }
  if (!r.ok) throw new GhErr('net'); const t = await r.text();
  try { return await unpack(t); } catch (e) { throw new GhErr('net'); }
}
/** 只取 sha（写、删要用）：JSON 方式，大文件也返回 sha（内容为空） */
async function meta(path) {
  const r = await req('GET', path); if (r.status === 404) { delete shas[path]; return null; }
  if (!r.ok) throw new GhErr('net'); const j = await r.json(); shas[path] = j.sha; return j.sha;
}
async function put(path, text, msg, keep) {
  for (let i = 0; i < 2; i++) {
    const body = { message: msg || 'save', content: b64e(text) }; if (shas[path]) body.sha = shas[path];
    const r = await req('PUT', path, body, keep);
    if (r.ok) { const j = await r.json().catch(() => null); if (j && j.content) shas[path] = j.content.sha; return true; }
    if ((r.status === 409 || r.status === 422) && i === 0) { await meta(path); continue; }   // sha 对不上 / 没带（别的手机刚传过、这次读的是原始内容）：取最新的 sha 再写
    throw new GhErr('net');
  }
  throw new GhErr('net');
}
export const stamp = (t = io.now()) => { const d = new Date(t), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${Math.random().toString(36).slice(2, 8)}`; };
async function archive(path) { const t = await get(path); if (t) await put(`saves/arch_${stamp()}.json`, await pack(t), 'archive'); }
const savePath = (u) => `saves/${u.id}.json`;
export const gidOf = (data) => { const m = /"gid":"([^"]+)"/.exec(data); return m ? m[1] : ''; };

/* ---------- 账号：本机记住名字和口令，以后打开直接进游戏 ---------- */
const LS = { get(k) { try { return JSON.parse(storage.get(k)); } catch (e) { return null; } }, set(k, v) { storage.set(k, JSON.stringify(v)); }, del(k) { storage.remove(k); } };
export let acct = LS.get(ACCT_KEY);   // { name, pin }
let user = null;                       // { uk, path, u }
export function setAcct(a) { acct = a; if (a) LS.set(ACCT_KEY, a); else { LS.del(ACCT_KEY); user = null; } }
export function reloadAcct() { acct = LS.get(ACCT_KEY); user = null; }
export const validAcct = (name, pin) => { const n = String(name || '').trim(); if (!n) return '名字不能是空的。'; if ([...n].length > NAME_MAX) return `名字最多 ${NAME_MAX} 个字。`; if (!/^\d{6}$/.test(String(pin || ''))) return '口令要 6 位数字。'; return ''; };
async function auth(create, fresh) {
  const name = String((acct && acct.name) || '').trim(), pin = String((acct && acct.pin) || '');
  if (validAcct(name, pin)) throw new GhErr('input');
  const uk = 'u_' + (await sha256('sf|' + name)).slice(0, 40), path = `users/${uk}.json`, ph = await sha256('pin|' + uk + '|' + pin);
  if (!fresh && user && user.uk === uk && user.u.ph === ph) return user;
  const t = await get(path); let u = t ? JSON.parse(t) : null, created = false;
  if (!u) { if (!create) throw new GhErr('nouser'); u = { id: uk.slice(2, 22), name, ph, save: null, created: io.now() }; await put(path, JSON.stringify(u), 'new user'); created = true; }
  else if (u.ph !== ph) throw new GhErr('pin');
  user = { uk, path, u, created }; return user;
}
let chain = Promise.resolve();   // 云端操作排队一个一个做
const wrap = (f) => (...a) => { const p = chain.then(async () => { try { return await f(...a); } catch (e) { return { ok: false, err: (e && e.code) || 'net' }; } }); chain = p.catch(() => {}); return p; };
/** 登录（create = 名字没人用过时建号）→ { ok, created, save: 摘要, data: 存档文本或 null } */
export const cloudLogin = wrap(async (create) => { const a = await auth(create, true); const data = a.u.save ? await get(savePath(a.u)) : null; return { ok: true, created: a.created, save: a.u.save, data }; });
export const cloudSave = wrap(async (data, brief, keep) => {
  const a = await auth(); const body = await pack(data); if (body.length > LIMIT) return { ok: false, err: 'size' };   // 设计79：压缩后 5 MB 才算太大
  const at = io.now(), gid = gidOf(data), old = a.u.save;
  if (old && old.gid && gid && old.gid !== gid && !keep) await archive(savePath(a.u));   // 云端那份是另一局（断网时开了新局）：先匿名收起来
  await put(savePath(a.u), body, 'save', keep && body.length < 60000);
  a.u.save = { brief: String(brief || '').slice(0, 80), savedAt: at, gid };
  await put(a.path, JSON.stringify(a.u), 'save', keep);
  return { ok: true, savedAt: at };
});
/** 重新开始：旧的一局匿名收起来（arch_），再把新的一局传上去 */
export const cloudRestart = wrap(async (data, brief) => {
  const a = await auth(); await archive(savePath(a.u));
  await put(savePath(a.u), await pack(data), 'restart'); a.u.save = { brief, savedAt: io.now(), gid: gidOf(data) }; await put(a.path, JSON.stringify(a.u), 'restart');
  return { ok: true };
});
/* ---------- 礼物信箱（V0.2.8）：作者送金券 / 券，不碰存档。shoufu/gifts/<id>.json = { list: [{ id, coupons, items: { potion: 5 … }, why, at }] }
   游戏开着每 2 分钟、回到前台时看一眼；领过的 id 记在存档里（不会重复领），领完把信箱删掉 ---------- */
const giftPath = (u) => `gifts/${u.id}.json`;
export const cloudGifts = wrap(async () => { const a = await auth(); const t = await get(giftPath(a.u)); let list = []; try { list = t ? JSON.parse(t).list || [] : []; } catch (e) { list = []; } return { ok: true, list }; });
export const cloudGiftsDone = wrap(async () => {
  const a = await auth(); const p = giftPath(a.u); if (!shas[p]) await meta(p); if (!shas[p]) return { ok: true };
  const r = await req('DELETE', p, { message: 'gift claimed', sha: shas[p] }); if (r.ok || r.status === 404) delete shas[p]; return { ok: r.ok || r.status === 404 };
});
export const errTxt = (e) => ({ pin: '口令不对。', input: '名字不能是空的，口令要 6 位数字。', nouser: '这个名字还没有人用。', token: '云端存档的钥匙失效了，请联系作者。', net: '连不上云端，检查一下网络。', size: '存档太大，云端没存上（进度在手机里）。' }[e] || '云端出错了，请稍后再试。');

/* ---------- 本机这份是谁的；本机和云端取新的 ---------- */
export const localOwner = () => LS.get(OWNER_KEY);
export function putLocal(text, owner) { if (text == null) storage.remove(SAVE_KEY); else storage.set(SAVE_KEY, text); if (owner !== undefined) { if (owner == null) LS.del(OWNER_KEY); else LS.set(OWNER_KEY, owner); } }
const when = (s) => (s && (s.lastSeen || s.savedAt)) || 0;
/** cloudText：云端存档文本或 null；name：登录名（null = 只用本机）。→ { text, from: local / cloud / new } */
export function pickSave(cloudText, name, t = io.now()) {
  const own = localOwner(), lt = storage.get(SAVE_KEY);
  let loc = null, c = null;
  if (lt && (own == null || own === name)) try { loc = deserialize(lt, t); } catch (e) { loc = null; }
  if (cloudText) try { c = deserialize(cloudText, t); } catch (e) { c = null; }
  if (loc && (!c || when(loc) >= when(c))) return { text: lt, from: 'local' };
  return c ? { text: cloudText, from: 'cloud' } : { text: null, from: 'new' };
}

/* ---------- 保存：本机马上存（game.save），云端至少隔 1 分钟传一次 ---------- */
export const cloudState = { ok: null, at: 0, err: '', okAt: 0 };   // okAt：上次云端存好的时间（设置页「上次云端保存」，本机记着）
/** 顶上小字 / 设置页：size 写太大，token 写钥匙失效，其余（断网、超时）写没连上 */
export const stateTxt = (st = cloudState) => (st.err === 'token' ? errTxt('token') : st.err === 'size' ? '存档太大，云端没存上（进度在手机里）' : '云端没连上，进度先存在手机里');
export const lastOkAt = () => cloudState.okAt || +(storage.get(AT_KEY) || 0) || 0;
/** 「上次云端保存：X 分钟前」 */
export function agoTxt(t = io.now()) { const a = lastOkAt(); if (!a) return '还没传过'; const m = Math.floor((t - a) / 60000); return m < 1 ? '刚刚' : m < 60 ? `${m} 分钟前` : m < 1440 ? `${Math.floor(m / 60)} 小时前` : `${Math.floor(m / 1440)} 天前`; }
let pushed = '', lastPush = 0, timer = null, getS = null, briefOf = () => '';
export const lock = { on: false };   // 重新开始 / 换名字时，刷新网页前不再传
export const onCloud = () => cloudCan() && !!(acct && acct.name);
export function bind(getter, brief) { getS = getter; if (brief) briefOf = brief; }
export function markPushed(text) { pushed = text || ''; }
/** game.save() 每次都叫这里：切后台、关页面马上传，平时攒着隔 1 分钟传 */
export function onSave() {
  if (!onCloud() || lock.on) return;
  if (io.hidden()) { push(true); return; }
  clearTimeout(timer); timer = setTimeout(() => push(), Math.max(1500, lastPush + GAP - io.now()));
}
let inflight = Promise.resolve();
export function push(force) { inflight = inflight.then(() => push1(force)).catch(() => {}); return inflight; }
const listeners = new Set();
export const onState = (fn) => listeners.add(fn);
async function push1() {
  const S = getS && getS(); if (!S || !onCloud() || lock.on) return;
  let data = JSON.stringify(S); if (data === pushed) return; lastPush = io.now();
  let j = await cloudSave(data, briefOf(S), io.hidden());   // 切后台、关页面：带 keepalive，页面关了也发得出去
  for (let k = 0; k < 4 && !j.ok && j.err === 'size'; k++) { shrinkHalf(S, k + 1); data = JSON.stringify(S); j = await cloudSave(data, briefOf(S), io.hidden()); }   // 设计79：太大就把列表再砍一半重传，不报错
  if (j.ok) { pushed = data; Object.assign(cloudState, { ok: true, at: j.savedAt, err: '', okAt: j.savedAt }); try { storage.set(AT_KEY, String(j.savedAt)); } catch (e) { /* 本机存不下也不要紧 */ } }
  else Object.assign(cloudState, { ok: false, at: io.now(), err: j.err });
  for (const fn of listeners) fn(cloudState);
}
/** 没连上的时候，每 2 分钟再试一次（联网后自动补传） */
export function startRetry() { if (typeof setInterval !== 'undefined') setInterval(() => { if (onCloud() && cloudState.ok === false && cloudState.err !== 'token') push(true); }, 120000); }
/** 只给测试用 */
export function _reset() { user = null; pushed = ''; lastPush = 0; clearTimeout(timer); for (const k of Object.keys(shas)) delete shas[k]; Object.assign(cloudState, { ok: null, at: 0, err: '', okAt: 0 }); storage.remove(AT_KEY); lock.on = false; acct = LS.get(ACCT_KEY); }
