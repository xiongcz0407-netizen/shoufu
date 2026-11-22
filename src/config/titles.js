// 称号（汇总第二节 + 设计20 第一节）
// need：身价到多少；rival：还要收购哪家（没有这家 = 第一次发布不开放）
// bg：办公室背景（没图的用最近一张有图的）；avatar：老板头像，按顺序找第一张有图的
// 培训位 = 2 + 称号序号（courses.js）；秘书工资规模系数在 posts.json 的 scaleByTitle
export const TITLES = [
  { name: '打工人', need: 0, bg: 'bg_office_1', avatar: ['me_1'] },
  { name: '小老板', need: 1e6, rival: 'weidao', bg: 'bg_office_2', avatar: ['me_2'] },
  { name: '老板', need: 1e7, rival: 'hengyuan', bg: 'bg_office_3', avatar: ['me_2'] },
  { name: '企业家', need: 5e8, rival: 'huarong', bg: 'bg_office_3', avatar: ['me_4', 'me_3'] },
  { name: '大亨', need: 1e10, rival: 'tianqiong', bg: 'bg_office_3', avatar: ['me_5', 'me_3'], last: true },
  { name: '巨头', need: 1e10, rival: null, bg: 'bg_office_3', avatar: ['me_3'] },
  { name: '财阀', need: 1e11, rival: null, bg: 'bg_office_3', avatar: ['me_3'] },
  { name: '首富', need: 1e12, rival: null, bg: 'bg_office_3', avatar: ['me_3'] },
];
