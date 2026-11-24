// 财富 → 资本（3-02，设计23 第一、二、十节）：公司估值、股东名册、融资（主动约 / 自己找 → 谈判）、对赌
import { openNegotiate } from './negotiate.js?v=691ed83a'; // V2-07 谈估值（开发2 的谈判）
import * as E from '../core/economy.js?v=691ed83a';
import * as CP from '../core/capital.js?v=691ed83a';
import { SEC_BY_ID } from '../config/secretaries.js?v=691ed83a';
import { fmtMoney } from '../core/format.js?v=691ed83a';
import { asset } from '../platform/assets.js?v=691ed83a';
import { now } from '../core/clock.js?v=691ed83a';
import { game } from '../game.js?v=691ed83a';
import { MONTH_MS } from '../core/gametime.js?v=691ed83a';
import { h, openPanel, toast, liveRender } from './dom.js?v=691ed83a';
import { hintLater } from './guide2.js?v=691ed83a';
import { bump } from '../core/daily.js?v=691ed83a';
import * as DL from '../core/daily.js?v=691ed83a';

const pct = (x) => `${(x * 100).toFixed(1)}%`;
/** 别的项挂进资本页的小节（上市 3-04 等，开发2）：fn(el) */
export const CAPITAL_SECTIONS = [];
export function renderCapital(body, ctx) {
  const wrap = h('div'); body.appendChild(wrap);
  ctx.onCleanup(liveRender(wrap, () => { wrap.innerHTML = ''; draw(wrap); for (const fn of CAPITAL_SECTIONS) fn(wrap); }, (fn) => game.onChange(fn), body));
}
function draw(el) {
  const s = game.state; const C = CP.cap(s); const v = E.companyEquity(s); const st = E.stakeOf(s);
  el.appendChild(h('div', 'sum-card', `<div><small>公司估值</small><b>${fmtMoney(v)}</b></div><div><small>你的持股</small><b>${pct(st)}</b></div>
    <div><small>经营估值（${((b) => b.mode === 'floor' ? '按产业投入 × 70%' : b.mode === 'ps' ? '亏损，按营收 × 市销率' : `行业市盈率 ${b.pe.toFixed(1)} × 规模系数 ${b.k}`)(E.valueBasis(s))}）</small><b>${fmtMoney(E.earningsValue(s))}</b></div><div><small>身价里公司那块</small><b class="pos">${fmtMoney(v * st)}</b></div>`));
  el.appendChild(h('div', 'tr-gain', '公司估值 = 每条线年净利 × 行业市盈率（门店 12、物流 15、地产 6、传媒 20、科技 30；亏损按营收 × 市销率）+ 公司账户、项目、车队 − 公司负债。身价里公司那块 = 公司估值 × 你的持股。'));
  // 股东名册
  el.appendChild(h('div', 'sd-rec-title', '股东名册')); if (!DL.progress(s, now(), 'capview')) bump(s, now(), 'capview');   // 每日任务（第 3-09 项）
  const sh = h('div', 'fn-card'); for (const x of CP.shareholders(s)) sh.appendChild(h('div', 'fn-row', `<span>${x.me ? '你（创始人）' : `${x.name}<small>（${x.roundName}${x.board ? ' · 董事' : ''}${x.pref > 1 ? ` · 优先清算 ${x.pref} 倍` : ''}${x.anti ? ' · 反稀释' : ''}）</small>`}</span><b>${pct(x.pct)}</b>`)); el.appendChild(sh);
  // 激励池（3-03）
  el.appendChild(h('div', 'sd-rec-title', '秘书股权激励')); hintLater('incentive');
  const P0 = CP.pool(s); const PL = CP.CAP.pool;
  if (!P0) {
    const c = h('div', 'tr-course', `<div style="flex:1"><b>设激励池</b><div class="tr-gain">从你的股份里划（最多 10%），给秘书期权：每次 1%，行权价 = 当时估值 × 20%，${(PL.vestRealMonths / 10).toFixed(1)} 个游戏月按月归属。拿了期权的秘书好感 +${PL.favor}、职位效率 × ${PL.eff}</div></div><div class="ind-btns">${PL.sizes.map((x) => `<button class="btn" data-pool="${x}">${x * 100}%</button>`).join('')}</div>`);
    c.querySelectorAll('[data-pool]').forEach((b) => (b.onclick = () => { const r = CP.makePool(s, +b.dataset.pool, now()); toast(r.ok ? `激励池 ${b.dataset.pool * 100}% 设好了` : r.why); game.changed(); game.save(); }));
    el.appendChild(c);
  } else {
    el.appendChild(h('div', 'tr-gain', `激励池 ${pct(P0.pct)}（还能给 ${pct(P0.free)}）`));
    for (const id of Object.keys(s.secs)) {
      const g = CP.grantOf(s, id); const w = CP.secWorth(s, id, now()); const gw = CP.whyNotGrant(s, id, now());
      const vf = g ? CP.vestedFrac(g, now()) : 0; const canEx = g && g.pct * vf - (g.done || 0) > 1e-9;
      const c = h('div', 'tr-course', `<div style="flex:1"><b>${SEC_BY_ID[id].name}</b><div class="tr-gain">${g ? `期权 ${pct(g.pct)}，已归属 ${Math.round(vf * 100)}%` : '还没有期权'}${w.total ? ` · 她的身家 ${fmtMoney(w.total)}` : ''}</div></div><div class="ind-btns"><button class="btn gr" ${gw ? 'disabled' : ''}>给 1%</button><button class="btn gold ex" ${canEx ? '' : 'disabled'}>行权</button></div>`);
      c.querySelector('.gr').onclick = () => { const r = CP.grant(s, id, now()); toast(r.ok ? `${SEC_BY_ID[id].name}：「${r.line}」` : r.why, 3200); game.changed(); game.save(); };
      c.querySelector('.ex').onclick = () => { const r = CP.exercise(s, id, now()); toast(r.ok ? `行权 ${pct(r.pct)}：她付 ${fmtMoney(r.strike)}，个税 ${fmtMoney(r.tax)}（财务总监代扣）` : r.why, 3200); game.changed(); game.save(); };
      el.appendChild(c);
    }
  }
  // 融资
  const r = CP.nextRound(s); const why = CP.whyNotRound(s, r);
  el.appendChild(h('div', 'sd-rec-title', '融资')); hintLater('capital');
  if (!r) el.appendChild(h('div', 'empty', '五轮都融完了，下一步上市'));
  else {
    const inv = C.invite && C.invite.round === r.id && now() <= C.invite.until ? C.invite : null;
    const c = h('div', 'tr-course', `<div style="flex:1"><b>${r.name}</b><div class="tr-gain">估值 ${fmtMoney(r.minVal)} 起 · 出让 ${pct(r.sell[0])}～${pct(r.sell[1])} · ${r.investors.join('、')}${inv ? `<br><b class="pos">${inv.investor}约您喝咖啡，还剩 ${Math.ceil((inv.until - now()) / 60e3)} 分钟</b>` : ''}${why ? `<br><span class="sc-cond">${why}</span>` : ''}</div></div><button class="btn gold" ${why ? 'disabled' : ''}>${inv ? '去赴约' : '自己去找'}</button>`);
    c.querySelector('.btn').onclick = () => openTalk(r.id); el.appendChild(c);
  }
  // 对赌
  if (C.vams.length) {
    el.appendChild(h('div', 'sd-rec-title', '对赌')); hintLater('vam');
    for (const x of C.vams) el.appendChild(h('div', 'tr-course', `<div><b>${x.investor} · 净利增长 ${Math.round(x.growth * 100)}%</b><div class="tr-gain">${x.status === 'open' ? `还剩 ${((x.end - now()) / MONTH_MS).toFixed(1)} 个游戏月；基数 ${fmtMoney(x.base)}，目标 ${fmtMoney(x.base * (1 + x.growth))}` : x.status === 'won' ? '达标了' : `没达标：回购 ${fmtMoney(x.price)}（现金 ${fmtMoney(x.cash)}${x.short > 0.01 ? `，股份抵 ${fmtMoney(x.short)}` : ''}）`}</div></div>`));
  }
}
/** 谈判：条款 + 带人（看交际、智慧） */
function openTalk(roundId) {
  bump(game.state, now(), 'investor');   // 每日任务「跟投资人聊 1 次」（第 3-09 项）
  const s = game.state; const r = CP.ROUND_BY_ID[roundId]; const p = openPanel(`谈${r.name}`);
  const o = { adj: 0, sell: (r.sell[0] + r.sell[1]) / 2, vam: 0, pref: 1, board: false, anti: false }; let team = [s.positions && s.positions.ipo && SEC_BY_ID[s.positions.ipo] ? s.positions.ipo : 's09_xia']; // 有投融资总监默认带她
  const tabs = (key, opts) => `<div class="tabs">${opts.map(([v, label]) => `<button class="tab ${o[key] === v ? 'on' : ''}" data-k="${key}" data-v="${v}">${label}</button>`).join('')}</div>`;
  const render = () => {
    const q = CP.quoteRound(s, roundId, o); const inv = CP.cap(s).invite && CP.cap(s).invite.round === roundId && now() <= CP.cap(s).invite.until;
    const why = CP.whyNotTalk(s, roundId, team, now()); const rate = CP.talkRate(s, roundId, team, o, inv);
    p.body.innerHTML = `<div class="sd-rec-title">投前估值</div>${CP.negoPre(s, roundId) != null ? `<div class="tr-gain pos">估值谈好了：投前 ${fmtMoney(CP.negoPre(s, roundId))}（这一轮按这个签，不另算溢价）</div>` : `<button class="btn cp-nego" style="width:100%">跟投资人谈估值（一来一回，谈成按谈下来的签）</button><small class="fn-note">不谈也行，直接选 ±20%（溢价越高越难谈成）</small>${tabs('adj', [[-0.1, '−10%'], [0, '按估值'], [0.1, '+10%'], [0.2, '+20%']])}`}
      <div class="sd-rec-title">出让比例</div>${tabs('sell', [[r.sell[0], pct(r.sell[0])], [(r.sell[0] + r.sell[1]) / 2, pct((r.sell[0] + r.sell[1]) / 2)], [r.sell[1], pct(r.sell[1])]])}
      <div class="sd-rec-title">对赌（${(CP.CAP.vam.realMonths / 10).toFixed(1)} 个游戏月净利增长）</div>${tabs('vam', [[0, '不对赌'], ...CP.CAP.vam.growth.map((g) => [g, `+${Math.round(g * 100)}%`])])}
      <div class="sd-rec-title">优先清算 · 董事席位 · 反稀释</div>${tabs('pref', [[1, '1 倍'], [1.5, '1.5 倍']])}${tabs('board', [[false, '不给席位'], [true, '给 1 个董事席位']])}${tabs('anti', [[false, '不反稀释'], [true, '给反稀释']])}
      <div class="sd-rec-title">带谁去（看交际、智慧，最多 2 人）</div><div class="tm-grid">${Object.keys(s.secs).map((id) => `<button class="tm-pick ${team.includes(id) ? 'on' : ''}" data-id="${id}"><img src="${asset(`assets/sec/${id}/${s.secs[id].outfit}.webp`)}" alt=""><small>${SEC_BY_ID[id].name}</small></button>`).join('')}</div>
      <div class="fn-card"><div class="fn-row"><span>投前 / 投后估值</span><b>${fmtMoney(q.pre)} / ${fmtMoney(q.post)}</b></div><div class="fn-row"><span>拿到的钱（进公司，限公司用）</span><b class="pos">${fmtMoney(q.amount)}</b></div><div class="fn-row"><span>你的持股</span><b>${pct(E.stakeOf(s))} → ${pct(E.stakeOf(s) * (1 - q.sell))}</b></div></div>
      <div class="rate">${why ? `<span class="sc-cond">${why}</span>` : `谈成概率 <b>${Math.round(rate * 100)}%</b>${inv ? '（对方主动约的）' : '（自己找上门，难一点）'}`}</div><button class="btn gold big go" ${why ? 'disabled' : ''}>谈 → 签投资协议</button>`;
    p.body.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { const k = b.dataset.k; const v = b.dataset.v; o[k] = v === 'true' ? true : v === 'false' ? false : +v; render(); }));
    p.body.querySelectorAll('.tm-pick').forEach((b) => (b.onclick = () => { const id = b.dataset.id; team = team.includes(id) ? team.filter((x) => x !== id) : [...team, id].slice(-2); render(); }));
    const ng = p.body.querySelector('.cp-nego'); if (ng) ng.onclick = () => openNegotiate({ title: `跟投资人谈${r.name}估值`, who: r.investors[0], fmt: (v) => `投前 ${fmtMoney(v)}`, secs: Object.keys(s.secs), opts: CP.capNegoOpts(s, roundId, team), onDone: (res) => { if (res.deal != null) { CP.setNegoPre(s, roundId, res.deal); toast(`估值谈下来了：投前 ${fmtMoney(res.deal)}`, 2800); game.changed(); game.save(); } render(); } }); // V2-07
    p.body.querySelector('.go').onclick = () => {
      const res = CP.raise(s, roundId, team, o, now()); if (!res.ok) { toast(res.why); return; }
      if (!res.success) toast(`没谈拢（成功率 ${Math.round(res.rate * 100)}%），对方要再想想`, 3000);
      else toast(`${r.name}签了：${res.investor}投 ${fmtMoney(res.amount)}，你持股 ${pct(E.stakeOf(s))}`, 3600);
      game.changed(); game.save(); p.close();
    };
  };
  render();
}
