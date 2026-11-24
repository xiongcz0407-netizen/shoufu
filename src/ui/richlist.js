// V2-14 财富榜界面（设计32 第七节）：财富页「榜单」分段；两个页签「华夏」「全球」；你那一行金边；点人看简介（挂股票的能点进股票）；最下面「你身边的人」
import * as RL from '../core/richlist.js?v=e379aa95';
import * as INB from './inbox.js?v=e379aa95';
import { BY as STOCK_BY } from '../core/stocks.js?v=e379aa95';
import { openStock } from './stocks.js?v=e379aa95';
import { fmtMoney } from '../core/format.js?v=e379aa95';
import { asset, hasAsset } from '../platform/assets.js?v=e379aa95';
import { game } from '../game.js?v=e379aa95';
import { now } from '../core/clock.js?v=e379aa95';
import { h, openPanel, toast } from './dom.js?v=e379aa95';
import { playStory, isStoryPlaying } from './story.js?v=e379aa95';

const C = RL.RICH_CFG;
let tab = 'cn';
const big = (v) => (v >= 1e12 ? `${(v / 1e12).toFixed(2)}万亿` : v >= 1e8 ? `${(v / 1e8).toFixed(v >= 1e10 ? 0 : 1)}亿` : fmtMoney(v));
const face = (p) => {
  if (p.img && hasAsset(p.img)) return `<span class="rl-av"><img src="${asset(p.img)}" alt=""></span>`;
  const logo = p.stock && hasAsset(`assets/stock/logo_${p.stock}.webp`) ? `<img class="rl-logo" src="${asset(`assets/stock/logo_${p.stock}.webp`)}" alt="">` : '';
  return `<span class="rl-av rl-ch ${p.me ? 'me' : ''}">${(p.me ? '我' : p.n[0])}${logo}</span>`;
};
const delta = (s, kind, p) => { if (p.rank > C.size) return ''; const R = RL.rc(s); const was = R.last && R.last[kind] ? (p.me ? R.last.me && R.last.me[kind] : R.last[kind][p.id]) : null; if (!was) return '<em class="rl-d new">新</em>'; const d = was - p.rank; return d > 0 ? `<em class="rl-d up">↑${d}</em>` : d < 0 ? `<em class="rl-d dn">↓${-d}</em>` : '<em class="rl-d">—</em>'; };
const row = (s, kind, p) => `<div class="rl-row ${p.me ? 'me' : ''}" data-id="${p.id}"><b class="rl-no">${p.rank}</b>${face(p)}<span class="rl-nm"><b>${p.n}${kind === 'gl' && p.c ? `<small>${p.c}</small>` : ''}</b><small>${p.biz || ''}</small></span><span class="rl-v">${big(p.val)}${delta(s, kind, p)}</span></div>`;

export function renderRich(body) {
  const draw = () => {
    const s = game.state; const b = RL.board(s, tab); const me = b.me; const y = RL.yearOf(s, now()) + 1;
    body.innerHTML = `<div class="tabs rl-tabs"><button class="tab ${tab === 'cn' ? 'on' : ''}" data-t="cn">华夏财富榜</button><button class="tab ${tab === 'gl' ? 'on' : ''}" data-t="gl">全球财富榜</button></div>
      <div class="rl-head"><span>第 ${y} 年 · 实时</span><b>${me.rank <= C.size ? `你排第 ${me.rank} 名` : `距离上榜还差 ${fmtMoney(Math.ceil(b.cut - me.val))}`}</b></div>
      <div class="rl-list">${b.list.map((p) => row(s, tab, p)).join('')}${me.rank > C.size ? `<div class="rl-gap">……</div>${row(s, tab, me)}` : ''}</div>
      ${tab === 'cn' && RL.nearby(s).length ? `<div class="sd-rec-title">你身边的人</div><div class="rl-list">${RL.nearby(s).map((p) => row(s, tab, p)).join('')}</div>` : ''}`;
    body.querySelectorAll('.rl-tabs .tab').forEach((x) => (x.onclick = () => { tab = x.dataset.t; draw(); }));
    body.querySelectorAll('.rl-row').forEach((x) => (x.onclick = () => openPerson(x.dataset.id)));
    const meEl = body.querySelector('.rl-row.me'); if (meEl && me.rank <= C.size && me.rank > 6) requestAnimationFrame(() => meEl.scrollIntoView({ block: 'center' }));
  };
  draw();
}
function openPerson(id) {
  const s = game.state; if (id === 'me') return;
  const p = RL.board(s, 'gl').all.find((x) => x.id === id) || RL.board(s, 'cn').all.find((x) => x.id === id); if (!p) return;
  const cn = p.cn ? RL.board(s, 'cn').all.find((x) => x.id === id) : null; const gl = RL.board(s, 'gl').all.find((x) => x.id === id);
  const top = C.top.find((x) => x.id === id);
  const pn = openPanel(p.n);
  pn.body.innerHTML = `<div class="rl-prof">${face(p)}<div><b>${p.n}</b><small>${p.c}${p.biz ? ` · ${p.biz}` : ''}</small></div></div>
    <div class="tr-gain">身价 <b>${big(p.val)}</b>　${cn && cn.rank <= C.size ? `华夏第 ${cn.rank}` : ''}${gl && gl.rank <= C.size ? `　全球第 ${gl.rank}` : ''}</div>
    ${p.stock ? `<div class="tr-gain">身价 = 持股 ${(p.pct * 100).toFixed(1)}% × ${STOCK_BY[p.stock].name}市值${p.priv ? ` + 私人部分 ${big(p.priv)}` : ''}，跟股价走</div>` : ''}
    <div class="tr-gain">${(top && top.desc) || p.desc || (p.rival ? '' : `做${p.biz}起家。`)}</div>
    ${p.stock ? `<button class="btn gold rl-stock" style="width:100%">看 ${STOCK_BY[p.stock].name} 的股票</button>` : ''}`;
  const b = pn.body.querySelector('.rl-stock'); if (b) b.onclick = () => { pn.close(); openStock(p.stock); };
}
/** 消息「看榜单」 */
export function openRichList() { const p = openPanel('财富榜'); const box = h('div', ''); p.body.appendChild(box); renderRich(box); }
INB.addActionUi((s, m, a) => { if (m.type !== 'richlist' || a !== 'open') return false; const pg = m.data && m.data.pages; if (pg) tab = 'cn'; openRichList(); return true; });
let last = 0;
game.addTicker((s) => {
  const t = now(); if (t - last < 5000) return; last = t;
  const r = RL.tick(s, t); if (r && r.published != null) toast(`第 ${r.published + 1} 年财富榜出炉了，去消息里看`, 3200);
  const R = s.rich; if (R && R.story && R.story.length && !isStoryPlaying() && !document.querySelector('.story')) { const x = R.story.shift(); game.save(); playStory(x.lines, { title: x.k.startsWith('cn') ? '华夏财富榜' : '全球财富榜', sec: s.current && s.secs[s.current] ? s.current : Object.keys(s.secs || {})[0] }); }
});
