// 买房商店里香港 / 海外那几处（第 2-14 项）。设计30：「财富 → 境外」页整个去掉，海外房产到「老板」用个人现金买
import * as OF from '../core/offshore.js?v=6993e46b';
import * as INB from '../core/inbox.js?v=6993e46b';
import { fmtMoney } from '../core/format.js?v=6993e46b';
import { game } from '../game.js?v=6993e46b';
import { now } from '../core/clock.js?v=6993e46b';
import { h, toast } from './dom.js?v=6993e46b';
import { openContract } from './contract.js?v=6993e46b';
import { nextContractNo } from '../core/contracts.js?v=6993e46b';

/** 买房商店里香港 / 海外那几处的卡片（ui/assets.js 调） */
export function abroadCard(it, draw, pic, badges, frameCls) {
  const s = game.state; const t = now(); const c = OF.houseCfg(it.id); const q = OF.quote(s, it.id);
  const own = (s.garage.houses || []).includes(it.id); const why = own ? null : OF.whyNot(s, it.id, t); const a = OF.ab(s).appr[it.id];
  let act;
  if (own) act = '<em class="owned">已拥有</em>';
  else if (c.approval && (s.title || 0) >= OF.OCFG.minTitle && (!a || (t >= a.at && !a.ok))) act = `<button class="btn gold appr two">申请：${c.approval.name}<small>等 ${c.approval.waitMin} 分钟${c.approval.chance ? '，看人脉' : ''}</small></button>`;
  else if (why) act = `<div class="sc-cond">${why}</div>`;
  else act = '<button class="btn gold buy">签合同（个人现金付）</button>';
  const card = h('div', 'as-card ' + frameCls(it) + (why && !own ? ' dim' : ''), `${pic(it)}${badges(it)}<b>${it.city} · ${it.name}</b><small>${fmtMoney(it.price)}　税费 ${fmtMoney(q.total - it.price)}　${it.area} ㎡</small><small class="note">${q.rows.slice(1).map((r) => r[0]).join('、') || '买的时候不多交'}${c.yearly.length ? `；每年 ${c.yearly.map((y) => y[0]).join('、')}` : ''}</small>${act}`);
  const on = (sel, fn) => { const x = card.querySelector(sel); if (x) x.onclick = fn; };
  on('.appr', () => { const r = OF.applyApproval(s, it.id, now()); if (!r.ok) { toast(r.why); return; } toast('申请交上去了'); game.changed(); game.save(); draw(); });
  on('.buy', () => openContract({ title: c.doc, sub: c.docEn ? `当地原名：${c.docEn}` : '', no: nextContractNo(s, 'HW', now()), signer: s.bossName || '老板', parties: [['买方', s.bossName || '老板'], ['卖方', `${it.city}业主（当地律师代理）`]],
    subject: `${it.city} · ${it.name}，${it.area} ㎡`, rows: q.rows, total: q.total,
    terms: ['买方以个人现金一次性全款支付，不涉及贷款、抵押。', '买方为外国买家，按当地规定缴纳外国买家税费。', '交易经当地律师（产权律师 / 公证人）办理过户登记。'],
    onSign: () => { const r = OF.buy(s, it.id, now()); if (!r.ok) { toast(r.why); return; } toast(`签好了：${r.contract.no}${r.visa ? `；拿到 ${r.visa.name}（人脉 +${r.visa.network}）` : ''}`, 2600); game.changed(); game.save(); draw(); } }));
  return card;
}

// 每秒：开户、备案、审批到点进消息；海外房产每年的税
game.addTicker((s) => { for (const x of OF.tick(s, now())) { toast(x, 2600); INB.addMsg(s, { kind: 'system', type: 'abroad', title: x, body: '资产 → 房产 → 去买房 → 海外' }, now()); } });
