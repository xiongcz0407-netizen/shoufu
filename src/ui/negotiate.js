// 通用谈判界面（V2-06，设计29 第二节）：对方是谁 + 耐心条 + 现在要价；一来一回的对话；出价滑条 + 「出价」「按对方的价成交」「不谈了」；筹码一次
// 接进来的：房东涨租（经营事件「谈」）、拍卖私洽（拍卖会每件的「私洽」）。开发1 的收购、融资、谈地也可以用 openNegotiate
import * as NG from '../core/negotiate.js?v=5e43f185';
import * as AU from '../core/auction.js?v=5e43f185';
import * as BE from '../core/bizevents.js?v=5e43f185';
import * as INB from './inbox.js?v=5e43f185';
import { bigBonus, useBig } from '../core/manage.js?v=5e43f185';
import { SEC_BY_ID } from '../config/secretaries.js?v=5e43f185';
import { fmtMoney } from '../core/format.js?v=5e43f185';
import { game } from '../game.js?v=5e43f185';
import { now } from '../core/clock.js?v=5e43f185';
import { h, openPanel, toast } from './dom.js?v=5e43f185';

const C = NG.NEGO_CFG;
/**
 * 打开谈判面板。o：{ title, who（对方叫什么）, opts（NG.start 的参数）, fmt(v), secs（能带的秘书 id 列表，可空）, onDone({ deal } | { walked } | { quit }) }
 */
export function openNegotiate(o) {
  const s = game.state; let secId = o.opts.chips && o.opts.chips.secId || null;
  const r = NG.start(s, { ...o.opts, chips: { ...(o.opts.chips || {}), secId } }, now()); if (!r.ok) { toast(r.why); return null; }
  const S = r.sess; if (o.coolMin) S.coolMin = o.coolMin; const fmt = o.fmt || ((v) => fmtMoney(v));
  let val = S.dir > 0 ? S.ask - (S.ask - S.lo) * 0.5 : S.ask + (S.hi - S.ask) * 0.5; let ended = false;
  const p = openPanel(o.title, { onClose: () => { if (!ended) { ended = true; o.onDone && o.onDone({ quit: true }); } } });
  const minV = S.dir > 0 ? Math.max(0, S.lo * 0.8) : S.ask, maxV = S.dir > 0 ? S.ask : S.hi * 1.2;
  const draw = () => {
    const ch = NG.chipsOf(s, S); const dots = '●'.repeat(Math.max(0, S.left)) + '○'.repeat(Math.max(0, S.patience - S.left));
    val = Math.min(maxV, Math.max(minV, val));
    p.body.innerHTML = `<div class="ng-who"><b>${o.who}</b><em>${S.persona}</em><span class="ng-pat" title="对方的耐心">耐心 ${dots}</span></div>
      <div class="ng-ask"><small>对方现在要${S.ask !== S.base ? `（开价 ${fmt(S.base)}）` : '（开价）'}</small><b>${fmt(S.ask)}</b>${S.peek ? `<small class="ng-peek">你看过账：底线大概在 ${fmt(S.peek[0])} ～ ${fmt(S.peek[1])}</small>` : ''}</div>
      <div class="ng-log">${S.log.map((x) => `<div class="ng-me">你：${fmt(x.you)}</div><div class="ng-them ${x.tier || (x.deal != null ? 'deal' : 'walk')}">${o.who}：${x.line}${x.ask != null ? `<small>（还价 ${fmt(x.ask)}）</small>` : ''}</div>`).join('') || '<div class="tr-gain">对方先开了价。出价越接近对方的底线，对方的话越松动；耐心用完对方就走了。</div>'}</div>
      ${S.done ? `<div class="ng-end ${S.walked ? 'neg' : 'pos'}">${S.walked ? `谈崩了：${C.cooldownMin} 分钟内不能再约` : `成交：${fmt(S.deal)}`}</div><button class="btn gold big ng-ok">好</button>` : `
      <div class="ng-offer"><span>你出</span><b>${fmt(val)}</b></div>
      <input class="ng-range" type="range" min="${minV}" max="${maxV}" step="${S.step || (maxV - minV) / 100}" value="${val}">
      <div class="ind-btns"><button class="btn gold ng-go">出价</button><button class="btn ng-acc">按对方的价成交</button></div>
      <div class="sd-rec-title">筹码（一次谈判只能用一个）${S.chipUsed ? '：已用' : ''}</div>
      ${(o.secs || []).length ? `<div class="tabs ng-secs"><button class="tab ${secId ? '' : 'on'}" data-s="">不带人</button>${o.secs.map((k) => `<button class="tab ${secId === k ? 'on' : ''}" data-s="${k}">带${SEC_BY_ID[k].name}</button>`).join('')}</div>` : ''}
      <div class="ind-btns ng-chips">${[['intel', '情报'], ['social', '秘书交际'], ['boss', '亲自谈']].map(([k, n]) => `<button class="btn sm ${S.chipUsed === k ? 'on' : ''}" data-c="${k}" ${S.chipUsed || ch[k] !== true ? 'disabled' : ''}>${n}${S.chipUsed === k ? '（用了）' : ''}${ch[k] !== true && !S.chipUsed ? `<br><small>${ch[k]}</small>` : ''}</button>`).join('')}</div>
      <button class="btn ng-quit" style="width:100%;margin-top:8px">不谈了</button>`}`;
    const rg = p.body.querySelector('.ng-range'); if (rg) rg.oninput = () => { val = +rg.value; p.body.querySelector('.ng-offer b').textContent = fmt(val); };
    const on = (sel, fn) => { const x = p.body.querySelector(sel); if (x) x.onclick = fn; };
    on('.ng-go', () => { NG.offer(s, S, val, now()); game.changed(); after(); });
    on('.ng-acc', () => { NG.accept(s, S); game.changed(); after(); });
    on('.ng-quit', () => p.close());
    on('.ng-ok', () => p.close());
    p.body.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { if (S.chipUsed) return; secId = b.dataset.s || null; S.chips.secId = secId; draw(); }));
    p.body.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { const x = NG.useChip(s, S, b.dataset.c); toast(x.ok ? x.text : x.why, 2400); if (x.ok && b.dataset.c === 'boss') useBig(s, 'deal'); game.changed(); draw(); }));
  };
  const after = () => { draw(); if (S.done && !ended) { ended = true; game.save(); o.onDone && o.onDone(S.walked ? { walked: true, sess: S } : { deal: S.deal, sess: S }); } };
  draw();
  return { sess: S, panel: p };
}

// ---------- 房东涨租：经营事件「谈（看交际）」→ 谈判 ----------
INB.addActionUi((s, m, a, rerender) => {
  if (m.type !== 'biz_event' || !m.data || m.data.ev !== 'rent_up' || a !== 'talk') return false;
  const R = C.rent; const secs = Object.keys(s.secs);
  openNegotiate({
    title: '跟房东谈涨租', who: '房东', fmt: (v) => `涨 ${+v.toFixed(1)}%`, secs,
    opts: { ...NG.rentOpts(m.id, m.from || null, bigBonus(s, 'deal') > 0) },
    onDone: (res) => {
      if (res.quit) return;
      if (m.status !== 'open') { toast('谈的时候已经过了时间，这件事按默认处理了', 2600); rerender && rerender(); return; }   // 2 分钟到点会按默认结算，别算两次
      const pct = res.walked ? R.walkPct : res.deal;
      const r = BE.resolve(s, m.id, 'talk', now(), Math.random, { fx: NG.rentFx(pct), msg: res.walked ? `谈崩了，房东按原来的涨 ${R.walkPct}%。` : `谈下来了：房租只涨 ${+pct.toFixed(1)}%。` });
      toast(r.ok ? r.text : r.why, 3200); game.changed(); game.save(); rerender && rerender();
    },
  });
  return true;
});

// ---------- 拍卖私洽：开拍前直接找卖家谈 ----------
export function openPrivateAuction(l, redraw) {
  const s = game.state; const o = AU.privateOpts(s, l.lot, now()); if (!o) { toast('这件已经不在图录里了'); return; }
  openNegotiate({
    title: `私洽 · ${l.name}`, who: l.kind === 'car' ? '车主（委托拍卖行）' : '藏家', opts: o, coolMin: C.auction.cooldownMin, secs: Object.keys(s.secs),
    onDone: (res) => {
      if (res.quit || res.walked) { if (res.walked) toast('卖家不谈了，拍卖会上还能举牌', 2600); redraw && redraw(); return; }
      const x = AU.privateDeal(s, l.lot, res.deal, now()); if (!x.ok) { toast(x.why); return; }
      toast(`私洽谈成：${fmtMoney(res.deal)}（连佣金税费 ${fmtMoney(x.total)}），到「拍到的」里签确认书付款（不限时）`, 3600);
      game.changed(); game.save(); redraw && redraw();
    },
  });
}
