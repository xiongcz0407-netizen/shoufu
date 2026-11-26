// 集团架构和节税（第 3-06 项，设计23 第六节）：控股公司 + 子公司、个人持股平台、高新技术企业、境外红筹架构、集团合并报表
// 企业所得税按子公司各算（companytax.quarterTax 的挂钩 setCitHook；年度汇算 fiscal.setAnnualHook）
import * as BK from './books.js?v=a184462c';   // 设计79 第三版
import CFG from '../config/group.json?v=a184462c' with { type: 'json' };
import { pay, receive, canPay } from './ledger.js?v=a184462c';
import { addContract } from './contracts.js?v=a184462c';
import { MONTH_MS, YEAR_MS, monthIndex } from './gametime.js?v=a184462c';
import { TAX, setCitHook } from './companytax.js?v=a184462c';
import { taxRec, setAnnualHook } from './fiscal.js?v=a184462c';
import { gm } from './calib.js?v=a184462c';
import { addMsg } from './inbox.js?v=a184462c';
import { holder, isSec } from './posts.js?v=a184462c';
import { IND_BY_ID } from '../config/industries.js?v=a184462c';
import { liveProducts } from './tech.js?v=a184462c';

export const GCFG = CFG;
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (n) => (Math.abs(n) >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : Math.abs(n) >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);
const cfoBy = (s) => { const m = holder(s, 'cfo'); return isSec(m) ? m : ''; };
const sum = (o) => Object.values(o || {}).reduce((a, x) => a + x, 0);

/** 存档 s.group：{ holding: { at, ready }, platform: { at, ready }, hitech: { at, ready, from, until, scope }, red: { step, at, done: [] }, ytd: { 实体: 应纳税所得额 }, feeMonth, lastQ: [...] } */
export function grp(s) { const g = (s.group = s.group || {}); g.ytd = g.ytd || {}; g.red = g.red || { done: [] }; return g; }
export const baseName = (s) => (String(s.companyName || '').replace(/(股份)?(有限责任公司|有限公司|集团|公司)$/, '').replace(/(商贸|实业|贸易|控股|科技)$/, '') || '我的');
export const holdingName = (s) => `${baseName(s)}控股集团有限公司`;
/** 实体名：每条产业线一家子公司；地标进置业公司；其他进实业公司 */
export function entityName(s, id) {
  if (id === 'holding') return holdingName(s);
  if (id === 'landmark') return `${baseName(s)}置业有限公司`;
  if (IND_BY_ID[id]) return `${baseName(s)}${IND_BY_ID[id].name}有限公司`;
  return `${baseName(s)}实业有限公司`;
}
export const holdingReady = (s) => !!(s.group && s.group.holding && s.group.holding.ready);
export const platformReady = (s) => !!(s.group && s.group.platform && s.group.platform.ready);
export const redchipDone = (s) => !!(s.group && s.group.red && CFG.redchip.steps.every((x) => s.group.red.done.includes(x.key)));   // 设计30 删了香港那一步：旧档 done 里多一个 hk 也算搭好
export function hitechActive(s, t = Date.now()) { const h = s.group && s.group.hitech; return !!(h && h.ready && t < h.until); }
const lines = (s) => Object.keys(s.inds || {}).filter((id) => IND_BY_ID[id]);

// ---------- 控股公司 ----------
export function holdingCost(s) { return CFG.holding.fee + CFG.holding.subFee * lines(s).length; }
export function whyNotHolding(s) {
  if (s.group && s.group.holding) return holdingReady(s) ? '已经成立了' : '正在办';
  if ((s.title || 0) < 2) return '要「老板」称号';
  if (!canPay(s, 'company', holdingCost(s))) return `公司账户还差 ${fmt(holdingCost(s) - s.company)}`;
  return null;
}
export function startHolding(s, t) {
  const why = whyNotHolding(s); if (why) return { ok: false, why };
  const cost = holdingCost(s);
  const ct = addContract(s, { prefix: 'SL', kind: 'group', title: '公司设立登记（控股架构）', parties: [['股东', s.bossName || '老板'], ['登记机关', '市场监督管理局']], subject: `设立${holdingName(s)}，原公司各产业线分拆为全资子公司`, rows: [['控股公司注册、章程、律师费', CFG.holding.fee, ''], [`子公司注册 × ${lines(s).length}`, CFG.holding.subFee * lines(s).length, '每家 2 万']], total: cost, wallet: 'company' }, t);
  pay(s, { wallet: 'company', cat: 'filing', amount: cost, ref: ct.no, party: '律师事务所', by: cfoBy(s), note: `设立${holdingName(s)}和子公司` }, t);
  grp(s).holding = { at: t + CFG.holding.months * MONTH_MS, from: t, ready: false, contract: ct.no };
  return { ok: true, at: grp(s).holding.at };
}
// ---------- 个人持股平台（激励池放进有限合伙，3-03 用） ----------
export function whyNotPlatform(s) {
  if (s.group && s.group.platform) return platformReady(s) ? '已经设好了' : '正在办';
  if (!holdingReady(s)) return '先成立控股公司';
  if (!canPay(s, 'company', CFG.platform.fee)) return '公司账户不够';
  return null;
}
export function startPlatform(s, t) {
  const why = whyNotPlatform(s); if (why) return { ok: false, why };
  pay(s, { wallet: 'company', cat: 'filing', amount: CFG.platform.fee, party: '律师事务所', by: cfoBy(s), note: `设立${baseName(s)}${CFG.platform.name}` }, t);
  grp(s).platform = { at: t + CFG.platform.months * MONTH_MS, from: t, ready: false }; return { ok: true };
}
// ---------- 高新技术企业 ----------
/** 近 12 个游戏月：研发费用、科技收入、全公司收入 */
export function hitechCheck(s, t) {
  const rows = BK.rowsOf(BK.cellsLast12(s, t)).filter((r) => r.wallet === 'company');   // 设计79：近 12 个游戏月按整月，从 books
  const rnd = rows.filter((r) => r.cat === 'rnd').reduce((a, r) => a + r.amount, 0);
  const nm = IND_BY_ID.tech ? IND_BY_ID.tech.name : '科技';
  const rev = rows.filter((r) => r.dir === 'in' && ['revenue', 'acquired_revenue', 'presale', 'rent_co'].includes(r.cat));
  const all = rev.reduce((a, r) => a + r.amount, 0); const tech = rev.filter((r) => (r.note || '').startsWith(nm)).reduce((a, r) => a + r.amount, 0);
  const scope = holdingReady(s) ? 'sub' : 'company';
  const rndRatio = tech > 0 ? rnd / tech : 0; const techShare = all > 0 ? tech / all : 0;
  let why = null;
  if (!s.inds || !s.inds.tech) why = '要有科技线';
  else if (!liveProducts(s).some((p) => p.stage !== 'dev')) why = '要有上线的科技产品';
  else if (rndRatio < CFG.hitech.rndMin) why = `研发费用占科技收入 ${(rndRatio * 100).toFixed(1)}%，要 ≥ ${CFG.hitech.rndMin * 100}%`;
  else if (scope === 'company' && techShare < CFG.hitech.techShareMin) why = `没有控股架构时，科技收入要占全公司 ${CFG.hitech.techShareMin * 100}% 以上（现在 ${(techShare * 100).toFixed(1)}%）；成立控股公司后科技子公司可以单独申请`;
  return { why, rnd, tech, all, rndRatio, techShare, scope };
}
export function whyNotHitech(s, t) {
  const h = s.group && s.group.hitech; if (h && !h.ready) return '在审核';
  if (hitechActive(s, t)) return '已经是高新技术企业了';
  if (!canPay(s, 'company', CFG.hitech.fee)) return '公司账户不够';
  return hitechCheck(s, t).why;
}
export function applyHitech(s, t) {
  const why = whyNotHitech(s, t); if (why) return { ok: false, why };
  const c = hitechCheck(s, t);
  pay(s, { wallet: 'company', cat: 'filing', amount: CFG.hitech.fee, party: '高新认定代理机构', by: cfoBy(s), note: '高新技术企业认定（专利、审计、申报材料）' }, t);
  grp(s).hitech = { at: t + CFG.hitech.months * MONTH_MS, from: t, ready: false, scope: c.scope }; return { ok: true };
}
// ---------- 境外红筹 ----------
export function nextRedStep(s) { const R = grp(s).red; return R.step ? null : CFG.redchip.steps.find((x) => !R.done.includes(x.key)) || null; }
export function whyNotRed(s) {
  const R = grp(s).red; if (redchipDone(s)) return '红筹架构已经搭好了';
  if (R.step) return '上一步还在办';
  if (!holdingReady(s)) return '先成立控股公司';
  const st = nextRedStep(s); if (!canPay(s, 'company', st.fee)) return '公司账户不够';
  return null;
}
export function startRed(s, t) {
  const why = whyNotRed(s); if (why) return { ok: false, why };
  const st = nextRedStep(s); const R = grp(s).red;
  pay(s, { wallet: 'company', cat: 'filing', amount: st.fee, party: st.key === 'safe37' ? '外汇管理局' : '境外律师事务所', by: cfoBy(s), note: `红筹架构：${st.name}` }, t);
  R.step = st.key; R.at = t + CFG.redchip.months * MONTH_MS; return { ok: true, step: st };
}
/** 红筹分红：境内子公司 → 开曼（预提所得税 5%）→ 你的个人现金（个税 20%）。设计30：没有香港中间控股、没有境外账户 */
export function redDividend(s, amount, t) {
  if (!redchipDone(s)) return { ok: false, why: '红筹架构还没搭好' };
  if (!(amount > 0) || !canPay(s, 'company', amount)) return { ok: false, why: '公司账户不够' };
  const wht = r2(amount * CFG.redchip.wht); const net = r2(amount - wht); const ptax = r2(net * CFG.redchip.personal); const by = cfoBy(s);
  pay(s, { wallet: 'company', cat: 'dividend_out', amount: net, party: '开曼控股公司', by, note: `红筹分红：${entityName(s, 'holding')} → 开曼` }, t);
  const c1 = taxRec(s, { kind: '预提所得税（股息 5%）', base: amount, rate: CFG.redchip.wht, amount: wht, payer: 'company', t });
  pay(s, { wallet: 'company', cat: 'tax_company', amount: wht, ref: c1 || '', party: '税务局', by, note: '红筹分红代扣预提所得税 5%' }, t);
  receive(s, { wallet: 'personal', cat: 'dividend_abroad', amount: net, party: '开曼控股公司', note: '红筹分红（开曼不收股息税）' }, t);
  const c2 = taxRec(s, { kind: '红筹分红个税', base: net, rate: CFG.redchip.personal, amount: ptax, t });
  pay(s, { wallet: 'personal', cat: 'tax_personal', amount: ptax, tax: ptax, ref: c2 || '', by, party: '税务局', note: '红筹分红个税 20%', force: true }, t);
  return { ok: true, wht, net, tax: ptax, toYou: r2(net - ptax) };
}

// ---------- 企业所得税：按实体分 ----------
/** 把一段的营收、成本分到各实体：营收、进货按产业线；人工、房租、杂费、附加税按营收比例分摊 */
export function split(s, p) {
  const rev = p.rev || {}, cogs = p.cogs || {}; const total = sum(rev); const common = (p.labor || 0) + (p.rent || 0) + (p.other || 0) + (p.surcharge || 0);
  const ids = Object.keys(rev).filter((k) => rev[k] || (cogs[k] || 0));
  if (!ids.length || total <= 0) return [{ id: 'holding', rev: 0, cogs: 0, cost: common, profit: -common }];
  return ids.map((k) => { const c = common * (rev[k] || 0) / total; return { id: k, rev: r2(rev[k] || 0), cogs: r2(cogs[k] || 0), cost: r2(c), profit: r2((rev[k] || 0) - (cogs[k] || 0) - c) }; });
}
/** 实体税率：今年累计 ≤ 300 万小型微利 5%；高新的（科技子公司 / 全公司）15%；否则 25% */
export function rateFor(s, id, ytd, t) {
  if (ytd <= TAX.cit.smallLimitYear) return { rate: TAX.cit.smallRate, why: '小型微利' };
  const h = s.group && s.group.hitech;
  if (hitechActive(s, t) && (h.scope === 'company' || id === 'tech')) return { rate: CFG.hitech.rate, why: '高新技术企业' };
  return { rate: TAX.cit.rate, why: '一般' };
}
const active = (s, t) => holdingReady(s) || (hitechActive(s, t) && s.group.hitech.scope === 'company');
/** 季度预缴的挂钩：返回 null = 用原来的算法 */
export function citHook(s, p, profit, q, t) {
  if (!active(s, t)) return null;
  const g = grp(s);
  if (!holdingReady(s)) { const r = rateFor(s, 'company', s.citYtd || 0, t); const cit = r2(Math.max(0, profit) * r.rate); g.lastQ = [{ id: 'company', name: s.companyName || '公司', profit, rate: r.rate, why: r.why, cit }]; return { cit, note: `企业所得税（${r.why} ${r.rate * 100}%）` }; }
  const rows = split(s, p).map((x) => { g.ytd[x.id] = (g.ytd[x.id] || 0) + x.profit; const r = rateFor(s, x.id, g.ytd[x.id], t); return { ...x, name: entityName(s, x.id), rate: r.rate, why: r.why, cit: r2(Math.max(0, x.profit) * r.rate) }; });
  g.lastQ = rows;
  const cit = r2(rows.reduce((a, x) => a + x.cit, 0));
  return { cit, note: `企业所得税（集团 ${rows.length} 家子公司各自申报）` };
}
/** 年度汇算的挂钩：全年应纳（按实体）；返回 null = 用原来的算法 */
export function annualHook(s, t) {
  if (!active(s, t)) return null;
  const g = grp(s);
  if (!holdingReady(s)) { const p = s.citYtd || 0; const r = rateFor(s, 'company', p, t); return { due: r2(Math.max(0, p) * r.rate), small: r.rate === TAX.cit.smallRate, rate: r.rate }; }
  const rows = Object.entries(g.ytd).map(([id, p]) => { const r = rateFor(s, id, p, t); return { id, profit: p, rate: r.rate, due: r2(Math.max(0, p) * r.rate) }; });
  g.ytd = {};
  return { due: r2(rows.reduce((a, x) => a + x.due, 0)), small: false, rate: 'mix', rows };
}
setCitHook(citHook); setAnnualHook(annualHook);

/** 合并报表：一段数据（季度 / 年度累计）按实体拆开，跟「一家公司」的税比 */
export function consolidated(s, p, t) {
  const rows = split(s, p).map((x) => { const r = rateFor(s, x.id, Math.max(0, x.profit), t); return { ...x, name: holdingReady(s) ? entityName(s, x.id) : (IND_BY_ID[x.id] || { name: x.id === 'landmark' ? '地标' : '其他' }).name, rate: r.rate, why: r.why, cit: r2(Math.max(0, x.profit) * r.rate) }; });
  const profit = r2(rows.reduce((a, x) => a + x.profit, 0)); const rev = r2(rows.reduce((a, x) => a + x.rev, 0));
  const single = rateFor({ ...s, group: holdingReady(s) ? null : s.group }, 'company', profit, t);
  const singleCit = r2(Math.max(0, profit) * (single.rate));
  const groupCit = holdingReady(s) ? r2(rows.reduce((a, x) => a + x.cit, 0)) : singleCit;
  return { rows, rev, profit, groupCit, singleCit, saved: r2(singleCit - groupCit) };
}

// ---------- 到点、每月费用 ----------
export function tick(s, t) {
  if (!s.group) return [];
  const g = grp(s); const out = [];
  if (g.holding && !g.holding.ready && t >= g.holding.at) { g.holding.ready = true; g.feeMonth = monthIndex(s, t); out.push(`${holdingName(s)}成立了：${lines(s).length} 家子公司各自报税，子公司之间分红免企业所得税`); }
  if (g.platform && !g.platform.ready && t >= g.platform.at) { g.platform.ready = true; out.push(`${baseName(s)}${CFG.platform.name}设好了：激励池放进合伙企业`); }
  if (g.hitech && !g.hitech.ready && t >= g.hitech.at) { g.hitech.ready = true; g.hitech.until = g.hitech.at + gm(CFG.hitech.realYears * 12) * MONTH_MS; out.push(`高新技术企业认定通过：${g.hitech.scope === 'sub' ? entityName(s, 'tech') : '公司'}企业所得税 15%（${Math.round(gm(CFG.hitech.realYears * 12) * 10) / 10} 个游戏月后要重新认定）`); }
  const R = g.red; if (R.step && t >= R.at) { const st = CFG.redchip.steps.find((x) => x.key === R.step); R.done.push(R.step); R.step = null; out.push(`红筹架构：${st.name}办好了${redchipDone(s) ? '（全部搭好，可以走红筹分红，也能去港股、纳斯达克上市）' : ''}`); }
  if (holdingReady(s)) {
    const m = monthIndex(s, t); if (g.feeMonth == null) g.feeMonth = m;
    while (g.feeMonth < m) {
      g.feeMonth += 1; const at = s.createdAt + g.feeMonth * MONTH_MS; const n = lines(s).length;
      const fee = r2((CFG.holding.holdingYearly + CFG.holding.subYearly * n) / 12);
      pay(s, { wallet: 'company', cat: 'outsource', amount: fee, force: true, party: '会计师事务所', by: cfoBy(s), note: `集团 ${n + 1} 家公司代账、审计、年报（每月）` }, at);
      s.qtr = s.qtr || {}; s.qtr.other = (s.qtr.other || 0) + fee;
    }
  }
  for (const x of out) addMsg(s, { kind: 'system', type: 'group', title: '集团架构', body: x }, t);
  return out;
}
