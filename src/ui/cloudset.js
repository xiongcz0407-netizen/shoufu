// 老板页「设置」里的存档和素材（设计22 第二、三节）：登录名 + 口令（点眼睛看）、换个名字登录、重新开始、手机里的素材
import { game } from '../game.js?v=c60d881c';
import { h, openPanel, toast } from './dom.js?v=c60d881c';
import * as CL from '../core/cloud.js?v=c60d881c';
import * as AD from '../platform/assetdb.js?v=c60d881c';
import { LOAD } from '../platform/assets.js?v=c60d881c';
import { defaultState, serialize } from '../core/save.js?v=c60d881c';
import { now } from '../core/clock.js?v=c60d881c';
import { APP_V, versionText } from '../version.js?v=c60d881c';

const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** 二次确认：底部弹层，两个按钮 */
export function confirm2(title, text, okLabel) {
  return new Promise((res) => {
    const p = openPanel(title, { onClose: () => res(false) });
    p.body.appendChild(h('div', 'tr-gain', text));
    const row = h('div', '', `<button class="btn">${okLabel}</button> <button class="btn sec">算了</button>`);
    row.style.cssText = 'margin-top:14px;display:flex;gap:10px;justify-content:center';
    const [a, b] = row.querySelectorAll('button');
    a.onclick = () => { res(true); res = () => {}; p.close(); }; b.onclick = () => p.close();
    p.body.appendChild(row);
  });
}
const reload = () => setTimeout(() => location.reload(), 300);

/** 换个名字登录：先把本机这份传上去，再退出 */
export async function switchName() {
  if (!(await confirm2('换个名字登录', '先把现在的进度传到云端，再回到登录页。', '换'))) return;
  game.save(); toast('正在上传进度…', 3000);
  await Promise.race([CL.push(true), new Promise((r) => setTimeout(r, 8000))]);
  if (CL.cloudState.ok === false) { toast('云端没连上，进度还在这台手机里；联网后再换。', 3000); return; }
  CL.lock.on = true; CL.setAcct(null); CL.putLocal(null, null); reload();
}
/** 重新开始：二次确认；旧档存 arch_，局号换新 */
export async function restart() {
  if (!(await confirm2('重新开始', '从头再来一局：现在的公司、秘书、钱全部清零。', '重新开始'))) return;
  if (!(await confirm2('再确认一次', '真的要重新开始吗？这一步不能撤回。', '确定重新开始'))) return;
  const t = now(), ns = defaultState(t); ns.lastSeen = t; const text = serialize(ns);
  CL.lock.on = true;
  CL.putLocal(text, CL.onCloud() ? CL.acct.name : undefined);
  if (CL.onCloud()) { toast('正在把旧的一局收起来…', 3000); await Promise.race([CL.cloudRestart(text, '新开局'), new Promise((r) => setTimeout(r, 10000))]); }
  reload();
}
export async function clearAssets() {
  if (!(await confirm2('清掉重新下载', '把手机里存的素材清掉，刷新以后重新下载一遍。', '清掉'))) return;
  game.save(); await AD.clearLib(); reload();
}

export function appendCloudSettings(body) {
  if (CL.onCloud()) {
    const a = CL.acct;
    const r1 = h('div', 'tr-course', `<div><b>登录名　${esc(a.name)}</b><div class="tr-gain">口令 <span class="pin">••••••</span>　换手机时，用同一个名字和口令就能接着玩</div></div><button class="btn">👁</button>`);
    let shown = false; const pin = r1.querySelector('.pin');
    r1.querySelector('.btn').onclick = () => { shown = !shown; pin.textContent = shown ? a.pin : '••••••'; };
    const st = CL.cloudState.ok === false ? CL.stateTxt() : CL.cloudState.at ? '云端已存好' : '进度会自动传到云端';
    const ago = `<div class="tr-gain cloud-ago">上次云端保存：${CL.agoTxt()}</div>`;   // 设计79
    const r2 = h('div', 'tr-course', `<div><b>换个名字登录</b><div class="tr-gain">${st}</div>${ago}</div><button class="btn">换</button>`);
    r2.querySelector('.btn').onclick = switchName;
    body.append(r1, r2);
  } else body.append(h('div', 'tr-course', `<div><b>本机存档</b><div class="tr-gain">${location.protocol === 'file:' ? '本地打开' : '开发版没有云端钥匙'}，进度只存在这台手机里</div></div>`));
  const r3 = h('div', 'tr-course', `<div><b>重新开始</b><div class="tr-gain">从头再来一局（要确认两次）</div></div><button class="btn">重新开始</button>`);
  r3.querySelector('.btn').onclick = restart;
  const db = AD.dbOK();
  const r4 = h('div', 'tr-course', `<div><b>手机里的素材</b><div class="tr-gain">${db ? `存了 ${(AD.stat.storedBytes / 1048576).toFixed(1)} MB` : LOAD.mode === 'dev' ? '开发版：每次从网上读' : '这个浏览器存不了，每次从网上读'}</div></div><button class="btn">清掉重新下载</button>`);
  r4.querySelector('.btn').onclick = clearAssets; r4.querySelector('.btn').disabled = !db;
  body.append(r3, r4);
}
