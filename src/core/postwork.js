// 职位上的人每天干的活（设计16 第二节）：店长自动招人 + 托管（升级 / 开分店）+ 经营月报 + 小事故；
// 财务总监自动申报 / 算错 / 小微企业提醒 / 现金流预警 / 分红建议；资产管家出租（豪宅、飞机托管包机）+ 资产月报；
// 外包；授权额度和请示；秘书绩效 / 提成
import * as CF from './cashflow.js?v=701a82d3'; // V0.2.3
import P from '../config/posts.json?v=701a82d3' with { type: 'json' };
import { IND_BY_ID } from '../config/industries.js?v=701a82d3';
import { SEC_BY_ID } from '../config/secretaries.js?v=701a82d3';
import { HOUSES } from '../config/estates.js?v=701a82d3';
import { PLANES } from '../config/vehicles.js?v=701a82d3';
import * as PO from './posts.js?v=701a82d3';
import * as ST from './staff.js?v=701a82d3';
import * as E from './economy.js?v=701a82d3';
import * as CB from './calib.js?v=701a82d3';
import * as CT from './companytax.js?v=701a82d3';
import * as AC from './accrual.js?v=701a82d3';
import { pay, receive } from './ledger.js?v=701a82d3';
import { addMsg, onAction } from './inbox.js?v=701a82d3';
import { addFavor } from './affection.js?v=701a82d3';
import { MONTH_MS } from './gametime.js?v=701a82d3';
import { fmtMoney } from './format.js?v=701a82d3';
import { taxRec, payerOfPost } from './fiscal.js?v=701a82d3';

const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const nameOf = (who) => (PO.isSec(who) ? SEC_BY_ID[who].name : who === PO.OUT ? '外包' : '');
const byOf = (who) => (PO.isSec(who) ? who : who === PO.OUT ? 'outsource' : '');

// ---------- 财务总监：申报 ----------
let rndFn = Math.random;
CT.setFiler((s, item, t) => {
  const who = PO.holder(s, 'cfo'); if (!who) return null; // 没人管：进消息中心等你申报
  const by = byOf(who);
  if (!PO.isSec(who)) { PO.stat(s, 'cfo').filed += 1; return { by }; }
  PO.stat(s, 'cfo').filed += 1;
  const wit = PO.attrs(s, who).wit;
  if (wit < P.cfo.errBelow && rndFn() < P.cfo.errP) {
    return { by, extra: (s2, it, t2) => { // 算错了：补税 + 滞纳金（真实世界也会这样）
      const add = it.amount * P.cfo.errExtra; const late = add * CT.TAX.lateDailyRate * 30;
      pay(s2, { wallet: 'company', cat: 'tax_company', amount: add + late, force: true, party: '税务局', by, note: `${it.kind}申报算错，补税 + 滞纳金` }, t2);
      addMsg(s2, { kind: 'system', type: 'cfo_err', from: who, title: `${SEC_BY_ID[who].name}报税算错了：补 ${fmtMoney(add + late)}`, body: '智慧还不够，申报出了错。让她去上课，或者换个人当财务总监。' }, t2);
    } };
  }
  return { by };
});
CT.setOnDue((s, item, t) => {
  addMsg(s, { kind: 'request', type: 'tax_file', title: `待申报：${item.kind} ${fmtMoney(item.amount)}`, body: `${item.label}，${CT.TAX.fileDays} 个游戏日内申报（过期每天万分之五滞纳金）。没有财务总监，要你自己报；在「公司 → 职位」安排财务总监或代账公司就会自动申报。`, data: { id: item.id }, actions: [{ key: 'approve', label: '申报缴纳' }] }, t);
});
onAction('tax_file', (s, m, a, t) => { const r = CT.fileDue(s, m.data.id, t); return !!r || true; });

// ---------- 授权和请示 ----------
function ask(s, key, what, cost, data, t) {
  const who = PO.holder(s, key);
  if ((s.inbox || []).some((x) => x.type === 'post_spend' && x.status === 'open' && x.data && x.data.key === key && x.data.act === data.act)) return;
  addMsg(s, { kind: 'request', type: 'post_spend', from: PO.isSec(who) ? who : '', title: `${nameOf(who)}请示：${what} ${fmtMoney(cost)}`, body: PO.isSec(who) ? PO.say(who, 'ask', what, fmtMoney(cost)) : `${what}要 ${fmtMoney(cost)}，超过授权额度。`, data: { key, cost, ...data }, actions: [{ key: 'approve', label: '批准' }, { key: 'reject', label: '驳回' }] }, t);
}
onAction('post_spend', (s, m, a, t) => {
  if (a !== 'approve') return true;
  const d = m.data;
  if (d.act === 'hire') { const ch = ['manager', 'super', 'hq'].includes(d.role) ? 'web' : 'door'; const r = ST.hire(s, PO.indOf(d.key), d.role, d.n, ch, t, rndFn, byOf(PO.holder(s, d.key))); return r.ok; }
  return doSpend(s, d.key, d.act, t, true) !== false;
});
onAction('raise', (s, m, a, t) => { PO.answerRaise(s, m.from, a === 'approve', m.data.to, t, addFavor); return true; });

// ---------- 店长 ----------
/** 升一级 / 开一家能多赚多少（每小时，扣进货、人工、房租） */
export function payback(s, id, act) {
  const ind = s.inds[id]; const cfg = IND_BY_ID[id]; if (['project', 'product', 'media'].includes(cfg.kind)) return null; // 地产、科技另有玩法 // 地产等另有玩法，店长不托管升级
  const rev = E.industryRevenue(s, id); const net = (r) => r * (1 - E.cogsRate(s, id)) * 3600;
  const perH = MONTH_MS / 3600e3; // 一个游戏月多少小时
  if (act === 'up') {
    if (E.whyNotUpgrade(s, id)) return null;
    const cost = E.upCostOf(s, id);
    // 门店：真实经济下每家店的月净利是配好的（core/calib.js gameNet），升一级多赚的就是差额 × 家数（换样子时人工房租也跟着变，已经算在里面）
    const gain = cfg.retail ? (CB.gameNet(cfg, ind.level + 1) - CB.gameNet(cfg, ind.level)) * ind.branches / perH : net(rev / ind.level);
    return { cost, gain, hours: gain > 0 ? cost / gain : Infinity };
  }
  if (E.whyNotBranch(s, id)) return null;
  const cost = E.brCostOf(s, id);
  let gain;
  if (cfg.retail) gain = CB.gameNet(cfg, ind.level) / perH;
  else { const est = ST.estTotal(s, id) / ind.branches; const staffPerStore = est * 5500 * 1.3; const rentPer = cfg.rent[ST.lookOf(s, id)]; gain = net(rev / ind.branches) - (staffPerStore + rentPer) / perH; }
  return { cost, gain, hours: gain > 0 ? cost / gain : Infinity };
}
/** 店长花钱（升级 / 开分店）：force = 你批准过的 */
function doSpend(s, key, act, t, force = false) {
  const id = PO.indOf(key); const who = PO.holder(s, key); if (!id || !who || !s.inds[id]) return false;
  const pb = payback(s, id, act); if (!pb) return false;
  if (pb.cost > AC.available(s)) { if (force) addMsg(s, { kind: 'system', type: 'post_note', title: '批了，但公司可用的钱不够', body: `${IND_BY_ID[id].name}${act === 'up' ? '升级' : '开分店'}要 ${fmtMoney(pb.cost)}` }, t); return force ? true : false; }
  const m = PO.postMeta(s, key); const by = byOf(who);
  if (act === 'br') {
    const p = Math.min(0.95, P.manager.branchBase + PO.power(s, key, t) / 2);
    if (rndFn() >= p) { (m.notes = m.notes || []).push('看中一个铺面，没谈下来'); m.lastTry = t; return true; }
  }
  const ok = act === 'up' ? E.upgrade(s, id, t, by) : E.openBranch(s, id, t, by);
  if (!ok) return false;
  m.host.spent = (m.host.spent || 0) + pb.cost;
  m.done = m.done || { up: 0, br: 0 }; m.done[act] += 1;
  return true;
}
/** 托管：每分钟看一次，回本期短于你设的、预算和可用的钱都够才做；超授权额度发请示 */
function host(s, key, t) {
  const m = PO.postMeta(s, key); if (!m.host.on) return;
  if (m.lastHost && t - m.lastHost < P.manager.hostEverySec * 1000) return;
  m.lastHost = t;
  const id = PO.indOf(key);
  const opts = ['up', 'br'].map((a) => ({ a, ...(payback(s, id, a) || { hours: Infinity }) })).filter((o) => o.hours <= m.host.paybackH).sort((x, y) => x.hours - y.hours);
  for (const o of opts) {
    if (o.cost > (m.host.budget - (m.host.spent || 0))) continue;
    if (o.cost > AC.available(s)) continue;
    if (CF.cushionShort(s, o.cost) > 0) { const nt = `钱只够留两个月工资，${o.a === 'up' ? '先不升级' : '先不开分店'}`; m.notes = m.notes || []; if (!m.notes.includes(nt)) m.notes.push(nt); continue; } /* V0.2.3 托管也留够两个月工资（设计35） */
    if (o.cost > m.auth) { ask(s, key, `${IND_BY_ID[id].name}${o.a === 'up' ? '升一级' : '开一家分店'}`, o.cost, { act: o.a }, t); continue; }
    if (doSpend(s, key, o.a, t)) break;
  }
}
/** （V0.2.4 起不用了：招人交给人事自动补员）店长把她那条线招满编、补流失 */
function autoHire(s, key, t) {
  const id = PO.indOf(key); const who = PO.holder(s, key); if (!who) return;
  for (const [role, n] of Object.entries(ST.shortage(s, id))) {
    const pending = (s.hires || []).filter((h) => h.ind === id && h.role === role).reduce((a, h) => a + h.n, 0);
    const need = n - pending; if (need <= 0) continue;
    const ch = ['manager', 'super', 'hq'].includes(role) ? 'web' : 'door';
    const cost = ST.hireCost(ch, role, need);
    if (cost > PO.postMeta(s, key).auth) { ask(s, key, `${IND_BY_ID[id].name}招${ST.PAY.roles[role].name} ${need} 人`, cost, { act: 'hire', role, n: need }, t); continue; }
    ST.hire(s, id, role, need, ch, t, rndFn, byOf(who));
  }
}

// ---------- 资产管家：出租 ----------
export const RENTABLE = () => [...HOUSES.map((x) => ({ ...x, kind: 'house' })), ...PLANES.map((x) => ({ ...x, kind: 'plane' }))];
/** 年租金（游戏年）= 真实租金回报 × profitMul（验收阶段二 2-16b：豪宅出租、公务机包机的收入乘倍数；物业费、维护费不乘） */
export function rentYear(s, it) { return (it.kind === 'house' ? it.price * (P.steward.houseYield[it.city] || 0.02) : it.price * P.steward.planeCharter) * CB.profitMul(); }
export const canRent = (s) => PO.isSec(PO.holder(s, 'steward'));
export function setRent(s, id, on) {
  if (on && !canRent(s)) return { ok: false, why: '要有资产管家（秘书）才能帮你出租' };
  s.rented = s.rented || {}; if (on) s.rented[id] = true; else delete s.rented[id];
  return { ok: true };
}
export const isRented = (s, id) => !!(s.rented && s.rented[id]);

// ---------- 每秒 ----------
export function tickPosts(s, t, rnd = Math.random) {
  rndFn = rnd; s._t = t;
  for (const key of PO.postKeys(s)) {
    if (PO.kindOf(key) !== 'manager' || !PO.holder(s, key) || !s.inds[PO.indOf(key)]) continue;
    host(s, key, t); /* V0.2.4（设计36 第 3 条）：招满编、补流失交给人事自动补员（cashflow.autoFill），店长不管了 */
  }
  // 财务总监：现金流预警（每个游戏日看一次，一个月最多一次）
  const day = Math.floor((t - s.createdAt) / (MONTH_MS / 30));
  if (s.flags.cfoDay !== day) {
    s.flags.cfoDay = day;
    const who = PO.holder(s, 'cfo');
    if (PO.isSec(who)) {
      const mi = Math.floor((t - s.createdAt) / MONTH_MS);
      if (AC.available(s) < 0 && s.flags.cashWarn !== mi) { s.flags.cashWarn = mi; addMsg(s, { kind: 'system', type: 'cash_warn', from: who, title: '现金流预警：月底的工资和税可能不够', body: `${SEC_BY_ID[who].name}：公司账户 ${fmtMoney(s.company)}，月底要付的 ${fmtMoney(AC.payables(s).total)}。先别升级开店了。` }, t); }
      // 小型微利企业提醒（智慧 ≥ 40）
      const y = Math.floor((t - s.createdAt) / (MONTH_MS * 12));
      const q = s.qtr || {}; const ytd = (s.citYtd || 0) + sum(q.rev) - sum(q.cogs) - (q.labor || 0) - (q.rent || 0);
      if (PO.attrs(s, who).wit >= P.cfo.remindSmallWit && ytd > CT.TAX.cit.smallLimitYear * P.cfo.remindAt && s.flags.smallRemind !== y) {
        s.flags.smallRemind = y;
        addMsg(s, { kind: 'system', type: 'cfo_small', from: who, title: '快超小型微利企业线了', body: `${SEC_BY_ID[who].name}：今年应纳税所得额快到 300 万了，超过以后企业所得税从 5% 变成 25%。可以考虑年底前多投点在升级开店上。` }, t);
      }
    }
  }
}
/** 财务总监的分红建议：留够 3 个月开支后能分多少 */
export function dividendAdvice(s) {
  const L = ST.monthlyLabor(s).total + AC.monthlyRent(s);
  return Math.max(0, Math.floor(AC.available(s) - L * P.cfo.keepMonths));
}

// ---------- 月底 ----------
/** 每条线本月的利润（营收 − 进货 − 这条线的人工 − 房租） */
function lineProfit(s, id) {
  const p = s.period || {}; const rev = (p.rev || {})[id] || 0; const cogs = (p.cogs || {})[id] || 0;
  let labor = 0; const x = s.inds[id];
  for (const [r, n] of Object.entries(x.staff || {})) labor += n * ST.wage(r) * 1.3;
  for (const [r, n] of Object.entries(x.agency || {})) labor += n * ST.wage(r) * 1.15;
  const rent = IND_BY_ID[id].rent[ST.lookOf(s, id)] * x.branches;
  return { rev, cogs, labor, rent, profit: rev - cogs - labor - rent };
}
export function monthPosts(s, m, end, rnd = Math.random) {
  const label = `第${Math.floor(m / 12) + 1}年${(m % 12) + 1}月`;
  s.period = s.period || {};
  const cost = (amt, e) => { if (amt >= 0.01) { pay(s, { ...e, wallet: 'company', amount: amt, force: true }, end); s.period.other = (s.period.other || 0) + amt; } };
  for (const key of PO.postKeys(s)) {
    const who = PO.holder(s, key); const kind = PO.kindOf(key); const st = PO.stat(s, key); const meta = PO.postMeta(s, key);
    if (kind === 'manager' && s.inds[PO.indOf(key)]) {
      const id = PO.indOf(key); const lp = lineProfit(s, id);
      let accident = 0;
      if (PO.isSec(who) && PO.attrs(s, who).manage < P.manager.accidentBelow && rnd() < P.manager.accidentP && lp.profit > 0) {
        accident = lp.profit * (P.manager.accidentMin + rnd() * (P.manager.accidentMax - P.manager.accidentMin));
        cost(accident, { cat: 'loss', by: who, note: `${IND_BY_ID[id].name}小事故（进货积压 / 员工闹离职）` });
      }
      if (PO.isSec(who) && lp.profit > 0) cost(lp.profit * P.posts.manager.perfRate, { cat: 'sec_salary', party: who, by: who, note: `店长绩效（${IND_BY_ID[id].name}利润 1%）` });
      if (who === PO.OUT && lp.profit > 0) cost(lp.profit * P.outsource.manager.profitRate, { cat: 'outsource', party: P.outsource.manager.name, note: `职业经理人提成（${IND_BY_ID[id].name}利润 10%）` });
      if (who) {
        const last = meta.lastProfit; const d = meta.done || { up: 0, br: 0 };
        const what = `${IND_BY_ID[id].name}营收 ${fmtMoney(lp.rev)}、利润 ${fmtMoney(lp.profit - accident)}${last != null ? `（上月 ${fmtMoney(last)}）` : ''}${d.up || d.br ? `，升了 ${d.up} 级、开了 ${d.br} 家，花了预算 ${fmtMoney(meta.host.spent || 0)}` : ''}${accident ? `，出了个小事故亏了 ${fmtMoney(accident)}` : ''}${(meta.notes || []).length ? '，' + meta.notes.join('，') : ''}`;
        addMsg(s, { kind: 'report', type: 'post_report', from: PO.isSec(who) ? who : '', title: `${label}${PO.postName(key)}月报`, body: PO.isSec(who) ? PO.say(who, 'report', what) : what + '。', data: { key, ...lp, accident, gain: st.gain, save: st.save } }, end);
        meta.lastProfit = lp.profit - accident;
      }
      meta.host.spent = 0; meta.done = { up: 0, br: 0 }; meta.notes = [];
    }
    if (kind === 'cfo' && who === PO.OUT) cost(P.outsource.cfo.fee, { cat: 'outsource', party: P.outsource.cfo.name, note: '代账公司服务费（只报税不节税）' });
    if (kind === 'biz' && who === PO.OUT) cost(P.outsource.biz.fee, { cat: 'outsource', party: P.outsource.biz.name, note: '商务咨询公司服务费' });
    if (kind === 'ipo' && who === PO.OUT) cost(P.outsource.ipo.fee, { cat: 'outsource', party: P.outsource.ipo.name, note: 'FA 财务顾问服务费（3-03）' });
    if (kind === 'invest' && who === PO.OUT) cost(P.outsource.invest.fee, { cat: 'outsource', party: P.outsource.invest.name, note: '券商投顾服务费（第 2-09 项）' });
    if (kind === 'collector' && who === PO.OUT) cost(P.outsource.collector.fee, { cat: 'outsource', party: P.outsource.collector.name, note: '古玩行掌眼师傅（第 2-13 项）' });
    if (kind === 'steward' && PO.isSec(who)) {
      let rent = 0;
      for (const it of RENTABLE()) if (isRented(s, it.id)) {
        const amt = rentYear(s, it) / 12; rent += amt;
        const tax = amt * P.steward.rentTax;
        taxRec(s, { kind: '财产租赁所得个税', base: amt, rate: P.steward.rentTax, amount: tax, t: end });
        receive(s, { wallet: 'personal', cat: 'rent_income', amount: amt - tax, tax, by: who, party: it.kind === 'house' ? '租客' : '托管包机公司', note: `${it.name || it.model || it.id}出租（代扣 20% 个税）` }, end);
      }
      if (rent && payerOfPost(s, 'steward') === 'personal') pay(s, { wallet: 'personal', cat: 'family_office', amount: rent * P.posts.steward.rentRate, force: true, party: who, by: who, note: '资产管家出租提成 5%（家族办公室）' }, end);
      else if (rent) cost(rent * P.posts.steward.rentRate, { cat: 'sec_salary', party: who, by: who, note: '资产管家出租提成 5%' });
      st.rent = rent;
      addMsg(s, { kind: 'report', type: 'post_report', from: who, title: `${label}资产月报`, body: PO.say(who, 'report', `租金收了 ${fmtMoney(rent)}（到手 ${fmtMoney(rent * (1 - P.steward.rentTax))}），出租中 ${Object.keys(s.rented || {}).length} 件；维护费打 ${Math.round(PO.stewardUpkeepMult(s) * 100)} 折`), data: { key, rent } }, end);
    }
    s.postStats[key] = { gain: 0, save: 0, rent: 0, filed: 0 };
  }
  // 没申报的税过期一个月：强制扣 + 滞纳金
  for (const d of [...(s.taxDue || [])]) if (end - d.dueT > MONTH_MS / 2) CT.fileDue(s, d.id, end, '');
  // 工资拖欠：秘书好感 −
  if (s.payroll && s.payroll.arrears) for (const id of Object.keys(s.secs)) addFavor(s, id, -5);
  PO.checkRaises(s, end);
}
