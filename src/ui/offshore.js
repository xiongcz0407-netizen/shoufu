// 「财富 → 境外」+ 买房商店里香港 / 海外那几处（第 2-14 项）
import * as OF from '../core/offshore.js?v=1236a42d';
import * as INB from '../core/inbox.js?v=1236a42d';
import { SEC_BY_ID } from '../config/secretaries.js?v=1236a42d';
import { holder, isSec } from '../core/posts.js?v=1236a42d';
import { fmtMoney, fmtDuration } from '../core/format.js?v=1236a42d';
import { asset, hasAsset } from '../platform/assets.js?v=1236a42d';
import { game } from '../game.js?v=1236a42d';
import { now } from '../core/clock.js?v=1236a42d';
import { h, toast, liveRender } from './dom.js?v=1236a42d';
import { openContract } from './contract.js?v=1236a42d';
import { nextContractNo } from '../core/contracts.js?v=1236a42d';
import { ITEM } from '../core/assets.js?v=1236a42d';
import { hintLater } from './guide2.js?v=1236a42d';

const usd = (cny) => OF.fmtCcy(cny, 'USD');

/** 「财富 → 境外」 */
export function renderOffshore(body, ctx) {
  const wrap = h('div'); body.appendChild(wrap); hintLater('offshore');
  const draw = () => {
    const s = game.state; const t = now(); const d = OF.ab(s); wrap.innerHTML = '';
    wrap.appendChild(h('div', 'sum-card', `<div><small>境外账户</small><b>${usd(OF.balance(s))}</b><small>≈ ${fmtMoney(OF.balance(s))}</small></div><div><small>香港子公司</small><b>${OF.fmtCcy(d.hk, 'HKD')}</b><small>≈ ${fmtMoney(d.hk)}</small></div>`));
    wrap.appendChild(h('div', 'tr-gain', `照真实外汇规定：个人每年只能购汇 5 万美元；大钱走公司境外投资（ODI）→ 香港子公司 → 分红到境外账户（境外所得交 20%）。香港和海外的房子只能用境外账户付。汇率：美元 ${OF.FX.USD}、港币 ${OF.FX.HKD}、欧元 ${OF.FX.EUR}、英镑 ${OF.FX.GBP}、加元 ${OF.FX.CAD}、澳元 ${OF.FX.AUD}、日元 ${OF.FX.JPY}`));
    // 1. 开户
    const r1 = h('div', 'tr-course', d.open ? `<div><b>境外账户 ✓</b><div class="tr-gain">${OF.OCFG.open.bank}，个人多币种账户</div></div>`
      : d.applyAt ? `<div><b>开境外账户</b><div class="tr-gain">约好了面签，还剩 ${fmtDuration((d.applyAt - t) / 1000)}</div></div>`
      : `<div><b>开境外账户</b><div class="tr-gain">${OF.OCFG.open.bank}面签开户，等 10 分钟；个人金融资产要 ≥ 100 万港币（约 ${fmtMoney(OF.minAssets())}）</div></div><button class="btn">去面签</button>`);
    const b1 = r1.querySelector('.btn'); if (b1) b1.onclick = () => { const r = OF.applyOpen(s, now()); if (!r.ok) { toast(r.why); return; } toast('约好了，10 分钟后去香港面签'); game.changed(); game.save(); };
    wrap.appendChild(r1);
    // 2. 个人购汇
    if (d.open) {
      const left = OF.quotaLeftUSD(s, t);
      const r2 = h('div', 'tr-course', `<div><b>个人购汇</b><div class="tr-gain">今年（游戏年）还能换 ${Math.round(left).toLocaleString()} 美元，从个人现金扣</div></div><div class="ind-btns"><button class="btn a">1 万美元</button><button class="btn b">换满</button></div>`);
      const go = (u) => { const r = OF.buyFx(s, u, now()); if (!r.ok) { toast(r.why); return; } toast(`换了 ${Math.round(u).toLocaleString()} 美元（${fmtMoney(r.cny)}）`); game.changed(); game.save(); };
      r2.querySelector('.a').onclick = () => go(Math.min(1e4, left)); r2.querySelector('.b').onclick = () => go(left);
      r2.querySelectorAll('.btn').forEach((b) => { b.disabled = left < 1; });
      wrap.appendChild(r2);
    }
    // 3. ODI
    const od = d.odi; const steps = OF.OCFG.odi.steps;
    const st = od ? steps.map(([, n], i) => `${i < od.step ? '✓' : i === od.step && !od.done ? '⏳' : '·'} ${n}`).join('　') : steps.map(([, n]) => n).join(' → ');
    const r3 = h('div', 'tr-course', `<div><b>香港子公司（ODI）</b><div class="tr-gain">${st}${od && !od.done ? `　还剩 ${fmtDuration((od.at - t) / 1000)}` : ''}${!od ? `　每个备案等 10 分钟，代办费 ${fmtMoney(OF.OCFG.odi.fee)}（公司付）` : ''}</div></div>${!od ? '<button class="btn">开始备案</button>' : ''}`);
    const b3 = r3.querySelector('.btn'); if (b3) b3.onclick = () => { const r = OF.startOdi(s, now()); if (!r.ok) { toast(r.why); return; } toast('发改委备案提交了'); game.changed(); game.save(); };
    wrap.appendChild(r3);
    if (OF.odiDone(s)) {
      const cfo = holder(s, 'cfo');
      const r4 = h('div', 'tr-course', `<div><b>汇钱过去 / 分红回来</b><div class="tr-gain">公司账户 ${fmtMoney(s.company)} → 香港子公司；子公司分红：没搭红筹回公司账户，搭好红筹到境外账户（交 20%）（${isSec(cfo) ? `${SEC_BY_ID[cfo].name}代报` : '自己申报'}）</div></div>`);
      const btns = h('div', 'ind-btns');
      for (const [lab, fn] of [['汇 1000 万过去', () => OF.invest(s, 1e7, now())], ['汇 1 亿过去', () => OF.invest(s, 1e8, now())], ['全部分红回来', () => OF.dividend(s, d.hk, now())]]) {
        const b = h('button', 'btn', lab); b.onclick = () => { const r = fn(); if (!r.ok) { toast(r.why); return; } toast(r.toCompany ? `分红汇回公司账户 ${fmtMoney(r.net)}（要分到个人得先搭红筹架构：财务 → 集团）` : r.tax != null ? `分红到账 ${fmtMoney(r.net)}，境外所得个税 ${fmtMoney(r.tax)}` : `汇出去了：${r.contract.no}`, 2600); game.changed(); game.save(); }; btns.appendChild(b);
      }
      wrap.append(r4, btns);
    }
    // 4. 名下的海外房子
    const mine = (s.garage.houses || []).filter((id) => OF.isAbroad(ITEM[id]));
    if (mine.length) wrap.appendChild(h('div', 'tr-gain', `名下海外房产 ${mine.length} 处（资产 → 房产）；当地每年的房产税 / 财富税 ${fmtMoney(OF.yearlyAll(s))}，从境外账户扣`));
  };
  ctx.onCleanup(liveRender(wrap, draw, (fn) => game.onChange(fn), body));
}

/** 买房商店里香港 / 海外那几处的卡片（ui/assets.js 调） */
export function abroadCard(it, draw, pic, badges, frameCls) {
  const s = game.state; const t = now(); const c = OF.houseCfg(it.id); const q = OF.quote(s, it.id);
  const own = (s.garage.houses || []).includes(it.id); const why = own ? null : OF.whyNot(s, it.id, t); const a = OF.ab(s).appr[it.id];
  let act;
  if (own) act = '<em class="owned">已拥有</em>';
  else if (c.approval && OF.isOpen(s) && (!a || (t >= a.at && !a.ok))) act = `<button class="btn gold appr two">申请：${c.approval.name}<small>等 ${c.approval.waitMin} 分钟${c.approval.chance ? '，看人脉' : ''}</small></button>`;
  else if (why) act = `<div class="sc-cond">${why}</div>`;
  else act = '<button class="btn gold buy">签合同（境外账户付）</button>';
  const card = h('div', 'as-card ' + frameCls(it) + (why && !own ? ' dim' : ''), `${pic(it)}${badges(it)}<b>${it.city} · ${it.name}</b><small>${fmtMoney(it.price)}（${OF.fmtCcy(it.price, c.ccy)}）　税费 ${fmtMoney(q.total - it.price)}　${it.area} ㎡</small><small class="note">${q.rows.slice(1).map((r) => r[0]).join('、') || '买的时候不多交'}${c.yearly.length ? `；每年 ${c.yearly.map((y) => y[0]).join('、')}` : ''}</small>${act}`);
  const on = (sel, fn) => { const x = card.querySelector(sel); if (x) x.onclick = fn; };
  on('.appr', () => { const r = OF.applyApproval(s, it.id, now()); if (!r.ok) { toast(r.why); return; } toast('申请交上去了'); game.changed(); game.save(); draw(); });
  on('.buy', () => openContract({ title: c.doc, sub: c.docEn ? `当地原名：${c.docEn}` : '', no: nextContractNo(s, 'HW', now()), signer: s.bossName || '老板', parties: [['买方', s.bossName || '老板'], ['卖方', `${it.city}业主（当地律师代理）`]],
    subject: `${it.city} · ${it.name}，${it.area} ㎡`, rows: q.rows, total: q.total,
    terms: ['买方以境外账户资金一次性全款支付，不涉及贷款、抵押。', '买方为外国买家，按当地规定缴纳外国买家税费。', '交易经当地律师（产权律师 / 公证人）办理过户登记。'],
    onSign: () => { const r = OF.buy(s, it.id, now()); if (!r.ok) { toast(r.why); return; } toast(`签好了：${r.contract.no}${r.visa ? `；拿到 ${r.visa.name}（人脉 +${r.visa.network}）` : ''}`, 2600); game.changed(); game.save(); draw(); } }));
  return card;
}

// 每秒：开户、备案、审批到点进消息；海外房产每年的税
game.addTicker((s) => { for (const x of OF.tick(s, now())) { toast(x, 2600); INB.addMsg(s, { kind: 'system', type: 'abroad', title: x, body: '财富 → 境外' }, now()); } });
