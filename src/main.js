import { APP_V, versionText } from './version.js?v=385b5781';
import { fitPhone, onVisibility } from './platform/screen.js?v=385b5781';
import { preloadAll } from './platform/assets.js?v=385b5781';
import { game, start, stop } from './game.js?v=385b5781';
import { initDebug, addDebug } from './debug.js?v=385b5781';
import { buildMain, setNetWorth } from './ui/main-screen.js?v=385b5781';
import { buildNav, flashTab } from './ui/shell.js?v=385b5781';
import { registerPages, setSegment } from './ui/pages.js?v=385b5781';
import { renderIndustry, renderHR } from './ui/company.js?v=385b5781';
import { renderPosts } from './ui/posts.js?v=385b5781';
import { renderFinance } from './ui/wealth.js?v=385b5781';
import { renderBank } from './ui/bank.js?v=385b5781';
import { openNaming } from './ui/naming.js?v=385b5781';
import * as INB from './core/inbox.js?v=385b5781';
import { hookCompany } from './core/company.js?v=385b5781';
import * as BO from './core/boss.js?v=385b5781';
import { setBossAttrs } from './ui/boss.js?v=385b5781';
import { accruePayables } from './core/accrual.js?v=385b5781';
import { tickPosts } from './core/postwork.js?v=385b5781';
import * as ST from './core/staff.js?v=385b5781';
import { openIndustry } from './ui/industry.js?v=385b5781';
import { openSecretaryList } from './ui/secretary.js?v=385b5781';
import { playStory } from './ui/story.js?v=385b5781';
import * as SC from './core/secretary.js?v=385b5781';
import * as TR from './core/training.js?v=385b5781';
import { GRAD_LINES, COURSE_BY_ID } from './config/courses.js?v=385b5781';
import { say, setTapLine, setSwitchHandler, setHomeAction, setTodoProvider, setFloatState } from './ui/main-screen.js?v=385b5781';
import { openInbox } from './ui/inbox.js?v=385b5781';
import { openBoss } from './ui/boss.js?v=385b5781';
import { openMall } from './ui/mall.js?v=385b5781';
import { openDetail } from './ui/secretary.js?v=385b5781';
import { openWardrobe } from './ui/outfit.js?v=385b5781';
import { openTab } from './ui/shell.js?v=385b5781';
import * as LG from './core/ledger.js?v=385b5781';
import { MONTH_MS, monthIndex } from './core/gametime.js?v=385b5781';
import * as A from './core/affection.js?v=385b5781';
import { openGift } from './ui/gift.js?v=385b5781';
import { openDate } from './ui/date.js?v=385b5781';
import { LOVE_STAGE_STORIES } from './config/love-stories.js?v=385b5781';
import { setDateOutfit } from './ui/date.js?v=385b5781';
import { openShop, wearShow } from './ui/outfit.js?v=385b5781';
import * as OF from './core/outfits.js?v=385b5781';
import { PLACE_BY_ID } from './config/dates.js?v=385b5781';
import { openBattle } from './ui/battle.js?v=385b5781';
import * as AS from './core/assets.js?v=385b5781';
import { setDateCar } from './ui/date.js?v=385b5781';
import { openDaily, openSettings, hasDailyTodo } from './ui/daily.js?v=385b5781';
import { openCounter } from './ui/counter.js?v=385b5781'; // V2-04 站柜台
import './ui/negotiate.js?v=385b5781'; // V2-06 谈判：注册房东涨租的「谈」
import './ui/meeting.js?v=385b5781'; // V2-13 每周经营会：消息「开经营会」、每秒结周 / 约会
import { openAgenda } from './ui/agenda.js?v=385b5781'; // V3-02 日程表
import * as AGD from './core/agenda.js?v=385b5781';
import * as CTR from './core/counter.js?v=385b5781';
import { hint, withHint, HINTS } from './ui/guide.js?v=385b5781';
import * as BT from './core/battle.js?v=385b5781';
import { PROMOTE_STORIES } from './config/battle-lines.js?v=385b5781';
import { toast } from './ui/dom.js?v=385b5781';
import { now } from './core/clock.js?v=385b5781';
import { JOIN_STORIES } from './config/stories.js?v=385b5781';
import { openPanel, h } from './ui/dom.js?v=385b5781';
import * as E from './core/economy.js?v=385b5781';
import { fmtMoney, fmtDuration } from './core/format.js?v=385b5781';
import { SECRETARIES, SEC_BY_ID } from './config/secretaries.js?v=385b5781';
import { TITLES } from './config/titles.js?v=385b5781';
import * as EV from './core/events.js?v=385b5781';
import * as RE from './core/realestate.js?v=385b5781';
import { startFunds, needsStart } from './core/start.js?v=385b5781';
import * as CP from './core/capital.js?v=385b5781';
import * as PL from './core/pledge.js?v=385b5781';
import { settleAway } from './core/away.js?v=385b5781';
import ECO from './config/economy.json?v=385b5781' with { type: 'json' };
import * as LGI from './core/logistics.js?v=385b5781';
import * as TC from './core/tech.js?v=385b5781';
import * as MD from './core/media.js?v=385b5781';
import * as RV from './core/rivalry.js?v=385b5781';
import * as BK from './core/bank.js?v=385b5781';
import { COURSES } from './config/courses.js?v=385b5781';
import POSTS_CFG from './config/posts.json?v=385b5781' with { type: 'json' };
import { showAwayBill as showAwayPaper } from './ui/awaybill.js?v=385b5781';
import * as OC from './core/offcap.js?v=385b5781';
import * as RG from './core/rivalgrow.js?v=385b5781';
import { mountGoals } from './ui/goals.js?v=385b5781'; // 第 P-06 项：新手目标链
import './core/trade.js?v=385b5781'; // 第 P-06 项：条件单、打新、两融、周报（挂在股市每跳上）
import * as MG from './core/manage.js?v=385b5781';
import * as BE from './core/bizevents.js?v=385b5781';

const $ = (s) => document.querySelector(s);
const phone = $('#phone');
fitPhone(phone);
$('.load-ver').textContent = versionText(APP_V);

// 公司月结（发工资、交税、月报）挂在游戏时钟上
hookCompany();
// 产钱：在线每秒、离线结算
game.addTicker((s, dt) => { E.unlockIfReady(s); E.tickIncome(s, dt, SEC_BY_ID); accruePayables(s, now()); tickPosts(s, now()); AS.tickUpkeep(s, dt); assetNotices(s); for (const hh of ST.processHires(s, now())) toast(`${hh.n} 个${ST.PAY.roles[hh.role].name}到岗了`); checkJoins(s); checkEvents(s); reTick(s); for (const x of LGI.tickLogi(s, now())) toast(x, 2600); for (const x of RV.tickRivalry(s, now())) toast(x, 2600); for (const x of BK.tickBank(s, now())) toast(x, 2600); for (const x of CP.tickCapital(s, now())) toast(x, 2600); for (const x of PL.tickPledge(s, now())) toast(x, 2600); for (const x of MG.tickManage(s, now())) toast(x, 2600); for (const x of BE.tickEvents(s, now())) toast(x, 2600); /* P-05 经营、事件（事件只在线来） */ for (const x of MD.tickMedia(s, now())) { toast(x, 2600); INB.addMsg(s, { kind: 'system', type: 'media', title: x, body: '公司 → 产业 → 娱乐传媒' }, now()); } for (const x of TC.tickTech(s, now())) { toast(x, 2600); INB.addMsg(s, { kind: 'system', type: 'tech', title: x, body: '公司 → 产业 → 科技' }, now()); } newIndustries(s); finishCourses(s); A.dailyDecay(s, now()); promote(s); if (s.cash >= 1e5) s.flags.cash100k = true; });

// 认筹到期、订单到货、品牌来电：进消息中心 + 首页左侧「限时」
function assetNotices(s) {
  const t = now();
  for (const f of s.freezes || []) if (t >= f.until && !f.told) { f.told = true; INB.addMsg(s, { kind: 'invite', type: 'asset_ready', title: `认筹期满：${AS.label(AS.ITEM[f.id])}`, body: '验资通过，可以签合同了（资产 → 房产 → 去买）。', actions: [{ key: 'approve', label: '知道了' }] }, t); }
  for (const o of s.orders || []) if (t >= o.at && !o.told) { o.told = true; INB.addMsg(s, { kind: 'invite', type: 'asset_ready', title: `${o.ch === 'invite' ? '品牌经理来电' : o.ch === 'custom' ? '定制委托接受了' : '到货了'}：${AS.label(AS.ITEM[o.id])}`, body: '去「资产 → 去买」签合同。', actions: [{ key: 'approve', label: '知道了' }] }, t); }
}
let bootDone = false; // 进游戏的问候说完以后，新开放的页签才马上说
// 升称号：身价到线 + 收购了最终对手
function promote(s) {
  const t = BT.promoteIfReady(s, E.canPromote, now());
  if (t == null) return;
  playStory(PROMOTE_STORIES[t] || [{ who: 'narr', text: `你升为「${TITLES[t].name}」！` }], { sec: 's09_xia', title: `升为「${TITLES[t].name}」` });
  // 每升一档：培训位 +1、新课程、秘书市场月薪按规模系数涨（她们会来谈加薪）、办公室和头像换档（设计20 第一节）
  const nc = COURSES.filter((c) => c.unlockTitle === t).map((c) => `「${c.name}」`).join('');
  const k = (POSTS_CFG.scaleByTitle[t] ?? 1) / (POSTS_CFG.scaleByTitle[t - 1] ?? 1);
  INB.addMsg(s, { kind: 'system', type: 'promote', title: `升为「${TITLES[t].name}」`, body: [`培训位 +1（现在 ${TR.slotCount(s)} 个）`, nc && `新课程${nc}`, k > 1 && `公司规模上来了，秘书市场月薪 ×${+k.toFixed(2)}（她们会陆续来谈加薪）`].filter(Boolean).join('；') }, now());
  game.save();
}
// 地产项目到点往下走：要你拍板的（开工、卖还是持有）进消息中心，其余出提示
function reTick(s) {
  for (const [p, text] of RE.tickRE(s, now())) {
    if (p.stage === 'ready' || p.stage === 'built') INB.addMsg(s, { kind: 'system', type: 're', from: (s.positions || {}).manager_realestate || '', title: `${p.name}：${text}`, body: '公司 → 产业 → 地产 → 我的项目' }, now());
    toast(`${p.name}：${text}`, 2600);
  }
}
// 新产业解锁：陪着的秘书说一句（设计20 第一节），第一次打开出提示
const IND_LINES = { realestate: '老板，地产能做了！土地市场每个月挂地，拿地只能用自己的钱哦。', logistics: '物流也能做了，有了自己的车队，便利店和服装进货都便宜。', tech: '科技公司可以开了！先立项做产品，研发期只花钱……', media: '娱乐传媒开了～直播、拍电影，我想去片场看看！' };
function newIndustries(s) {
  const said = (s.flags.indSaid = s.flags.indSaid || {});
  for (const id of Object.keys(s.inds)) {
    if (said[id] || !IND_LINES[id]) continue; said[id] = true;
    if (bootDone) setTimeout(() => say(s.current, IND_LINES[id], 4200), 800);
    INB.addMsg(s, { kind: 'system', type: 'unlock', title: `新产业：${({ realestate: '地产', logistics: '物流', tech: '科技', media: '娱乐传媒' })[id]}`, body: '公司 → 产业' }, now());
  }
}
// 事件（团建、财务危机、招聘会）：到了进消息中心，陪着的秘书说一句
function checkEvents(s) {
  const cfg = EV.checkEvents(s, now()); if (!cfg) return;
  toast(`新事件：${cfg.msg.title}`, 2600, { top: true });
  if (cfg.notify && bootDone) setTimeout(() => say(s.current, cfg.notify, 4200), 400);
  game.save();
}

// 结业：加属性，出一句台词
function finishCourses(s) {
  for (const d of TR.finishDue(s, now())) {
    toast(`${SEC_BY_ID[d.sec].name}「${COURSE_BY_ID[d.course].name}」结业`);
    INB.addMsg(s, { kind: 'system', type: 'course', from: d.sec, title: `${SEC_BY_ID[d.sec].name}「${COURSE_BY_ID[d.course].name}」结业`, body: Object.entries(d.gain).map(([k, v]) => `${({ charm: '魅力', wit: '智慧', social: '交际', manage: '管理' })[k]} +${v}`).join('　') }, now());
    say(d.sec, GRAD_LINES[d.sec] || '结业啦！');
    game.save();
  }
}

// 新秘书加入：存档里加上，播剧情
function checkJoins(s) {
  for (const id of SC.checkJoins(s)) {
    playStory(JOIN_STORIES[id] || [], { sec: id, title: `${SEC_BY_ID[id].name} 加入了` });
    game.save();
  }
}
game.addOffline((s, away, t) => {
  if (away < 60) return;
  AS.tickUpkeep(s, away); // 离线期间车房飞机的持有成本照扣
  // 离线不封顶（设计21）：按游戏日一段段补算，地产、物流、科技、传媒、对手、银行到点的事照常走
  const capCtx = { news: [] }; const cap0 = OC.snap(s); const rv0 = RG.snapRivals(s); // P-00：对手这段时间长了多少 // 第 3-09 项：股市、基金、上市、要约、集团、地标也离线补
  const ticks = [...OC.capitalTicks(t, capCtx), (x, tt) => CP.tickCapital(x, tt), (x, tt) => PL.tickPledge(x, tt), (x, tt) => MG.tickManage(x, tt), (x, tt) => RE.tickRE(x, tt), (x, tt) => LGI.tickLogi(x, tt), (x, tt) => TC.tickTech(x, tt), (x, tt) => MD.tickMedia(x, tt), (x, tt) => RV.tickRivalry(x, tt), (x, tt) => BK.tickBank(x, tt)];
  const bill = settleAway(s, t - away * 1000, t, { secById: SEC_BY_ID, ticks });
  BE.resetTimer(s, t); OC.finishNews(s, capCtx, t); bill.capital = OC.diff(cap0, OC.snap(s)); bill.rivals = RG.diffRivals(s, rv0);
  if (away >= ECO.offline.billMinSec) showAwayBill(bill);
});
/** 「离开期间」账单：纸张样式，公司 / 个人两段 + 秘书替你做了什么（第 2-16a 项，ui/awaybill.js） */
export function showAwayBill(b) { return showAwayPaper(b); }

function debugButtons() {
  addDebug('全部', '全部解锁（秘书、页签、提示）', (s) => { for (const c of SECRETARIES) if (!s.secs[c.id]) { s.secs[c.id] = SC.newSecRecord(); SC.ensureSec(s, c.id); } for (const k of ['battle', 'assets', 'wealth']) s.ui.unlocked[k] = true; s.flags.introDone = true; s.flags.hints = Object.fromEntries(Object.keys(HINTS).map((k) => [k, true])); });
  addDebug('全部', '看离开期间账单（假装离开 3 小时）', () => { const s = game.state; const t = now(); const c0 = OC.snap(s); s.awayBill = settleAway(s, t - 3 * 3600e3, t, { secById: SEC_BY_ID, ticks: OC.capitalTicks(t) }); s.awayBill.capital = OC.diff(c0, OC.snap(s)); showAwayBill(s.awayBill); });
  addDebug('秘书', '全部解锁', (s) => { for (const c of SECRETARIES) if (!s.secs[c.id]) { s.secs[c.id] = SC.newSecRecord(); SC.ensureSec(s, c.id); } });
  addDebug('秘书', '看夏芷晴开场剧情', () => playStory(JOIN_STORIES.s09_xia, { sec: 's09_xia' }));
  addDebug('秘书', '当前换下一套衣服', (s) => { const o = s.secs[s.current]; o.outfit = 'c' + ((parseInt(o.outfit.slice(1)) % 11) + 1); });
  addDebug('称号', '升一级', (s) => { s.title = Math.min(TITLES.length - 1, s.title + 1); E.unlockIfReady(s); });
  addDebug('称号', '降一级', (s) => { s.title = Math.max(0, s.title - 1); });
  addDebug('产业', '便利店 +10 级', (s) => { s.inds.store.level += 10; });
  addDebug('好感', '当前秘书好感 +100', (s) => { const r = A.addFavor(s, s.current, 100); if (r.stageUp) game.emit('favorUp', s.current, r); });
  addDebug('好感', '当前秘书爱慕 +20', (s) => { const r = A.addLove(s, s.current, 20); if (r.stageUp) game.emit('loveUp', s.current, r); });
  addDebug('商战', '当前阶段对手都赢 3 次', (s) => { for (const r of BT.activeRivals(s)) BT.rivalState(s, r.id).wins = Math.max(3, BT.rivalState(s, r.id).wins); });
  addDebug('商战', '次数加满', (s) => { s.battleEnergy = null; });
  addDebug('事件', '升到老板（身价够、恒远算收购）', (s) => { s.flags.acquired = { ...(s.flags.acquired || {}), hengyuan: true }; s.title = Math.max(s.title, 1); LG.receive(s, { wallet: 'company', cat: 'refund', amount: Math.max(0, 1.1e7 - E.netWorth(s)), note: '调试' }, now()); });
  addDebug('事件', '下一件事件马上来（不等间隔和条件里的时间）', (s) => { s.eventLastAt = 0; s.flags.titleAt = s.flags.titleAt || {}; for (const k of Object.keys(s.flags.titleAt)) s.flags.titleAt[k] -= 3600e3; for (const st of Object.values(s.events || {})) st.snoozeUntil = 0; });
  addDebug('事件', '事件全部重置', (s) => { s.events = {}; s.eventLastAt = 0; for (const f of ['teamBuild1', 'financeCrisis1', 'jobFair1']) delete s.flags[f]; for (const id of ['s07_tang', 's08_xu', 's04_gu']) delete s.secs[id]; });
  addDebug('培养', '所有课马上结业', (s) => { for (const x of s.training) x.end = now(); });
}

async function boot() {
  const r = await preloadAll((d, n) => {
    $('.load-fill').style.width = (n ? (d / n) * 100 : 100) + '%';
    $('.load-text').textContent = n ? `正在加载 ${d}/${n}` : '正在加载…';
  });
  if (r.fails.length) console.warn('有素材没读到', r.fails);
  game.load();
  if (needsStart(game.state)) startFunds(game.state, now()); // 开局：20 万存款，15 万开第一家小店（设计21）
  E.unlockIfReady(game.state);
  if (game.state.needStaffUp) { for (const id of Object.keys(game.state.inds)) ST.staffUp(game.state, id); delete game.state.needStaffUp; }
  setNetWorth(E.netWorth);
  const main = $('#screen-main');
  buildMain(main);
  mountGoals(main);
  registerPages();
  setSegment('company.industry', renderIndustry);
  setSegment('company.hr', renderHR);
  setSegment('company.posts', renderPosts);
  setSegment('wealth.finance', renderFinance);
  setSegment('wealth.bank', renderBank);
  buildNav(main);
  setTapLine((s, id) => {
    const r = A.tapSec(s, id, now());
    if (r.favor && r.favor.stageUp) game.emit('favorUp', id, r.favor);
    return r;
  });
  // 首页：左浮动（签到、限时）、右浮动（商场、约会、衣柜）、头像 → 老板页、铃铛 → 消息、长按立绘 → 详情
  setHomeAction('daily', openDaily);
  setHomeAction('limited', () => openInbox('invite'));
  setHomeAction('mall', withHint('gift', (id) => openMall(id)));
  setHomeAction('date', withHint('date', openDate));
  setHomeAction('wardrobe', (id) => openWardrobe(id));
  setHomeAction('detail', (id) => openDetail(id));
  setHomeAction('boss', openBoss);
  setHomeAction('inbox', () => openInbox());
  setHomeAction('agenda', () => openAgenda()); // V3-02
  setHomeAction('counter', () => { const id = CTR.homeShop(game.state); if (id) openCounter(id); else toast('还没有能站柜台的小店'); });
  setFloatState((s) => {
    const inv = (s.inbox || []).some((m) => m.kind === 'invite' && m.status === 'open');
    return { daily: { red: hasDailyTodo(s, now()) }, limited: { show: inv, red: inv }, counter: { show: CTR.homeShow(s) }, agenda: { show: AGD.unlocked(s), red: AGD.unlocked(s) && AGD.pendingCount(s, now()) > 0 } };
  });
  // 待办条：请示 · 结业 · 月报；没事时显示本月公司收入
  setTodoProvider((s) => {
    const c = INB.counts(s);
    const done = (s.inbox || []).filter((m) => m.type === 'course' && !m.read).length;
    const parts = [];
    if (c.request.open) parts.push(`请示 ${c.request.open}`);
    if (c.event.open) parts.push(`事件 ${c.event.open}`);
    if (done) parts.push(`结业 ${done}`);
    if (c.report.unread) parts.push(`月报 ${c.report.unread}`);
    if (c.invite.open) parts.push(`邀请 ${c.invite.open}`);
    if (parts.length) return { text: '📋 ' + parts.join(' · '), onClick: () => openInbox(c.request.open ? 'request' : c.event.open ? 'event' : done ? 'system' : c.report.unread ? 'report' : 'invite') };
    const t = now(); const from = s.createdAt + monthIndex(s, t) * MONTH_MS;
    const rev = LG.query(s, { wallet: 'company', cat: 'revenue', from }).reduce((a, r) => a + r.amount, 0) + Object.values(s.accruals || {}).reduce((a, x) => a + (x.cat === 'revenue' ? x.amount : 0), 0);
    return { text: `本月公司营收 <span class="g">+${fmtMoney(rev)}</span>`, onClick: () => openTab('company') };
  });
  // 衣服：好感到了自动换上；约会 20 次送专属衣服；约会按地点穿
  game.on('favorUp', (id) => { const o = OF.autoWear(game.state, id); if (o) wearShow(id, o); });
  game.on('dateOutfit', (id) => { OF.grantDateOutfit(game.state, id); const o = OF.autoWear(game.state, id); if (o) wearShow(id, o); });
  setDateOutfit((s, id, placeId) => OF.outfitForDate(s, id, PLACE_BY_ID[placeId].dress, placeId)); // V3-05 按款式
  AS.recalc(game.state);
  // 老板属性（设计09）：气场让好感、爱慕涨得快；显示在老板页
  A.setAura((st) => BO.bossAttrs(st).aura);
  setBossAttrs((st) => { const b = BO.bossAttrs(st); return [
    { name: '气场', value: b.aura, from: `车 · 商战胜率 +${(BO.auraBattle(st) * 100).toFixed(1)}% · 好感 ×${A.favorMult(st).toFixed(2)}` },
    { name: '人脉', value: b.network, from: `豪宅、收购 · 收购成功率 +${(BO.networkAcquire(st) * 100).toFixed(1)}%` },
    { name: '眼光', value: b.vision, from: `飞机、分店、称号、古董 · 产钱 +${(BO.visionIncome(st) * 100).toFixed(1)}% · 商战看穿底牌 +${(BO.visionBattle(st) * 100).toFixed(1)}% · 古玩市场掌眼 ${Math.min(100, Math.round(b.vision))}%` }]; });
  setDateCar((s) => { const c = AS.bestCar(s); return c ? { tier: AS.carTierForDate(s), name: `${c.brand} ${c.model}`, rarity: AS.rarityOf(c), count: c.limitedN } : { tier: 0, name: '' }; });
  // 页签第一次打开出提示；新开放的页签闪一下
  game.on('tabOpened', (k) => setTimeout(() => hint(k), 350));
  const OPEN_LINES = { battle: '老板，便利店开到两家了，隔壁鑫鑫便利坐不住了——可以去「商战」会会他们！', assets: '个人现金有 10 万了！「资产」开了，买辆车撑撑场面吧？', wealth: '第一个月结束了，工资和税都交了。「财富」里能看到账。' };
  const saidOpen = () => (game.state.flags.openSaid = game.state.flags.openSaid || {});
  game.on('tabUnlocked', (k) => { if (!game.state.flags.introDone) return; flashTab(k); if (OPEN_LINES[k] && bootDone) { saidOpen()[k] = true; setTimeout(() => say(game.state.current, OPEN_LINES[k], 4200), 600); } if (k === 'wealth') setTimeout(() => hint('payroll'), 4400); });
  // 老存档：页签已经开放、但秘书还没说过那一句 → 回到首页时补说（一次说一句）
  const sayPendingOpen = () => {
    const s = game.state; if (!s.flags.introDone || !document.querySelector('.page-layer.hidden') || document.querySelector('.full, .story')) return;
    const k = Object.keys(OPEN_LINES).find((x) => s.ui.unlocked[x] && !saidOpen()[x]); if (!k) return;
    saidOpen()[k] = true; say(s.current, OPEN_LINES[k], 4200); game.save();
  };
  game.on('tabClosed', () => setTimeout(sayPendingOpen, 500));
  setTimeout(() => { bootDone = true; sayPendingOpen(); }, 4500); // 进游戏的问候说完再补
  // 新功能第一次提示
  game.on('tabOpened', (k) => { const s = game.state; if (k === 'company') setTimeout(() => { if (Object.keys(s.inds).some((id) => Object.keys(ST.shortage(s, id)).length)) hint('hire'); else if (Object.keys(s.secs).length >= 2) hint('posts'); }, 900); });
  // 爱慕到新阶段：小剧情
  game.on('loveUp', (id, r) => {
    const c = SEC_BY_ID[id];
    for (let st = SC.loveStage(r.from) + 1; st <= SC.loveStage(r.to); st++) {
      const S = LOVE_STAGE_STORIES[st]; if (!S) continue;
      const nm = (x) => x.replace(/\{name\}/g, c.name);
      playStory([{ who: 'narr', text: nm(S.lines[0]) }, { who: st === 1 ? id : 'narr', text: nm(S.lines[1]) }, { who: id, text: S.last[c.type] }],
        { sec: id, outfit: game.state.secs[id].outfit, title: `${c.name} · ${S.title}` });
    }
  });
  setSwitchHandler((id) => { const r = A.switchTo(game.state, id, now()); say(id, r.line, 3600, r.scene); });
  for (const id of Object.keys(game.state.secs)) SC.ensureSec(game.state, id);
  $('#screen-loading').classList.add('out'); setTimeout(() => $('#screen-loading').classList.add('hidden'), 650); // 加载页淡出（设计22）
  main.classList.remove('hidden');
  debugButtons();
  initDebug(phone);
  start();
  // 进游戏：当前秘书问候（冷落久了就吃醋）
  if (!game.state.flags.introDone) {
    // 新开局：起名 → 开场剧情（夏芷晴报到）→ 指一下「公司」
    A.markWith(game.state, 's09_xia', now());
    if (!game.state.bossName) await openNaming();
    playStory(JOIN_STORIES.s09_xia, { sec: 's09_xia', title: '首富之路', onEnd: () => { game.state.flags.introDone = true; game.save(); hint('start', '.nav-btn[data-key=company]'); } });
  } else {
    setTimeout(() => { const g = A.switchTo(game.state, game.state.current, now()); say(game.state.current, g.line, 3600, g.scene); }, 600);
  }
  // 今天没签到：弹每日（新手引导没走完时不弹，第 13 项）
  // 一天第一次进游戏、人在首页（没开页面 / 弹层 / 剧情）才弹一次每日；平时只在左侧「签到」亮红点
  setTimeout(() => {
    const s = game.state; const d = A.daily(s, now());
    const busy = document.querySelector('.story, .full, .panel-mask, .naming, .hint') || !document.querySelector('.page-layer.hidden');
    if (s.flags.introDone && !d.dailyShown && !busy && hasDailyTodo(s, now())) { d.dailyShown = true; openDaily(); }
  }, 1500);
  onVisibility(stop, start);
  window.addEventListener('pagehide', () => game.save());
}
boot();
