// 设计40 收益流水（开发2）：公司 →「收益」页签。顶上今天合计（进账、成本、赚），能按产业筛；
// 下面一笔一笔往上冒（最新在上，最多 60 条）。数据在 core/flow.js，钱都是真实营收切出来的
import * as FL from '../core/flow.js?v=f7808ad2';
import { IND_BY_ID } from '../config/industries.js?v=f7808ad2';
import { lookIndex } from '../core/economy.js?v=f7808ad2';
import { fmtMoney } from '../core/format.js?v=f7808ad2';
import { now } from '../core/clock.js?v=f7808ad2';
import { asset, hasAsset } from '../platform/assets.js?v=f7808ad2';
import { game } from '../game.js?v=f7808ad2';
import { h } from './dom.js?v=f7808ad2';

const icon = (s, id) => {
  const c = IND_BY_ID[id]; const x = s.inds && s.inds[id];
  const f = c && c.img ? `assets/ind/${c.img[c.looks && x ? Math.min(c.img.length - 1, lookIndex(c, x.level || 0)) : 0]}.webp` : '';
  return f && hasAsset(f) ? `<img class="fl-ic" src="${asset(f)}" alt="">` : `<span class="fl-ic ph">${id === 'battle' ? '⚔️' : (c ? c.name[0] : '¥')}</span>`;
};
/** 进账、成本取整（不到 10 元一位小数），赚 = 两个相减（设计40 第二节第 6 条） */
const money = (x, dec) => (dec ? `¥${x.toFixed(1)}` : fmtMoney(x));
const rowHtml = (s, r) => { const z = FL.roundPair(r.rev, r.cost); const p = z.profit;
  return `<div class="fl-row${r.big ? ' big' : ''}" data-i="${r.i}">${icon(s, r.id)}<div class="fl-txt"><b>${r.name}</b>${r.text ? ` · ${r.text}` : ''}</div>
    <div class="fl-nums"><span>进账 ${money(z.rev, z.dec)}</span><span>成本 ${money(z.cost, z.dec)}</span><span class="fl-p ${p < 0 ? 'neg' : ''}">赚 ${money(p, z.dec)}</span></div></div>`; };

export function renderProfit(body) {
  const wrap = h('div', 'fl-page'); body.appendChild(wrap);
  let filter = 'all'; let seen = -1; let tabsKey = '';
  wrap.innerHTML = '<div class="fl-sum"></div><div class="fl-tabs tabs"></div><div class="fl-list"></div>';
  const sumEl = wrap.querySelector('.fl-sum'), tabsEl = wrap.querySelector('.fl-tabs'), listEl = wrap.querySelector('.fl-list');
  const shown = (r) => filter === 'all' || r.id === filter;
  const full = () => {
    const s = game.state; const f = FL.fl(s); const rows = f.list.filter(shown);
    listEl.innerHTML = rows.map((r) => rowHtml(s, r)).join('') || '<div class="empty fl-empty">店开着就会有进账，在这里一笔一笔看。</div>';
    seen = f.seq;
  };
  const draw = () => {
    const s = game.state; const f = FL.fl(s); const z = FL.todaySum(s, now());
    sumEl.innerHTML = `<span>今天合计</span><div><em>进账</em><b>${money(z.rev, z.dec)}</b></div><div><em>成本</em><b>${money(z.cost, z.dec)}</b></div><div><em>赚</em><b class="${z.profit < 0 ? 'neg' : 'gold'}">${money(z.profit, z.dec)}</b></div>`;
    // 筛选：全部 + 开了的产业（流水里出现过的也列上）
    const ids = [...new Set([...Object.keys(s.inds || {}).filter((id) => (s.inds[id].branches || 0) > 0 && IND_BY_ID[id]), ...f.list.map((r) => r.id)])];
    const key = ids.join(',') + '|' + filter;
    if (key !== tabsKey) {
      tabsKey = key;
      tabsEl.innerHTML = [['all', '全部'], ...ids.map((id) => [id, id === 'battle' ? '商战' : (IND_BY_ID[id] || {}).name || '其他'])].map(([k, n]) => `<button class="tab ${filter === k ? 'on' : ''}" data-f="${k}">${n}</button>`).join('');
      tabsEl.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filter = b.dataset.f; tabsKey = ''; draw(); full(); }));
    }
    if (seen < 0) { full(); return; }
    if (f.seq === seen) return;
    // 只把新来的几条插到最上面，带一点往上冒的动画（照站柜台）
    const fresh = f.list.filter((r) => r.i > seen && shown(r)); seen = f.seq;
    if (!fresh.length) return;
    const em = listEl.querySelector('.fl-empty'); if (em) em.remove();
    for (const r of fresh.reverse()) { const el = h('div', ''); el.innerHTML = rowHtml(s, r); const row = el.firstElementChild; row.classList.add('fl-new'); listEl.prepend(row); }
    while (listEl.children.length > FL.FLOW_MAX) listEl.lastElementChild.remove();
  };
  draw();
  const off = game.onChange(() => { if (!wrap.isConnected) { off && off(); return; } draw(); });
}
