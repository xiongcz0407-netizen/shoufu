// V2-08 选址开分店（设计29 第三节）：选城市以后出 3 个候选铺位，可以先派秘书踩点（10 分钟），选一个开；线详情里看每家分店的铺位和表现、关店转让
import * as SI from '../core/sites.js?v=b7d8e042';
import * as E from '../core/economy.js?v=b7d8e042';
import { IND_BY_ID } from '../config/industries.js?v=b7d8e042';
import { SEC_BY_ID } from '../config/secretaries.js?v=b7d8e042';
import { attrs } from '../core/posts.js?v=b7d8e042';
import { isTraining } from '../core/training.js?v=b7d8e042';
import { fmtMoney, fmtDuration } from '../core/format.js?v=b7d8e042';
import { now } from '../core/clock.js?v=b7d8e042';
import { game } from '../game.js?v=b7d8e042';
import { openPanel, toast, liveRender } from './dom.js?v=b7d8e042';

const C = SI.SITE_CFG;
const kTxt = (k) => `×${k.toFixed(2)}`;
const kCls = (k) => (k >= C.rep.goodAt ? 'pos' : k <= C.rep.badAt ? 'neg' : '');
let secPick = null;
/**
 * 选铺位面板。okToSpend：company.js 的「钱够不够」检查（不够会提示注资）。开成了叫 done()
 * 返回 true 表示接手了（不是门店线返回 false，照原来直接开）
 */
export function openSitePick(id, city, okToSpend, done) {
  if (!SI.isSiteLine(id)) return false;
  const p = openPanel(`${IND_BY_ID[id].name} · 选铺位`);
  const render = () => {
    const s = game.state; const t = now(); const P = SI.candidates(s, id, city); const sc = SI.scoutState(s, t); const cost = E.brCostOf(s, id, city);
    const secs = SI.secList(s); if (secPick && !s.secs[secPick]) secPick = null; if (!secPick) secPick = secs.slice().sort((a, b) => (attrs(s, b).manage || 0) - (attrs(s, a).manage || 0))[0] || null;
    p.body.innerHTML = `<div class="tr-gain">开第 ${s.inds[id].branches + 1} 家（${fmtMoney(cost)}）。铺位定了营业额：人流 × 适不适合 ÷ 附近同行（${kTxt(C.kRange[0])}～${kTxt(C.kRange[1])}）。选得好口碑从 ${C.rep.good} 起，选得差从 ${C.rep.bad} 起。</div>
      <div class="st-list">${P.list.map((c, i) => { const e = sc && sc.done ? sc.est[i] : null; return `<div class="st-card">
        <div class="st-top"><b>${C.types[c.type].name}</b><span class="st-fit">适合：${C.types[c.type].good}</span></div>
        <div class="st-rows"><span>人流</span><b>${e ? `约 ${e.people.toLocaleString()} 人/小时` : SI.flowLv(c.flow)}</b>
          <span>附近同行</span><b>${e ? `${e.comp} 家` : `${C.types[c.type].comp[0]}～${C.types[c.type].comp[1]} 家`}</b>
          <span>跟${IND_BY_ID[id].name}</span><b>${SI.fitLv(c.fit)}</b>
          <span>租金</span><b>${fmtMoney(SI.rentOf(s, id, city, c))}/月</b>
          ${e ? `<span>估营业额</span><b class="${kCls(e.k)}">${kTxt(e.k)}</b>` : ''}</div>
        <button class="btn gold st-go" data-i="${i}">开在这里</button></div>`; }).join('')}</div>
      <div class="sd-rec-title">踩点（${C.scoutMin} 分钟，管理越高看得越准）</div>
      ${sc && sc.left ? `<div class="tr-gain">${SEC_BY_ID[sc.sec].name}正在踩点，还要 ${fmtDuration(sc.left / 1000)}</div>`
        : sc && sc.done ? `<div class="tr-gain">${SEC_BY_ID[sc.sec].name}踩完了：人流、同行是她数的，误差大概 ±${Math.round(sc.err * 100)}%</div>`
        : secs.length ? `<div class="tabs st-secs">${secs.map((k) => `<button class="tab ${secPick === k ? 'on' : ''}" data-s="${k}" ${isTraining(s, k) ? 'disabled' : ''}>${SEC_BY_ID[k].name}<small> 管理 ${Math.round(attrs(s, k).manage || 0)}</small></button>`).join('')}</div>
          <button class="btn st-scout" style="width:100%">派${secPick ? SEC_BY_ID[secPick].name : ''}去踩点</button>` : '<div class="tr-gain">还没有秘书，只能凭感觉选</div>'}`;
    p.body.querySelectorAll('.st-secs .tab').forEach((b) => (b.onclick = () => { secPick = b.dataset.s; render(); }));
    const sb = p.body.querySelector('.st-scout'); if (sb) sb.onclick = () => { const r = SI.scout(game.state, secPick, now()); if (!r.ok) return toast(r.why); toast(`${SEC_BY_ID[secPick].name}去踩点了，${C.scoutMin} 分钟回来`); game.changed(); game.save(); render(); };
    p.body.querySelectorAll('.st-go').forEach((b) => (b.onclick = () => {
      const s2 = game.state; const c2 = E.brCostOf(s2, id, city); if (!okToSpend(s2, c2, '开分店')) return;
      const c = SI.choose(s2, id, city, +b.dataset.i);
      if (E.openBranch(s2, id, now(), '', city)) { toast(`${C.types[c.type].name}开了一家，要招人`); game.changed(); game.save(); p.close(); done && done(); }
      else toast(E.whyNotBranch(s2, id) || '公司账户不够');
    }));
  };
  liveRender(p.body, render, (fn) => game.onChange(fn));
  return true;
}

/** 线详情里的「分店铺位」块 */
export function sitesBlockHtml(s, id) {
  const xs = SI.branchesOf(s, id); if (!SI.isSiteLine(id) || !xs.length) return '';
  const other = s.inds[id].branches - xs.length;
  return `<div class="sd-rec-title">分店铺位（整条线营业额 ${kTxt(SI.revMult(s, id))}）</div><div class="st-mine">${xs.map((x) => `<div class="st-row">
    <span><b>${x.cityName} · ${x.name}</b><small>月营业额约 ${fmtMoney(x.monthRev)} · 租金 ${fmtMoney(x.rent)}/月</small></span><em class="${kCls(x.k)}">${kTxt(x.k)}</em>
    <button class="btn sm st-close" data-i="${x.i}">关店转让<br><small>拿回 ${fmtMoney(x.back)}</small></button></div>`).join('')}</div>${other > 0 ? `<div class="tr-gain">另外 ${other} 家是早先开的（按 ×1.00）</div>` : ''}`;
}
export function bindSitesBlock(el, id) {
  el.querySelectorAll('.st-close').forEach((b) => (b.onclick = () => {
    const s = game.state; const x = SI.branchesOf(s, id)[+b.dataset.i]; if (!x) return;
    if (!confirm(`把${x.cityName}${x.name}那家转让出去？拿回开店费的 ${Math.round(C.sellBack * 100)}%（${fmtMoney(x.back)}），店里的人不会自动裁，超编的要去人事裁员。`)) return;
    const r = SI.close(s, id, x.i, now()); toast(!r.ok ? r.why : `转让了，拿回 ${fmtMoney(r.back)}。${r.over ? `这家店的 ${r.over} 个员工超编了，可以去人事裁员` : ''}`, r.over ? 4200 : 2600); game.changed(); game.save();
  }));
}
