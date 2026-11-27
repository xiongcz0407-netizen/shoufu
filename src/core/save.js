// 只有一个存档，自动存；带存档版本号，新版本必须能读旧存档
import { APP_V } from '../version.js?v=b846574c';
import { mkt, fillNew } from './stocks.js?v=b846574c';

export const SAVE_KEY = 'shoufu_save';
export const SAVE_VERSION = 2; // 第一次发布（V0.1）是 1；2：V0.2 取消境外账户（设计30，core/migrate.js v1to2）
import { v1to2 } from './migrate.js?v=b846574c';
import { dropOrphans } from './orphans.js?v=b846574c';
import { recallEmpty } from './posts.js?v=b846574c';
import { trimAll } from './cap.js?v=b846574c';   // 设计79：读档整理一次（列表封顶）
import { buildBooks } from './books.js?v=b846574c';
import { replayHooks } from './ledger.js?v=b846574c';
import { runLoadFix } from './loadfix.js?v=b846574c';   // 各模块挂的读档整理（设计86 约会券退金券在 core/coupon.js）
import './slim.js?v=b846574c';
import './slimday.js?v=b846574c';

/** 局号：每开一局一个 */
export const newGid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** 新开局的存档。以后加字段：在这里加默认值即可（读旧档时自动补上） */
export function defaultState(t = Date.now()) {
  const s = {
    saveV: SAVE_VERSION,
    appV: APP_V,
    createdAt: t,
    gid: newGid(),    // 局号：「重新开始」换新的（云端判断是不是换了一局，设计22）
    lastSeen: t,      // 上次在线（算离线收益）
    cash: 0,          // 个人现金
    company: 0,       // 公司账户（开局由 core/start.js 注资开店）
    invest: 0,        // 投资账户（设计62：股票、打新、投资经理；设计72：没在用的钱自动生息）
    bossName: '', companyName: '',
    ledger: [], ledgerSeq: 0, accruals: {},
    clock: { monthsDone: 0 },
    inbox: [], inboxSeq: 0, // 消息中心
    ui: { lastSeg: {}, unlocked: {} },
    positions: { cfo: 's09_xia' }, // 秘书职位：{ manager_store: 秘书 id | 'outsource', cfo: …, steward: … }；开局夏芷晴兼财务总监（设计16）
    title: 0,         // 称号序号（TITLES）
    secs: { s09_xia: { outfit: 'c1', joinedAt: t, attrs: null, favor: 0, love: 0, rec: { dates: 0, places: {}, lastDate: null, gifts: 0, talks: 0, clothes: 0 } } }, // 已加入的秘书（结构见 core/secretary.js newSecRecord）
    current: 's09_xia', // 当前陪着的秘书
    inds: { store: { level: 1, branches: 1, spent: 0, sec: null, staff: {}, agency: {}, openedAt: t } }, // 产业（staff：在岗人数按岗位）；第一家小店老板自己看，不用招人
    hires: [],        // 招聘中的 { ind, role, n, at }
    payroll: { arrears: 0, owed: 0, bonusMonths: 1 },
    training: [],     // 在上的课 [{sec, course, start, end}]
    garage: { cars: [], planes: [], houses: [] }, // 车库 / 机库 / 房产（id 列表）
    assetValue: 0,    // 车房飞机的价值（买价 × 80%）
    acquiredValue: 0, // 收购来的公司估值
    rivals: {},       // 对手：{ id: { wins, losses, acquired, cooldownUntil } }
    flags: {},        // 剧情 / 引导标记（titleAt：升到每个称号的时间）
    events: {},       // 事件（core/events.js）：{ id: { done, msg, snoozeUntil, times } }
    eventLastAt: 0,
    stats: {},        // 累计数据
    settings: { sound: true },
  };
  mkt(s, t);   // 第 3-09b 项：开局就建好股市（开局就能炒股；离线补算、上市后自己的股价都靠它）；读档没有的，fillDefaults 会补上
  return s;
}

// 存档升级：MIGRATIONS[n] 把 saveV = n 的档升到 n+1。字段改名、结构变化写在这里
export const MIGRATIONS = {
  // 发布以后每改一次存档结构：SAVE_VERSION + 1，这里加一条 n: (s) => { …; return s; }
  1: (s) => v1to2(s),   // V0.1 → V0.2：境外余额转回个人现金（设计30）
};

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }

/** 把默认值里有、旧档里没有的字段补上（不覆盖已有的值） */
export function fillDefaults(s, d) {
  for (const k of Object.keys(d)) {
    if (!(k in s)) s[k] = structuredClone(d[k]);
    else if (isObj(d[k]) && isObj(s[k])) fillDefaults(s[k], d[k]);
  }
  return s;
}

/** 读到的 JSON 对象 → 当前版本的存档 */
export function upgrade(raw, t = Date.now()) {
  let s = raw;
  if (!isObj(s)) return defaultState(t);
  let v = s.saveV || 0;
  if (v > SAVE_VERSION) throw new Error(`存档版本 ${v} 比游戏新（${SAVE_VERSION}），请更新游戏`);
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (m) s = m(s);
    v += 1;
    s.saveV = v;
  }
  fillDefaults(s, defaultState(t));
  if (Array.isArray(s.inbox)) s.inbox = s.inbox.filter((m) => m.type !== 'stock_ws');
  if (isObj(s.mkt)) { dropOrphans(s.mkt); fillNew(s.mkt); }   // 设计54：老存档补新股票（按起始价，从这一跳开始跳）   // V0.2.16：老版本看盘留下的孤儿止盈止损（买单没了、组里也没股票）撤掉   // 设计48：看盘提示不进消息了，老存档里的删掉
  delete s.fund; if (isObj(s.mkt)) delete s.mkt.margin;
  if (isObj(s.secs)) for (const r of Object.values(s.secs)) if (isObj(r) && r.favor >= 400) r.favor = 499;   // 设计76：好感到知己就满   // 设计72：老存档里的这两项直接丢（不折现）
  if (isObj(s.positions) && isObj(s.inds)) recallEmpty(s, t); /* 设计58（开发1）：还没开的线上的店长撤回 */
  if (isObj(s.mkt)) slimHist(s.mkt);
  runLoadFix(s, t);   // 设计86：约会券取消，手上剩的每张退 15 金券（core/coupon.js 挂的）
  if (buildBooks(s)) replayHooks(s, (s.ledger || []).slice().sort((a, b) => a.t - b.t || a.id - b.id));   // 设计79 第三版：老存档没有 books，用现有全部明细算一遍（今日日常的计数也补上）
  trimAll(s);   // 再把明细裁到 300、各列表封顶
  s.appV = APP_V;
  return s;
}

/** 设计79：老存档「长期」走势 400 个点 → 均匀抽成 120 个（画图就画这么多） */
function slimHist(m) {
  const L = m.long; if (!isObj(L)) return; const N = 120;
  for (const k of Object.keys(L)) { const a = L[k]; if (Array.isArray(a) && a.length > N) L[k] = Array.from({ length: N }, (_, i) => a[Math.round(i * (a.length - 1) / (N - 1))]); }
}

export function serialize(s) { return JSON.stringify(s); }

export function deserialize(str, t = Date.now()) {
  if (!str) return null;
  return upgrade(JSON.parse(str), t);
}

/** 读档 / 写档（storage 由外面传进来，测试时可以换成假的） */
export function loadGame(storage, t = Date.now()) {
  const str = storage.get(SAVE_KEY);
  if (!str) return defaultState(t);
  try { return deserialize(str, t); }
  catch (e) {
    // 坏档先备份一份，不直接丢
    storage.set(SAVE_KEY + '_bad_' + t, str);
    console.warn('存档读取失败，已备份并新开局', e);
    return defaultState(t);
  }
}

export function saveGame(storage, s, t = Date.now()) {
  s.lastSeen = t;
  return storage.set(SAVE_KEY, serialize(s));
}
