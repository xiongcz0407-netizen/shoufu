// 「财富 → 资本」里的「上市」一节（第 3-04 项）+ 「投资」页最上面你自己的股票 + 敲钟剧情
import * as LS from '../core/listing.js?v=b3791cdb';
import { stakeOf } from '../core/economy.js?v=b3791cdb';
import { SEC_BY_ID } from '../config/secretaries.js?v=b3791cdb';
import { fmtMoney, fmtDuration } from '../core/format.js?v=b3791cdb';
import { game } from '../game.js?v=b3791cdb';
import { now } from '../core/clock.js?v=b3791cdb';
import { h, toast } from './dom.js?v=b3791cdb';
import { MONTH_MS } from '../core/gametime.js?v=b3791cdb';
import { playStory } from './story.js?v=b3791cdb';
import { asset, hasAsset } from '../platform/assets.js?v=b3791cdb';
import { CAPITAL_SECTIONS } from './capital.js?v=b3791cdb';
import { HINTS } from './guide.js?v=b3791cdb';
import { hintLater } from './guide2.js?v=b3791cdb';

HINTS.ipo = '上市：选板块（主板、科创板、港股、纳斯达克，条件不一样）→ 选券商 → 股改 → 辅导 1 个游戏月 → 审核 1～2 个游戏月（可能问询，派财务总监回复）→ 选发行比例 → 路演 → 敲钟。募资进公司账户，你的持股被稀释；上市以后身价按市值 × 持股，锁定期过了才能减持。';
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const left = (at) => fmtDuration(Math.max(0, (at - now()) / 1000));
const ok = (r, msg) => { if (!r.ok) { toast(r.why); return false; } if (msg) toast(msg, 2600); game.changed(); game.save(); return true; };
const val = (v) => (typeof v === 'number' ? fmtMoney(v) : v);
let pickBoard = 'main', pickBroker = 0;

function section(el) {
  const s = game.state; const t = now(); const L = s.listing || {};
  el.appendChild(h('div', 'sd-rec-title', '上市'));
  hintLater('ipo');
  if (LS.listed(s)) { el.appendChild(selfCard(s, true)); return; }
  if (!L.stage || L.stage === 'rejected') {
    if (L.stage === 'rejected') el.appendChild(h('div', 'tr-gain neg', '上次审核没通过，可以重新申报'));
    const tabs = h('div', 'tabs'); for (const [k, B] of Object.entries(LS.BOARDS)) { const b = h('button', 'tab' + (k === pickBoard ? ' on' : ''), B.name.replace(/（.*）/, '')); b.onclick = () => { pickBoard = k; pickBroker = 0; game.changed(); }; tabs.appendChild(b); }
    el.appendChild(tabs);
    const B = LS.BOARDS[pickBoard]; const c = LS.conditions(s, pickBoard, t);
    el.appendChild(h('div', 'fn-card', `<div class="fn-row"><span><b>${B.name}</b></span><b>发行市盈率 ${B.pe} 倍</b></div>${c.items.map(([k, have, need, okk]) => `<div class="fn-row"><span>${k}</span><b class="${okk ? 'pos' : 'neg'}">${val(have)} / ${val(need)}${okk ? ' ✓' : ''}</b></div>`).join('')}<div class="fn-row"><span>预计发行前估值</span><b>${fmtMoney(LS.preMoney(s, pickBoard))}</b></div>`));
    const bt = h('div', 'tabs'); B.brokers.forEach(([n, fee, inq], i) => { const b = h('button', 'tab' + (i === pickBroker ? ' on' : ''), `${n}<small> 承销 ${pct(fee)} · 问询 ${pct(inq, 0)}</small>`); b.onclick = () => { pickBroker = i; game.changed(); }; bt.appendChild(b); });
    el.appendChild(h('div', 'tr-gain', '选券商：贵的承销费高，材料做得好、审核问询少'));
    el.appendChild(bt);
    const why = LS.whyNotStart(s, pickBoard, t);
    const go = h('button', 'btn gold big', `签保荐协议，开始股改（${fmtMoney(LS.LCFG.reform.fee)}）`); go.disabled = !!why; go.onclick = () => ok(LS.start(s, pickBoard, pickBroker, now()), '股改开始了'); el.appendChild(go);
    if (why) el.appendChild(h('div', 'tr-gain neg', why));
    return;
  }
  // 流程中
  const B = LS.BOARDS[L.board]; const order = ['reform', 'tutor', 'review', 'approved', 'roadshow', 'listed']; const cur = L.stage === 'inquiry' || L.stage === 'answering' ? 'review' : L.stage;
  el.appendChild(h('div', 'ipo-steps', order.map((k) => `<span class="${order.indexOf(k) < order.indexOf(cur) ? 'done' : k === cur ? 'on' : ''}">${{ reform: '股改', tutor: '辅导', review: '审核', approved: '注册', roadshow: '发行', listed: '敲钟' }[k]}</span>`).join('<i>›</i>')));
  const box = h('div', 'fn-card', `<div class="fn-row"><span>${B.name} · ${L.broker[0]}</span><b>${LS.STAGE[L.stage]}</b></div>`);
  if (['reform', 'tutor', 'review', 'answering', 'roadshow'].includes(L.stage)) box.appendChild(h('div', 'fn-row', `<span>还要</span><b>${left(L.at)}</b>`));
  if (L.stage === 'review') box.appendChild(h('small', 'fn-note', `问询概率约 ${pct(LS.inquiryRate(s), 0)}（有投融资总监少一些）`));
  if (L.stage === 'inquiry') { const b = h('button', 'btn gold', '回复问询（派财务总监处理）'); b.onclick = () => { const r = LS.answer(s, now()); ok(r, r.who ? `${SEC_BY_ID[r.who].name}去写回复了` : '没有财务总监，券商代写回复'); }; box.appendChild(b); }
  if (L.stage === 'approved') {
    box.appendChild(h('small', 'fn-note', '选发行比例（新股占发行后总股本）：发得多募资多，你的持股稀释得也多'));
    for (const p of LS.LCFG.issue) { const q = LS.issueQuote(s, p); const b = h('button', 'btn', `发 ${pct(p, 0)}：募资 ${fmtMoney(q.raised)}，到账 ${fmtMoney(q.net)}，你剩 ${pct(stakeOf(s) * (1 - p))}`); b.onclick = () => ok(LS.issue(s, p, now()), '路演定价，马上发行'); box.appendChild(b); }
  }
  if (L.stage === 'roadshow') { const q = LS.issueQuote(s, L.issue); box.appendChild(h('small', 'fn-note', `发行 ${pct(L.issue, 0)}，预计募资 ${fmtMoney(q.raised)}，发行价约 ${q.price} 元`)); }
  el.appendChild(box);
}
CAPITAL_SECTIONS.push(section);

/** 你自己的股票（资本页和投资页最上面） */
export function selfCard(s, full = false) {
  const X = s.listing.listed; const t = now(); const ch = X.px / X.issuePx - 1; const mc = LS.marketCap(s);
  const c = h('div', 'fn-card self-stk', `<div class="fn-row"><span><b>${X.name}</b><small>（${X.code} · ${LS.BOARDS[X.board].name.replace(/（.*）/, '')}）</small></span><b class="${ch >= 0 ? 'pos' : 'neg'}">${X.px.toFixed(2)}<small>较发行价 ${ch >= 0 ? '+' : ''}${pct(ch)}</small></b></div>
    <div class="fn-row"><span>市值</span><b>${fmtMoney(mc)}</b></div><div class="fn-row"><span>你持股 ${pct(stakeOf(s), 2)}</span><b class="pos">${fmtMoney(mc * stakeOf(s))}</b></div>
    ${full ? `<div class="fn-row"><span>锁定期</span><b>${t < X.lockUntil ? `还要 ${((X.lockUntil - t) / MONTH_MS).toFixed(1)} 个游戏月` : '已解禁'}</b></div><div class="fn-row"><span>这一期还能减持</span><b>${pct(LS.reduceLeft(s, t), 2)}</b></div><small class="fn-note">每 ${LS.LCFG.reduceEveryMonths} 个游戏月最多减持 ${pct(LS.LCFG.reduceMax, 0)}；限售股按所得 20% 交个税，钱进个人现金。每年年报后按净利 ${pct(LS.LCFG.dividendRatio, 0)} 分红。</small>` : ''}`);
  if (full) {
    const row = h('div', 'ind-btns');
    for (const p of [0.0025, 0.005, 0.01]) { const why = LS.whyNotReduce(s, p, t); const b = h('button', 'btn sm', `减持 ${pct(p, 2)}（约 ${fmtMoney(LS.marketCap(s) * p)}）`); b.disabled = !!why; b.onclick = () => { const r = LS.reduce(s, p, now()); if (ok(r)) toast(`减持到账 ${fmtMoney(r.net)}（个税 ${fmtMoney(r.tax)}）`, 3000); }; row.appendChild(b); }
    c.appendChild(row);
  }
  return c;
}

/** 敲钟剧情（发行完成后第一次回到界面时播） */
function bell(s) {
  const L = s.listing; L.justListed = false; game.save();
  const secs = Object.keys(s.secs || {}).slice(0, 4); const X = L.listed;
  const say = { 知性: '这一路的账，我都记着呢。恭喜你，老板。', 高冷: '……还行。别骄傲，市值要守住。', 元气: '老板！！我们上市啦！我要把这张照片裱起来！', 绿茶: '老板好厉害～今晚的庆功宴，我坐你旁边好不好？', 傲娇: '哼，早就说你能行。……恭喜。' };
  playStory([{ who: 'narr', text: `${LS.BOARDS[X.board].name}，上午九点半。大屏上亮起「${X.name}（${X.code}）」，发行价 ${X.issuePx} 元。` }, { who: 'me', text: '（握住锤子，深吸一口气）' }, { who: 'narr', text: '当——！钟声响起，台下掌声一片。' }, ...secs.map((id) => ({ who: id, text: say[SEC_BY_ID[id].type] || '恭喜老板！' })), { who: 'narr', text: `市值 ${fmtMoney(LS.marketCap(s))}。从今天起，你的公司在股票列表里了。` }],
    { sec: secs[0], title: '敲钟', bg: hasAsset('assets/bg/bg_ipo.webp') ? asset('assets/bg/bg_ipo.webp') : null, bgLabel: '交易所上市大厅' });   // 背景 bg_ipo_上市敲钟（在出）
}
game.addTicker((s) => { if (!s.listing) return; for (const m of LS.tick(s, now())) toast(m, 2600); if (s.listing.justListed) bell(s); });
