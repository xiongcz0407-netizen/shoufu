import * as LV from './core/love.js?v=b846574c';   // 设计56
import './ui/birthday.js?v=b846574c';   // 设计56 生日小条
import { APP_V, versionText } from './version.js?v=b846574c';
import { fitPhone, onVisibility } from './platform/screen.js?v=b846574c';
import { preloadAll } from './platform/assets.js?v=b846574c';
import { game, start, stop } from './game.js?v=b846574c';
import { initDebug, addDebug } from './debug.js?v=b846574c';
import { buildMain, setNetWorth } from './ui/main-screen.js?v=b846574c';
import { buildNav, flashTab } from './ui/shell.js?v=b846574c';
import { registerPages, setSegment } from './ui/pages.js?v=b846574c';
import { renderIndustry, renderHR } from './ui/company.js?v=b846574c';
import { renderPosts } from './ui/posts.js?v=b846574c';
import { renderFinance } from './ui/wealth.js?v=b846574c';
import { renderBank } from './ui/bank.js?v=b846574c';
import { openNaming } from './ui/naming.js?v=b846574c';
import * as INB from './core/inbox.js?v=b846574c';
import { hookCompany } from './core/company.js?v=b846574c';
import * as BO from './core/boss.js?v=b846574c';
import { setBossAttrs } from './ui/boss.js?v=b846574c';
import { accruePayables } from './core/accrual.js?v=b846574c';
import { tickPosts } from './core/postwork.js?v=b846574c';
import * as ST from './core/staff.js?v=b846574c';
import { openIndustry } from './ui/industry.js?v=b846574c';
import { openSecretaryList } from './ui/secretary.js?v=b846574c';
import { playStory, bgOf, officeBg } from './ui/story.js?v=b846574c';
import * as SC from './core/secretary.js?v=b846574c';
import * as TR from './core/training.js?v=b846574c';
import { COURSE_BY_ID } from './config/courses.js?v=b846574c';
import { say, setTapLine, setSwitchHandler, setHomeAction, setTodoProvider, setFloatState, dressUp } from './ui/main-screen.js?v=b846574c';
import * as DR from './core/dress.js?v=b846574c';   // 设计74 秘书自己换衣服
import { openInbox } from './ui/inbox.js?v=b846574c';
import * as BI from './ui/brandinv.js?v=b846574c';
import * as COUP from './core/coupon.js?v=b846574c'; // 设计39 金券（开发2）
import { mountCouponChip, openWallet } from './ui/coupon.js?v=b846574c';
import { openRoutine, routineTodo } from './ui/routine.js?v=b846574c';
let couponT = 0; // 设计35 第九、十节 品牌邀请不过期（开发2）
import './ui/upgradebox.js?v=b846574c'; // 设计37 第三节：升级框 + 好感升阶 / 老板属性看守（开发2）
import { openBoss } from './ui/boss.js?v=b846574c';
import { openMall } from './ui/mall.js?v=b846574c';
import { openDetail } from './ui/secretary.js?v=b846574c';
import { openWardrobe } from './ui/outfit.js?v=b846574c';
import { openTab } from './ui/shell.js?v=b846574c';
import * as LG from './core/ledger.js?v=b846574c';
import { MONTH_MS, monthIndex } from './core/gametime.js?v=b846574c';
import * as A from './core/affection.js?v=b846574c';
import { openGift } from './ui/gift.js?v=b846574c';
import { openDate } from './ui/date.js?v=b846574c';
import { loveStory } from './core/lovestory.js?v=b846574c';   // 设计88（通用版 LOVE_STAGE_STORIES 在里面兜底）
import { setDateOutfit } from './ui/date.js?v=b846574c';
import './ui/askvisit.js?v=b846574c'; // 设计96 主动要求（开发2）
import { checkLineOpen } from './core/joinflags.js?v=b846574c'; // 人物02
import { openShop, wearShow } from './ui/outfit.js?v=b846574c';
import * as OF from './core/outfits.js?v=b846574c';
import { PLACE_BY_ID } from './config/dates.js?v=b846574c';
import { openBattle, finishWarNow } from './ui/battle.js?v=b846574c';
import { ACQ_DISC } from './config/rivals.js?v=b846574c';   // 设计64
import * as AS from './core/assets.js?v=b846574c';
import { setDateCar } from './ui/date.js?v=b846574c';
import * as RD from './core/ride.js?v=b846574c'; // 设计71 座驾
import { openDaily, openSettings, hasDailyTodo } from './ui/daily.js?v=b846574c';
import './ui/negotiate.js?v=b846574c'; // V2-06 谈判：注册房东涨租的「谈」
import './ui/meeting.js?v=b846574c'; // V2-13 每周经营会：消息「开经营会」、每秒结周 / 约会
import { openAgenda } from './ui/agenda.js?v=b846574c'; // V3-02 日程表
import * as AGD from './core/agenda.js?v=b846574c';
import { hint, withHint, HINTS } from './ui/guide.js?v=b846574c';
import * as BT from './core/battle.js?v=b846574c';
import { PROMOTE_STORIES } from './config/battle-lines.js?v=b846574c';
import { toast } from './ui/dom.js?v=b846574c';
import { now } from './core/clock.js?v=b846574c';
import { JOIN_STORIES } from './config/stories.js?v=b846574c';
import { openPanel, h } from './ui/dom.js?v=b846574c';
import * as E from './core/economy.js?v=b846574c';
import { fmtMoney, fmtDuration } from './core/format.js?v=b846574c';
import { SECRETARIES, SEC_BY_ID, outfitCountOf } from './config/secretaries.js?v=b846574c';
import { TITLES } from './config/titles.js?v=b846574c';
import * as EV from './core/events.js?v=b846574c';
import * as RE from './core/realestate.js?v=b846574c';
import { startFunds, needsStart } from './core/start.js?v=b846574c';
import * as CP from './core/capital.js?v=b846574c';
import * as PL from './core/pledge.js?v=b846574c';
import { settleAway } from './core/away.js?v=b846574c';
import * as BKS from './core/books.js?v=b846574c';   // 设计79
import ECO from './config/economy.json?v=b846574c' with { type: 'json' };
import * as LGI from './core/logistics.js?v=b846574c';
import * as TC from './core/tech.js?v=b846574c';
import * as MD from './core/media.js?v=b846574c';
import * as RV from './core/rivalry.js?v=b846574c';
import * as BK from './core/bank.js?v=b846574c';
import POSTS_CFG from './config/posts.json?v=b846574c' with { type: 'json' };
import { IND_BY_ID } from './config/industries.js?v=b846574c'; // 设计39 自动上阵提醒
import { setRoutineHooks } from './ui/routine.js?v=b846574c';
import * as UPS from './ui/upshow.js?v=b846574c';
import { mountWageLock } from './ui/wagelock.js?v=b846574c'; // V0.2.9 工资锁只提醒
mountWageLock();
import * as UPN from './core/upnote.js?v=b846574c';
import { titleOpened } from './core/upbuild.js?v=b846574c';
import { showAwayBill as showAwayPaper } from './ui/awaybill.js?v=b846574c';
import * as OC from './core/offcap.js?v=b846574c';
import * as RG from './core/rivalgrow.js?v=b846574c';
import { mountGoals } from './ui/goals.js?v=b846574c'; // 第 P-06 项：新手目标链
import './core/trade.js?v=b846574c'; // 第 P-06 项：条件单、打新、周报、闲钱生息（挂在股市每跳上）
import * as MG from './core/manage.js?v=b846574c';
import * as BE from './core/bizevents.js?v=b846574c';
import * as CF from './core/cashflow.js?v=b846574c';
import { mountFundBar } from './ui/fund.js?v=b846574c';
import './core/flow.js?v=b846574c'; // 设计40 收益流水（开发2）：挂上 tickIncome / receive 的挂钩

const $ = (s) => document.querySelector(s);
const phone = $('#phone');
fitPhone(phone);
$('.load-ver').textContent = versionText(APP_V);

// 公司月结（发工资、交税、月报）挂在游戏时钟上
hookCompany();
// 产钱：在线每秒、离线结算
game.addTicker((s) => UPS.pump(s, now()));
setRoutineHooks({ actions: (s, t) => MG.actionsText(s, t) }); // 设计39 今日日常：亲自上阵状态
MG.setAutoActWarn((s, id, until, t) => { INB.addMsg(s, { kind: 'system', type: 'auto_act', title: `${IND_BY_ID[id] ? IND_BY_ID[id].name : id}自动上阵明天到期`, body: `到期以后 4 个动作不再自动续，要续在金券里买（1 天 20、1 周 100）。` }, t); toast(`${IND_BY_ID[id] ? IND_BY_ID[id].name : ''}自动上阵明天到期`, 3000); }); // 设计39 第二节 // V0.2.5 升级框排队（设计37 第三节）
game.addTicker((s) => { const m = CF.tickFund(s, now()); if (m) toast(m.title, 3000); const n = CF.autoFill(s, now()); if (n) toast(`人事自动补了 ${n} 个人`, 2000); }); // V0.2.3 资金链急报；V0.2.4 自动补员
game.addTicker((s, dt) => { E.unlockIfReady(s); E.tickIncome(s, dt, SEC_BY_ID); accruePayables(s, now()); tickPosts(s, now()); AS.tickUpkeep(s, dt); assetNotices(s); for (const hh of ST.processHires(s, now())) toast(`${hh.n} 个${ST.PAY.roles[hh.role].name}到岗了`); checkJoins(s); checkEvents(s); reTick(s); for (const x of LGI.tickLogi(s, now())) toast(x, 2600); for (const x of RV.tickRivalry(s, now())) toast(x, 2600); for (const x of BK.tickBank(s, now())) toast(x, 2600); for (const x of CP.tickCapital(s, now())) toast(x, 2600); for (const x of PL.tickPledge(s, now())) toast(x, 2600); for (const x of MG.tickManage(s, now())) toast(x, 2600); for (const x of BE.tickEvents(s, now())) toast(x, 2600); /* P-05 经营、事件（事件只在线来） */ for (const x of MD.tickMedia(s, now())) { toast(x, 2600); INB.addMsg(s, { kind: 'system', type: 'media', title: x, body: '公司 → 产业 → 娱乐传媒' }, now()); } for (const x of TC.tickTech(s, now())) { toast(x, 2600); INB.addMsg(s, { kind: 'system', type: 'tech', title: x, body: '公司 → 产业 → 科技' }, now()); } newIndustries(s); finishCourses(s); A.dailyDecay(s, now()); promote(s); if (s.cash >= 1e5) s.flags.cash100k = true; });

// 认筹到期、订单到货、品牌来电：进消息中心 + 首页左侧「限时」
function assetNotices(s) {
  const t = now();
  for (const f of s.freezes || []) if (t >= f.until && !f.told) { f.told = true; INB.addMsg(s, { kind: 'invite', type: 'asset_ready', title: `认筹期满：${AS.label(AS.ITEM[f.id])}`, body: '验资通过，可以签合同了（资产 → 房产 → 去买）。', actions: [{ key: 'approve', label: '知道了' }] }, t); }
  for (const o of s.orders || []) if (t >= o.at && !o.told) { o.told = true; BI.notify(s, 'car', o, `${o.ch === 'invite' ? '品牌经理来电' : o.ch === 'custom' ? '定制委托接受了' : '到货了'}：${AS.label(AS.ITEM[o.id])}`, '去「资产 → 去买」签合同。'); } // 设计35 第九节：不过期，签了才关
}
let bootDone = false; // 进游戏的问候说完以后，新开放的页签才马上说
// 升称号：身价到线 + 收购了最终对手
function promote(s) {
  const t = BT.promoteIfReady(s, E.canPromote, now());
  if (t == null) return;
  playStory(PROMOTE_STORIES[t] || [{ who: 'narr', text: `你升为「${TITLES[t].name}」！` }], { sec: 's09_xia', title: `升为「${TITLES[t].name}」`, bg: officeBg(t) });   /* 设计78：升上去那个称号的办公室 */
  // 每升一档：秘书市场月薪按规模系数涨（她们会来谈加薪）、办公室和头像换档（设计20 第一节）
  const k = (POSTS_CFG.scaleByTitle[t] ?? 1) / (POSTS_CFG.scaleByTitle[t - 1] ?? 1);
  const opened = titleOpened(t);   // 设计101：课程不再随称号开放 UPN.noteUp(s, { title: '升称号', what: `升为「${TITLES[t].name}」`, fx: [], opened, next: t + 1 < TITLES.length ? `下一个称号：${TITLES[t + 1].name}` : '' }, now()); /* V0.2.5 升称号加「开放了」 */
  INB.addMsg(s, { kind: 'system', type: 'promote', title: `升为「${TITLES[t].name}」`, body: [opened.length && `开放了：${opened.join('；')}`, k > 1 && `公司规模上来了，秘书市场月薪 ×${+k.toFixed(2)}（她们会陆续来谈加薪）`].filter(Boolean).join('；') }, now());
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

// 设计35 第八节：上课立刻学完；老存档里正在上的课读档时直接结业（不出消息）
function finishCourses(s) { if ((s.training || []).length) { TR.finishDue(s); game.save(); } }

// 设计78：加入剧情的背景
const JOIN_BG = { s03_lin: 'bg_meeting', s01_shen: 'bg_meeting', s02_su: 'bg_meeting', s04_gu: 'bg_meeting', s08_xu: 'bg_finance', s11_qiao: 'bg_jet_cabin' };   // 人物01：乔希雅在私人飞机舱门边
// 新秘书加入：存档里加上，播剧情
function checkJoins(s) {
  AS.checkFirstJet(s);   // 人物01：升企业家那一刻（之前就有飞机的）也算
  checkLineOpen(s);   // 人物02：企业家 + 开了科技 / 娱乐传媒线 → 温语棠 / 白若溪
  for (const id of SC.checkJoins(s)) {
    playStory(JOIN_STORIES[id] || [], { sec: id, title: `${SEC_BY_ID[id].name} 加入了`, bg: bgOf(JOIN_BG[id]) });   // 设计78：会议室 / 财务室，其他人走兜底（办公室）
    game.save();
  }
}
game.addOffline((s, away, t) => {
  const wf = s.war && s.war.open ? finishWarNow() : null;   // 设计64：没打完的商战（关了游戏 / 切了后台）先让秘书打完，再补算离线
  if (away < 60) return;
  AS.tickUpkeep(s, away); // 离线期间车房飞机的持有成本照扣
  // 离线不封顶（设计21）：按游戏日一段段补算，地产、物流、科技、传媒、对手、银行到点的事照常走
  const capCtx = { news: [] }; const cap0 = OC.snap(s); const rv0 = RG.snapRivals(s); // P-00：对手这段时间长了多少 // 第 3-09 项：股市、投资账户利息、上市、要约、集团、地标也离线补
  const ticks = [...OC.capitalTicks(t, capCtx), (x, tt) => CP.tickCapital(x, tt), (x, tt) => PL.tickPledge(x, tt), (x, tt) => MG.tickManage(x, tt), (x, tt) => RE.tickRE(x, tt), (x, tt) => LGI.tickLogi(x, tt), (x, tt) => TC.tickTech(x, tt), (x, tt) => MD.tickMedia(x, tt), (x, tt) => RV.tickRivalry(x, tt), (x, tt) => BK.tickBank(x, tt)];
  const bill = settleAway(s, t - away * 1000, t, { secById: SEC_BY_ID, ticks });
  bill.agenda = AGD.takeOffNew(s);   // 设计69：离线时新来了几个邀请
  BE.resetTimer(s, t); OC.finishNews(s, capCtx, t); bill.capital = OC.diff(cap0, OC.snap(s)); bill.rivals = RG.diffRivals(s, rv0);
  if (wf) bill.rivals = [...(bill.rivals || []), ['商战', wf.text]];   // 设计64：对账单写一行
  bill.ups = UPN.flushAuto(s, t, true); /* V0.2.5 托管离线自动升的：首页弹汇总 + 账单列一段 */
  if (away >= ECO.offline.billMinSec) showAwayBill(bill);
});
/** 「离开期间」账单：纸张样式，公司 / 个人两段 + 秘书替你做了什么（第 2-16a 项，ui/awaybill.js） */
export function showAwayBill(b) { return showAwayPaper(b); }

function debugButtons() {
  addDebug('全部', '全部解锁（秘书、页签、提示）', (s) => { for (const c of SECRETARIES) if (!s.secs[c.id]) { s.secs[c.id] = SC.newSecRecord(); SC.ensureSec(s, c.id); } for (const k of ['battle', 'assets', 'wealth']) s.ui.unlocked[k] = true; s.flags.introDone = true; s.flags.hints = Object.fromEntries(Object.keys(HINTS).map((k) => [k, true])); });
  addDebug('全部', '看离开期间账单（假装离开 3 小时）', () => { const s = game.state; const t = now(); const c0 = OC.snap(s); s.awayBill = settleAway(s, t - 3 * 3600e3, t, { secById: SEC_BY_ID, ticks: OC.capitalTicks(t) }); s.awayBill.capital = OC.diff(c0, OC.snap(s)); showAwayBill(s.awayBill); });
  addDebug('秘书', '全部解锁', (s) => { for (const c of SECRETARIES) if (!s.secs[c.id]) { s.secs[c.id] = SC.newSecRecord(); SC.ensureSec(s, c.id); } });
  addDebug('秘书', '看夏芷晴开场剧情', () => playStory(JOIN_STORIES.s09_xia, { sec: 's09_xia' }));
  addDebug('秘书', '当前换下一套衣服', (s) => { const o = s.secs[s.current]; o.outfit = 'c' + ((parseInt(o.outfit.slice(1)) % outfitCountOf(s.current)) + 1); }); /* 设计66 */
  addDebug('称号', '升一级', (s) => { s.title = Math.min(TITLES.length - 1, s.title + 1); E.unlockIfReady(s); });
  addDebug('称号', '降一级', (s) => { s.title = Math.max(0, s.title - 1); });
  addDebug('产业', '便利店 +10 级', (s) => { s.inds.store.level += 10; });
  addDebug('好感', '当前秘书好感 +100', (s) => { const r = A.addFavor(s, s.current, 100); if (r.stageUp) game.emit('favorUp', s.current, r); });
  addDebug('好感', '当前秘书爱慕 +20', (s) => { const r = A.addLove(s, s.current, 20, { cross: true }); if (r.stageUp) game.emit('loveUp', s.current, r); });
  addDebug('商战', '当前阶段对手都赢 3 次', (s) => { for (const r of BT.activeRivals(s)) BT.rivalState(s, r.id).wins = Math.max(3, BT.rivalState(s, r.id).wins); });
  addDebug('商战', '商战券 +10', (s) => { BT.addTickets(s, 10); }); addDebug('全部', '精力 +100', (s) => { MG.addEnergy(s, 100, now()); });
  addDebug('事件', '升到老板（身价够、恒远算收购）', (s) => { s.flags.acquired = { ...(s.flags.acquired || {}), hengyuan: true }; s.title = Math.max(s.title, 1); LG.receive(s, { wallet: 'company', cat: 'refund', amount: Math.max(0, 1.1e7 - E.netWorth(s)), note: '调试' }, now()); });
  addDebug('事件', '下一件事件马上来（不等间隔和条件里的时间）', (s) => { s.eventLastAt = 0; s.flags.titleAt = s.flags.titleAt || {}; for (const k of Object.keys(s.flags.titleAt)) s.flags.titleAt[k] -= 3600e3; for (const st of Object.values(s.events || {})) st.snoozeUntil = 0; });
  addDebug('事件', '事件全部重置', (s) => { s.events = {}; s.eventLastAt = 0; for (const f of ['teamBuild1', 'financeCrisis1', 'jobFair1']) delete s.flags[f]; for (const id of ['s07_tang', 's08_xu', 's04_gu']) delete s.secs[id]; });
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
  DR.dressTick(game.state, now());   // 设计74：打开游戏时过了一个游戏天就先换好再显示（离线不补换几次）
  if (game.state.needStaffUp) { for (const id of Object.keys(game.state.inds)) ST.staffUp(game.state, id); delete game.state.needStaffUp; }
  setNetWorth(E.netWorth);
  const main = $('#screen-main');
  buildMain(main);
  mountFundBar(main); // V0.2.3 资金链红条（设计35）
  mountGoals(main);
  registerPages();
  setSegment('company.industry', renderIndustry);
  setSegment('company.hr', renderHR);
  setSegment('company.posts', renderPosts);
  setSegment('wealth.finance', renderFinance);
  setSegment('wealth.bank', renderBank);
  buildNav(main);
  mountCouponChip(); // 设计39：顶栏「🎫 N」（开发2）
  game.addTicker((s) => { const ch = DR.dressTick(s, now()); for (const [id, o] of ch) if (id === s.current) dressUp(id, o); /* 设计74：主页看着她就换装淡出淡入，不说话不弹框 */ if (ch.length) game.save(); });
  game.addTicker((s) => { const t = now(); if (t - (couponT || 0) < 1000) return; couponT = t; for (const x of COUP.tick(s, t)) toast(`${x.n ? `🎫 金券 +${x.n}（${x.why}）` : x.why}${x.gifts ? `，送${x.gifts}` : ''}`, 2600); });
  setTapLine((s, id) => {
    const r = A.tapSec(s, id, now());
    if (r.favor && r.favor.stageUp) game.emit('favorUp', id, r.favor);
    return r;
  });
  // 首页：左浮动（签到、限时）、右浮动（商场、约会、衣柜）、头像 → 老板页、铃铛 → 消息、长按立绘 → 详情
  setHomeAction('daily', openDaily);
  setHomeAction('limited', () => openInbox()); // 设计39：品牌邀请这些在「重要」
  setHomeAction('routine', () => openRoutine()); // 设计39 今日日常（开发2）
  setHomeAction('wallet', () => openWallet()); // 设计39 卡包（开发2）
  setHomeAction('mall', withHint('gift', (id) => openMall(id)));
  setHomeAction('date', withHint('date', openDate));
  setHomeAction('wardrobe', (id) => openWardrobe(id));
  setHomeAction('detail', (id) => openDetail(id));
  setHomeAction('boss', openBoss);
  setHomeAction('inbox', () => openInbox());
  setHomeAction('agenda', () => openAgenda()); // V3-02
  setFloatState((s) => {
    const inv = (s.inbox || []).some((m) => m.kind === 'invite' && m.status === 'open');
    return { daily: { red: hasDailyTodo(s, now()) }, limited: { show: inv, red: inv }, routine: { show: true, red: routineTodo(s, now()) }, wallet: { show: true }, agenda: { show: AGD.unlocked(s), red: AGD.unlocked(s) && AGD.pendingCount(s, now()) > 0 } };
  });
  // 待办条：请示 · 结业 · 月报；没事时显示本月公司收入
  setTodoProvider((s) => {
    // 设计39：重要 N 件（永久挂着）· 经营还没做的 · 月报；点了先进「重要」
    const c = INB.tabCounts(s); const imp = c.important.n;
    const parts = [];
    if (imp) parts.push(`重要 <b class="todo-n">${imp}</b> 件`);
    if (c.biz.n) parts.push(`经营 ${c.biz.n}`);
    if (c.report.unread) parts.push(`月报 ${c.report.unread}`);
    if (parts.length) return { text: '📋 ' + parts.join(' · '), onClick: () => openInbox(imp ? 'important' : c.biz.n ? 'biz' : 'report') };
    const t = now(); const from = s.createdAt + monthIndex(s, t) * MONTH_MS;
    const rev = BKS.rowsOf(BKS.cellsSince(s, from, t)).filter((r) => r.wallet === 'company' && r.cat === 'revenue').reduce((a, r) => a + r.amount, 0) +   /* 设计79：本月营收从 books */ Object.values(s.accruals || {}).reduce((a, x) => a + (x.cat === 'revenue' ? x.amount : 0), 0);
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
    { name: '人脉', value: b.network, from: `豪宅、收购 · 收购价 −${(Math.min(BO.networkAcquire(st) * ACQ_DISC.network, ACQ_DISC.networkMax) * 100).toFixed(1)}%` }, /* 设计64 */
    { name: '眼光', value: b.vision, from: `飞机、分店、称号、古董 · 产钱 +${(BO.visionIncome(st) * 100).toFixed(1)}% · 商战看穿底牌 +${(BO.visionBattle(st) * 100).toFixed(1)}% · 古玩市场掌眼 ${Math.min(100, Math.round(b.vision))}%` }]; });
  setDateCar((s) => { const c = AS.ITEM[RD.rideId(s, 'car')]; return c ? { tier: Math.min(5, c.tier), name: `${c.brand} ${c.model}`, rarity: AS.rarityOf(c), count: c.limitedN } : { tier: 0, name: '' }; }); // 设计71：开座驾（没设过 = 以前那台）
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
      const tk = st === 5 && game.state.secs[id].token && game.state.secs[id].token.given ? LV.tokenOf(id) : null;   // 设计56：收下定情信物那句
      const L = loveStory(c, st, tk && tk.accept); if (!L) continue;   // 设计88：每个秘书自己的五段，没有才用通用版
      playStory(L.steps,
        { sec: id, outfit: game.state.secs[id].outfit, title: `${c.name} · ${L.title}`, bg: bgOf('bg_love') || bgOf('bg_date_4') });   // 设计78：爱慕剧情用专门的暧昧背景
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
    playStory(JOIN_STORIES.s09_xia, { sec: 's09_xia', title: '首富之路', skip: true, onEnd: () => { game.state.flags.introDone = true; game.save(); hint('start', '.nav-btn[data-key=company]'); } });
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
