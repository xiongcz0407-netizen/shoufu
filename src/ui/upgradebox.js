// 设计37 第三节：通用升级框 upgradeBox —— 顶上金光「升级！」，三行：升了什么 / 带来什么（前 → 后）/ 下一步；一个「好」，点框外不关。
// 同一时间只放一个，其余排队；剧情、小场景开着时先等（跟设计35 第五节第 4 条的队列一个规矩）。
// 开发2 这边接：秘书上课（ui/training.js）、好感升阶、老板属性涨（下面两个看守，每秒比一次）。开发1 的店铺 / 广告 / 分店直接调 upgradeBox。
import { SEC_BY_ID } from '../config/secretaries.js?v=6a9355f4';
import { outfitsOf } from '../config/outfits.js?v=6a9355f4';
import { LINES } from '../config/lines.js?v=6a9355f4';
import { FAVOR_STAGES, favorStage } from '../core/secretary.js?v=6a9355f4';
import { bossAttrs, auraBattle, networkAcquire, visionIncome, visionBattle } from '../core/boss.js?v=6a9355f4';
import { favorMult } from '../core/affection.js?v=6a9355f4';
import { nameOf } from '../core/styles.js?v=6a9355f4';
import { RIVALS, ACQ_DISC } from '../config/rivals.js?v=6a9355f4';
import P from '../config/posts.json?v=6a9355f4' with { type: 'json' };
import { game } from '../game.js?v=6a9355f4';
import { h } from './dom.js?v=6a9355f4';
import { isStoryPlaying } from './story.js?v=6a9355f4';

const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const Q = []; let showing = false;
// 剧情（XX 加入、升称号……）、小场景排在升级框前面：它们开着或排着队时，升级框先等
const storyOn = () => !!document.querySelector('.story, .sc-scene') || isStoryPlaying();
const busy = () => storyOn() || !!document.querySelector('.ub-mask');

/** opts: { what 升了什么, img 大图（换样子，开发1）, big 大一号, opened: [开放了…]（开发1）, sub 第二行的小标题（默认「带来什么」）, gains: [{ name, from, to, need } | 字符串], next 下一步, line 一句台词, sec 说话的秘书, title（默认「升级！」） } → Promise（点了「好」） */
export function upgradeBox(opts) { return new Promise((resolve) => { Q.push({ opts, resolve }); pump(); }); }
export const pendingBoxes = () => Q.length + (showing ? 1 : 0);

let settleAt = 0;
function pump() {
  if (showing || !Q.length) return;
  if (busy()) { settleAt = 0; setTimeout(pump, 400); return; }
  // 同一下触发的剧情（比如升广告带出「陆诗雨加入」）会晚一点进队：先等 0.15 秒再看一眼（剧情是同一下同步进队的，不用等久）
  const t = Date.now(); if (!settleAt) settleAt = t + 150; if (t < settleAt) { setTimeout(pump, settleAt - t + 10); return; }
  settleAt = 0;
  const { opts: o, resolve } = Q.shift(); showing = true;
  const gains = (o.gains || []).map((g) => (typeof g === 'string' ? `<li>${esc(g)}</li>` : `<li class="${g.need ? 'ub-off' : ''}"><span>${g.need ? `<em>${esc(g.need)}：</em>` : ''}${esc(g.name)}</span><b>${esc(g.from)} <i>→</i> ${esc(g.to)}</b></li>`)).join('');
  const sec = o.sec && SEC_BY_ID[o.sec];
  const mask = h('div', 'ub-mask');
  mask.innerHTML = `<div class="ub-box${o.big ? ' big' : ''}"><div class="ub-glow"></div><div class="ub-title">${esc(o.title || '升级！')}</div>
    ${o.img ? `<img class="ub-img" src="${esc(o.img)}" alt="" style="width:100%;border-radius:10px;margin:6px 0">` : ''}<div class="ub-what">${esc(o.what || '')}</div>
    ${gains ? `<div class="ub-sub">${esc(o.sub || '带来什么')}</div><ul class="ub-gains">${gains}</ul>` : ''}
    ${o.opened && o.opened.length ? `<div class="ub-sub">开放了</div><ul class="ub-gains">${o.opened.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${o.line ? `<div class="ub-line">${sec ? `<b>${esc(sec.name)}</b>` : ''}「${esc(o.line)}」</div>` : ''}
    ${o.next ? `<div class="ub-next">下一步：${esc(o.next)}</div>` : ''}
    <button class="btn gold ub-ok">好</button></div>`;
  (document.querySelector('#phone') || document.body).appendChild(mask);
  requestAnimationFrame(() => mask.classList.add('open'));
  // 框开着时又来了剧情：先把框藏起来，剧情放完再露出来（同一时间只放一个）
  const watch = setInterval(() => { mask.style.display = storyOn() ? 'none' : ''; }, 200);
  mask.querySelector('.ub-ok').onclick = () => { clearInterval(watch); mask.classList.remove('open'); setTimeout(() => { mask.remove(); showing = false; resolve(); pump(); }, 160); };
  // 点框外不关（防误点）
}

// —— 好感升阶 ——
const favorEff = (f) => { let e = 1; for (const [x, k] of P.favorEff) if (f >= x) e = k; return e; };
export function favorBox(s, id, fromStage, toStage) {
  const r = s.secs[id]; const name = SEC_BY_ID[id].name; const gains = [];
  const wear = outfitsOf(id).filter((o) => o.needFavor > fromStage * 100 && o.needFavor <= toStage * 100).map((o) => `${nameOf(id, o.id)}${(r.owned || []).includes(o.id) ? '（已买）' : ''}`);
  if (wear.length) gains.push(`能穿：${wear.join('、')}`);
  if (fromStage * 100 < 200 && toStage * 100 >= 200) gains.push('点她有一半机会撒娇（暧昧台词）');
  const e0 = favorEff(fromStage * 100), e1 = favorEff(toStage * 100);
  if (e0 !== e1) gains.push({ name: '她当职位的效率', from: `×${e0.toFixed(1)}`, to: `×${e1.toFixed(1)}` });
  if (toStage >= FAVOR_STAGES.length - 1) gains.push('好感已满，礼物不用再送了');   // 设计76
  const nx = toStage + 1 < FAVOR_STAGES.length ? `好感到 ${(toStage + 1) * 100} 进「${FAVOR_STAGES[toStage + 1]}」` : '好感到顶了，接着培养爱慕';
  const ls = LINES[id] || {}; const line = [].concat(ls.happy || ls.tap || [])[0];
  return upgradeBox({ what: `${name} 好感：${FAVOR_STAGES[fromStage]} → ${FAVOR_STAGES[toStage]}`, gains, next: nx, line: typeof line === 'string' ? line : line && line.t, sec: id });
}

// —— 老板属性涨 ——
const NAME = { aura: '气场', network: '人脉', vision: '眼光' };
const fxOf = (s) => ({ aura: [['商战胜率', `+${(auraBattle(s) * 100).toFixed(1)}%`], ['秘书好感涨得快', `×${favorMult(s).toFixed(2)}`]],
  network: [['收购价', `−${(Math.min(networkAcquire(s) * ACQ_DISC.network, ACQ_DISC.networkMax) * 100).toFixed(1)}%`]],   // 设计64
  vision: [['产钱', `+${(visionIncome(s) * 100).toFixed(1)}%`], ['商战看穿底牌', `+${(visionBattle(s) * 100).toFixed(1)}%`]] });
const NEXT = { aura: '买更贵的车、表、西装还能涨', network: '买豪宅、收购对手还能涨', vision: '买飞机、开分店、升称号还能涨' };
const snap = (s) => ({ a: bossAttrs(s), fx: fxOf(s), seq: s.ledgerSeq || 0, acq: Object.values(s.rivals || {}).filter((x) => x.acquired).length, br: Object.values(s.inds || {}).reduce((a, x) => a + (x.branches || 0), 0), title: s.title || 0 });
function reasonOf(s, o) {
  const acq = Object.entries(s.rivals || {}).filter(([, x]) => x.acquired).length;
  if (acq > o.acq) { const ids = Object.entries(s.rivals || {}).filter(([, x]) => x.acquired).map(([k]) => k); const r = RIVALS.find((x) => x.id === ids[ids.length - 1]); return `收购了${r ? r.name : '对手'}`; }
  if ((s.title || 0) > o.title) return '升称号';
  const rows = (s.ledger || []).filter((x) => x.id > o.seq && x.dir === 'out' && x.note).sort((a, b) => b.amount - a.amount);
  if (rows.length) return rows[0].note.replace(/（.*$/, '');
  const br = Object.values(s.inds || {}).reduce((a, x) => a + (x.branches || 0), 0);
  if (br > o.br) return '开了分店';
  return '';
}
let last = null, lastFav = null, lastT = 0, lastS = null;
function watch(s) {
  if (!s || !s.secs) return;
  if (s !== lastS) { lastS = s; last = null; lastFav = null; } // 读档 / 换档：重新拍，不把差当升级
  // 好感
  const fav = Object.fromEntries(Object.entries(s.secs).map(([id, r]) => [id, favorStage(r.favor || 0)]));
  if (lastFav) for (const [id, st] of Object.entries(fav)) if (lastFav[id] != null && st > lastFav[id]) favorBox(s, id, lastFav[id], st);
  lastFav = fav;
  // 老板属性（同一下涨了几项合一个框）
  const now = snap(s);
  if (last) {
    const up = Object.keys(NAME).filter((k) => Math.round(now.a[k] * 10) > Math.round(last.a[k] * 10));
    if (up.length) {
      const why = reasonOf(s, last);
      const gains = up.flatMap((k) => now.fx[k].map(([n, v], i) => ({ name: n, from: last.fx[k][i][1], to: v }))).filter((g) => g.from !== g.to);
      upgradeBox({ what: `${up.map((k) => `${NAME[k]} ${last.a[k]} → ${now.a[k]}`).join('，')}${why ? `（因为：${why}）` : ''}`, gains, next: up.map((k) => NEXT[k]).join('；') });
    }
  }
  last = now;
}
// 弹窗延迟修复：以前每秒（实际常常 2 秒）比一次；现在每秒照比，另外每次点完（game.changed）马上再比一次
game.addTicker((s) => watch(s));
let soonT = null;
if (typeof document !== 'undefined') game.onChange((s) => { if (soonT) return; soonT = setTimeout(() => { soonT = null; lastT = Date.now(); watch(game.state); }, 0); });
/** 读档 / 换档时重新拍一张，不把老存档的差当成「升级」 */
export const resetWatch = () => { last = null; lastFav = null; };
