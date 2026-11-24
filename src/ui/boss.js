import { avatarKey } from './main-screen.js?v=f7808ad2';
import * as MG from '../core/manage.js?v=f7808ad2'; // P-05 精力
import { asset, hasAsset } from '../platform/assets.js?v=f7808ad2';
// 老板页：名字和公司、老板属性、称号进度、穿戴、统计、设置（存档、重新开始在「设置」里，设计22）
import { TITLES } from '../config/titles.js?v=f7808ad2';
import { RIVALS } from '../config/rivals.js?v=f7808ad2';
import * as E from '../core/economy.js?v=f7808ad2';
import { fmtMoney, fmtDuration } from '../core/format.js?v=f7808ad2';
import { versionText } from '../version.js?v=f7808ad2';
import { now } from '../core/clock.js?v=f7808ad2';
import { game } from '../game.js?v=f7808ad2';
import { h, toast } from './dom.js?v=f7808ad2';
import { openFull } from './shell.js?v=f7808ad2';
import { wearHtml } from './luxury.js?v=f7808ad2';
import { appendCloudSettings } from './cloudset.js?v=f7808ad2';
import { inputBox } from './confirm.js?v=f7808ad2'; // 设计37 第一节：游戏样式输入框

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
        <div><div class="ind-name">${s.bossName || '老板'} <small>${TITLES[s.title].name}</small></div><div class="tr-gain">${s.companyName || ''}</div></div>
        <button class="btn rename">改名</button></div>
      <div class="sd-rec-title">精力</div>
      <div class="tr-course"><div style="flex:1"><b>${Math.floor(MG.energy(s, t))} / ${MG.energyMax(s)}</b><div class="bar" style="margin-top:6px"><i style="width:${MG.energy(s, t) / MG.energyMax(s) * 100}%"></i></div><div class="tr-gain">每天 0 点回满（打工人 150、小老板 200、老板起 250），中间不回复；门店动作、大事、事件选项、商战各 5，约会 10。${MG.tip(s)}。门店详情里「亲自上阵」花精力；${(s.title || 0) >= 2 ? '老板以后亲自经营效果减半，精力多花在大事上：' : `精力够哪条线都能去。`}</div>
        ${(s.title || 0) >= 2 ? `<div class="ind-btns">${['battle', 'deal'].map((k) => `<button class="btn big-act" data-k="${k}" ${MG.whyNotBig(s, k, t) ? 'disabled' : ''}>${MG.MANAGE_CFG.big[k].name}（${MG.MANAGE_CFG.big[k].energy}）${MG.bigBonus(s, k) ? '<br><small>已准备好</small>' : ''}</button>`).join('')}</div>` : ''}</div></div>
      <div class="sd-rec-title">老板属性</div>
      <div class="boss-attrs">${bossAttrs(s).map((a) => `<div><b>${a.value}</b><span>${a.name}</span><small>${a.from}</small></div>`).join('') || '<div class="empty">第 12 项接上（气场、人脉）</div>'}</div>
      <div class="sd-rec-title">称号进度</div>
      ${next ? `<div class="tr-course"><div><b>下一个：${next.name}</b><div class="tr-gain">身价 ${fmtMoney(nw)} / ${fmtMoney(next.need)}${final ? `　收购「${final.name}」${finalOk ? '✓' : '✗'}` : next.rival === null ? '　（后面的故事还在路上）' : next.rival ? `　收购最终对手（还没开放）` : ''}</div>
        <div class="bar" style="margin-top:6px"><i style="width:${Math.min(100, (nw / next.need) * 100)}%"></i></div></div></div>` : '<div class="tr-gain">你已经是首富了</div>'}
      <div class="sd-rec-title">穿戴</div>${wearHtml(s)}
      <div class="sd-rec-title">统计</div>
      <div class="sd-rec"><div>玩了<b>${fmtDuration((t - s.createdAt) / 1000)}</b></div><div>累计赚<b>${fmtMoney(st.earned || 0)}</b></div><div>商战<b>${st.battleWins || 0}/${st.battles || 0}</b></div>
        <div>约会<b>${st.dates || 0}次</b></div><div>送礼<b>${st.gifts || 0}次</b></div><div>结业<b>${st.coursesDone || 0}门</b></div></div>
      <div class="sd-rec-title">设置</div>
      <div class="tr-course"><div><b>人声</b><div class="tr-gain">秘书说话的配音（没有配音文件时只出气泡）</div></div><button class="btn voice">${s.settings.voice === false ? '关' : '开'}</button></div><div class="boss-cloud"></div>
      <div class="tr-gain" style="text-align:center;margin-top:12px">${versionText()}</div></div>`;
    p.body.querySelectorAll('.big-act').forEach((b) => (b.onclick = () => { const r = MG.doBig(game.state, b.dataset.k, now()); toast(r.ok ? r.text : r.why, 2600); game.changed(); game.save(); }));
    p.body.querySelector('.rename').onclick = async () => {
      const v = await inputBox('改名字', [{ label: '你的名字', value: s.bossName || '', max: 12 }, { label: '公司名字', value: s.companyName || '', max: 16 }]); if (!v) return; const [n, c] = v;
      s.bossName = n.trim() || s.bossName; s.companyName = c.trim() || s.companyName; game.save(); game.changed(); render();
    };
    appendCloudSettings(p.body.querySelector('.boss-cloud')); // 登录名、换名字、重新开始、手机里的素材（设计22）
    p.body.querySelector('.voice').onclick = () => { s.settings.voice = s.settings.voice === false; game.save(); render(); };
  };
  render();
}
