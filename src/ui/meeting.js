// V2-13 每周经营会 / 董事会界面（设计29 第五节）：消息「开经营会」→ 上周各线 → 秘书汇报 → 分预算（每格 10%）→ 董事会三选一 → 拍板
import * as MT from '../core/meeting.js?v=e379aa95';
import * as INB from './inbox.js?v=e379aa95';
import { SEC_BY_ID } from '../config/secretaries.js?v=e379aa95';
import { fmtMoney, fmtDuration } from '../core/format.js?v=e379aa95';
import { asset } from '../platform/assets.js?v=e379aa95';
import { game } from '../game.js?v=e379aa95';
import { now } from '../core/clock.js?v=e379aa95';
import { openPanel, toast } from './dom.js?v=e379aa95';

const C = MT.MEET_CFG; const DIRS = Object.keys(C.dirs);
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const gTxt = (g) => (g == null ? '—' : `<b class="${g >= 0 ? 'pos' : 'neg'}">${g >= 0 ? '+' : ''}${(g * 100).toFixed(1)}%</b>`);
const fxTxt = (d, v) => (d === 'exp' ? `开店费 −${pct(v)}` : d === 'tal' ? `流失 −${pct(v, 0)}` : `营业额 +${pct(v)}`);

export function openMeeting() {
  const s = game.state; const c = MT.pending(s, now());
  if (!c) { openResult(); return; }
  let alloc = { ad: 40, exp: 30, res: 0, tal: 30 }; if (s.inds.tech && (s.inds.tech.branches || 0) >= 0 && c.stats.rows.some((r) => r.id === 'tech')) alloc = { ad: 30, exp: 20, res: 30, tal: 20 };
  let board = c.board ? (MT.whyBoard(s, 'buyback') ? 'div' : 'buyback') : null;
  const p = openPanel(`第 ${c.wk + 1} 周${c.board ? '董事会' : '经营会'}`);
  const timer = setInterval(() => { const el = p.body.querySelector('.mt-left'); if (!el) return; const l = c.due - now(); if (l <= 0) { clearInterval(timer); p.close(); toast('过了时间，预算按平均分了（效果七折）', 2600); return; } el.textContent = fmtDuration(l / 1000); }, 1000);
  const draw = () => {
    const sum = DIRS.reduce((a, d) => a + alloc[d], 0);
    p.body.innerHTML = `<div class="tr-gain">上周营收 <b>${fmtMoney(c.stats.rev)}</b>、利润 <b>${fmtMoney(c.stats.profit)}</b>　还剩 <b class="mt-left">${fmtDuration((c.due - now()) / 1000)}</b></div>
      <div class="mt-tbl"><div class="mt-h"><span>产业</span><span>上周营收</span><span>利润</span><span>增长</span></div>${c.stats.rows.map((r) => `<div><span>${r.name}</span><span>${fmtMoney(r.rev)}</span><span class="${r.profit < 0 ? 'neg' : ''}">${fmtMoney(r.profit)}</span><span>${gTxt(r.growth)}</span></div>`).join('')}</div>
      ${c.rep.length ? `<div class="sd-rec-title">汇报</div><div class="mt-rep">${c.rep.map((x) => `<div><img src="${asset(`assets/sec/${x.sec}/c1.webp`)}" alt=""><p><b>${SEC_BY_ID[x.sec].name}</b>${x.text}</p></div>`).join('')}</div>` : ''}
      <div class="sd-rec-title">分预算：${fmtMoney(c.budget)}（上周利润的 ${Math.round(C.budgetPct * 100)}%，管到这个游戏周结束）</div>
      <div class="mt-alloc">${DIRS.map((d) => `<div><span><b>${C.dirs[d].name}</b><small>${C.dirs[d].fx}</small></span><button class="btn sm" data-d="${d}" data-v="-1">−</button><em>${alloc[d]}%</em><button class="btn sm" data-d="${d}" data-v="1">＋</button><i>${fxTxt(d, C.dirs[d].max * alloc[d] / 100)}</i></div>`).join('')}</div>
      <div class="tr-gain ${sum === 100 ? '' : 'neg'}">合计 ${sum}%${sum === 100 ? '' : '（要正好 100%）'}　不开会：平均分，效果 ×${C.autoK}</div>
      ${c.board ? `<div class="sd-rec-title">董事会议题（三选一）</div><div class="tabs mt-board">${Object.entries(C.board).map(([k, b]) => `<button class="tab ${board === k ? 'on' : ''}" data-b="${k}" ${MT.whyBoard(s, k) ? 'disabled' : ''}>${b.name}${MT.whyBoard(s, k) ? `（${MT.whyBoard(s, k)}）` : ''}</button>`).join('')}</div><div class="tr-gain">${board ? C.board[board].text : ''}</div>` : ''}
      <button class="btn gold big mt-go" style="width:100%;margin-top:8px" ${sum === 100 ? '' : 'disabled'}>就这么定</button>`;
    p.body.querySelectorAll('.mt-alloc button').forEach((b) => (b.onclick = () => { const d = b.dataset.d; const v = alloc[d] + (+b.dataset.v) * C.step; if (v < 0 || v > 100) return; if (+b.dataset.v > 0 && sum >= 100) { const o = DIRS.filter((x) => x !== d && alloc[x] > 0).sort((x, y) => alloc[y] - alloc[x])[0]; if (!o) return; alloc[o] -= C.step; } alloc[d] = v; draw(); }));
    p.body.querySelectorAll('.mt-board .tab').forEach((b) => (b.onclick = () => { board = b.dataset.b; draw(); }));
    p.body.querySelector('.mt-go').onclick = () => {
      const r = MT.decide(game.state, alloc, now(), { board }); if (!r.ok) return toast(r.why);
      clearInterval(timer); game.changed(); game.save(); p.close();
      toast(`定了：花 ${fmtMoney(r.spend)}，${DIRS.filter((d) => r.fx[d] > 0).map((d) => `${C.dirs[d].name}${fxTxt(d, r.fx[d])}`).join('、')}${r.board && r.board.ok ? `；${C.board[board].name}${r.board.net ? `到手 ${fmtMoney(r.board.net)}` : r.board.up ? `股价 +${pct(r.board.up, 2)}` : '：这周收购成功率 +10%'}` : ''}`, 4200);
    };
  };
  draw();
}
/** 这周已经定了：看加成和最近几次 */
function openResult() {
  const s = game.state; const m = MT.mt(s); const f = m.fx && now() < m.fx.until ? m.fx : null;
  const p = openPanel(MT.nameOf(s));
  p.body.innerHTML = `${f ? `<div class="tr-gain">这周的加成（还有 ${fmtDuration((f.until - now()) / 1000)}）${f.auto ? '：没开会，按平均分、七折' : ''}</div><div class="mt-alloc">${DIRS.map((d) => `<div><span><b>${C.dirs[d].name}</b><small>${C.dirs[d].fx}</small></span><i>${fxTxt(d, f[d] || 0)}</i></div>`).join('')}${f.acq ? `<div><span><b>并购</b><small>收购对手</small></span><i>成功率 +${pct(f.acq, 0)}</i></div>` : ''}</div>` : '<div class="tr-gain">这周没有加成</div>'}
    <div class="sd-rec-title">最近几次</div><div class="mt-tbl">${(m.hist || []).map((h) => `<div><span>第 ${h.wk + 1} 周</span><span>${h.auto ? '没开' : '开了'}</span><span>${fmtMoney(h.spend)}</span><span>${h.board ? C.board[h.board].name : ''}</span></div>`).join('') || '<div><span>还没开过</span></div>'}</div>`;
}

INB.addActionUi((s, m, a) => { if (m.type !== 'meeting' || a !== 'open') return false; openMeeting(); return true; });
game.addTicker((s) => { const r = MT.tick(s, now()); if (r && r.invited) toast(`秘书约你开每周${MT.nameOf(s)}（${C.dueMin} 分钟内），去消息里看`, 3200); });
