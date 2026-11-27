import { capAdd } from './cap.js?v=f00c2612';   // 设计79：有上限的列表（config/caps.js）
// 消息中心数据（设计18；设计39 改成「重要 | 经营 | 月报 | 邀请拍卖 | 系统」五个页签，消息自己的 kind 不变，按 tabOf 分页）
// 消息：{ id, t, kind, title, body, from, read, status: 'open'|'approved'|'rejected'|'done', actions: [{key,label}], type, data }
export const KINDS = { request: '请示', event: '事件', report: '月报', invite: '邀请拍卖', system: '系统' };
// 红点只给要你动手的（请示、邀请）；月报、系统只算数字
export const NEEDS_ACTION = { request: true, event: true, invite: true, report: false, system: false };
const handlers = {};
/** 某类请示批准 / 驳回时做什么：fn(s, msg, action, t) */
export const onAction = (type, fn) => { handlers[type] = fn; };

export function addMsg(s, m, t = Date.now()) {
  s.inboxSeq = (s.inboxSeq || 0) + 1;
  const msg = { id: s.inboxSeq, t, kind: m.kind || 'system', title: m.title || '', body: m.body || '', from: m.from || '', read: false,
    status: m.actions && m.actions.length ? 'open' : 'done', actions: m.actions || [], type: m.type || '', data: m.data || null };
  capAdd(s, 'inbox', (s.inbox = s.inbox || []), msg);   // 设计79：照旧 300 条
  return msg;
}
export function act(s, id, action, t = Date.now()) {
  const m = (s.inbox || []).find((x) => x.id === id);
  if (!m || m.status !== 'open') return false;
  const h = handlers[m.type];
  const ok = h ? h(s, m, action, t) !== false : true;
  if (!ok) return false;
  m.status = action === 'reject' ? 'rejected' : action === 'approve' ? 'approved' : 'done'; m.read = true;
  return true;
}
// —— 设计39 第三之三节：消息页签「重要 | 经营 | 月报 | 邀请拍卖 | 系统」（开发2）——
// 重要：要你签字 / 拍板 / 批准、还没办的（合同、请示、投资人、收购价、地产、大项目、对手进攻、品牌邀请……），永久挂着，办了就走（去「系统」里留底）
// 经营：每天的经营事件（0 点清掉是开发1 的事）；邀请拍卖：经营会、日程、拍卖这类按时段的；月报照旧
export const TABS = { important: '重要', biz: '经营', report: '月报', invite: '邀请拍卖', system: '系统' };
const BIZ = new Set(['biz_event']);
const TIMED = new Set(['auction', 'agenda']);              // 按场次的，不算「重要」（设计69：经营会不过期了，挂「重要」等你开）
const ackOnly = (m) => m.actions.length === 1 && /知道了/.test(m.actions[0].label || '');
export const isImportant = (m) => m.status === 'open' && !BIZ.has(m.type) && m.kind !== 'event' && m.kind !== 'report' && !TIMED.has(m.type) && m.actions.length > 0 && !ackOnly(m);
export function tabOf(m) {
  if (BIZ.has(m.type) || m.kind === 'event') return 'biz';
  if (m.kind === 'report') return 'report';
  if (isImportant(m)) return 'important';
  if (m.kind === 'invite' && (TIMED.has(m.type) || m.status === 'open')) return 'invite';
  return 'system';
}
/** 「重要」：没办的，按来的先后排（早的在上）。设计35 第十节「待处理」也是它 */
export const important = (s) => (s.inbox || []).filter(isImportant).sort((a, b) => a.t - b.t || a.id - b.id);
export const pending = important;
/** 某个页签的消息（重要按先后，其余新的在上） */
export const inTab = (s, tab) => (tab === 'important' ? important(s) : (s.inbox || []).filter((m) => tabOf(m) === tab));
/** 每个页签：{ n 红点数, unread }。重要 = 没办的件数；经营 = 今天还没做的件数；其余 = 没看的 */
export function tabCounts(s) {
  const c = Object.fromEntries(Object.keys(TABS).map((k) => [k, { n: 0, unread: 0 }]));
  for (const m of s.inbox || []) { const k = tabOf(m); if (!m.read) c[k].unread++; if ((k === 'important' || k === 'biz') && m.status === 'open') c[k].n++; }
  for (const k of ['report', 'invite', 'system']) c[k].n = c[k].unread;
  return c;
}
export const markRead = (s, id) => { const m = (s.inbox || []).find((x) => x.id === id); if (m) m.read = true; };
/** 各类数量：{ request: {open, unread}, ... } */
export function counts(s) {
  const c = {}; for (const k of Object.keys(KINDS)) c[k] = { open: 0, unread: 0 };
  for (const m of s.inbox || []) { if (m.status === 'open') c[m.kind].open++; if (!m.read) c[m.kind].unread++; }
  return c;
}
/** 铃铛：红点数（要动手的）和角标数（没看的） */
export function bell(s) {
  const c = tabCounts(s); let badge = 0; for (const v of Object.values(c)) badge += v.unread;
  return { red: c.important.n + c.biz.n, badge };
}
