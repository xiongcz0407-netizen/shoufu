// 产业配置（汇总第三节 + 设计21 真实经济）
// 门店三条线（store / food / fashion）：real 是三个样子的真实单店经营（每游戏月，上海系数 1.0）：
//   rev 真实月营收（这个样子最低级 → 最高级线性）、cogs 进货 / 食材占营收、margin 真实净利率（跟着营收从低到高）、invest 单店投资（开店费）
//   游戏营收由 core/calib.js 反推：成本照真实（进货、编制工资社保、房租），月净利 = 真实净利 × economy.json profitMul
// lookTitle：每个样子要的称号（设计21 第八节 1：打工人就能摆小吃摊、服装摊，餐厅 / 精品店要小老板，第 3 个样子要老板）；startEmpty：解锁时 0 家（自己花钱开第一家）
// looks：等级到多少换样子；maxLevel：最高级；编制跟着样子走（config/payroll.json staffing）；rent：每家店每个游戏月房租（按样子）
export const INDUSTRIES = [
  { id: 'store', name: '便利店', unlockTitle: 0, lookTitle: [0, 0, 2], rent: [3000, 8000, 30000], maxBranch: 120, maxLevel: 60,
    real: [{ rev: [4e4, 6e4], cogs: 0.78, margin: [0.03, 0.05], invest: 15e4 }, { rev: [15e4, 25e4], cogs: 0.72, margin: [0.04, 0.06], invest: 40e4 }, { rev: [150e4, 300e4], cogs: 0.80, margin: [0.02, 0.04], invest: 300e4 }],
    looks: [1, 15, 40], img: ['ind_store_1', 'ind_store_2', 'ind_store_3'], lookNames: ['小店', '便利店', '超市'] },
  { id: 'food', name: '餐饮', unlockTitle: 0, lookTitle: [0, 1, 2], startEmpty: true, rent: [2000, 15000, 60000], maxBranch: 120, maxLevel: 60,
    real: [{ rev: [3e4, 6e4], cogs: 0.38, margin: [0.15, 0.20], invest: 5e4 }, { rev: [40e4, 80e4], cogs: 0.35, margin: [0.08, 0.12], invest: 150e4 }, { rev: [300e4, 600e4], cogs: 0.35, margin: [0.06, 0.10], invest: 1500e4 }],
    looks: [1, 15, 40], img: ['ind_food_1', 'ind_food_2', 'ind_food_3'], lookNames: ['小吃摊', '餐厅', '大酒楼'] },
  { id: 'fashion', name: '服装', unlockTitle: 0, lookTitle: [0, 1, 2], startEmpty: true, rent: [1500, 10000, 40000], maxBranch: 120, maxLevel: 60,
    real: [{ rev: [2e4, 5e4], cogs: 0.50, margin: [0.15, 0.20], invest: 3e4 }, { rev: [20e4, 40e4], cogs: 0.45, margin: [0.10, 0.15], invest: 80e4 }, { rev: [200e4, 400e4], cogs: 0.40, margin: [0.08, 0.12], invest: 800e4 }],
    looks: [1, 15, 40], img: ['ind_fashion_1', 'ind_fashion_2', 'ind_fashion_3'], lookNames: ['服装摊', '精品店', '旗舰店'] },
];
for (const c of INDUSTRIES) { c.retail = true; c.cogs = c.real[0].cogs; } // cogs：第一个样子的（界面兜底），真实的按样子取 core/calib.js
// 地产（设计20 第二节 1）：项目制，不按秒产钱；编制 = 每个在做的项目一个项目公司（branches = 项目数，最少 1）。玩法在 core/realestate.js
INDUSTRIES.push({ id: 'realestate', name: '地产', kind: 'project', unlockTitle: 2, income: 0, cogs: 0, rent: [60000, 60000, 60000], upCost: 0, upGrow: 1, branchCost: 0, branchGrow: 1, maxBranch: 6,
  looks: [1], img: ['ind_realestate_1', 'ind_realestate_2', 'ind_realestate_3'], lookNames: ['地产开发'] });
// 物流（设计20 第二节 2）：规模制（kind 'scale'）：每升一级每个网点多 15 个人（payroll staffing 是「每级」的配比），收入按在岗人数（core/logistics.js）
INDUSTRIES.push({ id: 'logistics', name: '物流', kind: 'scale', unlockTitle: 2, income: 0, cogs: 0.34, rent: [0, 0, 0], rentPerHead: 2600, upCost: 5e4, upGrow: 1.12, branchCost: 5e6, branchGrow: 1.35, maxBranch: 120,
  looks: [1, 15, 40], img: ['ind_logistics_1', 'ind_logistics_2', 'ind_logistics_3'], lookNames: ['快递网点', '区域分拨中心', '物流园'] });
// 科技（设计20 第二节 3）：产品制（kind 'product'）：升级扩编、多做产品，不开分店；收入看上线产品（core/tech.js）
INDUSTRIES.push({ id: 'tech', name: '科技', kind: 'product', unlockTitle: 3, income: 0, cogs: 0.3, rent: [30000, 300000, 2000000], upCost: 2e6, upGrow: 1.15, branchCost: 0, branchGrow: 1, maxBranch: 1,
  looks: [1, 15, 40], img: ['ind_tech_1', 'ind_tech_2', 'ind_tech_3'], lookNames: ['软件工作室', '互联网公司', '科技集团'] });
// 娱乐传媒（设计20 第二节 4）：kind 'media'：直播按主播人头、投拍是项目（core/media.js）；不开分店；进货成本 50% = 主播分成
INDUSTRIES.push({ id: 'media', name: '娱乐传媒', kind: 'media', unlockTitle: 3, income: 0, cogs: 0.5, rent: [20000, 200000, 1200000], upCost: 1.5e6, upGrow: 1.15, branchCost: 0, branchGrow: 1, maxBranch: 1,
  looks: [1, 15, 40], img: ['ind_media_1', 'ind_media_2', 'ind_media_3'], lookNames: ['MCN 直播工作室', '影视公司', '传媒集团'] });
/** V2-12 前置条件（设计31）：needFirst 开第一家 / 解锁要，needBranch 开第 2 家起要。{ line, n }：那条线分店 ≥ n；{ retailTotal }：三种门店合计 ≥ n。称号要求照旧 */
const NEED = {
  food: { needBranch: { line: 'store', n: 3 }, firstCost: 10000 }, // V0.2.1（设计34）：第一家小吃摊、服装摊 1 万
  fashion: { needFirst: { line: 'store', n: 3 }, needBranch: { line: 'food', n: 3 }, firstCost: 10000 },
  logistics: { needFirst: { retailTotal: 20 } },
  realestate: { needFirst: { retailTotal: 30 } },
  tech: { needFirst: { line: 'logistics', n: 5 } },
  media: { needFirst: { line: 'fashion', n: 10 } },
};
for (const x of INDUSTRIES) Object.assign(x, NEED[x.id] || {});
export const IND_BY_ID = Object.fromEntries(INDUSTRIES.map((x) => [x.id, x]));
// 分店上限按称号（验收阶段二·节奏）：打工人 5、小老板 12、老板 40、企业家 120（开到几十家要更大的管理体系和资金）
export const BRANCH_CAP = [5, 12, 40, 120, 120, 120, 120, 120];
// 门店第 3 个样子（超市 / 大酒楼 / 旗舰店）要「老板」称号
export const LOOK3_TITLE = 2;
// 派驻秘书加成：管理每 1 点 +0.6%（科技、金融另按智慧，以后加）
export const SEC_BONUS_PER_POINT = 0.006;
