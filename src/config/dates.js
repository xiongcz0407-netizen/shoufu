// 约会（汇总第四节 3）。bg：背景图 key（assets/bg/），没图用占位
// needDates：跟她约会满几次才开（10 次解锁新地点）
export const DATE_PLACES = [
  { id: 'restaurant', name: '西餐厅', bg: 'bg_date_1', price: 2000, love: 4, favor: 10, needDates: 0, dress: 'formal' },
  { id: 'beach', name: '海边', bg: 'bg_date_2', price: 5000, love: 5, favor: 12, needDates: 0, dress: 'casual' },
  { id: 'yacht', name: '游艇', bg: 'bg_date_3', price: 5e4, love: 8, favor: 20, needDates: 10, dress: 'formal' },
  { id: 'rooftop', name: '地标楼顶', bg: 'bg_date_4', price: 0, love: 8, favor: 15, needDates: 0, dress: 'formal' }, // 验收阶段三：有地标才有（core/landmark.js 的 addPlaceGate）
];
/** 第一次去地标楼顶：她看着城市（按性格） */
export const ROOFTOP_LINES = {
  元气: '哇——整座城市都在脚下！这些……都是你的？我要把这一刻记一辈子！',
  高冷: '……这些，都是你的？（她扶着栏杆，很久没有说话）',
  知性: '这些……都是你的？我以前只在财报里见过这栋楼的名字。',
  绿茶: '这些……都是你的？那站在这里的我，是不是也算一点点？',
  傲娇: '这些……都是你的？哼，也、也就一般般吧。……风好大，你站过来点。',
};
export const PLACE_BY_ID = Object.fromEntries(DATE_PLACES.map((p) => [p.id, p]));
export const DATES_PER_DAY = 3;          // 一天最多约 3 次（所有人加起来）
export const CAR_TIER_LOVE = [0, 0, 1, 1, 2, 3]; // 开几档的车多加爱慕（0 = 打车）
export const OTHER_SAME_DAY_LOVE = -1;   // 同一天约了别人，今天被你约过的人爱慕 -1（不掉阶段）
// 约会次数解锁
export const DATE_MILESTONES = [
  { n: 1, kind: 'story', text: '第一次约会' },
  { n: 5, kind: 'line', text: '专属台词' },
  { n: 10, kind: 'place', text: '解锁新约会地点：游艇' },
  { n: 20, kind: 'outfit', text: '专属衣服' },
  { n: 50, kind: 'title', text: '纪念剧情 + 称号' },
];
// 5 次专属台词（按性格）
export const DATE5_LINES = {
  绿茶: '跟您出来这么多次了……别的姐姐会不会嫉妒我呀？',
  高冷: '第五次了。……我记着呢。',
  知性: '我统计过，和你出来的时候，我笑得比平时多。',
  元气: '第五次约会！我偷偷在日历上画了五颗星星！',
  傲娇: '才五次而已，你得意什么。……下次去哪？',
};
// 50 次给她的称号
export const DATE50_TITLE = '心上人';

// 开限量 / 孤品车去约会（设计11 第二节）：开场旁白 + 她的反应（按性格）
export const RARE_NARR = {
  limited: '一辆{count}的{car}停在门口，路过的人都放慢了脚步。',
  unique: '门口停着全世界独一无二的{car}，连门童都愣住了。',
};
export const RARE_REACT = {
  元气: { limited: '哇——这台车我只在杂志上见过！我能拍张照吗？', unique: '这、这台车……全世界只有一辆吧？我坐上去手都在抖！' },
  高冷: { limited: '限量款。……你倒是舍得。', unique: '全球唯一。……今晚我会记住的。' },
  绿茶: { limited: '老板～开这么稀罕的车来接我，别人会嫉妒的哦。', unique: '这台车……全世界只有一辆吧？那坐在上面的我，是不是也只有一个？' },
  知性: { limited: '全球限量的车，保值率很高。……当然，我更在意是谁开它来接我。', unique: '孤品。你知道这意味着什么吗？……意味着今晚很特别。' },
  傲娇: { limited: '哼，开个限量车就想讨好我？……好吧，有点帅。', unique: '你、你把全世界唯一的车开出来就为了接我？……笨蛋。' },
};
