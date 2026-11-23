// 地标建筑（第 3-07 项，设计19 第四节 + 设计23 第八节）：公司买（公司账户 + 并购贷款）
// 流程：仲梁联行牵线 → 尽职调查 15 分钟 → 谈判报价 / 竞标 → 签意向、付 10% 定金 → 审批（海外：当地审查（设计30 去掉了 ODI），可能被否，被否定金退回）→ 签资产买卖合同付尾款
// 持有：每个游戏月收租（估值 × 真实回报率 × profitMul），运营成本、房产税照真实；人脉、眼光加；身价按估值（公司资产）
import CFG from '../config/landmarks.json?v=876cadde' with { type: 'json' };
import { pay, receive } from './ledger.js?v=876cadde';
import { addContract } from './contracts.js?v=876cadde';
import { MONTH_MS, monthIndex } from './gametime.js?v=876cadde';
import { payTaxItem } from './companytax.js?v=876cadde';
import { taxRec } from './fiscal.js?v=876cadde';
import { profitMul } from './calib.js?v=876cadde';
import { addMsg } from './inbox.js?v=876cadde';
import { holder, isSec } from './posts.js?v=876cadde';
import { addAttrHook, bossAttrs } from './boss.js?v=876cadde';
import { netWorth, addCompanyAssetHook } from './economy.js?v=876cadde';
import { maMax, whyNotMa, maLoan, repay as repayLoan } from './bank.js?v=876cadde';

export const LCFG = CFG;
export const LANDMARKS = CFG.landmarks;
export const LM = Object.fromEntries(LANDMARKS.map((x) => [x.id, x]));
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (n) => (Math.abs(n) >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : Math.abs(n) >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);
const cfoBy = (s) => { const m = holder(s, 'cfo'); return isSec(m) ? m : ''; };
export const STAGE = { dd: '尽职调查中', offer: '可以报价', tender: '可以投标', approve: '审批中', ready: '审批通过，可以签约', lost: '没拿到', rejected: '审批被否' };

/** 存档 s.landmark：{ own: { id: { price, at, contract, rentMonth, rentTotal } }, deals: { id: { stage, at, price, deposit, steps: [{ key, at, ok }], npc, tried: [] } } } */
export function lm(s) { const d = (s.landmark = s.landmark || {}); d.own = d.own || {}; d.deals = d.deals || {}; return d; }
export const owns = (s, id) => !!lm(s).own[id];
export const mine = (s) => Object.keys(lm(s).own).filter((id) => LM[id]);
/** 现在的估值（买入价按月复利涨：现实 3% × profitMul / 游戏年） */
export const valOf = (o) => (o.val != null ? o.val : o.price);
export const value = (s) => (s.landmark ? mine(s).reduce((a, id) => a + valOf(lm(s).own[id]), 0) : 0);
/** 付进共管账户的定金（审批中、待签约），还是公司的钱 */
export const escrow = (s) => (s.landmark ? Object.values(lm(s).deals).filter((d) => ['approve', 'ready'].includes(d.stage)).reduce((a, d) => a + (d.deposit || 0), 0) : 0);
export const isAbroad = (x) => x.country !== '中国';
const freeCompany = (s) => (s.company || 0) - ((s.bank && s.bank.restricted) || 0);

/** 买的时候的税费 */
export function buyTaxes(x, price) { return x.buyTax.map(([name, rate]) => [name, r2(price * rate), rate]); }
/** 每年：租金（× profitMul）、运营成本、房产税（真实） */
export function yearly(x, price = x.value) {
  const rent = price * x.yield * profitMul(); const opex = price * x.opexYear;
  const H = x.holdTax; const tax = !H ? 0 : H.type === 'value' ? price * H.rate : rent * H.rate;
  return { rent: r2(rent), opex: r2(opex), tax: r2(tax), net: r2(rent - opex - tax) };
}

// ---------- 买 ----------
export function whyNotStart(s, id) {
  const x = LM[id]; if (!x) return '没有这个地标';
  if (owns(s, id)) return '已经是你的了';
  const d = lm(s).deals[id]; if (d && !['lost', 'rejected'].includes(d.stage)) return '已经在谈了';
  if ((s.title || 0) < CFG.minTitle) return '要「企业家」才有经纪来牵线';
  if (freeCompany(s) < x.value * CFG.depositRate) return `公司账户至少要有定金 ${fmt(x.value * CFG.depositRate)}（自有资金）`;
  return null;
}
/** 委托仲梁联行牵线，开始尽职调查 */
export function start(s, id, t, rnd = Math.random) {
  const why = whyNotStart(s, id); if (why) return { ok: false, why };
  const x = LM[id];
  const d = { stage: 'dd', at: t + CFG.ddMin * 60e3, from: t, tried: [], npc: x.deal === 'tender' ? Math.round(x.value * (CFG.offers.npcMin + rnd() * CFG.offers.npcSpan)) : 0 };
  lm(s).deals[id] = d; return { ok: true, deal: d };
}
/** 到点推进：尽调完 → 报价 / 投标；审批到点 → 一项一项出结果 */
export function advance(s, t, rnd = Math.random) {
  const out = [];
  for (const [id, d] of Object.entries(lm(s).deals)) {
    const x = LM[id]; if (!x) continue;
    if (d.stage === 'dd' && t >= d.at) { d.stage = x.deal === 'tender' ? 'tender' : 'offer'; out.push({ id, msg: `${x.name}：尽职调查做完了，${x.deal === 'tender' ? '可以投标（有财团一起抢）' : '可以报价'}` }); }
    while (d.stage === 'approve') {
      const st = d.steps.find((z) => z.ok == null); if (!st) { d.stage = 'ready'; out.push({ id, msg: `${x.name}：审批全部通过，可以签资产买卖合同了` }); break; }
      if (t < st.at) break;
      st.ok = rnd() < approveRate(s, x, st.key, d.price);
      const A = CFG.approvals[st.key];
      if (!st.ok) {
        d.stage = 'rejected'; receive(s, { wallet: 'company', cat: 'refund', amount: d.deposit, party: '卖方（共管账户）', note: `${x.name} ${A.name}没通过，定金退回` }, st.at);
        out.push({ id, msg: `${x.name}：${A.name}没通过，交易终止，定金 ${fmt(d.deposit)} 退回` }); break;
      }
      const nx = d.steps.find((z) => z.ok == null); if (nx) nx.at = st.at + CFG.approvals[nx.key].min * 60e3;
      out.push({ id, msg: `${x.name}：${A.name}通过了` });
    }
  }
  return out;
}
/** 审批通过的概率 */
export function approveRate(s, x, key, price = x.value) {
  const A = CFG.approvals[key]; const net = bossAttrs(s).network;
  return Math.min(0.95, A.base + Math.min(A.networkMax, net * A.perNetwork) + (A.rich && netWorth(s) >= price * 3 ? A.rich : 0));
}
/** 谈判：报价 pct（估值的几成），卖方按概率接受；同一个价不能再报 */
export function offer(s, id, pct, t, rnd = Math.random) {
  const x = LM[id]; const d = lm(s).deals[id]; if (!d || d.stage !== 'offer') return { ok: false, why: '现在不能报价' };
  const row = CFG.offers.negotiate.find((z) => Math.abs(z[0] - pct) < 1e-9); if (!row) return { ok: false, why: '报价不对' };
  if (d.tried.includes(pct)) return { ok: false, why: '这个价卖方已经拒过了' };
  d.tried.push(pct);
  if (rnd() >= row[1]) return { ok: true, accepted: false };
  return { ok: true, accepted: true, ...agree(s, id, Math.round(x.value * pct), t) };
}
/** 竞标：出价 ≥ 财团的就中标，否则没拿到（可以重新委托再来） */
export function tender(s, id, pct, t) {
  const x = LM[id]; const d = lm(s).deals[id]; if (!d || d.stage !== 'tender') return { ok: false, why: '现在不能投标' };
  if (!CFG.offers.tender.some((z) => Math.abs(z - pct) < 1e-9)) return { ok: false, why: '出价不对' };
  const price = Math.round(x.value * pct);
  if (price < d.npc) { d.stage = 'lost'; return { ok: true, won: false, npc: d.npc }; }
  return { ok: true, won: true, npc: d.npc, ...agree(s, id, price, t) };
}
/** 谈成 / 中标：签意向书，付 10% 定金进共管账户；有审批就开始审批 */
function agree(s, id, price, t) {
  const x = LM[id]; const d = lm(s).deals[id]; const dep = Math.round(price * CFG.depositRate);
  if (freeCompany(s) < dep) { d.stage = x.deal === 'tender' ? 'lost' : 'offer'; return { why: '公司账户自有资金不够定金' }; }
  const ct = addContract(s, { prefix: 'YX', kind: 'landmark', title: '物业收购意向书', parties: [['买方', s.companyName || '我的公司'], ['卖方', `${x.name}业主`], ['经纪', CFG.broker.name]], subject: `${x.city}${x.name}整栋物业`, rows: [['成交价', price, ''], ['定金（共管账户）', dep, '审批没过全额退回；买方放弃不退']], total: dep, wallet: 'company' }, t);
  pay(s, { wallet: 'company', cat: 'landmark', amount: dep, ref: ct.no, party: '共管账户', note: `${x.name} 收购定金 10%` }, t);
  d.price = price; d.deposit = dep; d.intent = ct.no;
  d.steps = x.approvals.map((k, i) => ({ key: k, at: i === 0 ? t + CFG.approvals[k].min * 60e3 : 0, ok: null }));
  d.stage = d.steps.length ? 'approve' : 'ready';
  return { price, deposit: dep, contract: ct };
}
/** 放弃：审批中 / 待签约放弃 = 违约，定金不退 */
export function abandon(s, id) { const d = lm(s).deals[id]; if (!d) return { ok: false }; const lost = ['approve', 'ready'].includes(d.stage) ? d.deposit : 0; delete lm(s).deals[id]; return { ok: true, lost }; }

/** 签约要付的：尾款 + 税费 + 经纪费 */
export function closingQuote(s, id) {
  const x = LM[id]; const d = lm(s).deals[id]; const price = d.price;
  const tax = buyTaxes(x, price); const fee = r2(price * CFG.broker.fee);
  const rows = [['成交价', price, ''], ['已付定金', -d.deposit, '意向书 ' + d.intent], ...tax.map(([n, a, r]) => [n, a, `${+(r * 100).toFixed(3)}%`]), [`${CFG.broker.name}经纪费`, fee, `${CFG.broker.fee * 100}%`]];
  const due = r2(price - d.deposit + tax.reduce((a, z) => a + z[1], 0) + fee);
  return { rows, due, tax, fee, maxLoan: maMax(s, price, price - d.deposit) };
}
export function whyNotClose(s, id, loan = 0, bk = null) {
  const d = lm(s).deals[id]; if (!d || d.stage !== 'ready') return '还不能签约';
  const q = closingQuote(s, id);
  if (loan > 0) { const w = whyNotMa(s, bk, d.price, d.price - d.deposit, loan); if (w) return w; }
  if (freeCompany(s) + loan < q.due - 1e-6) return `公司账户自有资金还差 ${fmt(q.due - loan - freeCompany(s))}（可以贷并购贷款，最多交易价 60%）`;
  return null;
}
/** 签资产买卖合同、付尾款和税费；可以带并购贷款（以这栋楼抵押） */
export function close(s, id, t, { loan = 0, bank: bk = null } = {}) {
  const why = whyNotClose(s, id, loan, bk); if (why) return { ok: false, why };
  const x = LM[id]; const d = lm(s).deals[id]; const q = closingQuote(s, id);
  let l = null;
  if (loan > 0) {
    l = maLoan(s, bk, `${x.name}（整栋物业）`, loan, t);
    const c = (s.contracts || []).find((z) => z.no === l.contract); if (c) c.subject = `收购${x.city}${x.name}整栋物业（专款专用，受托支付给卖方；以该物业抵押）`;
  }
  const ct = addContract(s, { prefix: 'ZC', kind: 'landmark', title: isAbroad(x) ? '资产买卖合同（境外物业）' : '资产买卖合同', parties: [['买方', s.companyName || '我的公司'], ['卖方', `${x.name}业主`], ['经纪', CFG.broker.name]], subject: `${x.country} ${x.city} ${x.name}整栋物业及配套${x.kind === 'hotel' ? '（含酒店经营）' : ''}`, rows: q.rows, total: q.due, wallet: 'company' }, t);
  pay(s, { wallet: 'company', cat: 'landmark', amount: d.price - d.deposit, force: true, ref: ct.no, party: `${x.name}业主`, note: `${x.name} 收购尾款` }, t);
  for (const [n, a, r] of q.tax) { const cert = taxRec(s, { kind: `${n}（${x.name}）`, base: d.price, rate: r, amount: a, payer: 'company', t }); pay(s, { wallet: 'company', cat: 'tax_company', amount: a, force: true, ref: cert || ct.no, party: isAbroad(x) ? `${x.city}税务` : '税务局', note: `${x.name} ${n}` }, t); }
  pay(s, { wallet: 'company', cat: 'outsource', amount: q.fee, force: true, ref: ct.no, party: CFG.broker.name, note: `${x.name} 经纪费` }, t);
  lm(s).own[id] = { price: d.price, at: t, contract: ct.no, rentMonth: monthIndex(s, t), rentTotal: 0, loan: l ? l.id : null };
  delete lm(s).deals[id];
  s.stats = s.stats || {}; s.stats.landmarks = (s.stats.landmarks || 0) + 1;
  return { ok: true, contract: ct, loan: l };
}

// ---------- 持有：每个游戏月收租 ----------
export function collect(s, t) {
  const out = [];
  for (const id of mine(s)) {
    const o = lm(s).own[id]; const x = LM[id]; const m = monthIndex(s, t);
    while (o.rentMonth < m) {
      o.rentMonth += 1; const at = s.createdAt + o.rentMonth * MONTH_MS; o.val = r2(valOf(o) * Math.pow(1 + CFG.growthReal * profitMul(), 1 / 12)); const y = yearly(x, valOf(o));
      const rent = r2(y.rent / 12), opex = r2(y.opex / 12), tax = r2(y.tax / 12);
      receive(s, { wallet: 'company', cat: 'rent_co', amount: rent, party: x.kind === 'hotel' ? '酒店经营' : '租户', note: `地标 ${x.name} ${x.kind === 'hotel' ? '经营收入' : '租金'}` }, at);
      pay(s, { wallet: 'company', cat: 'outsource', amount: opex, force: true, party: '物业运营', note: `地标 ${x.name} 运营成本` }, at);
      if (tax >= 0.01) payTaxItem(s, { kind: x.holdTax.name, label: x.name, base: x.holdTax.type === 'value' ? valOf(o) : rent, rate: x.holdTax.rate, amount: tax, note: `${x.name} ${x.holdTax.name}` }, at, cfoBy(s));
      for (const k of ['qtr', 'yearAcc']) { const q = (s[k] = s[k] || {}); q.rev = q.rev || {}; q.rev.landmark = (q.rev.landmark || 0) + rent; }
      s.qtr.other = (s.qtr.other || 0) + opex + tax;
      o.rentTotal = r2(o.rentTotal + rent); out.push({ id, rent });
    }
  }
  return out;
}
// ---------- 卖出（验收阶段三）----------
export const sellQuote = (s, id) => { const o = lm(s).own[id]; const amt = r2(valOf(o) * CFG.sellRate); return { amount: amt, gain: r2(amt - o.price), price: o.price, val: valOf(o) }; };
export function whyNotSell(s, id) { const o = lm(s).own[id]; if (!o) return '不是你的'; if (o.selling) return '已经在卖了'; return null; }
/** 委托经纪挂牌出售：15 分钟后成交 */
export function startSell(s, id, t) { const why = whyNotSell(s, id); if (why) return { ok: false, why }; lm(s).own[id].selling = t + CFG.sellMin * 60e3; return { ok: true }; }
export function cancelSell(s, id) { const o = lm(s).own[id]; if (o) delete o.selling; return { ok: true }; }
/** 成交：估值 × 95% 进公司账户；增值部分算进本季度应纳税所得；有并购贷款的先还 */
export function completeSell(s, id, t) {
  const x = LM[id]; const o = lm(s).own[id]; const q = sellQuote(s, id);
  const ct = addContract(s, { prefix: 'ZC', kind: 'landmark', title: isAbroad(x) ? '资产转让合同（境外物业）' : '资产转让合同', parties: [['卖方', s.companyName || '我的公司'], ['买方', '财团买家'], ['经纪', CFG.broker.name]], subject: `${x.country} ${x.city} ${x.name}整栋物业`, rows: [['估值', q.val, ''], ['成交价（估值 95%）', q.amount, '经纪费已扣'], ['当初买入价', q.price, ''], ['增值（计入企业所得税）', q.gain, '']], total: q.amount, wallet: 'company' }, t);
  receive(s, { wallet: 'company', cat: 'landmark_sale', amount: q.amount, ref: ct.no, party: '财团买家', note: `出售地标 ${x.name}` }, t);
  for (const k of ['qtr', 'yearAcc']) { const z = (s[k] = s[k] || {}); z.rev = z.rev || {}; z.rev.landmark = (z.rev.landmark || 0) + q.gain; }   // 增值（亏了就是负的，抵所得）
  let repaid = 0; if (o.loan) { const L = ((s.bank && s.bank.loans) || []).find((z) => z.id === o.loan); if (L) { repaid = L.principal; repayLoan(s, o.loan, t); } }
  delete lm(s).own[id];
  return { ok: true, ...q, contract: ct, repaid };
}
export function tick(s, t, rnd) {
  if (!s.landmark) return [];
  const msgs = advance(s, t, rnd);
  for (const id of mine(s)) { const o = lm(s).own[id]; if (o.selling && t >= o.selling) { const r = completeSell(s, id, o.selling); msgs.push({ id, msg: `${LM[id].name}：卖掉了，到账 ${fmt(r.amount)}（增值 ${fmt(r.gain)} 计入企业所得税${r.repaid ? `；还清并购贷款 ${fmt(r.repaid)}` : ''}）` }); } }
  for (const m of msgs) addMsg(s, { kind: 'system', type: 'landmark', title: m.msg.split('：')[0], body: m.msg }, t);
  collect(s, t);
  return msgs;
}

// ---------- 身价、属性 ----------
addCompanyAssetHook((s) => value(s) + escrow(s));   // 公司资产（按买入价），进公司估值 × 你的持股；并购贷款本金在 loanDebt 里已经算负债
import { addPlaceGate } from './dates.js?v=876cadde';
addPlaceGate((s, pid) => (pid === 'rooftop' && !(s.landmark && mine(s).length) ? '要先有一座地标' : null));   // 楼顶约会（验收阶段三）
addAttrHook((s) => { const n = s.landmark ? mine(s).length : 0; return { network: n * CFG.attr.network, vision: n * CFG.attr.vision }; });
