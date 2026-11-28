// 地产（设计20 第二节 1）：拿地（挂牌竞价）→ 四证 → 开工 → 分 3 批预售（监管账户）→ 交房清算（增值税、土地增值税、所得税）；商业综合体可以持有收租
// 不 import economy（economy 要用这里的 reValue 算身价）
import { capAdd, capPush, capOf } from './cap.js?v=6a9355f4';   // 设计79
import { whyCushion } from './cashflow.js?v=6a9355f4'; // V0.2.3 留够两个月工资
import { credit } from './credit.js?v=6a9355f4'; // V3-01 亲自拍板攒投入度
import C from '../config/realestate.json?v=6a9355f4' with { type: 'json' };
import { pay, receive, canPay } from './ledger.js?v=6a9355f4';
import { payTaxItem, TAX, deduct as deductTax } from './companytax.js?v=6a9355f4';   // 设计93：deductTax 挂钩
import { addContract } from './contracts.js?v=6a9355f4';
import { staffFactor, establishment, fire, PAY } from './staff.js?v=6a9355f4';
import { addMsg, onAction } from './inbox.js?v=6a9355f4';
import { cityOpen, cityName as cityNm } from './cities.js?v=6a9355f4';
import { managerRevMult, holder, isSec } from './posts.js?v=6a9355f4';
import { MONTH_MS, monthIndex } from './gametime.js?v=6a9355f4';
import { gm } from './calib.js?v=6a9355f4';
export { C as RE_CFG };

const MIN = 60e3;
const r2 = (x) => Math.round(x * 100) / 100;
const pick = (rnd, [a, b]) => a + (b - a) * rnd();
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function re(s) { return (s.re = s.re || { listings: [], listMonth: -1, heat: 'normal', projects: [], seq: 0, rentMonth: null, log: [] }); }
const by = (s) => { const m = holder(s, 'manager_realestate'); return isSec(m) ? m : ''; };
const cfoBy = (s) => { const m = holder(s, 'cfo'); return isSec(m) ? m : ''; };
export const heatOf = (s) => C.market.heat[re(s).heat];
export const activeProjects = (s) => re(s).projects.filter((p) => p.stage !== 'done' && p.stage !== 'held');
export const maxProjects = (s) => C.maxProjects[s.title] ?? 0;
export const typesFor = (s) => Object.entries(C.types).filter(([, x]) => s.title >= x.minTitle).map(([k]) => k);

// ---------- 土地市场 ----------
/** 每个游戏月换一批挂牌地块 + 市场冷热 */
export function refreshMarket(s, t, force = false) {
  const R = re(s); const m = monthIndex(s, t);
  if (!force && R.listMonth === m) return false;
  const rnd = rng((s.createdAt % 1e9) + m * 7919 + (force ? R.seq * 31 : 0));
  // 冷热按权重抽
  let x = rnd(), acc = 0; for (const [k, v] of Object.entries(C.market.heat)) { acc += v.w; if (x <= acc) { R.heat = k; break; } }
  const types = typesFor(s); const cities = Object.keys(C.cities).filter((c) => !C.cities[c].small);
  const n = Math.round(pick(rnd, C.market.listings));
  R.listings = R.listings.filter((l) => l.status === 'open' && l.leader === 'me'); // 正在跟你抢的不撤
  for (let i = 0; i < n && types.length; i++) {
    const type = types.length > 1 && rnd() < 0.4 ? types[1] : types[0];
    const T = C.types[type]; const city = cities[Math.floor(rnd() * cities.length)]; const k = C.cities[city].k;
    const landArea = Math.round(pick(rnd, T.landArea) / 100) * 100; const far = Math.round(pick(rnd, T.far) * 10) / 10;
    const gfa = Math.round(landArea * far); const floorPrice = Math.round(pick(rnd, T.floorPrice) * k / 10) * 10;
    const start = floorPrice * gfa;
    R.seq += 1;
    R.listings.push({ id: R.seq, type, city, district: C.districts[city][Math.floor(rnd() * 4)], landArea, far, gfa, floorPrice, start, cur: start,
      npcMax: Math.round(start * (1 + pick(rnd, C.market.npcMaxPremium))), npcName: C.market.npcNames[Math.floor(rnd() * C.market.npcNames.length)], npcRaises: 0, leader: null, status: 'open', month: m }); // NPC 用编的名字（验收阶段二）
  }
  // 小地块：郊区 / 二线城市的住宅（验收阶段二 2-16b）
  if (types.includes('residential')) {
    const smalls = Object.keys(C.cities).filter((c) => C.cities[c].small); const S = C.small; const ns = Math.round(pick(rnd, S.listings));
    for (let i = 0; i < ns; i++) {
      const city = smalls[Math.floor(rnd() * smalls.length)]; const far = Math.round(pick(rnd, S.far) * 10) / 10;
      const gfa = Math.round(pick(rnd, S.gfa) / 100) * 100; const landArea = Math.round(gfa / far / 100) * 100; const floorPrice = Math.round(pick(rnd, S.floorPrice) / 10) * 10; const start = floorPrice * gfa;
      R.seq += 1;
      R.listings.push({ id: R.seq, type: 'residential', small: true, city, district: C.districts[city][Math.floor(rnd() * 4)], landArea, far, gfa, floorPrice, start, cur: start,
        npcMax: Math.round(start * (1 + pick(rnd, C.market.npcMaxPremium))), npcName: C.market.npcNames[Math.floor(rnd() * C.market.npcNames.length)], npcRaises: 0, leader: null, status: 'open', month: m });
    }
  }
  R.listMonth = m;
  return true;
}
/** 成交要付：土地款 + 契税 3% + 印花税 */
export const landTotal = (price) => r2(price * (1 + C.tax.deed + C.tax.stampLand));
export function whyNotBid(s, l, price, t = Date.now()) {
  if (!l || l.status !== 'open') return '这块地已经挂牌结束了';
  if (activeProjects(s).length >= maxProjects(s)) return `同时最多做 ${maxProjects(s)} 个项目（升称号能多做）`;
  if (s.title < C.types[l.type].minTitle) return '称号不够';
  if (!cityOpen(s, l.city, t)) return `先注册${cityNm(l.city)}分公司（公司 → 产业 → 地产 → 上面的城市）`;
  if (!canPay(s, 'company', landTotal(price)) || s.company - ((s.bank && s.bank.restricted) || 0) < landTotal(price)) return `公司账户自有资金不够（土地款 + 契税要 ${Math.round(landTotal(price) / 1e4)} 万，拿地只能用自有资金，不能贷款）`;
  { const w = whyCushion(s, landTotal(price)); if (w) return w; } /* V0.2.3 */
  return null;
}
/** 你举牌：第一次按起拍价报名，之后按加价幅度。返回 { ok, why, won, npc } */
export function bid(s, id, step, t, rnd = Math.random) {
  const R = re(s); const l = R.listings.find((x) => x.id === id);
  const price = l && (l.leader == null ? l.start : Math.round(l.cur * (1 + step)));
  const why = whyNotBid(s, l, price, t); if (why) return { ok: false, why };
  if (l.leader === 'me') return { ok: false, why: '现在最高价就是你' };
  l.cur = price; l.leader = 'me';
  // NPC 开发商：还没到心理价、还有轮次就跟（一次加 5%）
  const next = Math.round(l.cur * (1 + C.market.raiseStep[0]));
  if (l.npcRaises < C.market.npcRounds && next <= l.npcMax) { l.cur = next; l.leader = 'npc'; l.npcRaises += 1; return { ok: true, won: false, npc: next }; }
  return { ok: true, won: true, ...win(s, l, t) };
}
// ---------- V2-07 谈地（接开发2 的 core/negotiate.js）：挂牌期间找想拿这块地的开发商私下谈，谈成它不举牌，你按谈下来的价拿地 ----------
export const LAND_NEGO = { ask: 1.05, range: [0.85, 0.97], persona: '精明' };
export function landNegoOpts(s, id, secId = null, boss = false) {
  const l = re(s).listings.find((x) => x.id === id); if (!l) return null;
  return { key: 'land_' + id, kind: 'buy', base: Math.round(Math.max(l.cur, l.npcMax * LAND_NEGO.ask) / 1e4) * 1e4, range: LAND_NEGO.range, step: 1e4, persona: LAND_NEGO.persona, chips: { intel: (l.npcRaises || 0) > 0, secId, boss } };
}
/** 谈成：按这个价拿地（同样只能用自有资金） */
export function winByDeal(s, id, price, t) {
  const l = re(s).listings.find((x) => x.id === id); price = Math.round(Math.max(price, l ? l.start : 0));
  const why = whyNotBid(s, l, price, t); if (why) return { ok: false, why };
  l.cur = price; l.leader = 'me'; credit(s, 'nego', 1, t); return { ok: true, won: true, ...win(s, l, t) };
}
/** V2-09 拿地定上限：你定一个最高价，按最小加价幅度跟到赢或者超过上限为止（超过上限就停下，你可以再加或放弃） */
export function bidUpTo(s, id, max, t, rnd = Math.random) {
  const l = re(s).listings.find((x) => x.id === id); if (!l || l.status !== 'open') return { ok: false, why: '这块地已经挂牌结束了' };
  let last = null;
  for (let i = 0; i < 20; i++) {
    const next = l.leader == null ? l.start : Math.round(l.cur * (1 + C.market.raiseStep[0]));
    if (l.leader === 'me') break; if (next > max) return { ok: true, won: false, stopped: true, cur: l.cur, last };
    last = bid(s, id, C.market.raiseStep[0], t, rnd); if (!last.ok) return last; if (last.won) return last;
  }
  return last || { ok: false, why: '没出价' };
}
export function giveUp(s, id) { const l = re(s).listings.find((x) => x.id === id); if (!l || l.status !== 'open') return false; if (l.leader === 'npc' || l.leader == null) { l.status = 'lost'; return true; } return false; }

/** 成交：付土地款（自有资金）+ 契税 + 印花税，签出让合同，项目开始办四证 */
function win(s, l, t) {
  const T = C.types[l.type]; const R = re(s);
  const deed = r2(l.cur * C.tax.deed), stamp = r2(l.cur * C.tax.stampLand);
  const ct = addContract(s, { prefix: 'CR', kind: 'land', title: '国有建设用地使用权出让合同', parties: [['出让人', `${C.cities[l.city].name}市规划和自然资源局`], ['受让人', s.companyName || '我的公司']],
    subject: `${C.cities[l.city].name}${l.district} ${l.landArea} ㎡ ${T.use}（容积率 ${l.far}，可建 ${l.gfa} ㎡，${T.years} 年）`, rows: [['土地出让金', l.cur], ['契税（3%）', deed], ['印花税（0.05%）', stamp]], total: l.cur + deed + stamp, wallet: 'company' }, t);
  pay(s, { wallet: 'company', cat: 'land', amount: l.cur, party: '规划和自然资源局', ref: ct.no, by: by(s), note: `地产 拿地 ${l.district}` }, t);
  payTaxItem(s, { kind: '契税', label: l.district, base: l.cur, rate: C.tax.deed, amount: deed, note: `土地契税 3%（${l.district}）` }, t, cfoBy(s));
  payTaxItem(s, { kind: '印花税', label: l.district, base: l.cur, rate: C.tax.stampLand, amount: stamp, note: '产权转移书据印花税' }, t, cfoBy(s));
  l.status = 'won';
  const p = { id: l.id, name: `${l.district}${T.name === '住宅小区' ? '·悦府' : '·中心'}`, type: l.type, city: l.city, district: l.district, landArea: l.landArea, far: l.far, gfa: l.gfa, floorPrice: l.floorPrice,
    land: l.cur, deed, stamp, build: Math.round(T.buildCost * l.gfa), paidBuild: 0, devFees: 0, commission: 0, stage: 'permit', at: t + gm(C.time.permit) * MONTH_MS, start: t,
    batch: 0, sold: 0, received: 0, escrow: 0, prepVat: 0, prepLat: 0, contract: ct.no, result: null };
  R.projects.push(p); syncTeams(s); R.dismissAt = 0; // 待岗的人转到新项目
  return { project: p, deed, stamp };
}

/** 收购对手并进来的项目（锦城、华荣）：上海住宅；'build' 在建（工程款对方付了一半）、'ready' 储备地（四证齐了） */
export function addAcquiredProject(s, spec, from, t) {
  const R = re(s); const T = C.types.residential; R.seq += 1;
  const landArea = 10000, far = 2.0, gfa = landArea * far, floorPrice = 3200, land = floorPrice * gfa;
  const p = { id: R.seq, name: `${from}·${spec.stage === 'build' ? '在建' : '储备'}项目`, type: 'residential', city: 'shanghai', district: '收购并入', landArea, far, gfa, floorPrice,
    land, deed: Math.round(land * C.tax.deed), stamp: Math.round(land * C.tax.stampLand), build: Math.round(T.buildCost * gfa), paidBuild: 0, devFees: 0, commission: 0, stage: spec.stage === 'build' ? 'build' : 'ready',
    at: 0, start: t, batch: 0, sold: 0, received: 0, escrow: 0, prepVat: 0, prepLat: 0, contract: '', result: null, from };
  if (p.stage === 'build') { p.paidBuild = Math.round(p.build * C.buildPrepay); p.buildEnd = t + buildMonths(p) / 2 * MONTH_MS; p.batchAt = t + gm(C.time.batchGap) * MONTH_MS; p.at = nextAt(p); } // 在建的已经开工一半：一个月后开盘
  R.projects.push(p); syncTeams(s); return p;
}

// ---------- 项目 ----------
/** 每平米售价：按市场楼面价 + 建安成本 × 加成（多花的地价就是你少赚的）；冷热 ±5% */
export const priceOf = (s, p) => Math.round((p.floorPrice + C.types[p.type].buildCost) * C.types[p.type].markup * heatOf(s).price * projK(p).price); // V2-09 定位、开盘定价、营销
export const buildMonths = (p) => gm(C.time.build[p.type] ?? 12);
/** 下一件到点的事：竣工、下一批开盘，取早的 */
export const nextAt = (p) => Math.min(p.buildEnd || Infinity, p.batchAt || Infinity) === Infinity ? 0 : Math.min(p.buildEnd || Infinity, p.batchAt || Infinity);
export const totalInvest = (p) => p.land + p.deed + p.stamp + p.build;
export const STAGE = { permit: '办四证', ready: '四证齐了，等开工', build: '建设中', built: '竣工，选卖还是持有', presale: '预售中', deliver: '交房清算中', done: '清算完', held: '持有出租' };

export function whyNotStart(s, p, pos = null) {
  if (p.stage !== 'ready') return '现在不能开工';
  const pre = Math.round(p.build * posBuild(p, pos) * C.buildPrepay);
  if (!canPay(s, 'company', pre)) return `公司账户不够（总包预付款 ${Math.round(pre / 1e4)} 万；四证齐了可以申请开发贷，银行在 2-08）`;
  { const w = whyCushion(s, pre); if (w) return w; } /* V0.2.3 */
  return null;
}
/** 开工：跟总包签施工合同，先付 50%，竣工付尾款 */
export function startBuild(s, id, t, pos = null) {
  const p = re(s).projects.find((x) => x.id === id); const why = p ? whyNotStart(s, p, pos) : '没有这个项目'; if (why) return { ok: false, why };
  if (pos) credit(s, 're', 1, t); setPos(s, p, pos, t); // V2-09 定位（住宅）：建安成本跟着变；然后问开盘定价、营销
  const pre = Math.round(p.build * C.buildPrepay);
  const ct = addContract(s, { prefix: 'SG', kind: 'build', title: '建设工程施工合同（总包）', parties: [['发包人', s.companyName || '我的公司'], ['承包人', '中建某局（总包）']], subject: `${p.name} ${p.gfa} ㎡`, rows: [['建安工程款（含 9% 增值税）', p.build], ['开工预付', pre], ['竣工结算付', p.build - pre]], total: p.build, wallet: 'company' }, t);
  pay(s, { wallet: 'company', cat: 'construction', amount: pre, party: '总包', ref: ct.no, by: by(s), note: `地产 ${p.name} 开工预付 50%` }, t);
  askDecisions(s, p, t);
  p.paidBuild = pre; p.stage = 'build'; p.buildEnd = t + buildMonths(p) * MONTH_MS; p.batchAt = C.types[p.type].canHold ? 0 : t + gm(C.time.presaleFrom) * MONTH_MS; p.at = nextAt(p); p.buildContract = ct.no;
  return { ok: true };
}
/** 商业综合体竣工：卖（走预售）还是自己持有收租 */
export function chooseHold(s, id, hold, t) {
  const p = re(s).projects.find((x) => x.id === id); if (!p || p.stage !== 'built') return { ok: false, why: '现在不能选' };
  if (hold && !C.types[p.type].canHold) return { ok: false, why: '住宅不做持有' };
  if (hold) { p.stage = 'held'; p.value = Math.round(totalInvest(p) * C.hold.valueK); p.heldAt = t; syncTeams(s); return { ok: true }; }
  p.stage = 'presale'; p.batchAt = t + gm(C.time.batchGap) * MONTH_MS; p.at = nextAt(p); return { ok: true };
}

/** 一批开盘：去化率 = 冷热 × 在岗 / 编制 × 经理加成（+ 娱乐传媒宣发，2-05） */
export function sellRate(s) {
  const media = (s.flags && s.flags.mediaReBoost) || 0;
  return Math.min(1, heatOf(s).sell * staffFactor(s, 'realestate') * managerRevMult(s, 'realestate') + media);
}
let loanHook = null; // 2-08 开发贷：预售款先还贷 fn(s, p, amount, t) → 用掉多少
export const setLoanHook = (fn) => { loanHook = fn; };

function batch(s, p, t) {
  const left = p.gfa - p.sold; const plan = left / (C.batches - p.batch);
  const area = Math.floor(Math.min(left, plan * Math.min(1.5, sellRate(s) * projK(p).sell))); const price = priceOf(s, p); const money = area * price; // V2-09 去化跟着定位、定价、营销、事件走
  p.batch += 1; p.sold += area; p.received += money;
  if (money > 0) {
    receive(s, { wallet: 'company', cat: 'presale', amount: money, party: '购房人', by: by(s), note: `地产 ${p.name} 第 ${p.batch} 批预售 ${area} ㎡ × ${price}` }, t);
    // 进监管账户：先还开发贷，留一部分到交房，剩下的解冻
    pay(s, { wallet: 'company', cat: 'escrow_in', amount: money, force: true, party: '监管银行', note: `${p.name} 预售款进监管账户` }, t);
    let esc = money; if (loanHook) esc -= loanHook(s, p, esc, t) || 0;
    const keep = Math.min(esc, money * C.escrowKeep); const free = esc - keep; p.escrow += keep;
    if (free > 0) receive(s, { wallet: 'company', cat: 'escrow_out', amount: free, party: '监管银行', note: `${p.name} 监管账户解冻（留 ${Math.round(C.escrowKeep * 100)}% 到交房）` }, t);
    // 预缴增值税 3%（不含税价）、预征土地增值税 2%
    const vat = r2(money / (1 + C.tax.vat) * C.tax.vatPrepay), lat = r2(money * C.tax.latPrepay);
    payTaxItem(s, { kind: '增值税预缴', label: p.name, base: money, rate: C.tax.vatPrepay, amount: vat, note: `${p.name} 预售增值税预缴 3%` }, t, cfoBy(s));
    payTaxItem(s, { kind: '土地增值税预征', label: p.name, base: money, rate: C.tax.latPrepay, amount: lat, note: `${p.name} 土地增值税预征 2%` }, t, cfoBy(s));
    p.prepVat += vat; p.prepLat += lat;
    // 开发费用（设计、营销、管理）+ 置业顾问提成 0.1%
    const fee = r2(money * C.types[p.type].devFeeRate), com = r2(money * C.agentCommission);
    pay(s, { wallet: 'company', cat: 're_cost', amount: fee, force: true, party: '营销 / 设计 / 物业', note: `地产 ${p.name} 开发费用` }, t);
    pay(s, { wallet: 'company', cat: 'bonus', amount: com, force: true, party: '置业顾问', note: `地产 ${p.name} 置业顾问提成 0.1%` }, t);
    p.devFees += fee; p.commission += com;
  }
  (p.batches = p.batches || []).push({ area, price, money, rate: area / Math.max(1, plan) });
}

/** 土地增值税：增值额 ÷ 扣除项目 → 四级超率累进；普通住宅增值率 ≤ 20% 免征 */
export function latOf(rev, deduct, ordinary) {
  const va = rev - deduct; if (va <= 0) return { va, ratio: 0, rate: 0, tax: 0, exempt: false };
  const ratio = va / deduct;
  if (ordinary && ratio <= C.tax.latExemptOrdinary) return { va, ratio, rate: 0, tax: 0, exempt: true };
  const [, rate, quick] = C.tax.latBrackets.find(([up]) => ratio <= up);
  return { va, ratio, rate, tax: r2(va * rate - deduct * quick), exempt: false };
}
/** 交房清算：尾盘打折卖掉、监管账户放出来、增值税和土增税多退少补、所得税进本季度 */
function deliver(s, p, t) {
  const T = C.types[p.type]; const left = p.gfa - p.sold;
  if (left > 0) { // 尾盘：按市场冷热打折一口气卖掉
    const price = Math.round(priceOf(s, p) * C.tailDiscount[re(s).heat]); const money = left * price;
    receive(s, { wallet: 'company', cat: 'presale', amount: money, party: '购房人', by: by(s), note: `地产 ${p.name} 尾盘特价 ${left} ㎡ × ${price}` }, t);
    p.sold += left; p.received += money; p.tail = { area: left, price, money };
    const fee = r2(money * T.devFeeRate); pay(s, { wallet: 'company', cat: 're_cost', amount: fee, force: true, party: '营销', note: `地产 ${p.name} 尾盘营销费` }, t); p.devFees += fee;
  }
  if (p.escrow > 0) { receive(s, { wallet: 'company', cat: 'escrow_out', amount: p.escrow, party: '监管银行', note: `${p.name} 交房，监管账户全部解冻` }, t); p.escrow = 0; }
  const S = p.received; const v = C.tax.vat;
  const outVat = (S - p.land) / (1 + v) * v; const inVat = p.build / (1 + v) * v; // 土地价款差额扣除；建安进项
  const vatAll = Math.max(0, outVat - inVat); const vatDue = r2(vatAll - p.prepVat);
  const sr = TAX.surcharge['城建税'] + TAX.surcharge['教育费附加'] + TAX.surcharge['地方教育附加']; const surcharge = r2(vatAll * sr);
  if (vatDue >= 0.01) payTaxItem(s, { kind: '增值税', label: p.name, base: S, rate: v, amount: vatDue, note: `${p.name} 交房清算增值税（扣掉预缴）` }, t, cfoBy(s));
  if (surcharge >= 0.01) payTaxItem(s, { kind: '附加税', label: p.name, base: vatAll, rate: sr, amount: surcharge, note: `${p.name} 城建税 + 教育费附加` }, t, cfoBy(s));
  const rev = S - outVat; const buildEx = p.build - inVat;
  const deduct = p.land + p.deed + buildEx + (p.land + buildEx) * C.tax.latDevFee + surcharge + (p.land + buildEx) * C.tax.latExtra;
  const L = latOf(rev, deduct, T.ordinary); const latDue = r2(L.tax - p.prepLat);
  if (latDue >= 0.01) payTaxItem(s, { kind: '土地增值税', label: p.name, base: L.va, rate: L.rate, amount: latDue, note: `${p.name} 土地增值税清算（增值率 ${Math.round(L.ratio * 100)}%，扣掉预征）` }, t, cfoBy(s));
  else if (latDue <= -0.01) receive(s, { wallet: 'company', cat: 'tax_refund', amount: -latDue, party: '税务局', by: cfoBy(s), note: `${p.name} 土地增值税清算退回预征${L.exempt ? '（普通住宅增值率 ≤ 20% 免征）' : ''}` }, t);
  if (vatDue <= -0.01) p.vatCredit = -vatDue; // 预缴多了：留抵，不退现金
  // 企业所得税：收入（不含税）− 土地 − 建安（不含税）− 开发费用 − 提成 − 附加 − 土增税，进本季度一起算
  const cost = p.land + p.deed + p.stamp + buildEx; const other = p.devFees + p.commission + surcharge + L.tax;
  for (const k of ['qtr', 'yearAcc']) { const q = (s[k] = s[k] || {}); q.rev = q.rev || {}; q.cogs = q.cogs || {}; q.rev.realestate = (q.rev.realestate || 0) + rev; q.cogs.realestate = (q.cogs.realestate || 0) + cost; }
  s.qtr.other = (s.qtr.other || 0) + other;
  const profit = rev - cost - other;
  p.result = { sales: S, rev: r2(rev), vat: r2(vatAll), surcharge, lat: L.tax, latRate: L.rate, latRatio: L.ratio, latExempt: L.exempt, cost: r2(cost), other: r2(other), profit: r2(profit), citEst: r2(Math.max(0, profit) * TAX.cit.rate), net: r2(profit - Math.max(0, profit) * TAX.cit.rate), invest: totalInvest(p) };
  p.stage = 'done'; p.doneAt = t; syncTeams(s); teamDone(s, p, t);
  capAdd(s, 're.log', re(s).log, { t, id: p.id, name: p.name, net: p.result.net });
}

/** 每秒 / 离线：到点的往下走（一次可以走好几步） */
export function tickRE(s, t) {
  if (!s.inds.realestate) return [];
  refreshMarket(s, t);
  const ev = [];
  for (const p of re(s).projects) {
    ev.push(...tickDecide(s, p, t)); // V2-09 建设期 / 预售期的事件
    if (!(s.flags && s.flags.reAutoDefault) && holdFor(p, t)) continue; // V0.2.3（设计35 第十节）：有没拍板的事，工程停在这一步，往后的时间点一起顺延
    for (let guard = 0; guard < 10 && p.at && t >= p.at; guard++) {
      const at = p.at;
      if (p.stage === 'permit') { p.stage = 'ready'; p.at = 0; ev.push([p, '四证办齐了，可以开工']); }
      else if ((p.stage === 'build' || p.stage === 'presale') && p.batchAt && p.batchAt === at) { // 一批开盘（住宅开工满 2 个月起，跟建设同时）
        batch(s, p, at); ev.push([p, `第 ${p.batch} 批开盘，卖了 ${p.batches.at(-1).area} ㎡`]);
        p.batchAt = p.batch >= C.batches ? 0 : at + gm(C.time.batchGap) * MONTH_MS;
        if (p.stage === 'presale' && !p.batchAt) { p.stage = 'deliver'; p.at = at + gm(C.time.deliver) * MONTH_MS; } else p.at = nextAt(p);
      } else if (p.stage === 'build') { // 竣工
        const rest = p.build - p.paidBuild; pay(s, { wallet: 'company', cat: 'construction', amount: rest, force: true, party: '总包', ref: p.buildContract, by: by(s), note: `地产 ${p.name} 竣工结算尾款` }, at); p.paidBuild = p.build; p.buildEnd = 0;
        if (C.types[p.type].canHold) { p.stage = 'built'; p.at = 0; ev.push([p, '竣工了：卖还是持有？']); }
        else if (!p.batchAt) { p.stage = 'deliver'; p.at = at + gm(C.time.deliver) * MONTH_MS; ev.push([p, '竣工了，一个月后交房']); }
        else { p.stage = 'presale'; p.at = nextAt(p); ev.push([p, '竣工了，接着卖']); }
      } else if (p.stage === 'deliver') { deliver(s, p, at); p.at = 0; ev.push([p, `交房清算完，净赚 ${Math.round(p.result.net / 1e4)} 万`]); }
      else p.at = 0;
    }
  }
  if (re(s).dismissAt && t >= re(s).dismissAt) { const d = dismissSurplus(s, t); if (d.n) ev.push([{ name: '项目公司' }, `${d.n} 人遣散，赔偿 ${Math.round(d.comp / 1e4)} 万`]); }
  collectRent(s, t);
  return ev;
}
/** 持有的商业：每个游戏月收租；房产税按租金 12%，物业团队（外包）10% */
function collectRent(s, t) {
  const R = re(s); const m = monthIndex(s, t);
  if (R.rentMonth == null) { R.rentMonth = m; return; }
  while (R.rentMonth < m) {
    R.rentMonth += 1; const at = s.createdAt + R.rentMonth * MONTH_MS;
    for (const p of R.projects.filter((x) => x.stage === 'held' && x.heldAt < at)) {
      const rent = r2(p.value * C.hold.rentYield / 12); const tax = r2(rent * C.tax.propertyTaxRent); const mg = r2(rent * C.hold.mgmtRate);
      receive(s, { wallet: 'company', cat: 'rent_co', amount: rent, party: '租户', by: by(s), note: `地产 ${p.name} 租金` }, at);
      payTaxItem(s, { kind: '房产税', label: p.name, base: rent, rate: C.tax.propertyTaxRent, amount: tax, note: `${p.name} 房产税（租金 12%）` }, at, cfoBy(s));
      pay(s, { wallet: 'company', cat: 'outsource', amount: mg, force: true, party: '物业公司', note: `${p.name} 物业管理` }, at);
      for (const k of ['qtr', 'yearAcc']) { const q = (s[k] = s[k] || {}); q.rev = q.rev || {}; q.rev.realestate = (q.rev.realestate || 0) + rent / (1 + C.tax.vat); }
      s.qtr.other = (s.qtr.other || 0) + tax + mg;
      p.rentTotal = (p.rentTotal || 0) + rent;
    }
  }
}
// ---------- V2-09 地产项目每一步拿主意（设计29 第四节）----------
const D = C.decide;
/** 这块地最合适的定位（看城市系数） */
export const bestPos = (p) => D.posFit.find(([k]) => (C.cities[p.city] ? C.cities[p.city].k : 1) >= k)[1];
const posBuild = (p, pos) => (p.type === 'residential' && pos && D.pos[pos] ? D.pos[pos].build : 1);
/** 定位 / 开盘定价 / 营销 / 事件 合起来的售价和去化倍数 */
export function projK(p) {
  const x = p.dec || {}; let price = 1, sell = 1;
  if (x.pos && D.pos[x.pos]) { price *= D.pos[x.pos].price; sell *= D.pos[x.pos].sell * (x.pos === bestPos(p) ? D.fitSell : D.missSell); }
  if (x.price && D.price[x.price]) { price *= D.price[x.price].price; sell *= D.price[x.price].sell; }
  if (x.mkt && D.mkt[x.mkt]) { price *= D.mkt[x.mkt].price; sell *= D.mkt[x.mkt].sell; }
  sell *= x.sellMul || 1;
  return { price, sell };
}
/** 秘书出主意：智慧最高、没在上课的，对的概率 50% + 智慧 / 2 */
export function posAdvice(s, p, rnd = Math.random) {
  const ids = Object.keys(s.secs || {}); if (!ids.length) return null;
  const at = (id) => ((s.secs[id] && s.secs[id].attrs) || {}).wit || 0; const sec = ids.sort((a, b) => at(b) - at(a))[0];
  const best = bestPos(p); const right = rnd() < 0.5 + at(sec) / 200; const others = Object.keys(D.pos).filter((k) => k !== best);
  return { sec, pos: right ? best : others[Math.floor(rnd() * others.length)], right };
}
function setPos(s, p, pos, t) {
  p.dec = p.dec || {};
  if (p.type !== 'residential') return;
  const k = D.pos[pos] ? pos : D.defaults.pos; p.dec.pos = k; p.build = Math.round(p.build * D.pos[k].build);
}
/** 开工时问开盘定价、营销（V0.2.3：不选项目就停在这一步） */
function askDecisions(s, p, t) {
  p.dec = p.dec || {}; p.pend = p.pend || [];
  for (const kind of ['price', 'mkt']) {
    if (p.dec[kind]) continue;
    const opts = Object.entries(D[kind]).map(([k, v]) => ({ key: k, label: kind === 'mkt' && v.cost ? `${v.name}（预计房款 ${(v.cost * 100).toFixed(1)}%）` : v.name }));
    const m = addMsg(s, { kind: 'invite', type: 're_dec', title: `${p.name}：${kind === 'price' ? '开盘定价' : '营销方案'}`, body: kind === 'price' ? '高价慢卖利润高、回款慢；平价快卖回款快、利润薄。' : '样板间稳、明星代言贵但带价、团购折扣卖得快但让价。', actions: opts, data: { pid: p.id, kind, until: t + D.waitMin * MIN } }, t);
    p.pend.push({ kind, msg: m.id, ...(s.flags && s.flags.reAutoDefault ? { until: t + D.waitMin * MIN } : {}) });
  }
  // 建设期事件：开工后某个时候来一次（概率 eventP）
  const evs = Object.entries(D.events).filter(([, e]) => e.stage === 'build');
  const r = rng(p.id * 7919 + (s.createdAt % 1e9)); if (r() < D.eventP && evs.length) { p.evId = evs[Math.floor(r() * evs.length)][0]; p.evAt = t + Math.round(buildMonths(p) * MONTH_MS * 0.4); }
}
/** 选一个（消息按钮 / 超时默认 / autoplay） */
export function decide(s, pid, kind, key, t) {
  const p = re(s).projects.find((x) => x.id === pid); if (!p) return { ok: false, why: '没有这个项目' };
  p.dec = p.dec || {}; const pend = (p.pend || []).find((x) => x.kind === kind); if (!pend) return { ok: false, why: '这件事已经定了' };
  p.pend = p.pend.filter((x) => x !== pend); const m = (s.inbox || []).find((x) => x.id === pend.msg); let text = '';
  if (kind === 'price' || kind === 'mkt') {
    const k = D[kind][key] ? key : D.defaults[kind]; p.dec[kind] = k; text = `${p.name}：${D[kind][k].name}`;
    if (kind === 'mkt' && D.mkt[k].cost) { const est = Math.round(priceOf(s, p) * (p.gfa - p.sold) * D.mkt[k].cost); if (est > 0) { pay(s, { wallet: 'company', cat: 're_cost', amount: est, force: true, party: '营销公司', note: `地产 ${p.name} ${D.mkt[k].name}` }, t); deductTax(s, est); /* 设计93 */ text += `，花了 ${Math.round(est / 1e4)} 万`; } }
  } else {
    const e = D.events[kind]; const o = e.options.find((x) => x.key === key) || e.options.find((x) => x.key === e.default); text = `${e.title}：${o.label}`;
    const fx = o.fx; const hit = fx.chance == null || rng(p.id * 131 + Math.floor(t / 1000) % 1e6)() < fx.chance;
    if (fx.build) { const add = Math.round(p.build * fx.build); p.build += add; text += `，建安多 ${Math.round(add / 1e4)} 万`; }
    if (hit && fx.sellMul) { p.dec.sellMul = (p.dec.sellMul || 1) * fx.sellMul; text += '，口碑受影响，之后去化变慢'; }
    if (hit && fx.payBuild) { const c = Math.round(p.build * fx.payBuild); pay(s, { wallet: 'company', cat: 're_cost', amount: c, force: true, party: kind === 'inspect' ? '整改 / 罚款' : e.title, note: `地产 ${p.name} ${e.title}` }, t); deductTax(s, c); /* 设计93 */ text += `，花了 ${Math.round(c / 1e4)} 万`; }
    if (hit && fx.payReceived) { const c = Math.round((p.received || 0) * fx.payReceived); if (c > 0) { pay(s, { wallet: 'company', cat: 're_cost', amount: c, force: true, party: '业主', note: `地产 ${p.name} 业主赔偿` }, t); deductTax(s, c); /* 设计93 */ text += `，赔了 ${Math.round(c / 1e4)} 万`; } }
    if (hit && fx.delayMonths && p.buildEnd) { p.buildEnd += fx.delayMonths * MONTH_MS; p.at = nextAt(p); text += `，竣工晚 ${fx.delayMonths} 个月`; }
    if (fx.chance != null && !hit) text += '，这回运气好，没出事';
  }
  if (m) { m.status = 'done'; m.read = true; m.result = text; }
  capPush((p.decLog = p.decLog || []), { t, kind, key, text }, capOf('re.projects[].decLog')); if (key != null) credit(s, 're', 1, t);
  return { ok: true, text };
}
/** 停工 / 复工：停着的时候记下起点；拍完板把 at、batchAt、buildEnd、evAt 一起往后挪停掉的时间 */
function holdFor(p, t) {
  const stop = (p.pend || []).length > 0 && p.stage !== 'done';
  if (stop) { if (p.holdAt == null) p.holdAt = t; return true; }
  if (p.holdAt != null) { const d = Math.max(0, t - p.holdAt); for (const k of ['at', 'batchAt', 'buildEnd', 'evAt']) if (p[k]) p[k] += d; p.holdAt = null; }
  return false;
}
export const onHold = (p) => (p.pend || []).length > 0 && p.stage !== 'done';
function tickDecide(s, p, t) {
  const out = [];
  /* V0.2.3（设计35 第十节）：不选不按默认，项目停在这一步（见 tickRE 的暂停）；测试可以 flags.reAutoDefault 用老规矩 */
  if (s.flags && s.flags.reAutoDefault) for (const x of [...(p.pend || [])]) if (x.until && t >= x.until) decide(s, p.id, x.kind, null, x.until);
  if (p.evId && p.evAt && t >= p.evAt && (p.stage === 'build' || p.stage === 'presale')) { askEvent(s, p, p.evId, p.evAt); p.evId = null; p.evAt = 0; }
  if (!p.evOwners && (p.batch || 0) >= 1 && (p.stage === 'build' || p.stage === 'presale')) { p.evOwners = true; if (rng(p.id * 977 + (s.createdAt % 1e9))() < D.eventP * 0.5) askEvent(s, p, 'owners', t); } // 业主维权：开盘以后有一半机会来一次
  return out;
}
function askEvent(s, p, id, t) {
  const e = D.events[id]; p.pend = p.pend || [];
  const m = addMsg(s, { kind: 'invite', type: 're_dec', title: `${p.name}：${e.title}`, body: e.text, actions: e.options.map((o) => ({ key: o.key, label: o.label })), data: { pid: p.id, kind: id, until: t + D.waitMin * MIN } }, t);
  p.pend.push({ kind: id, msg: m.id, ...(s.flags && s.flags.reAutoDefault ? { until: t + D.waitMin * MIN } : {}) });
}
onAction('re_dec', (s, m, a, t) => decide(s, m.data.pid, m.data.kind, a, t).ok);

/** 项目公司：每个在做的项目一套班子（编制 = 在做的项目数，没有项目就没有编制） */
export function syncTeams(s) { const x = s.inds.realestate; if (x) x.branches = activeProjects(s).length; }

// ---------- 项目公司做完：转岗或遣散（验收阶段二 2-02 第 2 条）----------
/** 多出来的人（在岗 − 编制），按岗位 */
export function surplus(s) {
  const x = s.inds.realestate; if (!x) return {}; const est = establishment(s, 'realestate'); const o = {};
  for (const r of new Set([...Object.keys(x.staff || {}), ...Object.keys(x.agency || {})])) { const d = (x.staff[r] || 0) + ((x.agency || {})[r] || 0) - (est[r] || 0); if (d > 0) o[r] = d; }
  return o;
}
const sumv = (o) => Object.values(o).reduce((a, b) => a + b, 0);
/** 遣散多出来的人：N+1 赔偿（staff.fire） */
export function dismissSurplus(s, t) {
  let n = 0, comp = 0;
  for (const [r, k] of Object.entries(surplus(s))) { const f = fire(s, 'realestate', r, k, t); if (f.ok) { n += f.n; comp += f.comp; } }
  re(s).dismissAt = 0; return { n, comp };
}
/** 清算完：有地产经理她自己处理（有在做的项目就转岗，没有就 30 分钟后遣散）；没有就发请示让你选 */
function teamDone(s, p, t) {
  const n = sumv(surplus(s)); if (!n) return;
  const R = re(s); const mgr = holder(s, 'manager_realestate');
  if (mgr) {
    if (activeProjects(s).length) addMsg(s, { kind: 'system', type: 're', from: isSec(mgr) ? mgr : '', title: `${p.name} 项目公司 ${n} 人转岗`, body: '地产经理把人转到在做的项目上，下一个项目开工先用他们。' }, t);
    else { R.dismissAt = t + C.dismissMin * MIN; addMsg(s, { kind: 'system', type: 're', from: isSec(mgr) ? mgr : '', title: `${p.name} 项目公司 ${n} 人待岗`, body: `没有在做的项目，${C.dismissMin} 分钟内不拿地就遣散（N+1 赔偿）。` }, t); }
    return;
  }
  addMsg(s, { kind: 'request', type: 're_team', title: `${p.name} 清算完：项目公司 ${n} 人怎么办？`, body: `转到下一个项目（先待岗，照发工资；下个项目开工先用他们），或者现在遣散（按 N+1 给赔偿）。`, data: { id: p.id }, actions: [{ key: 'approve', label: '转到下一个项目' }, { key: 'reject', label: '遣散（N+1）' }] }, t);
}
onAction('re_team', (s, m, a, t) => { if (a === 'reject') dismissSurplus(s, t); return true; });

/** 身价里地产这一块：在做的项目按成本（土地 + 已付建安 + 开发费用）+ 监管账户 − 已收的预售款（合同负债）；持有的按估值 */
export function reValue(s) {
  if (!s.re) return 0; let v = 0;
  for (const p of s.re.projects) {
    if (p.stage === 'held') v += p.value;
    else if (p.stage !== 'done') v += p.land + p.deed + p.stamp + p.paidBuild + p.devFees + p.commission + p.escrow - p.received + p.prepVat + p.prepLat;
  }
  return v;
}
