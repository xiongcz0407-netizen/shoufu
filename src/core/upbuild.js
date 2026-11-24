// V0.2.5（设计37 第三节）店铺升级、换样子、开分店、其他产业线升级的升级框内容：升了什么 / 带来什么（前 → 后）/ 下一步。
// 自己点的进 s.upq 马上弹；店长托管（by 有值）的攒起来合成（core/upnote.js）。
import { IND_BY_ID } from '../config/industries.js?v=e379aa95';
import { TITLES } from '../config/titles.js?v=e379aa95';
import * as E from './economy.js?v=e379aa95';
import { estTotal } from './staff.js?v=e379aa95';
import { autoOn as hrAuto } from './cashflow.js?v=e379aa95';
import { fmtMoney } from './format.js?v=e379aa95';
import { noteUp, noteAuto, setRevNow } from './upnote.js?v=e379aa95';
import { YEAR_MS } from './gametime.js?v=e379aa95';

const DAY_SEC = YEAR_MS / 360 / 1000;
/** 这条线每天营业额（按人招满算：升级后编制变大，自动补员会补上） */
export const dayRevOf = (s, id) => { if (!s.inds[id]) return 0; s._fullStaff = true; try { return E.industryRevenue(s, id) * DAY_SEC; } finally { delete s._fullStaff; } };
setRevNow(dayRevOf);
const isShop = (id) => !!(IND_BY_ID[id] && IND_BY_ID[id].retail);
const lookOf = (s, id) => (IND_BY_ID[id].looks ? E.lookIndex(IND_BY_ID[id], s.inds[id].level) : 0);
function snap(s, id) {
  const ind = s.inds[id]; if (!ind) return null;
  return { lv: ind.level, br: ind.branches, rev: dayRevOf(s, id), net: isShop(id) ? 0 : E.lineNetMonth(s, id), staff: estTotal(s, id), look: lookOf(s, id) };
}
/** 下一步：下一级多少钱 / 再升几级换样子 / 到顶原因 */
function nextUp(s, id) {
  const c = IND_BY_ID[id]; const lv = s.inds[id].level; const w = E.whyNotUpgrade(s, id);
  const nl = (c.looks || []).find((x) => x > lv); const look = nl && nl - lv <= 5 ? `再升 ${nl - lv} 级换样子：${c.lookNames[c.looks.indexOf(nl)]}` : '';
  if (w && !/钱|可用|不够/.test(w)) return w;
  return [`下一级 ${fmtMoney(E.upCostOf(s, id))}`, look].filter(Boolean).join('；');
}
export function buildNote(s, id, kind, a) {
  const c = IND_BY_ID[id]; const ind = s.inds[id]; const b = snap(s, id); const fx = [];
  if (kind === 'br') {
    fx.push(`这条线营业额每天 ${fmtMoney(a.rev)} → ${fmtMoney(b.rev)}`);
    if (b.staff > a.staff) fx.push(`编制 ${a.staff} → ${b.staff} 人${hrAuto(s) ? '，自动补员会补上' : '，记得招人'}`);
    const w = E.whyNotBranch(s, id);
    return { title: ind.branches > 1 ? '开分店' : '开店', what: `${c.name} 第 ${ind.branches} 家${a.city ? `（${a.city}）` : ''}`, fx, next: w || `下一家 ${fmtMoney(E.brCostOf(s, id, a.cityCode))} 起` };
  }
  if (!isShop(id)) {
    fx.push(`月净利 ${fmtMoney(a.net)} → ${fmtMoney(E.lineNetMonth(s, id))}`);
    return { title: '产业升级', what: `${c.name} ${a.lv} 级 → ${b.lv} 级`, fx, next: nextUp(s, id) };
  }
  fx.push(`营业额每天 ${fmtMoney(a.rev)} → ${fmtMoney(b.rev)}`);
  if (b.staff > a.staff) fx.push(`编制 ${a.staff} → ${b.staff} 人${hrAuto(s) ? '，自动补员会补上' : '，记得招人'}`);
  if (b.look > a.look) {
    const rent = c.rent || []; const opened = [`店面换成「${c.lookNames[b.look]}」`];
    if (rent[b.look] != null) opened.push(`每家店房租 ${fmtMoney(rent[a.look])} → ${fmtMoney(rent[b.look])} / 月`);
    return { title: '换样子！', big: true, img: `assets/ind/${c.img[b.look]}.webp`, what: `${c.lookNames[a.look]} → ${c.lookNames[b.look]}（${c.name} ${b.lv} 级）`, fx, opened, next: nextUp(s, id) };
  }
  return { title: '店铺升级', what: `${c.name} ${a.lv} 级 → ${b.lv} 级`, fx, next: nextUp(s, id) };
}
E.setUpNoteHooks(snap, (s, id, kind, a, by, t) => {
  if (!a) return;
  if (by) { noteAuto(s, { kind, id, by, from: kind === 'br' ? a.br : a.lv, to: kind === 'br' ? s.inds[id].branches : s.inds[id].level, rev0: a.rev }, t); return; }
  noteUp(s, buildNote(s, id, kind, a), t);
});
/** 升称号弹窗里加「开放了：……」 */
export function titleOpened(ti) {
  const out = []; const names = { traffic: ['发传单', '短视频投流', '商场 / 地铁广告', '机场 / 高铁广告'], rep: ['点评运营', '团购', '达人探店', '电视大牌'] };
  const capT = [25, 50, 75, 100], capR = [60, 70, 85, 100];
  if (ti >= 1 && ti <= 3) out.push(`人流广告：${names.traffic[ti]}，人流能升到 +${capT[ti]}%`, `口碑广告：${names.rep[ti]}，口碑能升到 ${capR[ti]}`);
  for (const c of Object.values(IND_BY_ID)) { if (c.unlockTitle === ti && ti > 0) out.push(`新产业：${c.name}`); (c.lookTitle || []).forEach((x, k) => { if (x === ti && k > 0 && ti > 0) out.push(`${c.name}能升到「${c.lookNames[k]}」`); }); }
  const mb = (k) => { try { return E.maxBranches({ title: k }, 'store'); } catch { return null; } }; const b0 = mb(ti - 1), b1 = mb(ti); if (b1 && b0 && b1 > b0) out.push(`每条门店线最多 ${b0} → ${b1} 家分店`);
  return out;
}
export { TITLES };
