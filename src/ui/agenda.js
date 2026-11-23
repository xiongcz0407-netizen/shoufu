// V3-02 老板日程表界面：首页「日程」→ 今天 / 明天，每个时段的邀请：答应 / 推掉 / 派人代去 / 去参加；外部事件「去处理」
// 出席宴会、讲座、慈善、私人场合先选车 / 表 / 西装 / 女伴；参加 = 小场景（ui/scene.js）
import * as AG from '../core/agenda.js?v=59e44493';
import { openTrip } from './trip.js?v=59e44493';
import * as INB from './inbox.js?v=59e44493';
import { SEC_BY_ID } from '../config/secretaries.js?v=59e44493';
import { attrs } from '../core/posts.js?v=59e44493';
import { dayIndex } from '../core/manage.js?v=59e44493';
import { game } from '../game.js?v=59e44493';
import { now } from '../core/clock.js?v=59e44493';
import { openPanel, toast } from './dom.js?v=59e44493';
import { playScene } from './scene.js?v=59e44493';
import { lineOf, setFavorFn } from '../core/storylib.js?v=59e44493';
import { favorStage } from '../core/secretary.js?v=59e44493';
setFavorFn((id) => { const r = game.state && game.state.secs && game.state.secs[id]; return r ? favorStage(r.favor || 0) : 0; }); // V3-04：{ t, fav } 好感到了才说
import * as STY from '../core/styles.js?v=59e44493';

const C = AG.AGENDA_CFG;
const OPENERS = {};
/** 外部事件的「去处理」：registerOpen('project', (s, item) => …)（开发1 的大项目节点、对手进攻用；经营会已接） */
export const registerOpen = (kind, fn) => { OPENERS[kind] = fn; };
const ST = { invite: '待定', accepted: '已答应', declined: '推掉了', delegated: '派人代去', done: '去过了', expired: '没去', missed: '失约' };
const BG = { inspect: 'bg_mall', talk: 'bg_meeting', banquet: 'bg_date_1', charity: 'bg_auction', sign: 'bg_meeting', media: 'bg_finance', private: 'bg_marina', datesec: 'bg_date_1' };
let day0 = 0;
export function openAgenda() {
  const p = openPanel('日程'); let off = 0;
  const draw = () => {
    const s = game.state; const t = now(); AG.tick(s, t); const d = dayIndex(s, t) + off; const sc = AG.scheduler(s); const A = AG.ag(s); const cur = AG.nowSlot(s, t);
    const xs = AG.itemsOf(s, d);
    p.body.innerHTML = `<div class="tabs ag-tabs"><button class="tab ${off === 0 ? 'on' : ''}" data-o="0">今天</button><button class="tab ${off === 1 ? 'on' : ''}" data-o="1">明天</button></div>
      <div class="tr-gain">${sc ? `日程秘书：<b>${SEC_BY_ID[sc].name}</b>（交际 ${Math.round(attrs(s, sc).social || 0)}：邀请多少和档次；管理 ${Math.round(attrs(s, sc).manage || 0)}：排不排得开）` : '没有日程秘书（让一位没职位的秘书陪着你），邀请函都堆在桌上'}　日程攒的人脉 <b>${(+A.net).toFixed(1)}</b>${A.gov ? `　政府关系 ${A.gov}` : ''}</div>
      ${[0, 1, 2].map((k) => { const ys = xs.filter((x) => (x.kind === 'trip' ? k === 0 : x.slot === k)); return `<div class="ag-slot ${off === 0 && cur.slot === k ? 'now' : ''}"><div class="ag-sh">${AG.slotName(k)}${off === 0 && cur.slot === k ? ' · 现在' : ''}</div>${ys.length ? ys.map((x) => card(s, x, t)).join('') : '<div class="ag-empty">空着</div>'}</div>`; }).join('')}
      ${A.log.length ? `<div class="sd-rec-title">最近</div><div class="ag-log">${A.log.slice(0, 5).map((l) => `<div>${l.text}</div>`).join('')}</div>` : ''}`;
    p.body.querySelectorAll('.ag-tabs .tab').forEach((b) => (b.onclick = () => { off = +b.dataset.o; draw(); }));
    p.body.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => act(b.dataset.act, +b.dataset.id, draw, p)));
  };
  draw(); day0 = 0;
}
function card(s, x, t) {
  const K = C.kinds[x.kind]; const why = AG.whyAttend(s, x, t); const open = ['invite', 'accepted'].includes(x.status);
  const btns = [];
  if (x.ext) { if (open) btns.push(['ext', '去处理', 'gold']); }
  else if (open) {
    if (!why) btns.push(['go', x.kind === 'trip' ? '出发' : '去参加', 'gold']);
    if (x.status === 'invite' && (why || x.kind === 'trip')) btns.push(['acc', '答应', '']);
    if (x.kind !== 'trip' && x.kind !== 'datesec') btns.push(['del', '派人代去', '']);
    btns.push(['dec', '推掉', '']);
  }
  return `<div class="ag-item st-${x.status}"><div class="ag-top"><i>${K.icon}</i><b>${x.title}</b><em>${C.tiers[x.tier] || ''}</em></div>
    <div class="ag-sub">${K.name}${x.kind === 'trip' ? ` · ${x.days} 天` : ''}${x.firm ? ' · 答应了要去' : ''}${AG.needDress(x) ? ' · 要打扮' : ''}　<span class="ag-st">${ST[x.status] || ''}${open && why && !x.ext ? `（${why}）` : ''}</span></div>
    ${btns.length ? `<div class="ind-btns">${btns.map(([a, l, c]) => `<button class="btn sm ${c}" data-act="${a}" data-id="${x.id}">${l}</button>`).join('')}</div>` : ''}</div>`;
}
function act(a, id, redraw, panel) {
  const s = game.state; const x = AG.byId(s, id); let r = { ok: true };
  if (a === 'acc') r = AG.accept(s, id);
  if (a === 'dec') r = AG.decline(s, id);
  if (a === 'del') { const sec = Object.keys(s.secs).find((k) => k !== s.current && !AG.whyDelegate(s, x, k)) || Object.keys(s.secs).find((k) => !AG.whyDelegate(s, x, k)); if (!sec) return toast('没有能代你去的秘书'); r = AG.delegate(s, id, sec); if (r.ok) toast(`${SEC_BY_ID[sec].name}代你去（效果一半）`); }
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
  const finish = () => { const r = AG.resolve(s, x, sel, now(), { score }); game.changed(); game.save(); const end = score >= 3 ? C.end.good : score >= 2 ? C.end.ok : C.end.bad; return [end, ...(r.lines.length ? [`（${r.lines.join('；')}）`] : [])]; };
  const inv = x.kind === 'datesec' && comp ? lineOf(comp, 'date_invite', Math.random, '') : ''; // V3-04 台词扩充：约会邀约
  const fl = fit && fit.line && sel && sel.sec ? [{ who: comp, text: fit.line }] : [];
  const sch = sel && sel.sec ? lineOf(sel.sec, 'schedule', Math.random, '') : ''; if (sch) fl.unshift({ who: comp, text: sch }); // V3-04：带她出席前
  playScene([...(inv ? [{ who: comp, text: inv }] : []), ...fl, ...v.intro.map(sub), ...round(0)], { sec: comp && SEC_BY_ID[comp] ? comp : null, outfit: fit ? fit.o : undefined, bg: BG[x.kind], title: `${C.kinds[x.kind].name} · ${x.title}` });
}
INB.addActionUi((s, m, a) => { if (m.type !== 'agenda' || a !== 'open') return false; openAgenda(); return true; });
import('./meeting.js?v=59e44493').then((M) => registerOpen('meeting', () => M.openMeeting()));
for (const k of ['project', 'attack', 'realestate']) registerOpen(k, () => INB.openInbox('important')); // 开发1 的消息（带按钮），设计39 起在消息中心「重要」页处理
let last = 0;
game.addTicker((s) => { const t = now(); if (t - last < 2000) return; last = t; const r = AG.tick(s, t); if (r && r.invites) toast(`${AG.scheduler(s) ? SEC_BY_ID[AG.scheduler(s)].name : '秘书'}把明天的日程排好了（${r.invites} 个邀请）`, 3000); });
