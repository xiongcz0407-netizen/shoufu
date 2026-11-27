// 设计96「主动要求」：在线时恋人秘书来找你 —— 卡片（立绘 + knock）「好」/「现在不行」，挂着直到点；
// 「好」照私密约会播 open → q1 → q2 → close，背景是当前称号的办公室；「现在不行」播 refuse
import * as AV from '../core/askvisit.js?v=3839f433';
import * as DL from '../core/datelib.js?v=3839f433';
import { SEC_BY_ID } from '../config/secretaries.js?v=3839f433';
import { TITLES } from '../config/titles.js?v=3839f433';
import { now } from '../core/clock.js?v=3839f433';
import { homeInfo } from '../core/home.js?v=3839f433';
import { asset, hasAsset } from '../platform/assets.js?v=3839f433';
import { game } from '../game.js?v=3839f433';
import { h } from './dom.js?v=3839f433';
import { playScene } from './scene.js?v=3839f433';
import { isStoryPlaying } from './story.js?v=3839f433';
import { confirmBox } from './confirm.js?v=3839f433';
import { openWallet } from './coupon.js?v=3839f433';

/** 正在看剧情、商战、约会、全屏页、弹框时不来 */
export const askBusy = () => isStoryPlaying() || !!document.querySelector('.story, .sc-scene, .ub-mask, .cf-mask, .panel-mask, .full, .ask-mask');
const officeBg = (s) => (TITLES[s.title || 0] || TITLES[0]).bg;
const vars = () => { const hm = homeInfo(game.state); return hm ? { 城市: hm.city } : {}; };   // {城市}：住的那套房子所在城市
const fillAll = (a) => a.map((x) => DL.fill(x, vars()));

game.addTicker((s, dt) => {
  if (typeof document === 'undefined' || document.hidden) return;   // 只在前台累计在线
  const p = AV.askTick(s, now(), dt || 1, askBusy());
  if (p) showAsk(p);
});
// 「这次上线来过的」在读档时清掉（core/askvisit.js addLoadFix）

/** 她的卡片 */
export function showAsk(p) {
  if (document.querySelector('.ask-mask')) return;
  const s = game.state; const c = SEC_BY_ID[p.id]; const r = s.secs[p.id]; const sc = AV.sceneOf(p);
  const img = `assets/sec/${p.id}/${r.outfit || 'c1'}.webp`;
  const mask = h('div', 'ask-mask');
  mask.innerHTML = `<div class="ask-card">${hasAsset(img) ? `<img class="ask-img" src="${asset(img)}" alt="">` : ''}
    <div class="ask-box"><div class="ask-name">${c.name}</div><div class="ask-knock">${fillAll(sc.knock || []).map((x) => `<p>${x}</p>`).join('')}</div>
    <div class="ask-btns"><button class="btn ask-no">现在不行</button><button class="btn gold ask-yes">好</button></div></div></div>`;
  document.querySelector('#phone').appendChild(mask);
  mask.querySelector('.ask-yes').onclick = () => { mask.remove(); yes(); };
  mask.querySelector('.ask-no').onclick = () => { mask.remove(); no(); };
}

function yes() {
  const s = game.state; const t = now(); const p = AV.ask(s).pending; if (!p) return;
  const id = p.id; const c = SEC_BY_ID[id]; const outfit = s.secs[id].outfit || 'c1';
  const r = AV.goAsk(s, t, outfit); if (!r.ok) return;
  game.changed(); game.save();
  const sc = r.scene; const bg = officeBg(s); const f = fillAll;
  const ask = (Q, then) => { const a = f(Q.ask); const q = a[a.length - 1]; return [...a.slice(0, -1), { choice: { q, who: q.startsWith('「') ? id : 'narr', opts: Q.opts.map((o) => DL.fill(o.t, vars())) }, then }]; };
  const count = { who: 'narr', text: `${c.name}第 ${s.secs[id].rec.askCount} 次主动来找你。`, fx: `♥ +${+(r.love.to - r.love.from).toFixed(2)}　好感 +${+(r.favor.to - r.favor.from).toFixed(2)}` };
  const steps = [...f(sc.open), ...ask(sc.q1, (i) => [...f(sc.q1.opts[i].r), ...ask(sc.q2, (j) => [...f(sc.q2.opts[j].r), ...f(sc.close), ...(r.gift.length ? [{ bg }, ...r.gift] : []), count])])];
  playScene(steps, { sec: id, outfit, title: AV.ASK_PLACE, bg }).then(async () => {
    if (await confirmBox({ title: '精力用完了', body: '精力用完了。还要做事得喝精力药水。', ok: '去卡包', cancel: '知道了' })) openWallet({ focus: 'potion' });
    if (r.favor.stageUp) game.emit('favorUp', id, r.favor);
    if (r.love.stageUp) game.emit('loveUp', id, r.love);
  });
}
function no() {
  const s = game.state; const r = AV.refuseAsk(s, now()); if (!r.ok) return;
  game.save();
  if (r.lines.length) playScene(fillAll(r.lines), { sec: r.id, outfit: s.secs[r.id].outfit || 'c1', title: AV.ASK_PLACE, bg: officeBg(s) });
}
