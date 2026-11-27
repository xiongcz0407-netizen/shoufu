// 培养课程（汇总第四节 1；设计91 现实价格）。gain：加哪些属性；unlockTitle：哪个称号解锁；price：基础价（属性 0 时）；cap：这门课最多练到（加的属性到了就不再加）
// 价格 = price × (1 + (PRICE_TOP − 1) × 当前属性 ÷ 100)（当前属性按 gain 里第一项算；擅长那项 8 折）；上课立刻学完，不限次数
export const COURSES = [
  { id: 'read', name: '读书进修', gain: { wit: 2 }, unlockTitle: 0, price: 2000, cap: 50 },
  { id: 'meeting', name: '项目例会', gain: { manage: 2 }, unlockTitle: 0, price: 5000, cap: 50 },
  { id: 'dinner', name: '商务饭局', gain: { social: 2 }, unlockTitle: 0, price: 20000, cap: 50 },
  { id: 'etiquette', name: '形象礼仪课', gain: { charm: 2 }, unlockTitle: 0, price: 10000, cap: 50 },
  { id: 'yoga', name: '健身瑜伽', gain: { charm: 1, manage: 1 }, unlockTitle: 1, price: 10000, cap: 60 },
  { id: 'negotiate', name: '谈判特训', gain: { social: 2, charm: 1 }, unlockTitle: 2, price: 50000, cap: 75 },
  { id: 'mba', name: '海外 MBA', gain: { wit: 3, manage: 2 }, unlockTitle: 3, price: 800000, cap: 100 },
  { id: 'gala', name: '高端酒会', gain: { social: 3, charm: 2 }, unlockTitle: 4, price: 200000, cap: 100 },
];
export const COURSE_BY_ID = Object.fromEntries(COURSES.map((c) => [c.id, c]));
export const PRICE_TOP = 3;        // 设计91：属性 100 时价格是基础价的几倍（0 是 1 倍、50 是 2 倍）
export const BEST_DISCOUNT = 0.8;  // 擅长那项 8 折、多 +1
// 结业台词（每人一句，按性格）
export const GRAD_LINES = {
  s09_xia: '老板！我结业啦！我是不是变厉害了一点点？',
  s10_lu: '课上完了。……没什么难的。',
  s06_ye: '老师夸我学得快呢～老板要不要考考我？',
  s03_lin: '我学得好辛苦哦……老板会奖励我吗？',
  s05_jiang: '哼，这种课对我来说太简单了。……不过还是谢谢你。',
  s01_shen: '学到了不少呢。以后能帮您分担更多了呀。',
  s07_tang: '结业！满分！老板请吃烧烤！',
  s08_xu: '笔记我整理了三遍。……您要看吗？',
  s04_gu: '课程不错，我顺便做了一份可以用在公司的方案。',
  s02_su: '结束了。下次给我报难一点的。',
  s11_qiao: '学完了。……我记下了。',
  s12_wen: '学完了。……已读，已掌握。',
  s13_bai: '学会啦。……这场戏，我拿下了。',
};
