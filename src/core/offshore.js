// 香港和海外房产（第 2-14 项，设计20 第五节、设计19 第三节）
// 设计30（11-22）：取消境外账户、个人购汇、ODI；游戏里只有一种钱。称号到「老板」就能买，跟国内一样用个人现金；
// 各地对外国买家的税费照旧（按游戏里的钱算）；新加坡、澳洲、瑞士的当地审批照旧。旧档的境外余额在存档迁移里转回个人现金（core/migrate.js）
import CFG from '../config/offshore.json?v=b846574c' with { type: 'json' };
import { pay, accrue } from './ledger.js?v=b846574c';
import { addContract } from './contracts.js?v=b846574c';
import { ITEM, recalc, freeCash } from './assets.js?v=b846574c';
import { addAttrHook, bossAttrs } from './boss.js?v=b846574c';
import { YEAR_MS } from './gametime.js?v=b846574c';
import { taxRec } from './fiscal.js?v=b846574c';

export const OCFG = CFG;
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (n) => (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : n >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);
const TITLE_NAME = ['打工人', '小老板', '老板', '企业家', '商界名流'];

/** 存档 s.abroad：{ appr: { 房子 id: { at, ok, told } }, visa, taxAt } */
export function ab(s) { const d = (s.abroad = s.abroad || {}); d.appr = d.appr || {}; return d; }

// ---------- 香港和海外房产 ----------
export const isAbroad = (it) => !!it && it.kind === 'house' && it.region && it.region !== 'china';
export const houseCfg = (id) => CFG.houses[id] || { doc: '买卖合同', taxes: [], yearly: [] };
const tiered = (amt, tiers) => { let left = amt, last = 0, fee = 0; for (const [cap, r] of tiers) { const part = Math.min(left, cap - last); if (part <= 0) break; fee += part * r; left -= part; last = cap; } return fee; };
const ownsOtherHome = (s, id) => ((s.garage || {}).houses || []).some((x) => x !== id);
/** 报价：房款 + 当地对外国买家的税费 */
export function quote(s, id) {
  const it = ITEM[id]; const c = houseCfg(id); const p = it.price; const rows = [['房款', p, '个人现金全款']];
  if (c.ptt) { const P = CFG.ptt; const fee = tiered(p, P.tiers) + Math.max(0, p - P.extraFrom) * P.extra; rows.push(['物业转让税 PTT', fee, `首 ${fmt(P.tiers[0][0])} 元 1%、到 ${fmt(P.tiers[1][0])} 元 2%、以上 3%、${fmt(P.extraFrom)} 元以上再 +2%`]); }
  if (c.sdlt) rows.push(['印花税 SDLT', tiered(p, CFG.sdlt.tiers), '分段最高 12%']);
  for (const [name, rate, note] of c.taxes) { if (name.includes('多套') && !ownsOtherHome(s, id)) continue; rows.push([name, p * rate, note || `${+(rate * 100).toFixed(2)}%`]); }
  const out = rows.map((r) => [r[0], r2(r[1]), r[2]]);
  return { rows: out, total: r2(out.reduce((a, r) => a + r[1], 0)) };
}
export function whyNot(s, id, t = Date.now()) {
  const c = houseCfg(id);
  if (((s.garage || {}).houses || []).includes(id)) return '已经有了';
  if ((s.title || 0) < CFG.minTitle) return `要「${TITLE_NAME[CFG.minTitle]}」才能买海外房产`;
  if (c.network && bossAttrs(s).network < c.network) return `人脉 ≥ ${c.network}（现在 ${bossAttrs(s).network}）`;
  if (c.approval) { const a = ab(s).appr[id]; if (!a) return `要先申请：${c.approval.name}`; if (t < a.at) return `${c.approval.name}：审批中`; if (!a.ok) return `${c.approval.name}没批下来，可以再申请`; }
  const q = quote(s, id); if (freeCash(s) < q.total) return `个人现金还差 ${fmt(q.total - freeCash(s))} 元`;
  return null;
}
/** 申请审批（新加坡土地局、澳洲 FIRB、瑞士 Lex Koller）；瑞士按人脉看批不批 */
export function applyApproval(s, id, t, rnd = Math.random) {
  const c = houseCfg(id); if (!c.approval) return { ok: false, why: '这处不用审批' };
  if ((s.title || 0) < CFG.minTitle) return { ok: false, why: `要「${TITLE_NAME[CFG.minTitle]}」才能买海外房产` };
  const a = ab(s).appr[id]; if (a && (t < a.at || a.ok)) return { ok: false, why: a.ok ? '已经批了' : '审批中' };
  const ok = c.approval.chance ? rnd() < Math.min(0.9, Math.max(0.1, bossAttrs(s).network / 100)) : true;
  ab(s).appr[id] = { at: t + c.approval.waitMin * 60e3, ok, told: false };
  return { ok: true, at: ab(s).appr[id].at };
}
export function buy(s, id, t = Date.now()) {
  const it = ITEM[id]; const why = whyNot(s, id, t); if (why) return { ok: false, why };
  const c = houseCfg(id); const q = quote(s, id);
  const ct = addContract(s, { prefix: 'HW', kind: 'house', title: c.doc, sub: c.docEn, parties: [['买方', s.bossName || '老板'], ['卖方', `${it.city}业主（当地律师代理）`]], subject: `${it.city} · ${it.name}，${it.area} ㎡`, rows: q.rows, total: q.total, wallet: 'personal' }, t);
  pay(s, { wallet: 'personal', cat: 'house', amount: it.price, ref: ct.no, party: `${it.city}业主`, note: `${it.city} · ${it.name}` }, t);
  const tax = r2(q.total - it.price); taxRec(s, { kind: `海外购房税费（${it.city}）`, base: it.price, amount: tax, t }); if (tax >= 0.01) pay(s, { wallet: 'personal', cat: 'tax_personal', amount: tax, tax, ref: ct.no, party: `${it.city}税务机关`, note: `${it.city} · ${it.name} ${q.rows.slice(1).map((r) => r[0]).join('、')}` }, t);
  s.garage.houses.push(id); s.garage.meta = s.garage.meta || {};
  s.garage.meta[id] = { price: it.price, at: t, contract: ct.no, channel: 'spot', abroad: true };
  if (c.visa) ab(s).visa = true;
  s.stats = s.stats || {}; s.stats.assetsBought = (s.stats.assetsBought || 0) + 1;
  recalc(s);
  return { ok: true, item: it, contract: ct, quote: q, visa: c.visa };
}
/** 每年当地的房产税 / 财富税（从个人现金扣，按时间算） */
export const yearlyOf = (s, id) => houseCfg(id).yearly.reduce((a, [, r]) => a + ITEM[id].price * r, 0);
export const yearlyAll = (s) => ((s.garage || {}).houses || []).filter((id) => isAbroad(ITEM[id])).reduce((a, id) => a + yearlyOf(s, id), 0);

/** 每秒（离线回来一次补）：审批到点；海外房产每年的税按时间扣。返回要提示的话 */
export function tick(s, t) {
  const d = ab(s); const out = [];
  for (const [id, a] of Object.entries(d.appr)) if (t >= a.at && !a.told) { a.told = true; out.push(`${houseCfg(id).approval.name}：${a.ok ? '批了' : '没批下来'}`); }
  const last = d.taxAt == null ? t : d.taxAt; d.taxAt = t;
  const y = yearlyAll(s); if (y && t > last) accrue(s, 'abroad_tax', 'personal', 'upkeep', y * (t - last) / YEAR_MS, '海外房产每年的房产税 / 财富税', 'out');
  return out;
}
addAttrHook((s) => ({ network: ab(s).visa ? (CFG.houses.house_dxb_1.visa.network || 0) : 0 }));
