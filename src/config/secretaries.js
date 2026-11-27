// 秘书配置（汇总第四节）。加新秘书 = 加一行 + 跑 tools/assets.py 出图
// attrs: [魅力, 智慧, 交际, 管理]；best: 擅长那项；unlock: 加入条件（core/unlock.js）；text: 列表里显示的条件
// 设计56 喜好（平均分）：favorites 最喜欢的 2 样礼物（好感 ×2）、dislikes 讨厌的 1 样（×0.5）、likeBrand 喜欢的包牌子、likeLux 最喜欢的 1 件奢侈品（爱慕 ×2）
export const ATTRS = [
  { key: 'charm', name: '魅力' },
  { key: 'wit', name: '智慧' },
  { key: 'social', name: '交际' },
  { key: 'manage', name: '管理' },
];
export const SECRETARIES = [
  { id: 's09_xia', name: '夏芷晴', type: '元气', outfits: 14, fullBody: true, attrs: [15, 12, 15, 18], best: 'manage', stage: 0, unlock: { type: 'start' }, text: '开局就在', favorites: ['零食礼盒', '电影票'], dislikes: ['钢笔'], likeBrand: 'lv', likeLux: '翡翠手镯' },
  { id: 's10_lu', name: '陆诗雨', type: '高冷', outfits: 14, fullBody: true, attrs: [18, 15, 10, 25], best: 'manage', stage: 0, unlock: { type: 'networth', value: 5e5 }, text: '身价到 50 万，公司搬进写字楼', favorites: ['猫咪马克杯', '精品咖啡豆'], dislikes: ['动漫手办'], likeBrand: 'bv', likeLux: '女士腕表' },
  { id: 's06_ye', name: '叶蔓', type: '绿茶', outfits: 14, fullBody: true, attrs: [25, 12, 15, 10], best: 'charm', stage: 0, unlock: { type: 'branches', ind: 'store', value: 3 }, text: '便利店开到 3 家', favorites: ['手账套装', '真丝丝巾'], dislikes: ['运动鞋'], likeBrand: 'dior', likeLux: '钻石耳环' },
  { id: 's03_lin', name: '林知夏', type: '绿茶', outfits: 14, fullBody: true, attrs: [30, 15, 22, 18], best: 'charm', stage: 0, unlock: { type: 'acquire', rival: 'weidao' }, text: '收购「味道工坊」', favorites: ['毛绒公仔', '草莓蛋糕'], dislikes: ['球赛门票'], likeBrand: 'dior', likeLux: '金手链' },
  { id: 's05_jiang', name: '唐思琪', type: '傲娇', outfits: 14, fullBody: true, attrs: [30, 20, 35, 15], best: 'social', stage: 1, unlock: { type: 'title', value: 1 }, text: '升到「小老板」', favorites: ['动漫手办', '红底高跟鞋'], dislikes: ['奶茶'], likeBrand: 'chanel', likeLux: '蓝宝石胸针' },
  { id: 's01_shen', name: '沈清妍', type: '绿茶', outfits: 14, fullBody: true, attrs: [45, 25, 40, 25], best: 'charm', stage: 0, unlock: { type: 'acquire', rival: 'hengyuan' }, text: '收购「恒远集团」', favorites: ['白玫瑰花束', '香水'], dislikes: ['毛绒公仔'], likeBrand: 'hermes', likeLux: '珍珠项链' },
  { id: 's07_tang', name: '江映雪', type: '元气', outfits: 14, fullBody: true, attrs: [20, 12, 28, 20], best: 'social', stage: 2, unlock: { type: 'flag', flag: 'teamBuild1', minTitle: 2 }, text: '升「老板」后员工满 20 人，公司第一次团建', favorites: ['运动鞋', '演唱会 VIP 票'], dislikes: ['精装小说'], likeBrand: 'lv', likeLux: '钻石项链' },
  { id: 's08_xu', name: '许可欣', type: '知性', outfits: 14, fullBody: true, attrs: [15, 35, 12, 32], best: 'wit', stage: 2, unlock: { type: 'flag', flag: 'financeCrisis1', minTitle: 2 }, text: '升「老板」后第一次财务危机', favorites: ['精装小说', '羊绒围巾'], dislikes: ['红底高跟鞋'], likeBrand: 'chanel', likeLux: '名庄红酒' },
  { id: 's04_gu', name: '顾念安', type: '知性', outfits: 14, fullBody: true, attrs: [20, 42, 20, 35], best: 'wit', stage: 2, unlock: { type: 'flag', flag: 'jobFair1', minTitle: 2 }, text: '身价到 1 亿后的招聘会', favorites: ['香薰蜡烛', '星空投影灯'], dislikes: ['演唱会 VIP 票'], likeBrand: 'bv', likeLux: '名贵腕表套盒' },
  { id: 's02_su', name: '苏曼琳', type: '高冷', outfits: 14, fullBody: true, attrs: [35, 45, 45, 30], best: 'social', stage: 3, unlock: { type: 'flag', flag: 'beatSuBank', minTitle: 3 }, text: '升「企业家」，跟瑞霖资本谈判赢一次', favorites: ['钢笔', '口红礼盒'], dislikes: ['零食礼盒'], likeBrand: 'hermes', likeLux: '祖母绿戒指' },
  { id: 's11_qiao', name: '乔希雅', type: '清冷', outfits: 14, fullBody: true, attrs: [38, 32, 36, 46], best: 'manage', stage: 3, unlock: { type: 'flag', flag: 'firstJet1', minTitle: 3 }, text: '升「企业家」后买下第一架私人飞机', favorites: ['手工巧克力', '小盆栽'], dislikes: ['香水'], likeBrand: 'bv', likeLux: '钻石脚链' },
  // 人物02（11-27）：两位新秘书，立绘没到先用占位（tools/sec_placeholder.py），数据和剧情开发2 做
  { id: 's12_wen', name: '温语棠', type: '天然呆', outfits: 14, fullBody: true, attrs: [32, 46, 30, 38], best: 'wit', stage: 3, unlock: { type: 'flag', flag: 'techOpen1', minTitle: 3 }, text: '升「企业家」后开了科技线', favorites: ['机械键盘', '拼装积木'], dislikes: ['白玫瑰花束'], likeBrand: 'lv', likeLux: '钻石耳骨夹' },
  { id: 's13_bai', name: '白若溪', type: '妩媚', outfits: 14, fullBody: true, attrs: [46, 34, 38, 30], best: 'charm', stage: 3, unlock: { type: 'flag', flag: 'mediaOpen1', minTitle: 3 }, text: '升「企业家」后开了娱乐传媒线', favorites: ['奶茶', '胶片相机'], dislikes: ['口红礼盒'], likeBrand: 'dior', likeLux: '红宝石耳坠' },
];
export const SEC_BY_ID = Object.fromEntries(SECRETARIES.map((s) => [s.id, s]));
export const OUTFIT_COUNT = 11;   // 默认几套（老的 9 个秘书）；设计66：每人可以写 outfits: N（夏芷晴 14），用 outfitCountOf(id)
export const outfitCountOf = (id) => (SEC_BY_ID[id] && SEC_BY_ID[id].outfits) || OUTFIT_COUNT;
