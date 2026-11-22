// 境外账户 + 香港和海外房产（第 2-14 项，设计20 第五节、设计19 第三节）
// 照真实外汇规定：个人每年购汇 5 万美元；大钱走公司境外投资（ODI：发改委、商务、外汇三个备案）→ 香港子公司 → 分红到你的境外账户（境外所得 20%）
// 境外账户 = 个人钱包的一部分（记账钱包 offshore，按人民币等值记，显示外币）；香港和海外房产只能用境外账户付，按各地对外国买家的真实税费
import CFG from '../config/offshore.json?v=1236a42d' with { type: 'json' };
import { pay, receive, accrue } from './ledger.js?v=1236a42d';
import { addContract } from './contracts.js?v=1236a42d';
import { ITEM, addAssetHook, recalc, freeCash } from './assets.js?v=1236a42d';
import { addAttrHook, bossAttrs } from './boss.js?v=1236a42d';
import { holder, isSec } from './posts.js?v=1236a42d';
import { YEAR_MS } from './gametime.js?v=1236a42d';
import { taxRec } from './fiscal.js?v=1236a42d';
import GROUP from '../config/group.json?v=1236a42d' with { type: 'json' };

export const OCFG = CFG;
export const FX = CFG.fx;
export const toCcy = (cny, ccy) => cny / FX[ccy];
export const toCny = (amt, ccy) => amt * FX[ccy];
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (n) => (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : n >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);
export const fmtCcy = (cny, ccy = 'USD') => `${fmt(toCcy(cny, ccy))} ${CFG.fxName[ccy]}`;

/** 存档 s.abroad：{ open, applyAt, quota: { year, usd }, odi: { step, at, done }, hk（香港子公司的钱，人民币等值）, appr: { 房子 id: { at, ok, told } }, visa, taxAt }；境外账户余额 s.offshore（人民币等值） */
export function ab(s) { const d = (s.abroad = s.abroad || {}); d.quota = d.quota || { year: -1, usd: 0 }; d.appr = d.appr || {}; d.hk = d.hk || 0; if (s.offshore == null) s.offshore = 0; return d; }
export const isOpen = (s) => !!ab(s).open;
export const balance = (s) => s.offshore || 0;

// ---------- 开户（香港银行面签）----------
export const minAssets = () => toCny(CFG.open.minAssetsHKD, 'HKD');
export function applyOpen(s, t) {
  const d = ab(s); if (d.open) return { ok: false, why: '已经开好了' }; if (d.applyAt) return { ok: false, why: '在等面签' };
  if (freeCash(s) < minAssets()) return { ok: false, why: `个人金融资产要 ≥ 100 万港币（约 ${fmt(minAssets())} 元，现在 ${fmt(freeCash(s))}）` };
  d.applyAt = t + CFG.open.waitMin * 60e3; return { ok: true, at: d.applyAt };
}

// ---------- 个人购汇：每游戏年 5 万美元 ----------
const yearOf = (s, t) => Math.floor((t - s.createdAt) / YEAR_MS);
export function quotaLeftUSD(s, t) { const q = ab(s).quota; return q.year === yearOf(s, t) ? Math.max(0, CFG.quotaUSD - q.usd) : CFG.quotaUSD; }
export function buyFx(s, usd, t) {
  if (!isOpen(s)) return { ok: false, why: '先开境外账户' };
  const left = quotaLeftUSD(s, t); if (usd > left + 1e-6) return { ok: false, why: `今年的购汇额度只剩 ${fmt(left)} 美元（每年 5 万美元）` };
  const cny = r2(toCny(usd, 'USD'));
  if (!pay(s, { wallet: 'personal', cat: 'fx_out', amount: cny, party: '银行', note: `个人购汇 ${fmt(usd)} 美元（汇率 ${FX.USD}）` }, t)) return { ok: false, why: '个人现金不够' };
  receive(s, { wallet: 'offshore', cat: 'fx_in', amount: cny, party: CFG.open.bank, note: `购汇 ${fmt(usd)} 美元汇入境外账户` }, t);
  const q = ab(s).quota; if (q.year !== yearOf(s, t)) { q.year = yearOf(s, t); q.usd = 0; } q.usd += usd;
  recalc(s); return { ok: true, cny };
}

// ---------- ODI：公司在香港设子公司 ----------
export const odiDone = (s) => !!(ab(s).odi && ab(s).odi.done);
export function startOdi(s, t) {
  const d = ab(s); if (d.odi) return { ok: false, why: d.odi.done ? '香港子公司已经设好了' : '备案在走' };
  if (!pay(s, { wallet: 'company', cat: 'filing', amount: CFG.odi.fee, party: '代办机构', note: '境外投资（ODI）三个备案代办费' }, t)) return { ok: false, why: '公司账户不够代办费' };
  d.odi = { step: 0, at: t + CFG.odi.waitMin * 60e3, done: false }; return { ok: true };
}
/** 公司账户的钱作为投资汇到香港子公司 */
export function invest(s, cny, t) {
  if (!odiDone(s)) return { ok: false, why: '三个备案还没走完' };
  const ct = addContract(s, { prefix: 'ODI', kind: 'odi', title: '境外投资汇出（ODI）业务登记凭证', parties: [['境内投资主体', s.companyName || '公司'], ['境外企业', `${s.companyName || '公司'}（香港）有限公司`]], subject: '对香港子公司增资', rows: [['汇出金额', cny, `约 ${fmtCcy(cny, 'HKD')}`]], total: cny, wallet: 'company' }, t);
  if (!pay(s, { wallet: 'company', cat: 'odi_out', amount: cny, ref: ct.no, party: '香港子公司', note: `ODI 汇出 ${fmtCcy(cny, 'HKD')}` }, t)) { s.contracts.pop(); return { ok: false, why: '公司账户不够' }; }
  ab(s).hk = r2(ab(s).hk + cny); recalc(s); return { ok: true, contract: ct };
}
/** 香港子公司分红到你的境外账户：香港不收股息税；境外所得 20% 申报（有财务总监她代报） */
/** 香港子公司分红：没搭红筹 → 汇回境内母公司（公司账户）；搭好红筹（第 3-06 项）→ 经开曼到你的境外账户，交境外所得个税 */
const redDone = (s) => !!(s.group && s.group.red && s.group.red.done && s.group.red.done.length === GROUP.redchip.steps.length);
export function dividend(s, cny, t) {
  const d = ab(s); if (cny > d.hk + 1e-6) return { ok: false, why: `香港子公司只有 ${fmtCcy(d.hk, 'HKD')}` };
  const who = holder(s, 'cfo'); const by = isSec(who) ? who : '';
  if (!redDone(s)) { d.hk = r2(d.hk - cny); receive(s, { wallet: 'company', cat: 'odi_dividend', amount: cny, by, party: '香港子公司', note: '香港子公司分红汇回境内母公司（香港不收股息税；要分到个人得先搭红筹架构）' }, t); recalc(s); return { ok: true, tax: 0, net: cny, by, toCompany: true }; }
  d.hk = r2(d.hk - cny); const tax = r2(cny * CFG.odi.dividendTax);
  receive(s, { wallet: 'offshore', cat: 'dividend_abroad', amount: cny, party: '香港子公司', note: '香港子公司分红（经开曼控股到个人，香港不收股息税）' }, t);
  taxRec(s, { kind: '境外所得个税', base: cny, rate: CFG.odi.dividendTax, amount: tax, t });
  pay(s, { wallet: 'offshore', cat: 'tax_personal', amount: tax, tax, by, party: '税务局', note: `境外所得个税 20%（${by ? '财务总监代为申报' : '自行申报'}）`, force: true }, t);
  recalc(s); return { ok: true, tax, net: r2(cny - tax), by };
}

// ---------- 香港和海外房产 ----------
export const isAbroad = (it) => !!it && it.kind === 'house' && it.region && it.region !== 'china';
export const houseCfg = (id) => CFG.houses[id] || { ccy: 'USD', doc: '买卖合同', taxes: [], yearly: [] };
const tiered = (amt, tiers) => { let left = amt, last = 0, fee = 0; for (const [cap, r] of tiers) { const part = Math.min(left, cap - last); if (part <= 0) break; fee += part * r; left -= part; last = cap; } return fee; };
const ownsOtherHome = (s, id) => ((s.garage || {}).houses || []).some((x) => x !== id);
/** 报价（人民币）：房款 + 当地对外国买家的税费 */
export function quote(s, id) {
  const it = ITEM[id]; const c = houseCfg(id); const p = it.price; const rows = [['房款', p, `约 ${fmtCcy(p, c.ccy)}，境外账户全款`]];
  if (c.ptt) { const P = CFG.ptt; const cad = toCcy(p, 'CAD'); const fee = tiered(cad, P.tiers) + Math.max(0, cad - P.extraFrom) * P.extra; rows.push(['物业转让税 PTT', toCny(fee, 'CAD'), '首 20 万加元 1%、到 200 万 2%、以上 3%、300 万以上再 +2%']); }
  if (c.sdlt) rows.push(['印花税 SDLT', toCny(tiered(toCcy(p, 'GBP'), CFG.sdlt.tiers), 'GBP'), '分段最高 12%']);
  for (const [name, rate, note] of c.taxes) { if (name.includes('多套') && !ownsOtherHome(s, id)) continue; rows.push([name, p * rate, note || `${+(rate * 100).toFixed(2)}%`]); }
  const out = rows.map((r) => [r[0], r2(r[1]), r[2]]);
  return { rows: out, total: r2(out.reduce((a, r) => a + r[1], 0)) };
}
export function whyNot(s, id, t = Date.now()) {
  const it = ITEM[id]; const c = houseCfg(id);
  if (((s.garage || {}).houses || []).includes(id)) return '已经有了';
  if (!isOpen(s)) return '要先开境外账户（财富 → 境外）';
  if (c.network && bossAttrs(s).network < c.network) return `人脉 ≥ ${c.network}（现在 ${bossAttrs(s).network}）`;
  if (c.approval) { const a = ab(s).appr[id]; if (!a) return `要先申请：${c.approval.name}`; if (t < a.at) return `${c.approval.name}：审批中`; if (!a.ok) return `${c.approval.name}没批下来，可以再申请`; }
  const q = quote(s, id); if (balance(s) < q.total) return `境外账户还差 ${fmt(q.total - balance(s))} 元（约 ${fmtCcy(q.total - balance(s), 'USD')}）`;
  return null;
}
/** 申请审批（新加坡土地局、澳洲 FIRB、瑞士 Lex Koller）；瑞士按人脉看批不批 */
export function applyApproval(s, id, t, rnd = Math.random) {
  const c = houseCfg(id); if (!c.approval) return { ok: false, why: '这处不用审批' };
  if (!isOpen(s)) return { ok: false, why: '要先开境外账户' };
  const a = ab(s).appr[id]; if (a && (t < a.at || a.ok)) return { ok: false, why: a.ok ? '已经批了' : '审批中' };
  const ok = c.approval.chance ? rnd() < Math.min(0.9, Math.max(0.1, bossAttrs(s).network / 100)) : true;
  ab(s).appr[id] = { at: t + c.approval.waitMin * 60e3, ok, told: false };
  return { ok: true, at: ab(s).appr[id].at };
}
export function buy(s, id, t = Date.now()) {
  const it = ITEM[id]; const why = whyNot(s, id, t); if (why) return { ok: false, why };
  const c = houseCfg(id); const q = quote(s, id);
  const ct = addContract(s, { prefix: 'HW', kind: 'house', title: c.doc, sub: c.docEn, parties: [['买方', s.bossName || '老板'], ['卖方', `${it.city}业主（当地律师代理）`]], subject: `${it.city} · ${it.name}，${it.area} ㎡`, rows: q.rows, total: q.total, wallet: 'offshore' }, t);
  pay(s, { wallet: 'offshore', cat: 'house', amount: it.price, ref: ct.no, party: `${it.city}业主`, note: `${it.city} · ${it.name}` }, t);
  const tax = r2(q.total - it.price); taxRec(s, { kind: `海外购房税费（${it.city}）`, base: it.price, amount: tax, t }); if (tax >= 0.01) pay(s, { wallet: 'offshore', cat: 'tax_personal', amount: tax, tax, ref: ct.no, party: `${it.city}税务机关`, note: `${it.city} · ${it.name} ${q.rows.slice(1).map((r) => r[0]).join('、')}` }, t);
  s.garage.houses.push(id); s.garage.meta = s.garage.meta || {};
  s.garage.meta[id] = { price: it.price, at: t, contract: ct.no, channel: 'spot', abroad: true };
  if (c.visa) ab(s).visa = true;
  s.stats = s.stats || {}; s.stats.assetsBought = (s.stats.assetsBought || 0) + 1;
  recalc(s);
  return { ok: true, item: it, contract: ct, quote: q, visa: c.visa };
}
/** 每年当地的房产税 / 财富税（从境外账户扣，按时间算） */
export const yearlyOf = (s, id) => houseCfg(id).yearly.reduce((a, [, r]) => a + ITEM[id].price * r, 0);
export const yearlyAll = (s) => ((s.garage || {}).houses || []).filter((id) => isAbroad(ITEM[id])).reduce((a, id) => a + yearlyOf(s, id), 0);

/** 每秒（离线回来一次补）：开户、备案、审批到点；海外房产每年的税按时间扣。返回要提示的话 */
export function tick(s, t) {
  const d = ab(s); const out = [];
  if (d.applyAt && !d.open && t >= d.applyAt) { d.open = true; d.openAt = t; addContract(s, { prefix: 'KH', kind: 'bank', title: '境外银行开户确认书', parties: [['开户人', s.bossName || '老板'], ['银行', CFG.open.bank]], subject: '个人多币种账户（面签开户）', rows: [], total: 0, wallet: 'offshore' }, t); out.push(`境外账户开好了（${CFG.open.bank}）`); }
  if (d.odi && !d.odi.done && t >= d.odi.at) {
    d.odi.step += 1; out.push(`${CFG.odi.steps[d.odi.step - 1][1]}办好了`);
    if (d.odi.step >= CFG.odi.steps.length) { d.odi.done = true; out.push('香港子公司设好了，可以汇钱过去'); } else d.odi.at = t + CFG.odi.waitMin * 60e3;
  }
  for (const [id, a] of Object.entries(d.appr)) if (t >= a.at && !a.told) { a.told = true; out.push(`${houseCfg(id).approval.name}：${a.ok ? '批了' : '没批下来'}`); }
  const last = d.taxAt == null ? t : d.taxAt; d.taxAt = t;
  const y = yearlyAll(s); if (y && t > last) accrue(s, 'abroad_tax', 'offshore', 'upkeep', y * (t - last) / YEAR_MS, '海外房产每年的房产税 / 财富税', 'out');
  return out;
}
/** 身价：境外账户 + 香港子公司的钱（人民币等值） */
export const value = (s) => (s.offshore || 0) + ab(s).hk;
addAssetHook({ value });   // 海外房产每年的税从境外账户扣（tick），不挂进 assets 的维护费（那个从个人现金扣）
addAttrHook((s) => ({ network: ab(s).visa ? (CFG.houses.house_dxb_1.visa.network || 0) : 0 }));
