// V3-02 老板日程表界面 → 设计69 第二版：首页「日程」= 邀请箱（不分时段、不过期）：去参加 / 派人代去 / 推掉；外部事件「去处理」
// 出席宴会、讲座、慈善、私人场合先选车 / 表 / 西装 / 女伴；参加 = 小场景（ui/scene.js）
import * as LV from '../core/love.js?v=b846574c';   // 设计56
import * as AG from '../core/agenda.js?v=b846574c';
import { openTrip } from './trip.js?v=b846574c';
import * as INB from './inbox.js?v=b846574c';
import { SEC_BY_ID } from '../config/secretaries.js?v=b846574c';
import { attrs } from '../core/posts.js?v=b846574c';
import { game } from '../game.js?v=b846574c';
import { now } from '../core/clock.js?v=b846574c';
import { openPanel, toast, h } from './dom.js?v=b846574c';
import { asset, hasAsset } from '../platform/assets.js?v=b846574c';
import { playScene } from './scene.js?v=b846574c';
import { lineOf, setFavorFn } from '../core/storylib.js?v=b846574c';
import { favorStage } from '../core/secretary.js?v=b846574c';
setFavorFn((id) => { const r = game.state && game.state.secs && game.state.secs[id]; return r ? favorStage(r.favor || 0) : 0; }); // V3-04：{ t, fav } 好感到了才说
import * as STY from '../core/styles.js?v=b846574c';

const C = AG.AGENDA_CFG;
const OPENERS = {};
/** 外部事件的「去处理」：registerOpen('project', (s, item) => …)（开发1 的大项目节点、对手进攻用；经营会已接） */
export const registerOpen = (kind, fn) => { OPENERS[kind] = fn; };
const BG = { inspect: 'bg_mall', talk: 'bg_meeting', banquet: 'bg_date_1', charity: 'bg_auction', sign: 'bg_meeting', media: 'bg_finance', private: 'bg_marina', datesec: 'bg_date_1' };
/** 设计69 第二版：日程 = 邀请箱（按来的先后列，不分时段、不过期）；每条写谁请你 / 什么事 / 去了有什么好处；去参加 / 派人代去（一半）/ 推掉 */
export function openAgenda(focusId = null) {   // focusId 给了就滚到那件事
  const p = openPanel('日程');
  const draw = () => {
    const s = game.state; const t = now(); AG.tick(s, t); const sc = AG.scheduler(s); const A = AG.ag(s);
    const ext = A.items.filter((x) => x.ext && x.status === 'invite').sort((a, b) => a.at - b.at || a.id - b.id); const xs = AG.inbox(s); const aw = AG.away(s, t);
    const bd = LV.birthdaysOn(s, t).map((id) => `<button class="ag-bday" data-bday="${id}">🎂 今天是${SEC_BY_ID[id].name}的生日（送礼 ×3，点这里去商场）</button>`).join('') + LV.birthdaysTomorrow(s, t).map((id) => `<button class="ag-bday pre" data-bday="${id}">🎂 明天是${SEC_BY_ID[id].name}的生日</button>`).join('');   // 设计56：生日一定写在日程最上面
    p.body.innerHTML = bd + `<div class="tr-gain">${sc ? `日程秘书：<b>${SEC_BY_ID[sc].name}</b>（交际 ${Math.round(attrs(s, sc).social || 0)}：邀请箱最多放 ${AG.cap(s)} 个、档次）` : `没有日程秘书（让一位没职位的秘书陪着你），邀请箱最多放 ${AG.cap(s)} 个`}　日程攒的人脉 <b>${(+A.net).toFixed(1)}</b>${A.gov ? `　政府关系 ${A.gov}` : ''}</div>
      ${aw ? `<div class="tr-gain ag-away">✈️ 出差中，还有 ${Math.max(1, Math.ceil((aw.until - t) / AG.DAY_MS))} 天回来：这几天别的只能派人代去</div>` : ''}
      <div class="sd-rec-title">邀请箱 ${xs.length}/${AG.cap(s)}<small>　不过期，什么时候去都行；每天秘书补到满</small></div>
      ${ext.map((x) => card(s, x, t)).join('')}${xs.length ? xs.map((x) => card(s, x, t)).join('') : '<div class="ag-empty">邀请箱空了，明天秘书会再补</div>'}
      ${A.log.length ? `<div class="sd-rec-title">最近</div><div class="ag-log">${A.log.slice(0, 5).map((l) => `<div>${l.text}</div>`).join('')}</div>` : ''}`;
    p.body.querySelectorAll('[data-bday]').forEach((b) => (b.onclick = () => { p.close(); import('./mall.js?v=b846574c').then((u) => u.openMall(b.dataset.bday, 'gift')); }));
    p.body.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => act(b.dataset.act, +b.dataset.id, draw, p)));
  };
  draw();
  if (focusId != null) { const el = p.body.querySelector(`.ag-item[data-iid="${focusId}"]`); if (el) { el.classList.add('focus'); el.scrollIntoView({ block: 'center' }); } }
}
const whoOf = (s, x) => (x.kind === 'datesec' && x.sec && SEC_BY_ID[x.sec] ? SEC_BY_ID[x.sec].name : x.kind === 'trip' ? `去${x.city}` : x.host || '');
function card(s, x, t) {
  const K = C.kinds[x.kind] || { icon: '📌', name: '' }; const why = AG.whyAttend(s, x, t); const g = x.ext ? '' : AG.gainText(s, x);
  const btns = [];
  if (x.ext) btns.push(['ext', '去处理', 'gold']);
  else {
    if (!why) btns.push(['go', `${x.kind === 'trip' ? '出发' : '去参加'}${g ? `<small>${g}</small>` : ''}`, 'gold']);
    if (x.kind !== 'trip' && x.kind !== 'datesec') btns.push(['del', `派人代去<small>效果一半</small>`, '']);
    btns.push(['dec', '推掉', '']);
  }
  const who = whoOf(s, x);
  return `<div class="ag-item" data-iid="${x.id}"><div class="ag-top"><i>${K.icon}</i><b>${x.title}</b><em>${C.tiers[x.tier] || ''}</em></div>
    <div class="ag-sub">${x.ext ? '要你拍板' : `${who ? `${who}请你 · ` : ''}${K.name}${x.kind === 'trip' ? ` · ${x.days} 天` : ''}${AG.needDress(x) ? ' · 要打扮' : ''}`}${why && !x.ext ? `　<span class="ag-st">${why}</span>` : ''}</div>
    ${g && why ? `<div class="ag-gain">去了：${g}</div>` : ''}
    <div class="ind-btns">${btns.map(([a, l, c]) => `<button class="btn sm ${c}" data-act="${a}" data-id="${x.id}">${l}</button>`).join('')}</div></div>`;
}
function act(a, id, redraw, panel) {
  const s = game.state; const x = AG.byId(s, id); let r = { ok: true };
  if (a === 'dec') r = AG.decline(s, id, now());
  if (a === 'del') { const sec = Object.keys(s.secs).find((k) => k !== s.current && !AG.whyDelegate(s, x, k)) || Object.keys(s.secs).find((k) => !AG.whyDelegate(s, x, k)); if (!sec) return toast('没有能代你去的秘书'); r = AG.delegate(s, id, sec, now()); if (r.ok) toast(`${SEC_BY_ID[sec].name}代你去了：${r.res.lines.join('，') || '没什么收获'}`, 2600); }
  if (a === 'ext') { const fn = OPENERS[x.kind]; if (!fn) return toast('这件事还没接上'); panel.close(); fn(s, x); return; }
  if (a === 'go') { panel.close(); if (x.kind === 'trip') openTrip(x); else if (AG.needDress(x)) openDress(x); else runScene(x, null); return; }
  if (!r.ok) toast(r.why); game.changed(); game.save(); redraw();
}
/** 出席前打扮：车 / 表 / 西装 / 女伴 */
function openDress(x) {
  const s = game.state; const w = AG.wardrobe(s); const sel = AG.bestDress(s);
  const p = openPanel(`出席：${x.title}`);
  const row = (k, name, list) => `<div class="ag-dr"><span>${name}</span><select data-k="${k}"><option value="">${k === 'sec' ? '不带' : '没有'}</option>${list.map((o) => `<option value="${o.id}" ${sel[k] === o.id ? 'selected' : ''}>${o.name}${o.price ? `（${big(o.price)}）` : ''}</option>`).join('')}</select></div>`;
  const draw = () => {
    p.body.innerHTML = `<div class="tr-gain">${AG.reqText(x.tier)}</div>
      ${row('car', '开哪辆车', w.car)}${row('watch', '戴哪块表', w.watch)}${row('suit', '穿哪套西装', w.suit)}${row('sec', '带谁当女伴', w.sec.map((id) => ({ id, name: `${SEC_BY_ID[id].name}（魅力 ${Math.round(attrs(s, id).charm || 0)} · 交际 ${Math.round(attrs(s, id).social || 0)}）` })))}
      ${(() => { const f = AG.compFit(s, x, sel); return f ? `<div class="tr-gain">${SEC_BY_ID[sel.sec].name}穿「${f.name}」（${f.style || '—'}）${f.k >= 1 ? `，对路${f.k > 1 ? ` +${Math.round((f.k - 1) * 100)}%` : ''}` : f.k >= 0.9 ? '，退了一档 ×0.9' : '，不太合适 ×0.8，去衣服店给她买一套'}</div>` : ''; })()}
      <div class="tr-gain">这身打扮：效果 ×<b>${AG.dressMult(s, x.tier, sel, x).toFixed(2)}</b>${sel.sec ? `；${SEC_BY_ID[sel.sec].name}好感、爱慕会涨` : ''}</div>
      <button class="btn gold big ag-goo" style="width:100%">出发</button>`;
    p.body.querySelectorAll('select').forEach((el) => (el.onchange = () => { sel[el.dataset.k] = el.value || null; draw(); }));
    p.body.querySelector('.ag-goo').onclick = () => { p.close(); runScene(x, sel); };
  };
  draw();
}
const big = (v) => (v >= 1e8 ? `${+(v / 1e8).toFixed(1)}亿` : v >= 1e4 ? `${+(v / 1e4).toFixed(0)}万` : `${v}`);
/** 小场景：开头 → 两轮选择 → 结果 */
export function runScene(x, sel) {
  const s = game.state; const vs = C.scenes[x.kind] || C.scenes.banquet; const v = vs[Math.floor(Math.random() * vs.length)];
  const comp = (sel && sel.sec) || (x.kind === 'datesec' ? x.sec : s.current); const name = comp && SEC_BY_ID[comp] ? SEC_BY_ID[comp].name : '秘书';
  const sub = (t) => t.replace(/\{sec\}/g, name).replace(/\{host\}/g, x.host || '对方').replace(/\{line\}/g, x.line || '门店');
  let score = 0; const fit = AG.compFit(s, x, sel) || (comp && STY.occOfItem(x) ? STY.fitMult(s, comp, STY.occOfItem(x), x.tier) : null);
  const round = (k) => { const R = v.rounds[k]; if (!R) return finish(); return [{ choice: { q: sub(R.q), opts: R.opts.map((o) => sub(o[0])) }, then: (i) => { score += R.opts[i][1]; return [sub(R.opts[i][2]), ...round(k + 1)]; } }]; };
  const finish = () => { const r = AG.resolve(s, x, sel, now(), { score }); if (r.loveUp) setTimeout(() => game.emit('loveUp', r.loveUp.id, r.loveUp.r), 400); game.changed(); game.save();   // 设计56：她约你也能跨门、播剧情
 const end = score >= 3 ? C.end.good : score >= 2 ? C.end.ok : C.end.bad; return [end, ...(r.lines.length ? [`（${r.lines.join('；')}）`] : [])]; };
  const inv = x.kind === 'datesec' && comp ? lineOf(comp, 'date_invite', Math.random, '') : ''; // V3-04 台词扩充：约会邀约
  const fl = fit && fit.line && sel && sel.sec ? [{ who: comp, text: fit.line }] : [];
  const sch = sel && sel.sec ? lineOf(sel.sec, 'schedule', Math.random, '') : ''; if (sch) fl.unshift({ who: comp, text: sch }); // V3-04：带她出席前
  playScene([...(inv ? [{ who: comp, text: inv }] : []), ...fl, ...v.intro.map(sub), ...round(0)], { sec: comp && SEC_BY_ID[comp] ? comp : null, outfit: fit ? fit.o : undefined, bg: BG[x.kind], title: `${C.kinds[x.kind].name} · ${x.title}` });
}
INB.addActionUi((s, m, a) => { if (m.type !== 'agenda' || a !== 'open') return false; openAgenda(); return true; });
import('./meeting.js?v=b846574c').then((M) => registerOpen('meeting', () => M.openMeeting()));
for (const k of ['project', 'attack', 'realestate']) registerOpen(k, () => INB.openInbox('important')); // 开发1 的消息（带按钮），设计39 起在消息中心「重要」页处理
let last = 0;
game.addTicker((s) => { const t = now(); if (t - last < 2000) return; last = t; AG.tick(s, t); freshTick(s); });

// —— 设计69 第二版 提醒：新邀请到了弹一条轻提示（带日程秘书头像），停 5 秒，点了打开日程；离线来的不弹（对账单写一行）；设置里「日程提醒」关了不弹（只剩红点）——
// 剧情、约会播放中先攒着，播完再弹（合成一条）
let freshQ = []; let remTimer = null;
export const remOn = (s) => !(s.settings && s.settings.agendaRem === false);
function freshTick(s) {
  const got = AG.takeFresh(s); if (!remOn(s)) { freshQ = []; return; }
  freshQ.push(...got); if (!freshQ.length || typeof document === 'undefined' || document.querySelector('.story')) return;
  const xs = freshQ.filter((x, i) => x.status === 'invite' && freshQ.findIndex((y) => y.id === x.id) === i); freshQ = []; if (xs.length) remBar(s, xs);
}
export function remBar(s, xs) {
  const ph = document.querySelector('#phone') || document.body; let bar = document.querySelector('.ag-rem'); if (!bar) { bar = h('button', 'ag-rem'); ph.appendChild(bar); }
  const sc = AG.scheduler(s); const face = sc && hasAsset(`assets/sec/${sc}/c1.webp`) ? `<img src="${asset(`assets/sec/${sc}/c1.webp`)}" alt="">` : '<i class="ag-rem-ic">📅</i>';
  bar.innerHTML = `${face}<span>${sc ? `<b>${SEC_BY_ID[sc].name}</b>：` : ''}${AG.freshText(s, xs)}</span><i>›</i>`;
  bar.classList.add('show');
  bar.onclick = () => { bar.classList.remove('show'); openAgenda(xs[0].id); };
  clearTimeout(remTimer); remTimer = setTimeout(() => bar.classList.remove('show'), 5000);
}
