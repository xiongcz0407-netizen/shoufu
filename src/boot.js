/* 入口 + 加载页 + 登录（设计22，照半亩山居 boot.js）
   1. index.html 里的加载页已经显示着；这里对时间（服务器时间）、检查新版本、读素材清单、打开手机里的素材库
   2. 库里没有的、改过的下载（进度按字节）；连着失败 8 个 →「再试一次 / 先进游戏」
   3. 好了 →「点一下，开始营业」；点一下：
      - 云端能用：记住了名字口令直接登录，本机和云端取新的；没记住弹「登录」卡片（名字 + 6 位口令）
      - 云端不能用（开发版、本地文件、令牌为空）：直接用本机存档
   4. 定好存档写进本机 → 读游戏本体 main.js（它从本机读档、开局起名、开场剧情）→ 加载页淡出 */
import { APP_V, versionText } from './version.js?v=47e8f1b5';
import { fitPhone } from './platform/screen.js?v=47e8f1b5';
import * as AD from './platform/assetdb.js?v=47e8f1b5';
import { loadList, devFetch, finishLoad, LOAD } from './platform/assets.js?v=47e8f1b5';
import * as CL from './core/cloud.js?v=47e8f1b5';
import { syncTime, setFloor, server } from './core/clock.js?v=47e8f1b5';
import { checkUpdate, upd, watch, whatsNew } from './ui/update.js?v=47e8f1b5';

const $ = (s) => document.querySelector(s);
const mb = (b) => (b / 1048576).toFixed(1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const TIPS = ['公司的钱和自己的钱是分开的。', '买车买房只能全款。', '秘书当店长，店会自己招人。', '每个月要发工资、交税。', '收购对手，它的店和员工一起并进来。', '你不在的时候，生意照样在做。'];
export const STAGES = ['整理办公桌', '打开收银机', '核对账本', '秘书到岗', '开门营业'];
export const stageOf = (k) => STAGES[Math.min(STAGES.length - 1, Math.floor(k * STAGES.length))];
const T0 = Date.now();

/* ---------- 加载页上的字 ---------- */
let tipI = 0, tipT = 0, slow = false, lastDetail = '', lastK = 0;
function tips() {
  const el = $('.bt-tip'); tipI = Math.floor(Math.random() * TIPS.length);
  const set = () => { el.textContent = '小贴士：' + TIPS[tipI++ % TIPS.length]; };
  set(); tipT = setInterval(() => { el.style.opacity = 0; setTimeout(() => { set(); el.style.opacity = 1; }, 500); }, 4000);
}
function prog(k, detail = lastDetail) {
  const p = Math.max(0, Math.min(1, k)); lastK = p; lastDetail = detail;
  $('.bt-fill').style.width = (p * 100).toFixed(1) + '%';
  $('.bt-txt').innerHTML = `${p >= 1 ? STAGES[STAGES.length - 1] : stageOf(p) + '…'}${slow && p < 1 ? '　网有点慢…' : ''}${detail ? `<small>${detail}</small>` : ''}`;
}

/* ---------- 素材 ---------- */
async function assets() {
  const mode = await loadList();
  if (mode === 'dev') { const fails = await devFetch((d, n) => prog(n ? d / n : 1, '')); await finishLoad(fails); return; }
  const r = await AD.openLib();
  if (!r.ok) { console.warn('[加载页] 手机里的素材库不能用，从网上读：', r.why); LOAD.mode = 'net'; }
  const all = AD.allPaths(), tot = AD.totalBytes(all), first = AD.dbOK() && AD.stat.have < all.length * 0.3;
  let fails = 0;
  for (;;) {
    const res = await AD.fetchList(all, (b, t, c, n) => { if (!n) return; prog(t ? b / t : 1, first || !AD.dbOK() ? `第一次打开，正在准备 ${mb(b + tot - t)} / ${mb(tot)} MB` : `正在更新 ${c} / ${n} 个文件（${mb(b)} / ${mb(t)} MB）`); });
    fails = res.fail; if (!fails) break;
    $('.bt-txt').innerHTML = `网有点慢，还有 ${fails} 个文件没下好`; $('.bt-btns').classList.add('on');
    const c = await new Promise((ok) => { $('.bt-retry').onclick = () => ok('retry'); $('.bt-skip').onclick = () => ok('skip'); });
    $('.bt-btns').classList.remove('on'); if (c === 'skip') break;   // 先进游戏：没下好的边玩边从网上读
  }
  const s = AD.stat;
  prog(1, s.got && !first ? `更新了 ${s.got} 个文件（${s.gotBytes < 104858 ? Math.max(1, Math.round(s.gotBytes / 1024)) + ' KB' : mb(s.gotBytes) + ' MB'}）` : '');
  if (s.got && !first) await sleep(900);
  await finishLoad(fails ? ['…'] : []);
}

/* ---------- 点一下 ---------- */
const tapOnce = () => new Promise((ok) => {
  const b = $('#screen-loading'); b.classList.add('ready');
  const f = (e) => { if (e.target.closest('.bt-card, .bt-btns')) return; b.removeEventListener('pointerup', f); b.classList.remove('ready'); ok(); };
  b.addEventListener('pointerup', f);
});

/* ---------- 登录 ---------- */
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const form = { step: 'login', msg: '', busy: false };
function drawLogin() {
  const L = $('.bt-card'), n0 = $('#bt-name'), a = n0 && form.step === 'login' ? { name: n0.value } : CL.acct || {};
  const msg = `<p class="bt-msg">${form.busy ? '正在连接云端……' : esc(form.msg)}</p>`;
  L.innerHTML = form.step === 'create'
    ? `<h4>新来的老板</h4><p>还没有人叫「<b>${esc(a.name)}</b>」，就用这个名字吧？</p><label><span>再输一次</span><input id="bt-pin2" type="password" inputmode="numeric" maxlength="6" placeholder="6 位数字口令" autocomplete="new-password"></label>${msg}
       <div class="row"><button data-b="create" ${form.busy ? 'disabled' : ''}>进公司</button><button class="g" data-b="back">换个名字</button></div><p class="note">名字和口令请记好：换手机时，用同一个名字和口令就能接着玩。</p>`
    : `<h4>登录</h4><label><span>名字</span><input id="bt-name" maxlength="${CL.NAME_MAX}" value="${esc(a.name || '')}" placeholder="最多 ${CL.NAME_MAX} 个字" autocomplete="username" autocapitalize="off" spellcheck="false"></label>
       <label><span>口令</span><input id="bt-pin" type="password" inputmode="numeric" maxlength="6" placeholder="6 位数字" autocomplete="current-password"></label>${msg}
       <div class="row"><button data-b="login" ${form.busy ? 'disabled' : ''}>进公司</button></div><p class="note">换手机时，用同一个名字和口令就能接着玩。</p>`;
  L.classList.add('on'); $('.bt-low').style.visibility = 'hidden';
}
/** 返回进游戏用的存档 { text, from } */
export async function login() {
  if (!CL.cloudCan()) return CL.pickSave(null, null);   // 开发版、本地文件、令牌为空：只用本机存档
  if (CL.acct && CL.acct.name) {   // 记住了：直接登录
    $('.bt-txt').textContent = '正在进公司…';
    const j = await CL.cloudLogin(false);
    if (j.ok) return done(j);
    if (j.err === 'net' || j.err === 'token') { Object.assign(CL.cloudState, { ok: false, err: j.err }); const own = CL.localOwner(); return own == null || own === CL.acct.name ? CL.pickSave(null, CL.acct.name) : { text: null, from: 'new' }; }
    form.msg = CL.errTxt(j.err); CL.setAcct({ name: CL.acct.name, pin: '' });   // 口令不对了：重新登录
  }
  drawLogin();
  return new Promise((resolve) => {
    const L = $('.bt-card');
    const go = async (create) => {
      form.busy = true; drawLogin(); const j = await CL.cloudLogin(create); form.busy = false;
      if (j.ok) { L.classList.remove('on'); $('.bt-low').style.visibility = ''; resolve(done(j)); return; }
      if (j.err === 'nouser') { form.step = 'create'; form.msg = ''; drawLogin(); const p = $('#bt-pin2'); if (p) p.focus(); return; }
      form.msg = CL.errTxt(j.err); if (j.err === 'pin') CL.setAcct({ name: CL.acct.name, pin: '' }); drawLogin();
    };
    L.onclick = (e) => {
      const b = e.target.closest('[data-b]'); if (!b || form.busy) return;
      if (b.dataset.b === 'login') { const n = ($('#bt-name').value || '').trim(), p = $('#bt-pin').value || '', bad = CL.validAcct(n, p); if (bad) { form.msg = bad; drawLogin(); return; } CL.setAcct({ name: n, pin: p }); go(false); }
      else if (b.dataset.b === 'create') { if (($('#bt-pin2').value || '') !== CL.acct.pin) { form.msg = '两次输入的口令不一样。'; drawLogin(); return; } go(true); }
      else if (b.dataset.b === 'back') { form.step = 'login'; form.msg = ''; drawLogin(); }
    };
    L.onkeydown = (e) => { if (e.key !== 'Enter') return; e.preventDefault(); if (e.target.id === 'bt-name') $('#bt-pin').focus(); else { const b = L.querySelector('[data-b="login"],[data-b="create"]'); if (b) b.click(); } };
  });
}
function done(j) {
  Object.assign(CL.cloudState, { ok: true, err: '' });
  const r = CL.pickSave(j.data, CL.acct.name);
  if (r.from === 'cloud') CL.markPushed(r.text);   // 刚读下来的，不用马上再传
  return r;
}

/* ---------- 顶部小字：云端没连上 ---------- */
export function cloudNote() {
  let el = document.getElementById('sf-cloud');
  const show = CL.onCloud() && CL.cloudState.ok === false;
  if (!show) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'sf-cloud'; el.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);top:calc(var(--safe-t, 0px) + 46px);z-index:80;padding:2px 10px;border-radius:10px;background:rgba(15,29,51,.85);border:1px solid rgba(176,138,69,.6);white-space:nowrap;font-size:11px;color:#f2d593;pointer-events:none'; $('#phone').appendChild(el); }
  el.textContent = CL.cloudState.err === 'token' ? CL.errTxt('token') : '云端没连上，进度先存在手机里';
}

/* ---------- 入口 ---------- */
async function main() {
  fitPhone($('#phone'));
  $('.load-ver').textContent = versionText(APP_V);
  tips(); prog(0, '');
  const slowT = setTimeout(() => { slow = true; prog(lastK); }, 10000);
  const tsync = syncTime();
  const upd0 = checkUpdate(true);   // 加载页发现新版本：自动更新
  try { await assets(); } catch (e) { console.warn('[加载页] 素材出错，从网上读', e); await finishLoad([]); prog(1, ''); }
  clearTimeout(slowT);
  if (Date.now() - T0 < 500) await sleep(500 - (Date.now() - T0));   // 没更新一闪而过（最少 0.5 秒）
  await Promise.all([tsync, upd0]);
  await tapOnce();
  const r = await login();
  // 定好存档写进本机（main.js 从本机读）；开新局就清掉本机的
  const name = CL.onCloud() ? CL.acct.name : undefined;
  CL.putLocal(r.text, name);
  if (!server.synced && r.text) { try { setFloor(JSON.parse(r.text).lastSeen || 0); } catch (e) { /* */ } }   // 没取到服务器时间：不让时间倒退
  $('.bt-txt').textContent = '开门营业…';
  // 存档：本机马上存，云端隔 1 分钟传一次
  const { game } = await import('./game.js?v=47e8f1b5');
  const save0 = game.save;
  game.save = function () { if (CL.lock.on) return; save0.call(this); CL.onSave(); };   // 重新开始 / 换名字时，刷新前不再存
  const [E, { TITLES }, { fmtMoney }] = await Promise.all([import('./core/economy.js?v=47e8f1b5'), import('./config/titles.js?v=47e8f1b5'), import('./core/format.js?v=47e8f1b5')]);
  CL.bind(() => game.state, (s) => `${(TITLES[s.title] || {}).name || ''}　身价 ${fmtMoney(E.netWorth(s))}　${s.companyName || ''}`);
  CL.onState(cloudNote); CL.startRetry();
  upd.beforeUpdate = () => { game.save(); return CL.push(true); };
  clearInterval(tipT);
  await import('./main.js?v=47e8f1b5');
  const { addDebugInfo } = await import('./debug.js?v=47e8f1b5');
  addDebugInfo(() => { const a = AD.stat; return `素材：${AD.dbOK() ? '库能用' : '库不能用（' + (a.why || LOAD.mode) + '）'}　存了 ${a.have + a.got} 个 ${(a.storedBytes / 1048576).toFixed(1)} MB　这次本机拿 ${a.have} 个、新下 ${a.got} 个（${mb(a.gotBytes)} MB）`; });
  addDebugInfo(() => `云端：${CL.onCloud() ? CL.acct.name + '　' + (CL.cloudState.ok === false ? '没连上 ' + CL.cloudState.err : CL.cloudState.at ? '已传' : '待传') : '只用本机'}　服务器时间 ${server.synced ? '已对' : '没取到'}`);
  cloudNote(); watch();
  // 礼物信箱（V0.2.8；设计42 改成奖励邮件）：开着每 2 分钟、回到前台时看一眼；新礼物变成「重要」里的邮件，玩家点「领取」才到手；存档上传后删信箱
  const GF = await import('./core/gift.js?v=47e8f1b5'); await import('./ui/giftmail.js?v=47e8f1b5'); let giftBusy = false;
  const pollGift = async () => {
    if (giftBusy || !CL.onCloud() || CL.lock.on || !game.state) return; giftBusy = true;
    try {
      const r = await CL.cloudGifts(); if (!r.ok || !r.list.length) return;
      const got = GF.giftsToMail(game.state, r.list, APP_V, Date.now());
      if (got.length) { game.changed(); game.save(); await CL.push(true); }
      if (GF.allTaken(game.state, r.list) && CL.cloudState.ok !== false) await CL.cloudGiftsDone();   // 版本不够、还没收的留在信箱
    } catch (e) { console.warn('[礼物]', e); } finally { giftBusy = false; }
  };
  setTimeout(pollGift, 3000); setInterval(pollGift, 120000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(pollGift, 1500); });
  const items = whatsNew();
  if (items.length) setTimeout(async () => {
    const { openPanel, h } = await import('./ui/dom.js?v=47e8f1b5');
    const p = openPanel('这一版新加了什么');
    p.body.appendChild(h('div', 'tr-gain', items.map((x) => '· ' + esc(x)).join('<br>')));
  }, 2500);
}
main().catch((e) => { console.error(e); const t = $('.bt-txt'); if (t) { t.textContent = '出错了，点这里再试一次'; t.onclick = () => location.reload(); } });
