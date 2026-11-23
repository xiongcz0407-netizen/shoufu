// 分店（V2-08；设计35 第十二节取消地段）：开分店只选城市直接开（openSitePick 不再接手）；线详情里列每家分店、关店转让
import * as SI from '../core/sites.js?v=77f12d68';
import { fmtMoney } from '../core/format.js?v=77f12d68';
import { now } from '../core/clock.js?v=77f12d68';
import { game } from '../game.js?v=77f12d68';
import { toast } from './dom.js?v=77f12d68';

const C = SI.SITE_CFG;
/** 设计35 第十二节：不选铺位了，返回 false = 照原来直接开 */
export const openSitePick = () => false;

/** 线详情里的「分店铺位」块 */
export function sitesBlockHtml(s, id) {
  const xs = SI.branchesOf(s, id); if (!SI.isSiteLine(id) || !xs.length) return '';
  const other = s.inds[id].branches - xs.length;
  return `<div class="sd-rec-title">分店（关店转让拿回开店费 ${Math.round(C.sellBack * 100)}%）</div><div class="st-mine">${xs.map((x) => `<div class="st-row">
    <span><b>${x.cityName} · 分店 ${x.i + 1}</b><small>月营业额约 ${fmtMoney(x.monthRev)} · 租金 ${fmtMoney(x.rent)}/月</small></span>
    <button class="btn sm st-close" data-i="${x.i}">关店转让<br><small>拿回 ${fmtMoney(x.back)}</small></button></div>`).join('')}</div>${other > 0 ? `<div class="tr-gain">另外 ${other} 家是总店或早先开的，没记开店费，不能在这转让</div>` : ''}`;
}
export function bindSitesBlock(el, id) {
  el.querySelectorAll('.st-close').forEach((b) => (b.onclick = () => {
    const s = game.state; const x = SI.branchesOf(s, id)[+b.dataset.i]; if (!x) return;
    if (!confirm(`把${x.cityName}分店 ${x.i + 1} 转让出去？拿回开店费的 ${Math.round(C.sellBack * 100)}%（${fmtMoney(x.back)}），店里的人不会自动裁，超编的要去人事裁员。`)) return;
    const r = SI.close(s, id, x.i, now()); toast(!r.ok ? r.why : `转让了，拿回 ${fmtMoney(r.back)}。${r.over ? `这家店的 ${r.over} 个员工超编了，可以去人事裁员` : ''}`, r.over ? 4200 : 2600); game.changed(); game.save();
  }));
}
