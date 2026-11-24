// 事件系统（设计20 第四节）：配置驱动。条件 → 消息中心（kind 'event'）→ 剧情 + 选择 → 花钱 / 好感 / 剧情标记
import { EVENTS, EVENT_BY_ID, EVENT_GAP_MIN } from '../config/events.js?v=701206f7';
import { addMsg } from './inbox.js?v=701206f7';
import { pay, receive, canPay } from './ledger.js?v=701206f7';
import { netWorth } from './economy.js?v=701206f7';
import { totalStaff } from './staff.js?v=701206f7';
import { addFavor } from './affection.js?v=701206f7';

const MIN = 60e3;
const ev = (s, id) => { s.events = s.events || {}; return (s.events[id] = s.events[id] || { done: false, msg: 0, snoozeUntil: 0, times: 0 }); };
export const eventState = ev;

/** 条件满足没有 */
export function condOk(s, cfg, t) {
  const w = cfg.when || {};
  if (w.minTitle != null && s.title < w.minTitle) return false;
  if (w.netWorth != null && netWorth(s) < w.netWorth) return false;
  if (w.staff != null && totalStaff(s) < w.staff) return false;
  if (w.flag && !s.flags[w.flag]) return false;
  if (w.noFlag && s.flags[w.noFlag]) return false;
  if (w.sinceTitle) {
    const [ti, min] = w.sinceTitle; const at = (s.flags.titleAt || {})[ti];
    if (at == null || t - at < min * MIN) return false;
  }
  return true;
}
export const openEvent = (s) => EVENTS.find((e) => ev(s, e.id).msg && !ev(s, e.id).done && (s.inbox || []).some((m) => m.id === ev(s, e.id).msg && m.status === 'open'));

/** 每秒查一次：没有开着的事件、离上一件够久，就发下一件。返回新发的事件配置或 null */
export function checkEvents(s, t) {
  if (openEvent(s)) return null;
  if (s.eventLastAt && t - s.eventLastAt < EVENT_GAP_MIN * MIN) return null;
  for (const cfg of EVENTS) {
    const st = ev(s, cfg.id);
    if (st.done || t < st.snoozeUntil || !condOk(s, cfg, t)) continue;
    const m = addMsg(s, { kind: 'event', type: 'event', from: reporter(s, cfg), title: cfg.msg.title, body: cfg.msg.body, data: { id: cfg.id }, actions: [{ key: 'open', label: '去看看' }] }, t);
    st.msg = m.id; st.times += 1; s.eventLastAt = t;
    return cfg;
  }
  return null;
}
/** 谁来报：财务总监 / 陪着的秘书 / 指定秘书（不是秘书就旁白） */
export function reporter(s, cfg) {
  const f = cfg.from === 'cfo' ? (s.positions || {}).cfo : cfg.from === 'current' ? s.current : cfg.from;
  return f && s.secs[f] ? f : '';
}

/** 一个选项要花多少（团建按人头） */
export function choiceCost(s, c) {
  if (!c.cost) return 0;
  return Math.round(c.cost.perStaff ? c.cost.perStaff * totalStaff(s) : c.cost.amount || 0);
}
/** 退多少增值税：最近一次申报的增值税 × 份额（「一笔申报了两次」） */
export function vatRefund(s, share) {
  const last = [...(s.taxes || [])].reverse().find((x) => x.kind === '增值税');
  return last ? Math.round(last.amount * share * 100) / 100 : 0;
}
export const whyNotChoice = (s, c) => (c.cost && !canPay(s, c.cost.wallet || 'company', choiceCost(s, c)) ? `${c.cost.wallet === 'personal' ? '个人现金' : '公司账户'}不够` : null);

/** 选了一个：花钱、好感、标记；返回 { ok, why, then, refund, cost } */
export function choose(s, id, idx, t) {
  const cfg = EVENT_BY_ID[id]; const st = ev(s, id); const c = cfg && cfg.choices[idx];
  if (!c || st.done) return { ok: false, why: '这件事已经过去了' };
  const why = whyNotChoice(s, c); if (why) return { ok: false, why };
  const cost = choiceCost(s, c);
  if (cost > 0) { pay(s, { wallet: c.cost.wallet || 'company', cat: c.cost.cat, amount: cost, note: c.cost.note, by: reporter(s, cfg) }, t); if ((c.cost.wallet || 'company') === 'company' && s.period) s.period.other = (s.period.other || 0) + cost; } // 公司的费用进本月利润（所得税前扣）
  let refund = 0;
  if (c.refundVat) { refund = vatRefund(s, c.refundVat); if (refund > 0) receive(s, { wallet: 'company', cat: 'tax_refund', amount: refund, party: '税务局', by: 's08_xu', note: '多交的增值税退回（重复申报）' }, t); }
  if (c.favorAll) for (const sid of Object.keys(s.secs)) addFavor(s, sid, c.favorAll);
  if (c.flag) s.flags[c.flag] = true;
  if (c.snoozeMin) st.snoozeUntil = t + c.snoozeMin * MIN; else st.done = !!cfg.once;
  const m = (s.inbox || []).find((x) => x.id === st.msg); if (m) { m.status = 'done'; m.read = true; m.body += `　→ ${c.label}`; }
  st.msg = 0; s.eventLastAt = t;
  (s.eventLog = s.eventLog || []).unshift({ t, id, choice: idx, cost, refund });
  if (s.eventLog.length > 50) s.eventLog.length = 50;
  return { ok: true, then: c.then || [], refund, cost };
}
