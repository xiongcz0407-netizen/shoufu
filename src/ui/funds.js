// 「财富 → 投资 → 基金」（第 2-10 项）：公募 / 私募 / 天使风投；申购、赎回（下一跳到账）、私募三份文件
import { YEAR_MS } from '../core/gametime.js?v=691ed83a'; // V0.2.10
import * as FD from '../core/funds.js?v=691ed83a';
import * as AS from '../core/assets.js?v=691ed83a';
import * as INB from '../core/inbox.js?v=691ed83a';
import * as E from '../core/economy.js?v=691ed83a';
import { fmtMoney, fmtDuration } from '../core/format.js?v=691ed83a';
import { game } from '../game.js?v=691ed83a';
import { now } from '../core/clock.js?v=691ed83a';
import { h, openPanel, toast } from './dom.js?v=691ed83a';
import { spark } from './stocks.js?v=691ed83a';
import { hintLater } from './guide2.js?v=691ed83a';

const pct = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');
const TYPE = { equity: '股票型', bond: '债券型', money: '货币型', hedge: '私募', angel: '私募股权' };

export function renderFunds(s, wrap, redraw) {
  hintLater('funds');
  const d = FD.fd(s); const t = now();
  const hs = FD.holdings(s); const v = FD.value(s);
  wrap.appendChild(h('div', 'sum-card', `<div><small>基金市值（含锁定中、在途）</small><b>${fmtMoney(v)}</b></div><div><small>赎回在途</small><b>${d.pending.length} 笔</b><small>下一跳（30 秒）到账</small></div>`));
  for (const f of FD.FUNDS) {
    const hd = d.hold[f.id]; const nav = d.nav[f.id]; const hist = d.hist[f.id] || []; const c = hist.length > 1 ? nav / hist[0] - 1 : 0;
    const lock = (s.title || 0) < (f.title || 0);
    const r = h('button', 'sk-row' + (lock ? ' dim' : ''), `<i class="sk-logo ph">${TYPE[f.type]}</i><div class="sk-name"><b>${f.name}</b><small>${f.manager} · 管理费 ${(f.fee * 100).toFixed(1)}%/年${f.perfFee ? ` + 赚的 ${f.perfFee * 100}%` : ''} · 起投 ${fmtMoney(f.min)}${f.qualified ? ' · 合格投资者' : ''}</small>${hd ? `<small>持有 ${fmtMoney(hd.units * nav)}　盈亏 <span class="${cls(hd.units * nav - hd.cost)}">${fmtMoney(hd.units * nav - hd.cost)}</span></small>` : ''}${f.type === 'angel' && d.angel.length ? `<small>投了 ${d.angel.length} 笔，锁定中</small>` : ''}</div><div class="sk-px">${f.type === 'angel' ? `<b>锁 ${FD.lockGameYears(f)} 游戏年</b>` : `<b>${nav.toFixed(4)}</b><small class="${cls(c)}">${pct(c)}</small>`}</div>`);
    r.onclick = () => openFund(f.id, redraw); wrap.appendChild(r);
  }
  wrap.appendChild(h('div', 'tr-gain', '净值跟股票同一套行情，管理费按时间扣；申购费、赎回费（持有不到 7 个游戏日 1.5%、不到 30 个游戏日 0.5%）；赎回按当跳净值、下一跳到账；基金收益免个税'));
}

function openFund(id, done) {
  const s = game.state; const f = FD.FB[id]; const p = openPanel(f.name);
  let amt = Math.max(f.min, f.min >= 1e6 ? f.min : 1e4);
  const render = () => {
    const d = FD.fd(s); const t = now(); const nw = E.netWorth(s); const hd = d.hold[id];
    const why = FD.whyNot(s, id, amt, nw);
    const chips = [1e3, 1e4, 1e5, 1e6, 5e6, 1e7, 1e8].filter((k) => k >= f.min);
    p.body.innerHTML = `<div class="tr-gain">${TYPE[f.type]} · ${f.manager}${f.qualified ? ' · <b>合格投资者</b>（身价 ≥ 1000 万）' : ''}${f.title ? ` · 称号「${['打工人', '小老板', '老板', '企业家'][f.title]}」` : ''}</div>
      ${f.type === 'angel' ? `<div class="tr-gain">投进去锁 ${FD.lockGameYears(f)} 个游戏年（${fmtDuration(FD.lockGameYears(f) * YEAR_MS / 1000)} 真实时间）；到期随机：40% 亏一半、40% 拿回 1～2 倍、20% 翻 5～20 倍；赚的部分 20% 业绩报酬</div>${d.angel.filter((a) => a.id === id).map((a) => `<div class="tr-course"><div><b>投了 ${fmtMoney(a.amount)}</b><div class="tr-gain">还剩 ${fmtDuration(Math.max(0, a.until - t) / 1000)} 到期</div></div></div>`).join('')}` : `<div class="tr-gain">净值 <b>${d.nav[id].toFixed(4)}</b></div>${spark(d.hist[id] || [])}`}
      ${hd ? `<div class="tr-course"><div><b>持有 ${fmtMoney(hd.units * d.nav[id])}</b><div class="tr-gain">${hd.units.toFixed(2)} 份　成本 ${fmtMoney(hd.cost)}　盈亏 <span class="${cls(hd.units * d.nav[id] - hd.cost)}">${fmtMoney(hd.units * d.nav[id] - hd.cost)}</span>　赎回费 ${(FD.redeemFee(f, t - hd.at) * 100).toFixed(1)}%</div></div></div>` : ''}
      <div class="sd-rec-title">申购金额</div><div class="tabs">${chips.map((k) => `<button class="tab ${k === amt ? 'on' : ''}" data-a="${k}">${fmtMoney(k)}</button>`).join('')}</div>
      <div class="tr-gain">申购费 ${(f.buyFee * 100).toFixed(2)}%（${fmtMoney(amt * f.buyFee)}）${f.qualified ? '；签认购协议、风险揭示书、合格投资者确认书' : ''}</div>
      ${why ? `<div class="sc-cond">${why}</div>` : ''}
      <div class="ind-btns"><button class="btn gold buy" ${why ? 'disabled' : ''}>申购</button>${hd ? '<button class="btn half">赎回一半</button><button class="btn all">全部赎回</button>' : ''}</div>`;
    p.body.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { amt = +b.dataset.a; render(); }));
    p.body.querySelector('.buy').onclick = () => { const r = FD.subscribe(s, id, amt, now(), { netWorth: E.netWorth(s) }); if (!r.ok) { toast(r.why); return; } toast(`申购好了：${r.docs.map((x) => x.title).join('、')}进档案柜`, 2600); AS.recalc(s); game.changed(); game.save(); render(); done && done(); };
    const red = (k) => { const r = FD.redeem(s, id, k, now()); if (!r.ok) { toast(r.why); return; } toast(`赎回 ${fmtMoney(r.gross)}${r.rf ? `，赎回费 ${fmtMoney(r.rf)}` : ''}${r.perf ? `，业绩报酬 ${fmtMoney(r.perf)}` : ''}，30 秒后到账`, 2600); AS.recalc(s); game.changed(); game.save(); render(); done && done(); };
    const hb = p.body.querySelector('.half'); if (hb) hb.onclick = () => red(0.5); const ab = p.body.querySelector('.all'); if (ab) ab.onclick = () => red(1);
  };
  render();
}

// 每秒：赎回到账、天使到期
game.addTicker((s) => { if (!s.fund) return; for (const x of FD.tick(s, now())) { toast(x, 2600); INB.addMsg(s, { kind: 'system', type: 'fund', title: x, body: '财富 → 投资 → 基金' }, now()); AS.recalc(s); } });
