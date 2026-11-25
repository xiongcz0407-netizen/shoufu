// 娱乐传媒（设计20 第二节 4）：直播分成（平台 50%、主播再分 50%）、投拍电影 / 剧（偏态票房、真实分账、限薪令）、文化事业建设费 3%、联动
// 不 import economy
import { whyCushion } from './cashflow.js?v=4306ebaa'; // V0.2.3 留够两个月工资
import M from '../config/media.json?v=4306ebaa' with { type: 'json' };
import { headCap, gm } from './calib.js?v=4306ebaa';
import { pay, receive, canPay } from './ledger.js?v=4306ebaa';
import { payTaxItem, track } from './companytax.js?v=4306ebaa';
import { onDutyRole, onDuty, lookOf } from './staff.js?v=4306ebaa';
import { holder, isSec, attrs } from './posts.js?v=4306ebaa';
import { MONTH_MS, monthIndex } from './gametime.js?v=4306ebaa';
import { addMsg } from './inbox.js?v=4306ebaa';
import { addContract } from './contracts.js?v=4306ebaa';
export { M as MEDIA_CFG };
/** 一部片各段的游戏月（现实 ÷ profitMul，最少 1） */
export const filmMonths = (kind) => { const m = M.months[kind]; return { shoot: gm(m.shoot), post: gm(m.post), release: gm(m.release) }; };

const MIN = 60e3; const MONTH_SEC = MONTH_MS / 1000; const r2 = (x) => Math.round(x * 100) / 100;
export const media = (s) => (s.media = s.media || { films: [], seq: 0, month: null, adRev: 0, lastT: null });
const by = (s) => { const m = holder(s, 'manager_media'); return isSec(m) ? m : ''; };

// ---------- 直播 ----------
/** 直播每秒进公司的（平台抽完 50% 以后）；人效上限：≤ 在岗 × 人均上限（core/calib.js headCap） */
export function liveRevPerSec(s) {
  if (!s.inds.media) return 0;
  const raw = onDutyRole(s, 'media', 'anchor') * M.live.flowPerAnchor * (1 - M.live.platformCut) / MONTH_SEC;
  return Math.min(raw, onDuty(s, 'media') * headCap('media', lookOf(s, 'media'), M.real) / MONTH_SEC); // 真实经济反推（设计21）
}
/** 联动：有娱乐传媒，服装、餐饮收入 +5%（广告）；地产去化 +10%（宣发） */
export const mediaLink = (s, id) => (s.inds && s.inds.media ? M.link.inds[id] || 0 : 0);

// ---------- 投拍 ----------
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
/** 这个游戏月观众爱看什么（每月换） */
export const hotGenre = (s, t) => M.genres[Math.floor(rng((s.createdAt % 1e9) + monthIndex(s, t) * 131)() * M.genres.length)];
export const slots = (s) => (s.inds.media ? Math.floor(onDutyRole(s, 'media', 'producer') / M.producersPerProject) : 0);
export const shooting = (s) => media(s).films.filter((f) => f.stage !== 'done');
export function costOf(o) {
  const K = M.kinds[o.kind]; const d = M.directors[o.dir], c = M.casts[o.cast], p = M.publicity[o.pub];
  const make = K.base + d.cost + c.cost; return { make, cast: c.cost, pub: p.cost, total: make + p.cost };
}
export function whyNotShoot(s, o) {
  if (!s.inds.media) return '还没有娱乐传媒';
  if (lookOf(s, 'media') < 1) return '直播工作室拍不了片，升到 15 级「影视公司」';
  if (shooting(s).length >= slots(s)) return `制片人不够：每 ${M.producersPerProject} 个制片管 1 部，现在最多同时 ${slots(s)} 部`;
  const c = costOf(o);
  if (c.cast > c.total * M.castCapShare) return `演员片酬超过总成本的 40%（限薪令），换个演员档或加制作 / 宣发`;
  if (c.total > M.maxBudget[lookOf(s, 'media')]) return `超过公司能做的预算（${M.maxBudget[lookOf(s, 'media')] / 1e8} 亿）`;
  if (!canPay(s, 'company', c.total)) return '公司账户不够';
  { const w = whyCushion(s, c.total); if (w) return w; } /* V0.2.3 */
  return null;
}
/** 开机：制作费（导演、演员、制作）+ 宣发一次付；拍 30 分钟 */
export function shoot(s, o, t, rnd = Math.random) {
  const why = whyNotShoot(s, o); if (why) return { ok: false, why };
  o = { ...o, title: String(o.title || '').replace(/[《》<>]/g, '').trim().slice(0, 12) || '无名之作' }; // 片名自己起（最多 12 个字）
  const X = media(s); const c = costOf(o); const K = M.kinds[o.kind];
  pay(s, { wallet: 'company', cat: 'film_cost', amount: c.make, by: by(s), note: `娱乐传媒 ${K.name}《${o.title}》制作（导演 ${M.directors[o.dir].name}、${M.casts[o.cast].name}）` }, t);
  pay(s, { wallet: 'company', cat: 'film_cost', amount: c.pub, by: by(s), note: `娱乐传媒 ${K.name}《${o.title}》宣发` }, t);
  s.period = s.period || {}; s.period.other = (s.period.other || 0) + c.total; // 费用，所得税前扣
  const ct = addContract(s, { prefix: 'YS', kind: 'film', title: `${K.name}摄制合同`, parties: [['出品方', s.companyName || '我的公司'], ['导演', M.directors[o.dir].name], ['主演', M.casts[o.cast].name]], subject: `${K.name}《${o.title}》（${o.genre}）`, rows: [['制作费（含导演、演员片酬）', c.make], ['宣发费', c.pub]], total: c.total, wallet: 'company' }, t);
  // 质量：对数正态（大部分一般、少数爆款）× 导演 × 演员 × 题材对不对 × 经理魅力
  const m = holder(s, 'manager_media'); const charm = isSec(m) ? attrs(s, m).charm : m ? 40 : 15;
  const z = Math.sqrt(-2 * Math.log(1 - rnd() * 0.999999)) * Math.cos(2 * Math.PI * rnd());
  const hot = o.genre === hotGenre(s, t);
  const q = M.box.median * Math.exp(M.box.sigma * z) * M.directors[o.dir].k * M.casts[o.cast].k * M.publicity[o.pub].k * (hot ? M.hotGenre : 1) * (1 + charm / 200);
  X.seq += 1; const f = { id: X.seq, ...o, cost: c, q, hot, stage: 'shoot', at: t + gm(M.months[o.kind].shoot) * MONTH_MS, start: t, result: null, contract: ct.no };
  X.films.push(f); return { ok: true, film: f };
}
/** 结算：电影按真实分账（专项资金 5%、税金附加 3.3% → 院线 57%、发行 4% → 片方约 39%）+ 网络版权；剧集卖平台（固定价 + 分账） */
function settle(s, f, t) {
  let rev, res;
  if (f.kind === 'film') {
    const B = M.box; const gross = Math.round(B.market * f.q); // 票房看片子本身，不跟成本成正比
    const net = gross * (1 - B.fund - B.surcharge); const producer = r2(net * (1 - B.cinema - B.distributor)); const rights = r2(f.cost.make * B.rights);
    rev = producer + rights; res = { gross, fund: r2(gross * B.fund), sur: r2(gross * B.surcharge), cinema: r2(net * B.cinema), dist: r2(net * B.distributor), producer, rights };
  } else {
    const D = M.drama; const fixed = r2(f.cost.total * D.fixed); const share = r2(Math.max(0, f.q - D.shareFrom) * D.shareK * f.cost.total);
    rev = fixed + share; res = { fixed, share };
  }
  receive(s, { wallet: 'company', cat: 'revenue', amount: rev, party: f.kind === 'film' ? '发行公司' : '视频平台', by: by(s), note: `娱乐传媒 ${M.kinds[f.kind].name}《${f.title}》${f.kind === 'film' ? '片方分账 + 网络版权' : '平台采购 + 分账'}` }, t);
  track(s, 'media', rev, 0); // 增值税 6%、所得税跟着月 / 季走
  f.result = { ...res, rev, profit: r2(rev - f.cost.total) }; f.stage = 'done'; f.doneAt = t;
}

/** 每秒 / 离线：拍摄 → 上映 → 结算；每个游戏月：文化事业建设费（直播广告部分 3%）；联动标记 */
export function tickMedia(s, t) {
  if (!s.inds.media) return [];
  const X = media(s); const ev = [];
  s.flags.mediaReBoost = M.link.reSell; // 地产开盘去化 +10%（core/realestate.js 读）
  for (const f of X.films) {
    for (let g = 0; g < 3 && f.at && t >= f.at; g++) {
      const mo = M.months[f.kind];
      if (f.stage === 'shoot' && mo.post) { f.stage = 'post'; f.at += gm(mo.post) * MONTH_MS; ev.push(`《${f.title}》杀青，进后期`); }
      else if (f.stage === 'shoot' || f.stage === 'post') { f.stage = 'release'; f.at += gm(mo.release) * MONTH_MS; ev.push(`《${f.title}》${f.kind === 'film' ? '上映' : '交平台播出'}了`); }
      else if (f.stage === 'release') { const at = f.at; f.at = 0; settle(s, f, at); ev.push(`《${f.title}》${f.kind === 'film' ? `票房 ${(f.result.gross / 1e8).toFixed(2)} 亿` : '结算了'}，${f.result.profit >= 0 ? '赚' : '亏'} ${Math.round(Math.abs(f.result.profit) / 1e4)} 万`); }
    }
  }
  const dt = X.lastT != null ? Math.max(0, Math.min(t - X.lastT, 24 * 3600e3)) / 1000 : 0; X.lastT = t;
  X.adRev += liveRevPerSec(s) * M.live.adShare * dt;
  const m = monthIndex(s, t); if (X.month == null) X.month = m;
  while (X.month < m) {
    X.month += 1; const at = s.createdAt + X.month * MONTH_MS; const fee = r2(X.adRev * M.live.cultureFee);
    if (fee >= 0.01) payTaxItem(s, { kind: '文化事业建设费', label: '直播广告', base: X.adRev, rate: M.live.cultureFee, amount: fee, note: '文化事业建设费（广告收入 3%）' }, at, isSec(holder(s, 'cfo')) ? holder(s, 'cfo') : '');
    X.adRev = 0;
  }
  return ev;
}
