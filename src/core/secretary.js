// 秘书：加入条件、存档记录、好感 / 爱慕阶段
import { SECRETARIES, SEC_BY_ID } from '../config/secretaries.js?v=f7808ad2';
import { netWorth } from './economy.js?v=f7808ad2';

export const FAVOR_STAGES = ['陌生', '熟悉', '信任', '亲密', '知己']; // 每段 100 点
export const FAVOR_MAX = 499;
export const LOVE_STAGES = [[0, '还没心动'], [20, '心动'], [40, '暧昧'], [60, '喜欢'], [80, '恋人'], [100, '唯一']];

export function newSecRecord(t = Date.now()) {
  return {
    outfit: 'c1', joinedAt: t, attrs: null, favor: 0, love: 0,
    rec: { dates: 0, places: {}, lastDate: null, gifts: 0, talks: 0, clothes: 0 },
  };
}
/** 旧存档里简化的记录补全 */
export function ensureSec(s, id, t = Date.now()) {
  const d = newSecRecord(t);
  const r = s.secs[id];
  if (!r) return null;
  for (const k of Object.keys(d)) if (!(k in r)) r[k] = d[k];
  for (const k of Object.keys(d.rec)) if (!(k in r.rec)) r.rec[k] = d.rec[k];
  if (!r.attrs) { const c = SEC_BY_ID[id]; r.attrs = { charm: c.attrs[0], wit: c.attrs[1], social: c.attrs[2], manage: c.attrs[3] }; }
  return r;
}

export const favorStage = (f) => Math.min(FAVOR_STAGES.length - 1, Math.floor(f / 100));
export const favorInStage = (f) => (f >= FAVOR_MAX ? 100 : f % 100);
export function loveStage(l) { let i = 0; LOVE_STAGES.forEach(([v], k) => { if (l >= v) i = k; }); return i; }

export function conditionMet(s, cfg) {
  const u = cfg.unlock || {};
  if (u.minTitle != null && s.title < u.minTitle) return false; // 有的还要到某个称号
  switch (u.type) {
    case 'start': return true;
    case 'networth': return netWorth(s) >= u.value;
    case 'branches': return !!s.inds[u.ind] && s.inds[u.ind].branches >= u.value;
    case 'acquire': return !!(s.flags.acquired && s.flags.acquired[u.rival]);
    case 'title': return s.title >= u.value;
    case 'flag': return !!s.flags[u.flag];
    default: return false;
  }
}

/** 检查有没有新来的秘书；加进存档，返回新来的 id 列表（按配置顺序） */
export function checkJoins(s, t = Date.now()) {
  const got = [];
  for (const c of SECRETARIES) {
    if (s.secs[c.id]) continue;
    if (conditionMet(s, c)) { s.secs[c.id] = newSecRecord(t); ensureSec(s, c.id, t); got.push(c.id); }
  }
  return got;
}

export const daysKnown = (s, id, t = Date.now()) => Math.max(1, Math.floor((t - (s.secs[id].joinedAt || t)) / 86400e3) + 1);
