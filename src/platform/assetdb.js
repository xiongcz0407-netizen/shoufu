/* 素材存在手机里（设计22 第二节，照半亩山居 assetdb.js）
   - IndexedDB 库 sf_assets，表 files：{ path, hash, blob }（老 Safari 存不了 Blob 时存 { buf, type }）
   - 清单 files.json（打包时生成，不走缓存取）：{ v, files: { 路径: [hash, 字节数] } }；开发版没有清单 → 不用库，全走网络
   - 打开时：库里 hash 对得上的直接用；hash 不对、清单里没了的删掉；缺的下载（同时 4 个，失败隔 1 秒重试 3 次），下一个存一个
   - 浏览器没有 IndexedDB、打不开、存不进去：退回从网上读，不影响玩
   纯逻辑（plan、fetchList）不碰浏览器，node 测试时把 store、net 换成假的 */
const DB = 'sf_assets', ST = 'files';
export const LIST = { hash: {}, size: {}, ok: false };   // 清单
const URLS = new Map();          // 路径 → blob 网址（库里有、hash 对得上的，或这次刚下好的）
export const stat = { ok: false, why: '', have: 0, removed: 0, got: 0, gotBytes: 0, storedBytes: 0 };
export const blobOf = (p) => URLS.get(p);
export const setList = (files) => { LIST.hash = {}; LIST.size = {}; for (const [p, [h, n]] of Object.entries(files || {})) { LIST.hash[p] = h; LIST.size[p] = n; } LIST.ok = Object.keys(LIST.hash).length > 0; };
export const allPaths = () => Object.keys(LIST.hash);
export const totalBytes = (list = allPaths()) => list.reduce((a, p) => a + (LIST.size[p] || 0), 0);
export const urlOf = (p) => LIST.hash[p] ? `${p}?h=${LIST.hash[p]}` : p;
export const mkUrl = { make: (b) => URL.createObjectURL(b), drop: (u) => URL.revokeObjectURL(u) };   // 测试时换掉

/** 三份名单：库里的记录 recs [{ path, hash }] 对清单 → { keep 用本机, del 要删, need 要下 } */
export function plan(recs, hash = LIST.hash) {
  const keep = [], del = [];
  for (const r of recs) (hash[r.path] && hash[r.path] === r.hash && (r.blob || r.buf) ? keep : del).push(r.path);
  const ks = new Set(keep);
  return { keep, del, need: Object.keys(hash).filter((p) => !ks.has(p)) };
}

/* ---------- 库（浏览器）：store = { all(), put(rec), del(paths), clear() } ---------- */
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
function idbStore() {
  let db = null;
  const open = () => new Promise((res, rej) => {
    let r; try { r = indexedDB.open(DB, 1); } catch (e) { rej(e); return; }
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST, { keyPath: 'path' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
    setTimeout(() => rej(new Error('timeout')), 8000);
  });
  const tx = (m) => db.transaction(ST, m).objectStore(ST);
  return {
    async open() { db = await open(); },
    all: () => req(tx('readonly').getAll()),
    async put(rec) {
      try { await req(tx('readwrite').put(rec)); }
      catch (e) { const buf = await rec.blob.arrayBuffer(); await req(tx('readwrite').put({ path: rec.path, hash: rec.hash, buf, type: rec.blob.type })); }
    },
    async del(paths) { const s = tx('readwrite'); for (const p of paths) s.delete(p); },
    close() { try { db && db.close(); } catch (e) { /* */ } db = null; },
    drop: () => new Promise((r) => { try { const q = indexedDB.deleteDatabase(DB); q.onsuccess = q.onerror = q.onblocked = () => r(); } catch (e) { r(); } }),
  };
}
export const lib = { store: null, broken: false };
export const dbOK = () => !!lib.store && !lib.broken;

/** 打开库：对得上的变成 blob 网址，删掉旧的。store 不给就用 IndexedDB */
export async function openLib(store) {
  if (!LIST.ok) return Object.assign(stat, { ok: false, why: '开发版（没有清单）' });
  if (!store) {
    if (typeof indexedDB === 'undefined') return Object.assign(stat, { ok: false, why: '浏览器不支持' });
    store = idbStore();
    try { await store.open(); } catch (e) { return Object.assign(stat, { ok: false, why: '打不开：' + ((e && e.message) || e) }); }
  }
  lib.store = store; lib.broken = false;
  try {
    const recs = await store.all(), P = plan(recs);
    const byPath = new Map(recs.map((r) => [r.path, r]));
    for (const p of P.keep) { const r = byPath.get(p); const b = r.blob || new Blob([r.buf], { type: r.type || '' }); URLS.set(p, mkUrl.make(b)); stat.storedBytes += b.size || LIST.size[p] || 0; }
    if (P.del.length) await store.del(P.del);
    return Object.assign(stat, { ok: true, why: '', have: P.keep.length, removed: P.del.length });
  } catch (e) { lib.broken = true; return Object.assign(stat, { ok: false, why: '读不出来：' + ((e && e.message) || e) }); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const net = { fetch: (u, o) => fetch(u, o), retryMs: 1000 };   // 测试时换掉（慢网、断网）
async function fetchOne(p, tries = 3) {
  for (let i = 0; ; i++) {
    try { const r = await net.fetch(urlOf(p)); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.blob(); }
    catch (e) { if (i >= tries) throw e; await sleep(net.retryMs); }
  }
}
async function keep(p, b) {
  if (!dbOK()) return;
  try { await lib.store.put({ path: p, hash: LIST.hash[p], blob: b }); stat.storedBytes += b.size || 0; }
  catch (e) { if (/quota/i.test(String((e && e.name) || '') + String(e && e.message))) lib.broken = true; }   // 空间不够：不存了，退回网络
}
/** 下载一批（还没有的），同时 n 个；onProg(下好的字节, 总字节, 下好几个, 一共几个)。连着失败 8 个、一个都没下好：多半断网，剩下的不试了 */
export async function fetchList(list, onProg = () => {}, n = 4) {
  const need = list.filter((p) => !URLS.has(p)), total = totalBytes(need);
  let got = 0, cnt = 0, fail = 0, i = 0; onProg(0, total, 0, need.length);
  const one = async (p) => {
    try { const b = await fetchOne(p); await keep(p, b); URLS.set(p, mkUrl.make(b)); got += LIST.size[p] || b.size || 0; cnt++; stat.got++; stat.gotBytes += LIST.size[p] || b.size || 0; }
    catch (e) { fail++; }
    onProg(got, total, cnt, need.length);
  };
  await Promise.all(Array.from({ length: Math.min(n, need.length) }, async () => {
    while (i < need.length) { if (!cnt && fail >= 8) { fail += need.length - i; i = need.length; break; } await one(need[i++]); }
  }));
  return { fail, total, cnt, bytes: got };
}
/** 设置里「清掉重新下载」：删库（调用的地方再刷新网页） */
export async function clearLib() {
  for (const u of URLS.values()) try { mkUrl.drop(u); } catch (e) { /* */ }
  URLS.clear(); stat.storedBytes = 0;
  const s = lib.store; lib.store = null;
  if (s) { s.close && s.close(); if (s.drop) await s.drop(); else await s.clear(); }
  else if (typeof indexedDB !== 'undefined') await idbStore().drop();
}
/** 只给测试用：清空内存里的状态 */
export function _reset() { URLS.clear(); lib.store = null; lib.broken = false; Object.assign(stat, { ok: false, why: '', have: 0, removed: 0, got: 0, gotBytes: 0, storedBytes: 0 }); }
