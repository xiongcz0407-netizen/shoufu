// 「资产 → 房产」里的「地标」一组（第 3-07 项）：公司持有的地标 + 「地标（公司买）」→ 委托经纪、尽调、报价 / 竞标、审批、签约
import * as LMK from '../core/landmark.js?v=47e8f1b5';
import BCFG from '../config/bank.json?v=47e8f1b5' with { type: 'json' };
import { whyNotMa } from '../core/bank.js?v=47e8f1b5';
import { fmtMoney, fmtDuration } from '../core/format.js?v=47e8f1b5';
import { asset, hasAsset } from '../platform/assets.js?v=47e8f1b5';
import { game } from '../game.js?v=47e8f1b5';
import { now } from '../core/clock.js?v=47e8f1b5';
import { h, toast, liveRender } from './dom.js?v=47e8f1b5';
import { openFull } from './shell.js?v=47e8f1b5';
import { openContract } from './contract.js?v=47e8f1b5';
import { nextContractNo } from '../core/contracts.js?v=47e8f1b5';
import { hintLater } from './guide2.js?v=47e8f1b5';
import { HINTS } from './guide.js?v=47e8f1b5';

HINTS.landmark = '地标是公司买的（公司账户 + 并购贷款）：经纪牵线 → 尽调立刻出结果 → 报价或竞标 → 付 10% 定金 → 海外的要过境外投资核准和当地审查（可能被否，被否定金退回）→ 签合同。买下以后每月收租，人脉、眼光大涨。';
const KIND = { office: '写字楼', hotel: '酒店' };
let kindTab = 'office';
const imgPath = (x) => `assets/landmark/${x.id}.webp`;
const pic = (x, cls = 'as-img') => (hasAsset(imgPath(x)) ? `<img class="${cls}" src="${asset(imgPath(x))}" alt="">` : `<div class="${cls} as-ph">${x.name}<small>${x.city}</small></div>`);
const pct = (v) => `${Math.round(v * 100)}%`;
const left = (at) => fmtDuration(Math.max(0, (at - now()) / 1000));

/** 资产页「房产」下面的一组（ui/assets.js 调） */
export function renderLandmarkGroup(wrap, redraw) {
  const s = game.state; const own = LMK.mine(s);
  wrap.appendChild(h('div', 'sd-rec-title', `地标（公司持有 ${own.length}）`));
  if (own.length) {
    const grid = h('div', 'as-grid');
    for (const id of own) {
      const x = LMK.LM[id]; const o = LMK.lm(s).own[id]; const v = LMK.valOf(o); const y = LMK.yearly(x, v); const q = LMK.sellQuote(s, id);
      const c = h('div', 'as-card fr-unique', `${pic(x)}<b>${x.name}</b><small>${x.city} · ${KIND[x.kind]} · 估值 ${fmtMoney(v)}（买入 ${fmtMoney(o.price)}）<br>每月净收 ${fmtMoney(y.net / 12)} · 累计租金 ${fmtMoney(o.rentTotal)}</small>`);
      const b = h('button', 'btn sm', o.selling ? `挂牌中，${fmtDuration(Math.max(0, (o.selling - now()) / 1000))}后成交（取消）` : `卖出 ${fmtMoney(q.amount)}`);
      b.onclick = () => {
        if (o.selling) { LMK.cancelSell(s, id); game.changed(); game.save(); redraw(); return; }
        if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = `确定？估值 95%，增值 ${fmtMoney(q.gain)} 交企业所得税`; return; }
        const r = LMK.startSell(s, id, now()); if (!r.ok) { toast(r.why); return; } toast(`${LMK.LCFG.broker.name}挂牌了，${LMK.LCFG.sellMin} 分钟后成交`, 2600); game.changed(); game.save(); redraw();
      };
      c.appendChild(b); grid.appendChild(c);
    }
    wrap.appendChild(grid);
  }
  const go = h('button', 'btn big', '地标（公司买）'); go.onclick = () => openLandmarks(redraw); wrap.appendChild(go);
}

/** 地标列表：每个一张卡，按进度出按钮 */
export function openLandmarks(done) {
  const p = openFull('地标建筑', { onClose: () => done && done() }); hintLater('landmark');
  const body = h('div', 'page-body'); p.body.append(body);
  const draw = () => {
    const s = game.state; body.innerHTML = '';
    body.appendChild(h('div', 'tr-gain', `公司账户 ${fmtMoney(s.company)}　地标是公司资产，钱从公司账户出，可以贷并购贷款（交易价 60%）。经纪：${LMK.LCFG.broker.name}（成交价 ${LMK.LCFG.broker.fee * 100}%）`));
    const tb = h('div', 'tabs lm-tabs');   // 第 P-07 项：写字楼 / 酒店两栏，按估值从小到大
    for (const [k, n] of Object.entries(KIND)) { const b = h('button', 'tab' + (k === kindTab ? ' on' : ''), `${n} ${LMK.LANDMARKS.filter((x) => x.kind === k).length}`); b.onclick = () => { kindTab = k; draw(); }; tb.appendChild(b); }
    body.appendChild(tb);
    const grid = h('div', 'lm-list');
    for (const x of LMK.LANDMARKS.filter((y) => y.kind === kindTab).sort((a, b) => a.value - b.value)) {
      const d = LMK.lm(s).deals[x.id]; const own = LMK.owns(s, x.id); const y = LMK.yearly(x);
      const appr = x.approvals.length ? x.approvals.map((k) => LMK.LCFG.approvals[k].name.replace(/（.*）/, '')).join(' + ') : '不用审批';
      const c = h('div', 'lm-card' + (own ? ' own' : ''), `${pic(x, 'lm-img')}<div class="lm-info"><b>${x.name}</b><small>${x.country} · ${x.city} · ${KIND[x.kind]} · ${x.deal === 'tender' ? '竞标' : '谈判'}</small>
        <small>估值 <b>${fmtMoney(x.value)}</b>　年租金约 ${fmtMoney(y.rent)}（净 ${fmtMoney(y.net)}）</small><small>审批：${appr}</small><div class="lm-act"></div></div>`);
      const act = c.querySelector('.lm-act'); const btn = (txt, cls, fn, dis) => { const b = h('button', 'btn ' + cls, txt); b.disabled = !!dis; b.onclick = fn; act.appendChild(b); return b; };
      const ok = (r, msg) => { if (!r.ok) { toast(r.why); return false; } if (msg) toast(msg, 2600); game.changed(); game.save(); draw(); return true; };
      if (own) act.innerHTML = '<em class="pos">已持有</em>';
      else if (!d || ['lost', 'rejected'].includes(d.stage)) {
        if (d) act.appendChild(h('small', 'neg', d.stage === 'lost' ? `上次被财团以 ${fmtMoney(d.npc)} 拿走了` : '上次审批没过'));
        const why = LMK.whyNotStart(s, x.id); btn(`委托${LMK.LCFG.broker.name}牵线`, 'gold', () => ok(LMK.start(s, x.id, now()), '经纪开始做尽职调查'), why);
        if (why) act.appendChild(h('small', 'neg', why));
      } else if (d.stage === 'dd') act.appendChild(h('small', '', `尽职调查中，还要 ${left(d.at)}`));
      else if (d.stage === 'offer') {
        act.appendChild(h('small', '', '报价（估值的几成，越低卖方越可能拒）'));
        for (const [k] of LMK.LCFG.offers.negotiate) btn(`${pct(k)} ${fmtMoney(x.value * k)}`, d.tried.includes(k) ? '' : 'gold', () => { const r = LMK.offer(s, x.id, k, now()); if (ok(r) && !r.accepted) toast('卖方拒了这个价，再报高一点'); if (r.accepted) toast(r.why || `谈成了：${fmtMoney(r.price)}，定金 ${fmtMoney(r.deposit)} 进共管账户`, 2600); }, d.tried.includes(k));
      } else if (d.stage === 'tender') {
        act.appendChild(h('small', '', '投标（有财团一起抢，价高者得；没中标要重新委托）'));
        for (const k of LMK.LCFG.offers.tender) btn(`${pct(k)} ${fmtMoney(x.value * k)}`, 'gold', () => { const r = LMK.tender(s, x.id, k, now()); if (ok(r)) toast(r.won ? `中标：${fmtMoney(r.price)}（财团出 ${fmtMoney(r.npc)}）` : `没中：财团出了 ${fmtMoney(r.npc)}`, 2600); });
      } else if (d.stage === 'approve') {
        act.innerHTML = d.steps.map((st) => `<small>${LMK.LCFG.approvals[st.key].name}：${st.ok === true ? '<b class="pos">通过</b>' : st.at ? `审查中，还要 ${left(st.at)}（通过率约 ${pct(LMK.approveRate(s, x, st.key, d.price))}）` : '排队'}</small>`).join('');
        btn('放弃（定金不退）', '', () => { const r = LMK.abandon(s, x.id); ok(r, `放弃了，定金 ${fmtMoney(r.lost)} 不退`); });
      } else if (d.stage === 'ready') {
        const q = LMK.closingQuote(s, x.id);
        act.appendChild(h('small', '', `成交价 ${fmtMoney(d.price)}，签约还要付 ${fmtMoney(q.due)}（尾款 + 税费 + 经纪费）`));
        btn('签资产买卖合同', 'gold', () => closeDeal(x, draw));
      }
      grid.appendChild(c);
    }
    body.appendChild(grid);
  };
  liveRender(body, draw, (fn) => game.onChange(fn));
}

/** 签约：选贷不贷 → 合同 → 签字付款 */
function closeDeal(x, redraw) {
  const s = game.state; const q = LMK.closingQuote(s, x.id); const d = LMK.lm(s).deals[x.id];
  const bk = Object.keys(BCFG.banks).find((k) => !whyNotMa(s, k, d.price, d.price - d.deposit, Math.max(1, Math.floor(q.maxLoan)))) || null;
  const loan = bk && LMK.whyNotClose(s, x.id) ? Math.floor(q.maxLoan) : 0;   // 自有资金够就不贷；不够又能贷就贷到上限
  const why = LMK.whyNotClose(s, x.id, loan, bk); if (why) { toast(why, 3000); return; }
  openContract({ title: LMK.isAbroad(x) ? '资产买卖合同（境外物业）' : '资产买卖合同', no: nextContractNo(s, 'ZC', now()), signer: s.bossName || '老板',
    parties: [['买方', s.companyName || '我的公司'], ['卖方', `${x.name}业主`], ['经纪', LMK.LCFG.broker.name]],
    subject: `${x.country} ${x.city} ${x.name}整栋物业${x.kind === 'hotel' ? '（含酒店经营）' : ''}`,
    rows: [...q.rows, ...(loan ? [['其中：并购贷款', -loan, `${BCFG.banks[bk].name}，以该物业抵押`]] : [])], total: q.due - loan,
    terms: ['买方以公司名义购买，价款从公司账户支付；物业登记在公司名下，计入公司资产。', '租约随物业转让，现有租户继续履行，租金自交割次月起归买方。', ...(x.approvals.length ? ['本次交易已取得境外投资核准及当地监管审查。'] : [])],
    signText: '签字并付款',
    onSign: () => { const r = LMK.close(s, x.id, now(), { loan, bank: bk }); if (!r.ok) { toast(r.why); return; } toast(`${x.name}是你的了：${r.contract.no}`, 3000); game.changed(); game.save(); redraw(); } });
}

game.addTicker((s) => { if (s.landmark) for (const m of LMK.tick(s, now())) toast(m.msg, 2600); });
