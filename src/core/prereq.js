// V2-12 前置条件（设计31）：第一次满足某个条件时，秘书在消息里说一句（同一个条件只说一次；已经开了的不说）
import { INDUSTRIES, IND_BY_ID } from '../config/industries.js?v=9a2bf56f';
import { TITLES } from '../config/titles.js?v=9a2bf56f';
import { SEC_BY_ID } from '../config/secretaries.js?v=9a2bf56f';
import * as E from './economy.js?v=9a2bf56f';
import { addMsg } from './inbox.js?v=9a2bf56f';
import * as MG from './manage.js?v=9a2bf56f';
import * as PO from './posts.js?v=9a2bf56f';

const keyOf = (need) => (need.retailTotal ? `retail:${need.retailTotal}` : `${need.line}:${need.n}`);
/** 这个条件放开的事：{ acts 现在就能做的, wait 还差称号的 } */
function actions(s, need) {
  const k = keyOf(need); const acts = []; let wait = 0;
  for (const cfg of INDUSTRIES) for (const which of ['needFirst', 'needBranch']) {
    const n = cfg[which]; if (!n || keyOf(n) !== k) continue;
    const ind = s.inds[cfg.id];
    if (which === 'needBranch') { if (ind && ind.branches === 1) acts.push(`开${cfg.name}分店`); continue; }
    if (!cfg.startEmpty && ind && ind.fresh) { acts.push(`做${cfg.name}（产业页里已经有了）`); delete ind.fresh; continue; }
    if (cfg.startEmpty ? ind && ind.branches > 0 : !!ind) continue; // 已经开了
    if ((s.title || 0) < cfg.unlockTitle && !(s.flags && s.flags.earlyUnlock && s.flags.earlyUnlock[cfg.id])) { wait++; continue; } // 称号还不够：等升了再说
    acts.push(cfg.retail ? `开${cfg.name}店` : `开${cfg.name}`);
  }
  return { acts, wait };
}
const metReal = (s, need) => { const p = E.needProgress(s, need); return p.cur >= p.n; };
/** 检查一遍：返回新说的话 */
export function checkNeeds(s, t) {
  const told = ((s.flags = s.flags || {}).needTold = s.flags.needTold || {}); const said = []; const seen = new Set();
  for (const cfg of INDUSTRIES) for (const which of ['needFirst', 'needBranch']) {
    const need = cfg[which]; if (!need) continue; const k = keyOf(need); if (seen.has(k) || told[k]) continue; seen.add(k);
    if (!metReal(s, need)) continue;
    const { acts, wait } = actions(s, need);
    if (!acts.length) { if (!wait) told[k] = t; continue; } // 放开的事都做过了（老档）就不说；还差称号的等升了再说
    told[k] = t;
    const p = E.needProgress(s, need); const sec = Object.keys(s.secs || {})[0] || '';
    const head = need.retailTotal ? `三种门店加起来已经 ${p.cur} 家了` : `${IND_BY_ID[need.line].name}已经 ${p.cur} ${need.line === 'logistics' ? '个网点' : '家'}了`;
    const body = `${head}，可以考虑${acts.join('、')}了。`;
    addMsg(s, { kind: 'system', type: 'need_met', from: sec, title: '可以开新的了', body: sec && SEC_BY_ID[sec] ? `${SEC_BY_ID[sec].name}：「${body}」` : body }, t);
    said.push(body);
  }
  return said;
}
/** 称号还不够时的灰卡说明：[{ text, ok }] */
export function lockInfo(s, id) {
  const cfg = IND_BY_ID[id]; const out = [{ text: `「${TITLES[cfg.unlockTitle].name}」称号`, ok: (s.title || 0) >= cfg.unlockTitle }];
  if (cfg.needFirst) { const p = E.needProgress(s, cfg.needFirst); const w = E.needNow(s, cfg.needFirst); out.push({ text: `${w.who}，要 ${w.n}`, ok: p.cur >= p.n }); } /* 设计58：「便利店现在 1 家，要 3 家」 */
  return out;
}
MG.onDay((s, d, at) => { checkNeeds(s, at); PO.recallEmpty(s, at); return []; }); /* 设计58：线关到 0 家时店长也撤回 */
