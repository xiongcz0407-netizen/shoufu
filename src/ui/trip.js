// V3-03 出差界面：选带谁去（她这趟要用的属性、爱慕阶段、有没有专属剧情）→ 看交通住宿和花费 → 出发：白天办事（选一次）→ 晚上 → 过夜 → 早上
import * as TP from '../core/trip.js?v=b3791cdb';
import * as AG from '../core/agenda.js?v=b3791cdb';
import * as SL from '../core/storylib.js?v=b3791cdb';
import * as STY from '../core/styles.js?v=b3791cdb';
import { SEC_BY_ID } from '../config/secretaries.js?v=b3791cdb';
import { attrs } from '../core/posts.js?v=b3791cdb';
import { ensureSec, loveStage, LOVE_STAGES } from '../core/secretary.js?v=b3791cdb';
import { fmtMoney } from '../core/format.js?v=b3791cdb';
import { asset } from '../platform/assets.js?v=b3791cdb';
import { game } from '../game.js?v=b3791cdb';
import { now } from '../core/clock.js?v=b3791cdb';
import { openPanel, toast } from './dom.js?v=b3791cdb';
import { playScene } from './scene.js?v=b3791cdb';

const C = TP.TRIP_CFG; const ATTR = { charm: '魅力', wit: '智慧', social: '交际', manage: '管理' };
export function openTrip(it) {
  const s = game.state; const P = TP.plan(s, it); const pu = C.purposes[it.purpose];
  const secs = Object.keys(s.secs || {}); let pick = secs.filter((id) => TP.canBring(s, id)).sort((a, b) => (attrs(s, b)[pu.attr] || 0) - (attrs(s, a)[pu.attr] || 0))[0] || null;
  const p = openPanel(`出差：${it.title}`);
  const draw = () => {
    p.body.innerHTML = `<div class="tr-gain">${P.city} · ${pu.name} · ${it.days} 天（这几天别的日程排不进，生意照常）</div>
      <div class="tr-gain">交通：${P.plane ? '自己的私人飞机' : '头等舱（两个人来回）'}　住：${P.home ? `${P.city}自己的房子` : P.ownHotel ? `自己的${P.hotel}` : `${P.hotel} · ${P.room}`}　${P.cost ? `花费 <b>${fmtMoney(P.cost)}</b>（个人）` : '不用花钱'}</div>
      <div class="sd-rec-title">带谁去（这趟看${ATTR[pu.attr]}）</div>
      <div class="tp-secs">${secs.map((id) => { const r = ensureSec(s, id); const ls = loveStage(r.love); const ok = TP.canBring(s, id); return `<button class="tp-sec ${pick === id ? 'on' : ''}" data-s="${id}" ${ok ? '' : 'disabled'}><img src="${asset(`assets/sec/${id}/c1.webp`)}" alt=""><b>${SEC_BY_ID[id].name}</b><small>${ATTR[pu.attr]} ${Math.round(attrs(s, id)[pu.attr] || 0)} · ${LOVE_STAGES[ls][1]}${SL.hasTrip(id) ? ' · ✦' : ''}</small>${ok ? '' : '<em>走不开</em>'}</button>`; }).join('')}</div>
      <div class="tr-gain">✦ 有专属出差剧情。一路上好感、爱慕都会涨。</div>
      <button class="btn gold big tp-go" style="width:100%" ${pick ? '' : 'disabled'}>出发</button>`;
    p.body.querySelectorAll('.tp-sec').forEach((b) => (b.onclick = () => { pick = b.dataset.s; draw(); }));
    p.body.querySelector('.tp-go').onclick = () => { p.close(); run(it, pick); };
  };
  draw();
}
function run(it, secId) {
  const s = game.state; const P = TP.plan(s, it); const pu = C.purposes[it.purpose]; const name = SEC_BY_ID[secId].name;
  const sub = (x) => x.replace(/\{sec\}/g, name).replace(/\{城市\}/g, P.city).replace(/\{夜景\}/g, P.view).replace(/\{酒店\}/g, P.hotel);
  const before = SL.lineOf(secId, 'trip_before', Math.random, ''); // V3-04 台词扩充：出差前
  const steps = [...(before ? [{ who: secId, text: before }] : []), P.plane ? sub(C.plane) : sub(C.firstClass), `落地${P.city}。`, {
    choice: { q: sub(pu.q), opts: pu.opts.map((o) => sub(o[0])) },
    then: (i) => {
      const r = TP.go(game.state, it.id, secId, i, now()); if (!r.ok) { toast(r.why); return []; }
      game.changed(); game.save(); const S = r.story; const [open, mid, end] = S.night;
      return [S.day[2], `（${r.res.join('；')}）`, { bg: 'bg_date_4', outfit: S.wear.eve }, S.evening, { bg: 'bg_hotel_night', label: '酒店套房 · 夜', outfit: S.wear.hotel }, S.go[1], ...(S.costumeLine ? [S.costumeLine] : []), ...open, ...mid, '#黑屏', { bg: 'bg_hotel_morning', label: '酒店套房 · 早上', sec: false }, ...end]; // 设计33 第四之五节：回酒店、夜里 bg_hotel_night；早上 bg_hotel_morning、不显示立绘
    },
  }];
  playScene(steps, { sec: secId, bg: 'bg_office_3', title: `出差 · ${P.city}`, outfit: STY.pick(s, secId, 'tripDay').o });
}
