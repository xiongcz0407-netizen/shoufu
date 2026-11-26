// 设计37 第三节 3：秘书四项属性（魅力 / 智慧 / 交际 / 管理）在这一版代码里真实影响了什么。
// 每一项：attrs 看哪几项（多项取平均）、name 名字、post 在什么职位才生效（null = 任何时候都算）、need 没生效时写的「当上 X 后」、
// val(A, ctx) → 显示的值（A = 假设的属性，ctx = { eff 职位效率 }）。升级框拿「前 → 后」，培养页「?」列整张表。
// 改了游戏里的公式，这里要跟着改（test/secfx.test.mjs 拿真函数对过几项）。
import { attrs as secAttrs, postOfSec, kindOf, efficiency } from './posts.js?v=a24b4431';
import { MANAGE_CFG } from './manage.js?v=a24b4431';
import { WAR } from './war.js?v=a24b4431';
import { AGENDA_CFG, scheduler } from './agenda.js?v=a24b4431';
import { TECH_CFG } from './tech.js?v=a24b4431';
import P from '../config/posts.json?v=a24b4431' with { type: 'json' };
import LX from '../config/luxury.json?v=a24b4431' with { type: 'json' };
import AU from '../config/auction.json?v=a24b4431' with { type: 'json' };
import NG from '../config/negotiate.json?v=a24b4431' with { type: 'json' };
import { SCFG as STK_CFG, seeCount as seeN } from './stocks.js?v=a24b4431';   // 设计54 看得到几只

export const ATTR_NAME = { charm: '魅力', wit: '智慧', social: '交际', manage: '管理' };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const mul = (x, d = 2) => `×${x.toFixed(d)}`;
const avg = (A, ks) => ks.reduce((a, k) => a + (A[k] || 0), 0) / ks.length;
const card = (id) => WAR.plays[id];
const warVal = (ids) => (A) => `${Math.round(A[card(ids[0]).attr] || 0)}`;

/** 整张表。group：生效的场合（培养页「?」按这个分段） */
export const EFFECTS = [
  // —— 工资（四项都算，属性越高要得越多）——
  { attrs: ['charm', 'wit', 'social', 'manage'], post: null, name: '要的月薪（市场价）', val: (A, c) => salaryAt(c.s, c.id, A) },
  // —— 店长（这条线）——
  { attrs: ['manage'], post: 'manager', need: '当上店长后', name: '这条线营业额', val: (A, c) => `+${pct(A.manage / 100 * c.eff * P.manager.revK)}` },
  { attrs: ['manage'], post: 'manager', need: '当上店长后', name: '这条线进货成本', val: (A, c) => `−${pct(A.manage / 100 * c.eff * P.manager.costK)}` },
  { attrs: ['manage'], post: 'manager', need: '当上店长后', name: '每天自动砍价、拉熟客的效果', val: (A) => { const M = MANAGE_CFG.auto; return pct((M.base + A.manage / M.per) * (1 + A.manage / M.secPer)); } },
  { attrs: ['manage'], post: 'manager', need: '当上店长后', name: '月底出事故', val: (A) => (A.manage < P.manager.accidentBelow ? `管理到 ${P.manager.accidentBelow} 就不会（还差 ${P.manager.accidentBelow - A.manage}）` : '已经不会') },
  { attrs: ['manage'], post: 'manager', need: '当上店长后', name: '后期大项目主持更顺（所有店长的管理平均）', val: () => '' },
  { attrs: ['wit'], post: 'manager_tech', need: '当上科技店长后', name: '研发做成的把握', val: (A) => `+${pct(A.wit / 100 * TECH_CFG.quality.witK, 0)}` },
  { attrs: ['charm'], post: 'manager_media', need: '当上娱乐传媒店长后', name: '电影 / 剧的票房', val: (A) => `+${pct(A.charm / 200, 0)}` },
  // —— 其他职位 ——
  { attrs: ['manage', 'social'], post: 'steward', need: '当上资产管家后', name: '车房飞机的持有成本', val: (A, c) => mul(1 - avg(A, ['manage', 'social']) / 100 * c.eff * P.steward.upkeepK, 3) },
  { attrs: ['social'], post: 'steward', need: '当上资产管家后', name: '资产卖回价', val: (A) => `买价的 ${pct(P.steward.sellBase + Math.min(1, A.social / 100) * P.steward.sellK, 0)}` },
  { attrs: ['wit'], post: 'cfo', need: '当上财务总监后', name: '报税出错', val: (A) => (A.wit < P.cfo.errBelow ? `智慧到 ${P.cfo.errBelow} 就不会（还差 ${P.cfo.errBelow - A.wit}）` : '已经不会') },
  { attrs: ['wit'], post: 'cfo', need: '当上财务总监后', name: '小微企业额度快满时提醒你（智慧 ≥ 40）', val: (A) => (A.wit >= P.cfo.remindSmallWit ? '会' : '不会') },
  { attrs: ['social'], post: 'biz', need: '当上商务总监后', name: '名表名包配货额度', val: (A) => mul(1 + A.social / 100 * LX.quotaBiz) },
  { attrs: ['social'], post: 'biz', need: '当上商务总监后', name: '被品牌拉黑时去求情的成功率', val: (A) => pct(clamp(A.social / 100, LX.plead.minChance, LX.plead.maxChance), 0) },
  { attrs: ['social', 'charm'], post: 'biz', need: '当上商务总监后', name: '对手来抢地挖人前的预警本事', val: (A, c) => pct(avg(A, ['social', 'charm']) / 100 * c.eff, 0) },
  { attrs: ['wit'], post: 'invest', need: '当上投资经理后', name: '投资经理每轮看得到', val: (A, c) => `${seeN(A.wit * c.eff)} 只` },   // 设计44
  { attrs: ['wit'], post: 'invest', need: '当上投资经理后', name: '投资经理吃到涨幅', val: (A, c) => pct(STK_CFG.watch.look.cBase + STK_CFG.watch.look.cK * Math.min(100, A.wit * c.eff) / 100, 0) },
  { attrs: ['wit'], post: 'collector', need: '当上收藏顾问后', name: '古玩市场掌眼（智慧）', val: (A) => `${Math.round(A.wit)}` },
  { attrs: ['social'], post: 'collector', need: '当上收藏顾问后', name: '替你代拍时对手少抬价', val: (A) => pct(A.social / 100 * AU.proxySocialK) },
  { attrs: ['social', 'wit'], post: 'ipo', need: '当上投融资总监后', name: '上市问询少问的本事', val: (A, c) => pct(avg(A, ['social', 'wit']) / 100 * c.eff, 0) },
  // —— 日程秘书（没职位、陪着你的那位）——
  { attrs: ['social'], post: 'scheduler', need: '当日程秘书（没职位陪着你）后', name: '邀请箱最多放几个', val: (A) => `${Math.min(AGENDA_CFG.invites.max, AGENDA_CFG.invites.base + Math.floor(A.social / AGENDA_CFG.invites.perSocial))} 个${A.social >= AGENDA_CFG.invites.tierSocial ? '，档次高一档' : ''}` },
  // —— 不用职位，带她去就算 ——
  { attrs: ['manage'], post: null, name: '商战「价格战」她的本事', val: warVal(['price']) },
  { attrs: ['charm'], post: null, name: '商战「广告投放」她的本事', val: warVal(['ad']) },
  { attrs: ['social'], post: null, name: '商战「渠道独家 / 挖人 / 舆论公关」她的本事', val: warVal(['channel']) },
  { attrs: ['wit'], post: null, name: '商战「供应链压价」她的本事', val: warVal(['supply']) },
  { attrs: ['social'], post: null, name: '带她谈判：「她陪着谈」筹码', val: (A) => (A.social >= NG.chips.socialMin ? '已经能用' : `还差 ${NG.chips.socialMin - A.social} 点能用`) },
  { attrs: ['charm', 'social'], post: null, name: '带她当女伴出席：表现加成', val: (A) => `+${pct(((A.charm || 0) + (A.social || 0)) / 800)}` },
  { attrs: ['wit'], post: null, name: '让她看盘：提前看到消息 / 看得准', val: (A) => `${pct(Math.min(1, A.wit / STK_CFG.watch.tip.earlyDiv), 0)} / ${pct(Math.min(1, STK_CFG.watch.tip.rightBase + A.wit / STK_CFG.watch.tip.rightDiv), 0)}` },
  { attrs: ['wit'], post: null, name: '看盘：看得到 / 吃到涨幅 / 最多赚', val: (A) => { const L = STK_CFG.watch.look; const w = Math.min(100, A.wit); if (w >= 100) return '100% 准，买在最低、卖在最高'; return `${seeN(w)} 只 / ${pct(L.cBase + L.cK * w / 100, 0)} / ${(100 * (L.gBase + w * L.gK)).toFixed(1)}%`; } }, // 设计41 第四节
  { attrs: ['social'], post: null, name: '出差「签约」（选最好的那个）效果', val: (A) => mul(1 + Math.min(100, A.social) / 200) },
  { attrs: ['wit'], post: null, name: '出差「看地」效果', val: (A) => mul(1 + Math.min(100, A.wit) / 200) },
  { attrs: ['charm'], post: null, name: '出差「见投资人」效果', val: (A) => mul(1 + Math.min(100, A.charm) / 200) },
  { attrs: ['manage'], post: null, name: '出差「考察市场」效果', val: (A) => mul(1 + Math.min(100, A.manage) / 200) },
  { attrs: ['wit', 'social', 'manage'], post: null, name: '经营事件：这项最高的秘书给你出主意（越高越准）', val: () => '' },
];

/** 假设属性是 A 时她要的月薪（跟 posts.marketSalary 一个算法） */
function salaryAt(s, id, A) {
  if (!s || !id) return '';
  if (!s.title && P.starterSalary) return '打工人阶段固定';
  const key = postOfSec(s, id); const kind = key ? kindOf(key) : null; const ks = kind && P.posts[kind] ? P.posts[kind].attrs : ['charm', 'wit', 'social', 'manage'];
  const base = kind ? P.posts[kind].base : P.assistantBase; const k = P.salaryAttrBase + avg(A, ks) / 100 * P.salaryAttrK;
  return `¥${(Math.round(base * k * (P.scaleByTitle[s.title] ?? 1) / 10) * 10).toLocaleString()}`;
}
/** 她现在是不是在这一项要的职位上；返回 { on, eff } */
function where(s, id, post) {
  if (!post) return { on: true, eff: 1 };
  if (post === 'scheduler') return { on: scheduler(s) === id, eff: 1 };
  const key = postOfSec(s, id); if (!key) return { on: false, eff: 1 };
  const ok = post.startsWith('manager_') ? key === post : kindOf(key) === post;
  return { on: ok, eff: ok ? efficiency(s, id, key) : 1 };
}
/** 这位秘书、某项属性（或几项）的效果表：[{ name, on, need, val }]；A 不给就用她现在的属性 */
export function effectsOf(s, id, keys, A = secAttrs(s, id)) {
  const ks = [].concat(keys);
  return EFFECTS.filter((e) => e.attrs.some((k) => ks.includes(k))).map((e) => { const w = where(s, id, e.post); return { name: e.name, on: w.on, need: e.need || '', val: e.val(A, { eff: w.eff, s, id }) }; });
}
/** 升级框用：属性从 A0 变到 A1，列每一项「前 → 后」（生效的在前；没变的不列；整项没作用的标 need） */
export function diffOf(s, id, A0, A1) {
  const ks = Object.keys(ATTR_NAME).filter((k) => (A0[k] || 0) !== (A1[k] || 0));
  const out = EFFECTS.filter((e) => e.attrs.some((k) => ks.includes(k)) && e.val(A0, { eff: 1, s, id }) !== '').map((e) => { const w = where(s, id, e.post); return { name: e.name, on: w.on, need: e.need || '', from: e.val(A0, { eff: w.eff, s, id }), to: e.val(A1, { eff: w.eff, s, id }) }; });
  return out.filter((x) => x.from !== x.to).sort((a, b) => b.on - a.on);
}
