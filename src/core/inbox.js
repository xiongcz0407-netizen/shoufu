// 消息中心数据（设计18）：请示 / 月报 / 邀请拍卖 / 系统
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
  (s.inbox = s.inbox || []).unshift(msg);
  if (s.inbox.length > 300) s.inbox.length = 300;
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
/** 设计35 第十节：「待处理」= 所有还没办的（要你签字 / 拍板 / 批准的），不限时，按来的先后排（早的在上） */
export const pending = (s) => (s.inbox || []).filter((m) => m.status === 'open').sort((a, b) => a.t - b.t || a.id - b.id);
export const markRead = (s, id) => { const m = (s.inbox || []).find((x) => x.id === id); if (m) m.read = true; };
/** 各类数量：{ request: {open, unread}, ... } */
export function counts(s) {
  const c = {}; for (const k of Object.keys(KINDS)) c[k] = { open: 0, unread: 0 };
  for (const m of s.inbox || []) { if (m.status === 'open') c[m.kind].open++; if (!m.read) c[m.kind].unread++; }
  return c;
}
/** 铃铛：红点数（要动手的）和角标数（没看的） */
export function bell(s) {
  const c = counts(s); let red = 0, badge = 0;
  for (const [k, v] of Object.entries(c)) { if (NEEDS_ACTION[k]) red += v.open; badge += v.unread; }
  return { red, badge };
}
