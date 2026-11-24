// 素材：加载页一次读完，存在手机里（设计22 第二节，库在 assetdb.js）。代码里用 asset('assets/xxx.webp') 拿地址
// 打包版有清单 files.json（hash + 字节数）→ 用 IndexedDB 只下改过的；开发版没有清单 → 照 assets/manifest.json 从网上读
import * as AD from './assetdb.js?v=701206f7';
import { storage } from './storage.js?v=701206f7';
const LIST_KEY = 'sf_files';   // 上次的素材清单（断网打开时用）

const urls = new Map();   // 开发版：路径 → blob 网址
export const asset = (p) => AD.blobOf(p) || urls.get(p) || AD.urlOf(p);
let listed = new Set();
/** 清单里有没有这个文件（图没到的地方用占位） */
export const hasAsset = (p) => listed.has(p);
let secMeta = {};
export const getSecMeta = () => secMeta;
export const LOAD = { mode: '', ready: false, total: 0, fails: [] };   // mode：db（存手机）/ net（打包版但库不能用）/ dev（开发版）

/** 读清单。打包版：files.json；开发版：assets/manifest.json */
export async function loadList(f = (u, o) => fetch(u, o)) {
  let j = null;
  try { j = await (await f('files.json?t=' + Date.now(), { cache: 'no-store' })).json(); storage.set(LIST_KEY, JSON.stringify(j)); }
  catch (e) { try { j = JSON.parse(storage.get(LIST_KEY)); } catch (e2) { j = null; } }   // 断网：用上次的清单，库里有什么用什么
  if (j && j.files) { AD.setList(j.files); listed = new Set(Object.keys(j.files)); LOAD.mode = 'db'; }
  else {
    let list = [];
    try { list = (await (await f('assets/manifest.json', { cache: 'no-store' })).json()).files || []; } catch (e2) { console.warn('没有素材清单，跳过预加载'); }
    listed = new Set(list); LOAD.mode = 'dev';
  }
  LOAD.total = listed.size;
  return LOAD.mode;
}

/** 开发版：一个个从网上读（同时 6 个）；onProgress(已读, 总数) */
async function devFetch(onProgress) {
  const list = [...listed]; let done = 0; const fails = []; const queue = list.slice();
  onProgress && onProgress(0, list.length);
  const worker = async () => { while (queue.length) { const p = queue.shift(); try { const r = await fetch(p); if (!r.ok) throw 0; urls.set(p, URL.createObjectURL(await r.blob())); } catch (e) { fails.push(p); } done += 1; onProgress && onProgress(done, list.length); } };
  await Promise.all(Array.from({ length: 6 }, worker));
  return fails;
}

async function readMeta() {
  try { secMeta = await (await fetch(asset('assets/sec/meta.json'), { cache: 'no-store' })).json(); } catch (e) { secMeta = {}; }
}

/** 加载页结束时叫：读秘书的 meta，标记好了（main.js 的 preloadAll 就直接返回） */
export async function finishLoad(fails = []) { await readMeta(); LOAD.fails = fails; LOAD.ready = true; }

/** main.js 用：加载页（boot.js）已经读完就直接返回；直接打开 main.js（老入口、测试页）时照旧读一遍 */
export async function preloadAll(onProgress) {
  if (LOAD.ready) return { total: LOAD.total, fails: LOAD.fails };
  await loadList();
  let fails = [];
  if (LOAD.mode === 'db') {
    await AD.openLib(); if (!AD.dbOK()) LOAD.mode = 'net';
    const r = await AD.fetchList(AD.allPaths(), (b, t) => onProgress && onProgress(b, t || 1));
    fails = r.fail ? ['…'] : [];
  } else fails = await devFetch(onProgress);
  await finishLoad(fails);
  return { total: LOAD.total, fails };
}
export { devFetch };
