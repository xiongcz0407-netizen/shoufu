// 秘书配置（汇总第四节）。加新秘书 = 加一行 + 跑 tools/assets.py 出图
// attrs: [魅力, 智慧, 交际, 管理]；best: 擅长那项；unlock: 加入条件（core/unlock.js）；text: 列表里显示的条件
// gifts: 最喜欢的 3 样礼物（设计13 礼物表）
export const ATTRS = [
  { key: 'charm', name: '魅力' },
  { key: 'wit', name: '智慧' },
  { key: 'social', name: '交际' },
  { key: 'manage', name: '管理' },
];
export const SECRETARIES = [
  { id: 's09_xia', name: '夏芷晴', type: '元气', attrs: [15, 12, 15, 18], best: 'manage', stage: 0, unlock: { type: 'start' }, text: '开局就在', gifts: ['零食礼盒', '小盆栽', '电影票'] },
  { id: 's10_lu', name: '陆诗雨', type: '高冷', attrs: [18, 15, 10, 25], best: 'manage', stage: 0, unlock: { type: 'networth', value: 5e5 }, text: '身价到 50 万，公司搬进写字楼', gifts: ['钢笔', '精品咖啡豆', '猫咪马克杯'] },
  { id: 's06_ye', name: '叶蔓', type: '绿茶', attrs: [25, 12, 15, 10], best: 'charm', stage: 0, unlock: { type: 'branches', ind: 'store', value: 3 }, text: '便利店开到 3 家', gifts: ['精装小说', '手账套装', '真丝丝巾'] },
  { id: 's03_lin', name: '林知夏', type: '绿茶', attrs: [30, 15, 22, 18], best: 'charm', stage: 0, unlock: { type: 'acquire', rival: 'weidao' }, text: '收购「味道工坊」', gifts: ['毛绒公仔', '草莓蛋糕', '金手链'] },
  { id: 's05_jiang', name: '江映雪', type: '傲娇', attrs: [30, 20, 35, 15], best: 'social', stage: 1, unlock: { type: 'title', value: 1 }, text: '升到「小老板」', gifts: ['动漫手办', '草莓蛋糕', '红底高跟鞋'] },
  { id: 's01_shen', name: '沈清妍', type: '绿茶', attrs: [45, 25, 40, 25], best: 'charm', stage: 0, unlock: { type: 'acquire', rival: 'hengyuan' }, text: '收购「恒远集团」', gifts: ['珍珠项链', '白玫瑰花束', '香水'] },
  { id: 's07_tang', name: '唐思琪', type: '元气', attrs: [20, 12, 28, 20], best: 'social', stage: 2, unlock: { type: 'flag', flag: 'teamBuild1', minTitle: 2 }, text: '升「老板」后员工满 20 人，公司第一次团建', gifts: ['运动鞋', '球赛门票', '演唱会 VIP 票'] },
  { id: 's08_xu', name: '许可欣', type: '知性', attrs: [15, 35, 12, 32], best: 'wit', stage: 2, unlock: { type: 'flag', flag: 'financeCrisis1', minTitle: 2 }, text: '升「老板」后第一次财务危机', gifts: ['精装小说', '香薰蜡烛', '羊绒围巾'] },
  { id: 's04_gu', name: '顾念安', type: '知性', attrs: [20, 42, 20, 35], best: 'wit', stage: 2, unlock: { type: 'flag', flag: 'jobFair1', minTitle: 2 }, text: '身价到 1000 万后的招聘会', gifts: ['精装小说', '精品咖啡豆', '香薰蜡烛'] },
  { id: 's02_su', name: '苏曼琳', type: '高冷', attrs: [35, 45, 45, 30], best: 'social', stage: 3, unlock: { type: 'flag', flag: 'beatSuBank', minTitle: 3 }, text: '升「企业家」，跟瑞霖资本谈判赢一次', gifts: ['名贵腕表套盒', '名庄红酒', '钢笔'] },
];
export const SEC_BY_ID = Object.fromEntries(SECRETARIES.map((s) => [s.id, s]));
export const OUTFIT_COUNT = 11;
