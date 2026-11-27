import { avatarKey } from './main-screen.js?v=701a82d3';
import * as MG from '../core/manage.js?v=701a82d3'; // P-05 精力
import { asset, hasAsset } from '../platform/assets.js?v=701a82d3';
// 老板页：名字和公司、老板属性、称号进度、穿戴、统计、设置（存档、重新开始在「设置」里，设计22）
import { TITLES } from '../config/titles.js?v=701a82d3';
import { RIVALS } from '../config/rivals.js?v=701a82d3';
import * as E from '../core/economy.js?v=701a82d3';
import { fmtMoney, fmtDuration } from '../core/format.js?v=701a82d3';
import { versionText } from '../version.js?v=701a82d3';
import { now } from '../core/clock.js?v=701a82d3';
import { game } from '../game.js?v=701a82d3';
import { h, toast, openPanel } from './dom.js?v=701a82d3';
import { openFull } from './shell.js?v=701a82d3';
import { lxPic, openLuxShop } from './luxury.js?v=701a82d3';
import { openShop } from './assets.js?v=701a82d3';
import * as LX from '../core/luxury.js?v=701a82d3';
import * as AS from '../core/assets.js?v=701a82d3';
import * as HM from '../core/home.js?v=701a82d3';
import { isRented } from '../core/postwork.js?v=701a82d3';
import { appendCloudSettings } from './cloudset.js?v=701a82d3';
import { inputBox } from './confirm.js?v=701a82d3'; // 设计37 第一节：游戏样式输入框
import * as RD from '../core/ride.js?v=701a82d3';
import * as RL from '../core/richlist.js?v=701a82d3'; // 设计98 // 设计71 座驾

// 老板属性（设计09 第一节）由第 12 项提供：返回 [{ name, value, from }]
let bossAttrs = () => [];
export const setBossAttrs = (fn) => { bossAttrs = fn; };

export function openBoss() {
  const p = openFull('老板');
  const render = () => {
    const s = game.state; const t = now(); const nw = E.netWorth(s);
    const next = TITLES[s.title + 1];
    const final = next && next.rival ? RIVALS.find((r) => r.id === next.rival) : null; const finalOk = final && ((s.flags.acquired || {})[final.id] || (s.flags.finalBeaten || {})[s.title]);
    const st = s.stats || {};
    p.body.innerHTML = `<div class="page-body">
      <div class="boss-card"><div class="tb-avatar big">${hasAsset(`assets/me/${avatarKey(s.title)}.webp`) ? `<img src="${asset(`assets/me/${avatarKey(s.title)}.webp`)}" alt="">` : (s.bossName || '我').slice(0, 1)}</div>
        <div><div class="ind-name">${s.bossName || '老板'} <small>${RL.titleText(s)}</small></div><div class="tr-gain">${s.companyName || ''}</div></div>
        <button class="btn rename">改名</button></div>
      ${mineHtml(s)}
      <div class="sd-rec-title">精力</div>
      <div class="tr-course"><div style="flex:1"><b>${Math.floor(MG.energy(s, t))} / ${MG.energyMax(s)}</b><div class="bar" style="margin-top:6px"><i style="width:${MG.energy(s, t) / MG.energyMax(s) * 100}%"></i></div><div class="tr-gain">每天 0 点回满（打工人 150、小老板 200、老板起 250），中间不回复；门店动作、大事、事件选项、商战各 5，约会 ${MG.E_COST.date}（私密约会要有 ${MG.E_COST.privMin} 才能开始，约完清空）。${MG.tip(s)}。门店详情里「亲自上阵」花精力；${(s.title || 0) >= 2 ? '老板以后亲自经营效果减半，精力多花在大事上：' : `精力够哪条线都能去。`}</div>
        ${(s.title || 0) >= 2 ? `<div class="ind-btns">${['battle', 'deal'].map((k) => `<button class="btn big-act" data-k="${k}" ${MG.whyNotBig(s, k, t) ? 'disabled' : ''}>${MG.MANAGE_CFG.big[k].name}（${MG.MANAGE_CFG.big[k].energy}）${MG.bigBonus(s, k) ? '<br><small>已准备好</small>' : ''}</button>`).join('')}</div>` : ''}</div></div>
      <div class="sd-rec-title">老板属性</div>
      <div class="boss-attrs">${bossAttrs(s).map((a) => `<div><b>${a.value}</b><span>${a.name}</span><small>${a.from}</small></div>`).join('') || '<div class="empty">第 12 项接上（气场、人脉）</div>'}</div>
      <div class="sd-rec-title">称号进度</div>
      ${next ? `<div class="tr-course"><div><b>下一个：${next.name}</b><div class="tr-gain">身价 ${fmtMoney(nw)} / ${fmtMoney(next.need)}${final ? `　收购「${final.name}」${finalOk ? '✓' : '✗'}` : next.rival === null ? '　（后面的故事还在路上）' : next.rival ? `　收购最终对手（还没开放）` : ''}</div>
        <div class="bar" style="margin-top:6px"><i style="width:${Math.min(100, (nw / next.need) * 100)}%"></i></div></div></div>` : '<div class="tr-gain">你已经是首富了</div>'}
      <div class="sd-rec-title">统计</div>
      <div class="sd-rec"><div>玩了<b>${fmtDuration((t - s.createdAt) / 1000)}</b></div><div>累计赚<b>${fmtMoney(st.earned || 0)}</b></div><div>商战<b>${st.battleWins || 0}/${st.battles || 0}</b></div>
        <div>约会<b>${st.dates || 0}次</b></div><div>送礼<b>${st.gifts || 0}次</b></div><div>结业<b>${st.coursesDone || 0}门</b></div></div>
      <div class="sd-rec-title">设置</div>
      <div class="tr-course"><div><b>人声</b><div class="tr-gain">秘书说话的配音（没有配音文件时只出气泡）</div></div><button class="btn voice">${s.settings.voice === false ? '关' : '开'}</button></div><div class="tr-course"><div><b>日程提醒</b><div class="tr-gain">新邀请到了在上方提醒一下（关了只剩日程图标的红点）</div></div><button class="btn ag-rem-set">${s.settings.agendaRem === false ? '关' : '开'}</button></div><div class="boss-cloud"></div>
      <div class="tr-gain" style="text-align:center;margin-top:12px">${versionText()}</div></div>`;
    p.body.querySelectorAll('.big-act').forEach((b) => (b.onclick = () => { const r = MG.doBig(game.state, b.dataset.k, now()); toast(r.ok ? r.text : r.why, 2600); game.changed(); game.save(); }));
    p.body.querySelectorAll('.mine-chg').forEach((b) => (b.onclick = () => pickMine(b.dataset.k, render)));   // 设计71 / 94
    p.body.querySelectorAll('.mine-go').forEach((b) => (b.onclick = () => (b.dataset.k === 'car' ? openShop('car', render) : openLuxShop(b.dataset.k, render))));
    p.body.querySelector('.rename').onclick = async () => {
      const v = await inputBox('改名字', [{ label: '你的名字', value: s.bossName || '', max: 12 }, { label: '公司名字', value: s.companyName || '', max: 16 }]); if (!v) return; const [n, c] = v;
      s.bossName = n.trim() || s.bossName; s.companyName = c.trim() || s.companyName; game.save(); game.changed(); render();
    };
    appendCloudSettings(p.body.querySelector('.boss-cloud')); // 登录名、换名字、重新开始、手机里的素材（设计22）
    p.body.querySelector('.voice').onclick = () => { s.settings.voice = s.settings.voice === false; game.save(); render(); };
    p.body.querySelector('.ag-rem-set').onclick = () => { s.settings.agendaRem = s.settings.agendaRem === false; game.save(); render(); };   // 设计69
  };
  render();
}

// —— 设计94「我的东西」：表、西装、车、飞机、游艇、房子一行一样（设计71 座驾 + 穿戴合在一起），点「换 ›」从买了还在手上的里挑 ——
export const MINE_KINDS = ['watch', 'suit', 'car', 'plane', 'yacht', 'house'];
const MK = {
  watch: { n: '表', unit: '块', none: '还没有表', go: '去表行', verb: '戴上了' },
  suit: { n: '西装', unit: '套', none: '还没有西装', go: '去定制店', verb: '换上了' },
  car: { n: '车', unit: '台', none: '还没有车', go: '去车行', verb: '座驾换成' },
  plane: { n: '飞机', unit: '架', verb: '座驾换成' },
  yacht: { n: '游艇', unit: '艘', verb: '座驾换成' },
  house: { n: '房子', unit: '套', verb: '以后住' },
};
const isLx = (k) => k === 'watch' || k === 'suit';
/** 这一类手上有的（最贵在前）、现在用的那件 */
export function mineOf(s, k) {
  if (isLx(k)) return { list: LX.mine(s, k).sort((a, b) => LX.L[b].price - LX.L[a].price), cur: (LX.worn(s, k) || {}).id || null };
  if (k === 'house') return { list: HM.homesOwned(s), cur: HM.homeId(s) };
  return { list: RD.owned(s, k), cur: RD.rideId(s, k) };
}
const mName = (k, id) => (isLx(k) ? LX.label(LX.L[id]) : k === 'house' ? HM.homeName(id) : RD.nameOf(k, id));
const mPrice = (k, id) => (isLx(k) ? LX.L[id].price : k === 'house' ? AS.ITEM[id].price : RD.rideItem(k, id).price);
const mImg = (k, id) => { if (isLx(k)) return lxPic(LX.L[id]); const p = `assets/${k}/${id}.webp`; return hasAsset(p) ? `<img src="${asset(p)}" alt="">` : ''; };
export function mineHtml(s) {
  const rows = MINE_KINDS.map((k) => {
    const { list, cur } = mineOf(s, k); const M = MK[k];
    if (!list.length) return M.none ? `<div class="tr-course ride-row" data-k="${k}"><div class="ride-thumb"></div><div class="ride-info"><small>${M.n}</small><b>${M.none}</b></div><button class="btn sm mine-go" data-k="${k}">${M.go} ›</button></div>` : '';
    return `<div class="tr-course ride-row" data-k="${k}"><div class="ride-thumb">${cur ? mImg(k, cur) : ''}</div><div class="ride-info"><small>${M.n}${list.length > 1 ? `（${list.length} ${M.unit}）` : ''}</small><b>${cur ? mName(k, cur) : '都在出租'}</b>${cur ? `<small>${fmtMoney(mPrice(k, cur))}</small>` : ''}</div><button class="btn sm mine-chg" data-k="${k}">换 ›</button></div>`;
  }).join('');
  return `<div class="sd-rec-title">我的东西</div><div class="ride-box">${rows}</div>`;
}
/** 换这一类：表 / 西装 LX.wear；车 / 飞机 / 游艇 RD.setRide；房子 HM.setHome（只列国内 / 香港，出租中的灰掉） */
export function setMine(s, k, id) {
  const r = isLx(k) ? LX.wear(s, id) : k === 'house' ? HM.setHome(s, id) : RD.setRide(s, k, id);
  return r.ok ? { ok: true, text: `${MK[k].verb} ${mName(k, id)}` } : r;
}
function pickMine(k, after) {
  const s = game.state; const { list, cur } = mineOf(s, k);
  const p = openPanel(k === 'house' ? '住哪套' : `换${MK[k].n}`);
  for (const id of list) {
    const rent = k === 'house' && isRented(s, id);
    const row = h('button', `tr-course ch ride-pick mine-pick${id === cur ? ' on' : ''}${rent ? ' off' : ''}`, `<div class="ride-thumb">${mImg(k, id)}</div><div class="ride-info"><b>${mName(k, id)}</b><small>${k === 'house' ? AS.ITEM[id].city + ' · ' : ''}${fmtMoney(mPrice(k, id))}${rent ? ' · 出租中' : ''}</small></div>`);
    if (rent) row.disabled = true;
    row.onclick = () => { const r = setMine(game.state, k, id); p.close(); if (!r.ok) { toast(r.why); return; } toast(r.text); game.changed(); game.save(); after(); };
    p.body.appendChild(row);
  }
}
