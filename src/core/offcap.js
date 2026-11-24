// 第 3-09 项：离线补算里的资本部分（股市、基金、上市、要约、集团费用、地标收租和估值）
// main.js 的 settleAway 按游戏日一段段叫这些（跟在线 ticker 叫的是同一批函数，所以结果一样）；前后各拍一张快照，离开期间对账单里列出来
import * as SK from './stocks.js?v=691ed83a';
import * as FD from './funds.js?v=691ed83a';
import * as LS from './listing.js?v=691ed83a';
import * as TKO from './takeover.js?v=691ed83a';
import * as GR from './group.js?v=691ed83a';
import * as LMK from './landmark.js?v=691ed83a';
import { recalc } from './assets.js?v=691ed83a';
import { addMsg } from './inbox.js?v=691ed83a';
import * as TR from './trade.js?v=691ed83a';
import * as MT from './meeting.js?v=691ed83a'; // V2-13 每周经营会
import * as RL from './richlist.js?v=691ed83a'; // V2-14 财富榜：跨年发榜（只发最近一年的）
import * as AGD from './agenda.js?v=691ed83a'; // V3-02 日程表：离线时秘书替你推掉，不扣

const TICK_MS = SK.SCFG.tickSec * 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (n) => (Math.abs(n) >= 1e8 ? `${+(n / 1e8).toFixed(2)}亿` : Math.abs(n) >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : `${Math.round(n)}`);

/** 离线补算要叫的（to = 回来的时刻；股市照在线规矩只补最近 7 天）。ctx 收集这段时间的大新闻 */
export function capitalTicks(to, ctx = { news: [] }) {
  ctx.news = ctx.news || [];
  return [
    (s, t) => {
      if (!s.mkt) return;
      if (to - t > SK.SCFG.offlineMaxTicks * TICK_MS) return;   // 太久以前的跳过（在线回来也只补 7 天）
      const r = SK.advance(s, t); for (const n of r.news) if (Math.abs(n.jump) >= 0.05) ctx.news.push(n);
      SK.dividends(s, t);
      const rep = SK.mgrReport(s, t); if (rep) addMsg(s, { kind: 'report', type: 'invest_report', from: rep.who && rep.who !== 'outsource' ? rep.who : '', title: '投资经理汇报', body: rep.text }, t);
      if (r.ticks) recalc(s);
    },
    (s, t) => { if (s.mkt) TR.tick(s, t, ctx.rnd); },   // 第 P-06 项：打新、两融利息、炒股周报（条件单、平仓线在每跳里）
    (s, t) => { if (!s.fund) return; for (const x of FD.tick(s, t)) addMsg(s, { kind: 'system', type: 'fund', title: x, body: '财富 → 投资 → 基金' }, t); },
    (s, t) => { if (s.listing) LS.tick(s, t, ctx.rnd); },
    (s, t) => { if (s.takeover) TKO.tick(s, t); },
    (s, t) => { if (s.group) GR.tick(s, t); },
    (s, t) => { if (s.landmark) LMK.tick(s, t, ctx.rnd); },
    (s, t) => { MT.tick(s, t, ctx.rnd); },
    (s, t) => { RL.tick(s, t); },   // V2-14：跨年发榜、首次上榜奖励
    (s, t) => { AGD.tick(s, t, { offline: true }, ctx.rnd); },   // V3-02   // V2-13：结上周、约这周的会；到点没开按平均分（七折）
  ];
}
/** 补算结束：股市大新闻汇总成一条消息 */
export function finishNews(s, ctx, t) {
  if (!ctx.news.length) return;
  const big = ctx.news.slice().sort((a, b) => Math.abs(b.jump) - Math.abs(a.jump)).slice(0, 5);
  addMsg(s, { kind: 'system', type: 'stock_news', title: '你不在的时候，股市里……', body: big.map((n) => `${n.title} ${n.jump > 0 ? '+' : ''}${(n.jump * 100).toFixed(1)}%`).join('\n') }, t);
}

/** 快照：大盘、个人股票基金、公司持股、自己公司的股价、地标、上市进度、要约、集团 */
export function snap(s) {
  return {
    idx: s.mkt ? SK.index(s) : null,
    mine: s.mkt ? r2(SK.myShareValue(s) + ((s.mkt.mgr && s.mkt.mgr.value) || 0)) : 0,
    fund: s.fund ? r2(FD.value(s)) : 0,
    co: r2(TKO.coValue(s)),
    self: LS.listed(s) ? { px: s.listing.listed.px, cap: LS.marketCap(s) } : null,
    stage: s.listing && s.listing.stage ? s.listing.stage : null,
    lmRent: s.landmark ? r2(LMK.mine(s).reduce((a, id) => a + (LMK.lm(s).own[id].rentTotal || 0), 0)) : 0,
    lmVal: s.landmark ? r2(LMK.value(s)) : 0,
    lmN: s.landmark ? LMK.mine(s).length : 0,
    offers: s.takeover ? Object.keys(s.takeover.offers || {}).length : 0,
    ctrl: s.takeover ? Object.keys(s.takeover.ctrl || {}).length : 0,
    group: s.group ? { hold: GR.holdingReady(s), red: (s.group.red && s.group.red.done.length) || 0, hitech: !!(s.group.hitech && s.group.hitech.ready) } : null,
  };
}
const pctTxt = (a, b) => (a ? `${b >= a ? '+' : ''}${((b / a - 1) * 100).toFixed(1)}%` : '');
/** 两张快照比一比：对账单里「资本」那段，每行 [项目, 说明] */
export function diff(a, b) {
  const out = [];
  if (a.idx != null && b.idx != null && a.idx !== b.idx) out.push(['大盘指数', `${a.idx.toFixed(2)} → ${b.idx.toFixed(2)}（${pctTxt(a.idx, b.idx)}）`]);
  if (a.mine || b.mine) out.push(['你的股票（含投资经理）', `${fmt(a.mine)} → ${fmt(b.mine)}（${pctTxt(a.mine, b.mine)}）`]);
  if (a.fund || b.fund) out.push(['你的基金', `${fmt(a.fund)} → ${fmt(b.fund)}`]);
  if (a.co || b.co) out.push(['公司持有的股票', `${fmt(a.co)} → ${fmt(b.co)}`]);
  if (b.self) out.push(['你公司的股价', a.self ? `${a.self.px.toFixed(2)} → ${b.self.px.toFixed(2)}（${pctTxt(a.self.px, b.self.px)}），市值 ${fmt(b.self.cap)}` : `上市了！市值 ${fmt(b.self.cap)}`]);
  if (a.stage !== b.stage && b.stage) out.push(['上市进度', `${LS.STAGE[a.stage] || '还没开始'} → ${LS.STAGE[b.stage]}`]);
  else if (b.stage && b.stage !== 'listed') out.push(['上市进度', LS.STAGE[b.stage]]);
  if (b.lmN) out.push(['地标租金', `收了 ${fmt(b.lmRent - a.lmRent)}；估值 ${fmt(a.lmVal)} → ${fmt(b.lmVal)}`]);
  else if (a.lmN) out.push(['地标', `卖掉了 ${a.lmN - b.lmN} 座`]);
  if (a.offers > b.offers) out.push(['要约收购', `${a.offers - b.offers} 个要约期满了${b.ctrl > a.ctrl ? `，新控股 ${b.ctrl - a.ctrl} 家` : ''}（详情在消息中心）`]);
  if (b.group && a.group) {
    if (!a.group.hold && b.group.hold) out.push(['集团架构', '控股公司成立了']);
    if (b.group.red > a.group.red) out.push(['红筹架构', `办好了 ${b.group.red - a.group.red} 步（${b.group.red} / 4）`]);
    if (!a.group.hitech && b.group.hitech) out.push(['高新技术企业', '认定通过，企业所得税 15%']);
  }
  return out;
}
