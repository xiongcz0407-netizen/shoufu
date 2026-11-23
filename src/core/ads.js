// V0.2.3 广告投放（设计35 第七节 2，取代站柜台）：渠道 + 预算 + 天数，公司账户按天扣，留够两个月工资；
// 人流（投放期营业额 +X%，边际递减，停投 7 天退回）、口碑（团购 / 点评可推到 85）、知名度（每条线 0～100，永久人流最多 +25%）。
// 秘书店长可以托管（每月预算：金额或营业额 %），按上月各渠道 ROI 分配；外包经理人只投传单 + 团购、效果 ×0.7。
import C from '../config/ads.json?v=77f12d68' with { type: 'json' };
import { IND_BY_ID } from '../config/industries.js?v=77f12d68';
import * as MG from './manage.js?v=77f12d68';
import { cogsRate } from './economy.js?v=77f12d68';
import { pay, canPay } from './ledger.js?v=77f12d68';
import { holder, isSec, attrs, OUT } from './posts.js?v=77f12d68';
import { whyCushion } from './cashflow.js?v=77f12d68';
import { addMsg } from './inbox.js?v=77f12d68';
import { MONTH_MS, monthIndex } from './gametime.js?v=77f12d68';
import { fmtMoney } from './format.js?v=77f12d68';

export { C as ADS_CFG };
const r2 = (x) => Math.round(x * 100) / 100;
const CH = C.channels;
export const CH_KEYS = Object.keys(CH);
export const ads = (s) => (s.ads = s.ads || { seq: 0, lines: {}, auto: {}, meetK: null });
export const adLine = (s, id) => { const A = ads(s); return (A.lines[id] = A.lines[id] || { camps: [], aware: 0, lift: 0, fade: null, today: {}, month: { spent: 0, gain: 0, rev: 0, rep0: null, aware0: null, byCh: {} }, last: {} }); };
export const isAdLine = (s, id) => MG.isShop(id) && !!s.inds[id] && s.inds[id].branches > 0;
export const whyNotCh = (s, ch) => (!CH[ch] ? '没有这个渠道' : (s.title || 0) < CH[ch].minTitle ? `升到「${['打工人', '小老板', '老板', '企业家', '大亨'][CH[ch].minTitle]}」开放` : null);

/** 营业额挂钩：投放人流（估值不算）× 知名度（永久，估值算） */
export function adsMult(s, id, valueMode) {
  const L = s.ads && s.ads.lines[id]; if (!L) return 1;
  const aw = 1 + (L.aware || 0) / 100 * C.awareMaxK;
  return valueMode ? aw : aw * (1 + (L.lift || 0));
}
MG.setAdsHook(adsMult);

/** 没有广告时这条线一天的营业额 */
const baseDay = (s, id) => { const L = s.ads && s.ads.lines[id]; return MG.dayRev(s, id) / (1 + ((L && L.lift) || 0)); };
const gm = (s, id) => Math.max(0, 1 - cogsRate(s, id));
/** 会上「广告」方向（设计29）：投放打折 + 效果加成（门店不再直接加营业额） */
let meetAd = () => 0; export const setMeetAdHook = (fn) => { meetAd = fn; };
/** V0.2.4 回报率（设计36 第 2 条）：x = 花的 ÷ 日营业额（≤ 10%）；ROI(x) = roi10 ×（x / 10%）^(p − 1) */
export const roiAt = (c, x) => c.roi10 * Math.pow(Math.min(C.maxX, Math.max(1e-6, x)) / C.maxX, C.p - 1);
const charmK = (s, id, c) => (c.charm ? 0.9 + (bestCharm(s, id) / 100) * 0.3 : 1);
/** 一个渠道花 daily 一天多赚的毛利（未封顶） */
export function chGross(s, id, ch, daily) {
  const b = baseDay(s, id); if (!(b > 0) || !(daily > 0)) return 0; const c = CH[ch]; const d = Math.min(daily, b * C.maxX);
  return d * roiAt(c, d / b) * charmK(s, id, c) * (1 + meetAd(s));
}
/** 一个渠道的人流 = 多赚的毛利 ÷ 毛利率 ÷ 日营业额 */
export function chLift(s, id, ch, daily) { const b = baseDay(s, id); const g = gm(s, id); return b > 0 && g > 0 ? chGross(s, id, ch, daily) / g / b : 0; }
const combine = (sum) => Math.min(C.totalMax, sum);
function bestCharm(s, id) { const w = holder(s, 'manager_' + id); if (isSec(w)) return attrs(s, w).charm || 0; return Math.max(30, ...Object.keys(s.secs || {}).map((k) => attrs(s, k).charm || 0)); }
/** 投之前：预计每天多卖多少、花多少、ROI */
export function preview(s, id, ch, daily, days = 1) {
  const b = baseDay(s, id); const g = gm(s, id); const cur = activeSpend(s, id); const c = CH[ch];
  const sum0 = Object.entries(cur).reduce((a, [k, v]) => a + chLift(s, id, k, v), 0);
  const sum1 = Object.entries({ ...cur, [ch]: (cur[ch] || 0) + daily }).reduce((a, [k, v]) => a + chLift(s, id, k, v), 0);
  const lift = combine(sum1) - combine(sum0); const extra = b * lift; const gross = extra * g; const cost = daily * (1 - meetAd(s));
  const x = b > 0 ? daily / b : 0; const k = Math.min(1, x / c.r);
  return { lift, full: sum1 >= C.totalMax, x, extraRev: r2(extra), gross: r2(gross), costDay: r2(cost), net: r2(gross - cost), total: r2(cost * days), roi: cost > 0 ? gross / cost : 0, rep: c.rep ? c.rep * k : 0, aware: c.aware ? c.aware * k : 0 };
}
/** 这个渠道这条线今天还能投多少（每个渠道最多日营业额的 10%，手动 + 托管合计） */
export const chRoom = (s, id, ch) => Math.max(0, Math.floor(baseDay(s, id) * C.maxX - (activeSpend(s, id)[ch] || 0)));
/** 手动投放：渠道 + 每天预算 + 天数 */
export function whyNotBuy(s, id, ch, daily, days) {
  if (!isAdLine(s, id)) return '这条线还没开店'; const w = whyNotCh(s, ch); if (w) return w;
  if (!(daily > 0) || !(days > 0)) return '预算、天数不对';
  if (daily > chRoom(s, id, ch) + 0.5) return `每个渠道最多投营业额的 10%（这个渠道今天还能加 ${fmtMoney(chRoom(s, id, ch))}）`;
  if (activeLift(s, id) >= C.totalMax - 1e-6) return '这条线人流满了（+100%），再投也不会多来客人';
  const cost = daily * (1 - meetAd(s)); if (!canPay(s, 'company', cost)) return '公司账户不够第一天的钱';
  return whyCushion(s, cost * Math.min(days, 30));
}
export function buy(s, id, ch, daily, days, t) {
  const why = whyNotBuy(s, id, ch, daily, days); if (why) return { ok: false, why };
  const A = ads(s); A.seq += 1; const L = adLine(s, id); if (L.month.rep0 == null) { L.month.rep0 = MG.line(s, id).rep; L.month.aware0 = L.aware; }
  const cp = { id: A.seq, ch, daily: Math.round(daily), left: days, days, by: 'me', t }; L.camps.push(cp);
  const r = spendDay(s, id, t, { [ch]: cp.daily }, { first: cp }); /* 第一天现在付、现在生效 */
  const sum = Object.entries(activeSpend(s, id)).reduce((a, [k, v]) => a + chLift(s, id, k, v), 0); void r; cp.left -= 1;
  const lift = combine(sum); if (lift > (L.lift || 0)) { L.lift = lift; L.fade = { lift, day: MG.dayIndex(s, t) }; }
  if (cp.left <= 0) L.camps = L.camps.filter((c) => c !== cp);
  return { ok: true, camp: cp };
}
export function stop(s, id, campId) { const L = adLine(s, id); const n = L.camps.length; L.camps = L.camps.filter((c) => c.id !== campId); return L.camps.length < n; }
const activeLift = (s, id) => Object.entries(activeSpend(s, id)).reduce((a, [k, v]) => a + chLift(s, id, k, v), 0);
const activeSpend = (s, id) => { const o = {}; const L = s.ads && s.ads.lines[id]; for (const c of (L && L.camps) || []) if (c.left > 0) o[c.ch] = (o[c.ch] || 0) + c.daily; for (const [k, v] of Object.entries((L && L.autoToday) || {})) o[k] = (o[k] || 0) + v; return o; };

/** 托管：{ mode: 'amt' | 'pct', v }（v = 0 不投） */
export const autoOf = (s, id) => ads(s).auto[id] || { mode: 'pct', v: 0 };
export const setAuto = (s, id, a) => { ads(s).auto[id] = { mode: a.mode === 'amt' ? 'amt' : 'pct', v: Math.max(0, +a.v || 0) }; };
export function autoWho(s, id) { const w = holder(s, 'manager_' + id); return isSec(w) ? w : w === OUT ? OUT : null; }
/** 这个月托管每天能花多少 */
export function autoDaily(s, id) {
  const a = autoOf(s, id); if (!(a.v > 0) || !autoWho(s, id)) return 0;
  return Math.min(baseDay(s, id) * C.maxX, a.mode === 'amt' ? a.v / 30 : baseDay(s, id) * a.v); /* 托管上限也是 10% */
}
/** 托管按上月 ROI 挑渠道分钱 */
function autoPlan(s, id, rnd) {
  const who = autoWho(s, id); const daily = autoDaily(s, id); if (!(daily > 0)) return {};
  const pool = (who === OUT ? C.auto.outChannels : CH_KEYS).filter((k) => !whyNotCh(s, k) && (who !== OUT || true));
  const L = adLine(s, id); const last = L.last || {};
  let picks = pool.filter((k) => last[k] && last[k].spent > 0 ? last[k].roi >= 1 : C.auto.defaultChannels.includes(k));
  const tried = pool.filter((k) => last[k] && last[k].spent > 0); if (tried.length && tried.every((k) => last[k].roi < 1) && !picks.some((k) => !tried.includes(k))) return {};
  if (!picks.length) picks = pool.filter((k) => C.auto.defaultChannels.includes(k)); if (!picks.length) return {};
  const at = isSec(who) ? attrs(s, who) : { wit: 50, manage: 50 };
  if (rnd() < (1 - (at.wit || 0) / 100) * C.auto.wrongP) picks = [pool[Math.floor(rnd() * pool.length)]]; // 智慧低偶尔投错
  const w = picks.map((k) => Math.max(0.5, (last[k] && last[k].roi) || 1)); const tw = w.reduce((a, b) => a + b, 0);
  const over = rnd() < (1 - (at.manage || 0) / 100) * C.auto.overP ? 1 + C.auto.over : 1; // 管理低偶尔超支
  const o = {}; picks.forEach((k, i) => { o[k] = r2(daily * over * w[i] / tw); }); return o;
}
/** 付一天的钱、算一天的效果 */
function spendDay(s, id, t, add, opts = {}) {
  const L = adLine(s, id); const b = baseDay(s, id); const disc = 1 - meetAd(s); let sum = 0; const per = {};
  const spendMap = opts.first ? add : add;
  for (const [ch, d] of Object.entries(spendMap)) {
    if (!(d > 0)) continue; const cost = r2(d * disc);
    if (!canPay(s, 'company', cost) || whyCushion(s, cost)) { per[ch] = { stopped: true }; continue; }
    pay(s, { wallet: 'company', cat: 'ads', amount: cost, party: CH[ch].name, note: `${IND_BY_ID[id].name}广告：${CH[ch].name}` }, t);
    s.period = s.period || {}; s.period.other = (s.period.other || 0) + cost;
    const eff = opts.eff || 1; const l = chLift(s, id, ch, d); sum += l; per[ch] = { cost, lift: l };
    const c = CH[ch]; const k = Math.min(1, d / Math.max(1, b) / c.r) * eff; /* 外包只打口碑、知名度的折，回报不打折（守住 ≥ 1.3） */
    if (c.rep) { const ln = MG.line(s, id); if (ln.rep < C.repCap) ln.rep = Math.min(C.repCap, ln.rep + c.rep * k); ln.care = MG.dayIndex(s, t); }
    if (c.catchP && (opts.rnd || Math.random)() < c.catchP) { MG.addRep(s, id, c.catchRep); addMsg(s, { kind: 'system', type: 'ads', title: `${IND_BY_ID[id].name}被平台查到刷好评`, body: `点评运营被平台判定刷好评，口碑 ${c.catchRep}。` }, t); }
    if (c.aware) L.aware = Math.min(100, (L.aware || 0) + c.aware * k);
    const m = L.month; m.spent = r2(m.spent + cost); const x = (m.byCh[ch] = m.byCh[ch] || { spent: 0, gain: 0 }); x.spent = r2(x.spent + cost);
  }
  return { sum, per, b };
}
/** 每个游戏天（manage 的 onDay）：手动的扣一天、托管的按计划投；合起来定今天的人流；停投的 7 天退回 */
export function adsDay(s, day, at, rnd = Math.random) {
  const A = s.ads; const out = []; if (!A && !Object.keys(s.inds).length) return out;
  for (const id of Object.keys(s.inds)) {
    if (!isAdLine(s, id)) continue; const L = adLine(s, id);
    L.aware = Math.max(0, (L.aware || 0) - C.awareDecay);
    const man = {}; for (const c of L.camps) if (c.left > 0) { if (c.skipDay === day) continue; man[c.ch] = (man[c.ch] || 0) + c.daily; }
    const auto = autoPlan(s, id, rnd); const who = autoWho(s, id);
    if (L.month.rep0 == null && (Object.keys(man).length || Object.keys(auto).length)) { L.month.rep0 = MG.line(s, id).rep; L.month.aware0 = L.aware; }
    const r1 = spendDay(s, id, at, man, { rnd });
    const r2_ = spendDay(s, id, at, auto, { rnd, eff: who === OUT ? C.auto.outK : 1 });
    for (const c of L.camps) if (c.left > 0) { if (c.skipDay !== day) { if (r1.per[c.ch] && r1.per[c.ch].stopped) { c.left = 0; out.push(`${IND_BY_ID[id].name}的${CH[c.ch].name}停了：钱只够留两个月工资`); } else c.left -= 1; } }
    if (Object.values(r2_.per).some((x) => x.stopped)) L.autoNote = '钱只够留两个月工资，广告先停了';
    L.camps = L.camps.filter((c) => c.left > 0);
    L.autoToday = Object.fromEntries(Object.entries(auto).filter(([k]) => r2_.per[k] && !r2_.per[k].stopped));
    const sum = r1.sum + r2_.sum; const lift = combine(sum);
    if (lift > 0) { L.lift = lift; L.fade = { lift, day }; }
    else if (L.fade) { const k = 1 - (day - L.fade.day) / C.fadeDays; L.lift = k > 0 ? L.fade.lift * k : 0; if (k <= 0) L.fade = null; }
    else L.lift = 0;
    // 算回报：今天多卖的毛利按各渠道人流分
    const b = r1.b; const g = Math.max(0, gm(s, id)); const parts = [...Object.entries(r1.per), ...Object.entries(r2_.per)].filter(([, x]) => x.lift > 0);
    const tot = parts.reduce((a, [, x]) => a + x.lift, 0);
    for (const [ch, x] of parts) { const extra = b * lift * x.lift / tot; const gain = extra * g; const m = L.month; m.rev = r2(m.rev + extra); m.gain = r2(m.gain + gain); m.byCh[ch].gain = r2(m.byCh[ch].gain + gain);
      /* V0.2.4：团购抽成已经算在回报里，不另扣 */ }
  }
  return out;
}
/** 月底：每条线写月报一句，存上月各渠道 ROI（托管用），清零 */
export function adsMonth(s, t) {
  const A = s.ads; if (!A) return;
  for (const [id, L] of Object.entries(A.lines)) {
    const m = L.month; if (!(m.spent > 0)) { L.last = {}; continue; }
    const last = {}; for (const [k, x] of Object.entries(m.byCh)) last[k] = { spent: x.spent, gain: x.gain, roi: x.spent > 0 ? x.gain / x.spent : 0 };
    L.last = last; const rep = MG.line(s, id).rep;
    const by = Object.entries(last).map(([k, x]) => `${CH[k].name} ${fmtMoney(x.spent)}（ROI ${x.roi.toFixed(2)}）`).join('、');
    addMsg(s, { kind: 'report', type: 'ads_report', from: isSec(autoWho(s, id)) ? autoWho(s, id) : '', title: `${IND_BY_ID[id].name}广告月报`, body: `这个月广告花了 ${fmtMoney(m.spent)}，多卖 ${fmtMoney(m.rev)}，多赚毛利 ${fmtMoney(m.gain)}（ROI ${(m.gain / m.spent).toFixed(2)}）。${by}。口碑 ${Math.round(m.rep0 ?? rep)} → ${Math.round(rep)}，知名度 ${Math.round(m.aware0 ?? L.aware)} → ${Math.round(L.aware)}。${L.autoNote ? L.autoNote + '。' : ''}` }, t);
    L.month = { spent: 0, gain: 0, rev: 0, rep0: null, aware0: null, byCh: {} }; L.autoNote = null;
  }
}
MG.onDay((s, day, at) => adsDay(s, day, at));
void MONTH_MS; void monthIndex;
