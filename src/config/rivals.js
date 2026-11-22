// 对手公司（设计02 第三节 + 汇总第七节）。stage：哪个称号阶段的对手；final：最终对手（收购了才能升称号）
// power：对手实力（跟你的身价比）；skill：对手的「属性」（跟带去的人比）；value：收购价（估值）= 年利润 profit × 行业市盈率 pe（设计21：按规模，每档最终对手约为下一档门槛的 60%～80%）
// reward：商战赢一次的奖金（小额）
// effect：收购后 —— boost 给同类产业加成；early 提前开产业；final 记最终对手
// merge：收购后对方的门店（连员工）并进来：{ 产业: 家数 }
export const RIVALS = [
  { id: 'xinxin', name: '鑫鑫便利', ind: '便利店', boss: '钱有财', bossImg: 'boss_qian', bossAge: 50, desc: '精明的小店主，爱占小便宜',
    growReal: 0.05, stage: 0, level: 1, profit: 2e5, pe: 1.5, power: 2e5, skill: 15, reward: 1000, effect: { boost: { store: 0.2 } }, merge: { store: 2 } },
  { id: 'weidao', name: '味道工坊', ind: '餐饮', boss: '周嘉豪', bossImg: 'boss_zhou', bossAge: 35, desc: '网红餐厅老板，爱面子、爱炫富',
    growReal: 0.05, stage: 0, level: 2, profit: 3.75e5, pe: 2, power: 7.5e5, skill: 22, reward: 3000, final: true, effect: { early: ['food'] }, merge: { food: 1 } },
  { id: 'hengyuan', name: '恒远集团', ind: '零售 / 服装', boss: '赵恒远', bossImg: 'boss_zhao', bossAge: 58, desc: '本地老牌董事长，老谋深算、看不起年轻人',
    growReal: 0.05, stage: 1, level: 3, profit: 3.1e6, pe: 2, power: 6.2e6, skill: 34, reward: 2e4, final: true, effect: { early: ['fashion'] }, merge: { store: 3, fashion: 1 } },
  // 每个称号收购不同的最终对手（设计21 第九节 2）：估值按门槛配（下一档门槛 × 70%），利润 = 估值 ÷ 市盈率
  // 打工人：鑫鑫（练手，30 万，不卡称号）、味道工坊（最终，70 万，林知夏）；小老板：恒远集团（最终，500 万 = 老板门槛 50%，沈清妍）；老板：华荣 3.5 亿；企业家：天穹 50 亿（3-08 Arvin 定：企业家 5 亿、大亨 100 亿，华荣、天穹跟着抬，实力 power 同比例抬）
  // 第二批（老板阶段，设计20 第三节）。估值 = 年利润 × 行业市盈率（地产 6、物流 15、科技 30、传媒 20）
  // turf：在哪个城市跟你抢哪条线（你那个城市的同行门店收入 −5%，收购了就没了）
  { id: 'jifeng', name: '疾风快运', ind: '物流', boss: '孙铁军', bossImg: 'boss_sun', bossAge: 46, desc: '退伍军人创业，强硬、说一不二，好面子不好骗',
    growReal: 0.08, stage: 2, level: 1, profit: 8e5, pe: 15, power: 8e6, skill: 38, reward: 3e4, turf: { city: 'shenzhen', ind: 'logistics' }, merge: { logistics: 2 }, effect: { fleetUnits: 12 } },
  { id: 'jincheng', name: '锦城置业', ind: '地产', boss: '何美琪', bossImg: 'boss_he', bossAge: 42, desc: '地产女强人，精明、算账快、会谈判',
    growReal: 0.04, stage: 2, level: 2, profit: 4.7e6, pe: 6, power: 2.4e7, skill: 46, reward: 5e4, effect: { reProjects: [{ stage: 'build' }, { stage: 'ready' }] } },
  { id: 'huarong', name: '华荣控股', ind: '地产 + 物流', boss: '韩振邦', bossImg: 'boss_han', bossAge: 63, desc: '老牌董事长，稳、深藏不露，有靠山',
    growReal: 0.06, stage: 2, level: 3, profit: 2.3e7, pe: 10, power: 2.3e8, skill: 55, reward: 8e4, final: true, turf: { city: 'shanghai', ind: 'logistics' }, merge: { logistics: 3 }, effect: { fleetUnits: 18, reProjects: [{ stage: 'build' }] } },
  // 第三批（企业家阶段）
  { id: 'xingmang', name: '星芒娱乐', ind: '娱乐传媒', boss: '白子轩', bossImg: 'boss_bai', bossAge: 32, desc: '明星转型老板，张扬、爱炒作、玻璃心',
    growReal: 0.1, stage: 3, level: 1, profit: 2.5e6, pe: 20, power: 5e7, skill: 52, reward: 2e5, effect: { boost: { media: 0.3 }, rights: 1.5e7 } },
  { id: 'yunzhan', name: '云栈科技', ind: '科技', boss: '陈一舟', bossImg: 'boss_chen', bossAge: 37, desc: '技术天才创始人，傲、不懂人情、只认技术',
    growReal: 0.15, stage: 3, level: 2, profit: 3.8e6, pe: 30, power: 1e8, skill: 60, reward: 3e5, effect: { techProduct: { dir: 'cloud', q: 0.9 }, levelUp: { tech: 3 } } },
  { id: 'tianqiong', name: '天穹集团', ind: '科技 + 传媒', boss: '秦啸天', bossImg: 'boss_qin', bossAge: 56, desc: '帝国掌门人，霸道、手段狠、会反击',
    growReal: 0.125, stage: 3, level: 3, profit: 1.12e8, pe: 25, power: 2.8e9, skill: 70, reward: 5e5, final: true, effect: { techProduct: { dir: 'ai', q: 0.8 }, levelUp: { tech: 3, media: 3 }, boost: { media: 0.2 } } },
];
for (const r of RIVALS) if (r.profit && r.pe) r.value = r.profit * r.pe;
// 瑞霖资本（投行，不能收购）：企业家阶段「融资谈判」，赢一次 → 苏曼琳加入 + 一笔过桥融资（利率按谈的结果）
export const RUILIN = { id: 'ruilin', name: '瑞霖资本', ind: '投资银行', boss: '苏曼琳', bossTitle: '执行董事', bossImg: null, bossSrc: 'assets/sec/s02_su/c1.webp', bossAge: 29, desc: '国内头部投行，条款一个字都不让', stage: 3, level: 2, power: 3e8, skill: 62, reward: 0, noAcquire: true,
  loan: { amount: 2e8, rateMax: 0.1, rateMin: 0.05, months: 12 } };
RIVALS.push(RUILIN);
// 对手反击（老板阶段以后）：被你赢过 2 次以上、还没收购的，每游戏月有概率挖人或抢地；有商务总监时一半能提前稳住
export const COUNTER = { fromStage: 2, minWins: 2, monthlyP: 0.35, poachRate: 0.02, bizStopP: 0.5 };
export const TURF_HIT = 0.05;
/** P-00 对手也在长大（设计24）：growReal 现实年增长率（× 赚钱倍数 = 游戏年增长，按游戏月复利）；赢一次利润 × win、输一次 × loss；
 *  利润比出现时每翻一倍：多抢一个城市（最多 maxCities）、反击概率 + counterPer（最多 counterMax）；收购并进来的按规模放大（最多 × mergeMax） */
// P-00：起始估值（自动试玩 3 种子 × B / C 调过）：鑫鑫 30 万、味道 75 万、恒远 620 万、华荣 2.3 亿、天穹 28 亿；最多长到 2 倍，收购时一般在阶段三的数附近
export const RIVAL_GROW = { win: 0.92, loss: 1.03, maxCities: 3, counterPer: 0.1, counterMax: 0.3, mergeMax: 3, kMax: 2 }; // kMax：利润最多长到出现时的 2 倍（P-00：不封顶的话天穹一年 × 2.25，比玩家后期快，要么刚出现就被收、要么永远追不上；封 2 倍 + 起始值抬高，节奏跟阶段三差 10% 以内）
export const RIVAL_BY_ID = Object.fromEntries(RIVALS.map((r) => [r.id, r]));
// 商战项目：比哪项属性
export const PROJECTS = [
  { id: 'price', name: '价格战', attr: 'manage', desc: '比谁成本压得低' },
  { id: 'market', name: '营销战', attr: 'charm', desc: '比谁更会吸引客人' },
  { id: 'network', name: '抢人脉', attr: 'social', desc: '比谁关系硬' },
];
export const BATTLES_PER_DAY = 20;          // 商战次数上限（攒满 20 次）
export const BATTLE_REGEN_MIN = 30;         // 每 30 分钟（真实时间，离线照样）恢复 1 次；原来是按自然日零点清零，下午打完要等到半夜（验收阶段二）
export const WINS_TO_ACQUIRE = 3;
export const TEAM_MAX = 2;
export const ACQUIRE_REFUND = 0.5;          // 收购失败退一半
// 收购款分期（验收阶段二 2-08b 第三轮）：首付 ≥ 30%（商务总监在任 20%），余款 12 个游戏月按月付；逾期按日 0.05% 违约金；连续 3 期付不上对方解除协议（股权收回，已付的扣 20% 退回，并进来的店和员工退回去）
export const INSTALL = { down: 0.3, downBiz: 0.2, months: 12, lateDaily: 0.0005, missMax: 3, breachKeep: 0.2 };
export const ACQUIRE_COOLDOWN_SEC = 10 * 60; // 失败后冷却 10 分钟（真实时间，离线照样走）
export const ACQUIRE_EXTRA_WIN = 0.1;
export const INTEL_PER_LOSS = 0.05, INTEL_MAX = 0.25; // 知己知彼：对同一家每输一次下次胜率 +5%，最多 +25%，赢一次清零        // 满 3 胜以后每多赢一次商战，收购成功率 +10%
