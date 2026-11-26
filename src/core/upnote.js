// V0.2.5（设计37 第三节）每次升级都告诉玩家：升了什么 / 带来什么（前 → 后）/ 下一步。
// 自己点的：noteUp 放进 s.upq，界面一个一个弹（ui/upshow.js）。
// 托管自动升的：noteAuto 攒进 s.upAuto；在线攒满 1 分钟合成一个框，离线回来合成一个汇总（首页弹 + 离开期间账单列一段）。
import { capAdd } from './cap.js?v=9a2bf56f';   // 设计79：有上限的列表（config/caps.js）
import { IND_BY_ID } from '../config/industries.js?v=9a2bf56f';
import { SEC_BY_ID } from '../config/secretaries.js?v=9a2bf56f';
import { fmtMoney } from './format.js?v=9a2bf56f';

export const AUTO_MERGE_MS = 60e3;
/** note = { title, what, fx: [行], next, img?, big?, opened?: [行] } */
const UP_HOOKS = []; export const addUpHook = (fn) => { UP_HOOKS.push(fn); };   // 开发2 挂钩：往升级框里加行（设计44 第二版：升称号加「投资经理最多管」）
export function noteUp(s, note, t = 0) { if (!note) return; for (const fn of UP_HOOKS) fn(s, note); capAdd(s, 'upq', (s.upq = s.upq || []), { ...note, t }); }
export const takeUp = (s) => (s.upq && s.upq.length ? s.upq.shift() : null);

let revNow = () => 0; export const setRevNow = (fn) => { revNow = fn; }; // 这条线现在每天营业额（economy 挂进来，避免循环引用）
/** item = { kind: 'lv' | 'br' | 'ad', id, by, from, to, cat?, rev0 }；按线合并（每条线记最早的 from、最新的 to），不越攒越多 */
export function noteAuto(s, item, t) {
  const A = (s.upAuto = s.upAuto && s.upAuto.lines ? s.upAuto : { t0: t, n: 0, by: [], lines: {} }); if (!A.n) A.t0 = t; A.n += 1;
  if (!A.by.includes(item.by)) A.by.push(item.by);
  const L = (A.lines[item.id] = A.lines[item.id] || { rev0: item.rev0, ad: {} }); const k = item.kind === 'ad' ? null : item.kind;
  const slot = k ? L : L.ad; const key = k || item.cat; slot[key] = { from: slot[key] ? slot[key].from : item.from, to: item.to };
}
const whoName = (by) => (SEC_BY_ID[by] ? SEC_BY_ID[by].name : '职业经理人');
const adVal = (cat, n) => (cat === 'traffic' ? `人流 +${n * 5}%` : `口碑 ${50 + n * 5}`);
/** 合成：「沈清妍帮你升了：便利店 13 → 15 级、人流 +25% → +35%；营业额每天 ¥6100 → ¥8200」 */
export function summarize(s, A, away) {
  if (!A || !A.n) return null;
  const by = A.by.map(whoName).join('、'); const parts = []; let r0 = 0, r1 = 0;
  for (const [id, L] of Object.entries(A.lines)) {
    const nm = (IND_BY_ID[id] || { name: id }).name; const ps = [];
    if (L.lv) ps.push(`${nm} ${L.lv.from} → ${L.lv.to} 级`);
    if (L.br) ps.push(`${nm} ${L.br.from} → ${L.br.to} 家店`);
    for (const cat of ['traffic', 'rep']) if (L.ad[cat]) ps.push(`${ps.length ? '' : nm + ' '}${adVal(cat, L.ad[cat].from)} → ${adVal(cat, L.ad[cat].to).replace(/^(人流|口碑) /, '')}`);
    parts.push(ps.join('、')); r0 += L.rev0 || 0; r1 += revNow(s, id);
  }
  const what = `${away ? '你不在的时候，' : ''}${by}帮你升了：${parts.join('；')}`;
  const fx = r0 > 0 ? [`营业额每天 ${fmtMoney(r0)} → ${fmtMoney(r1)}`] : [];
  return { title: away ? '你不在的时候' : '托管升级', what, fx, next: '在店长授权里可以关掉自动升级', auto: true };
}
/** 在线：攒满 1 分钟就合成一个框；离线回来（away）马上合成。返回合成的 note（也已放进 s.upq） */
export function flushAuto(s, t, away = false) {
  const A = s.upAuto; if (!A || !A.n) return null;
  if (!away && t - A.t0 < AUTO_MERGE_MS) return null;
  const n = summarize(s, A, away); s.upAuto = null; if (n) noteUp(s, n, t); return n;
}
