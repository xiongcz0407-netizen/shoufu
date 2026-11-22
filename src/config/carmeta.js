// 车的限量台数和渠道（设计11 第四节、设计09 第三节 3）。没写的：6 档以外按价格 —— 210 万以下现货，以上订单配额（要「老板」称号）
// limit：全球台数（1 = 孤品）；channel：spot 现货 / order 订单 / invite 邀请 / auction 拍卖 / custom 定制委托
export const CAR_META = {
  car_kronstein_L1: { limit: 275, channel: 'auction' }, car_kronstein_L2: { limit: 75, channel: 'auction' }, car_kronstein_L3: { limit: 1, channel: 'custom' },
  car_falkner_L1: { limit: 1270, channel: 'auction' },
  car_wexford_L1: { limit: 18, channel: 'invite' },
  car_ashford_L1: { limit: 77, channel: 'auction' }, car_ashford_L2: { limit: 999, channel: 'invite' }, car_ashford_L3: { limit: 1, channel: 'auction' },
  car_arrowline_L1: { limit: 106, channel: 'auction', network: 60 }, car_arrowline_L2: { limit: 375, channel: 'auction' }, car_arrowline_L3: { limit: 149, channel: 'auction' }, car_arrowline_L4: { limit: 15, channel: 'auction' }, car_arrowline_L5: { limit: 399, channel: 'invite' },
  car_regent_L1: { limit: 1, channel: 'custom' }, car_regent_L2: { limit: 1, channel: 'custom' }, car_regent_L3: { limit: 1, channel: 'custom' },
  car_velocita_L1: { limit: 400, channel: 'auction', network: 60 }, car_velocita_L2: { limit: 499, channel: 'auction', network: 60 }, car_velocita_L3: { limit: 499, channel: 'auction' }, car_velocita_L4: { limit: 599, channel: 'auction' },
  car_furia_L1: { limit: 20, channel: 'auction' }, car_furia_L2: { limit: 20, channel: 'auction' }, car_furia_L3: { limit: 20, channel: 'auction' }, car_furia_L4: { limit: 112, channel: 'auction' }, car_furia_L5: { limit: 1, channel: 'custom' },
  car_halvorsen_L1: { limit: 2, channel: 'auction' }, car_halvorsen_L2: { limit: 7, channel: 'auction' }, car_halvorsen_L3: { limit: 25, channel: 'auction' },
  car_montclair_L1: { limit: 10, channel: 'invite', needModel: 'Chiron' }, car_montclair_L2: { limit: 40, channel: 'invite', needModel: 'Chiron' },
  car_vespera_L1: { limit: 15, channel: 'auction' }, car_vespera_L2: { limit: 20, channel: 'auction' }, car_vespera_L3: { limit: 5, channel: 'auction' }, car_vespera_L4: { limit: 5, channel: 'auction' },
  car_murray_L1: { limit: 100, channel: 'auction' }, car_murray_L2: { limit: 100, channel: 'auction' }, car_murray_L3: { limit: 25, channel: 'auction' },
  car_seiran_5: { limit: 500, channel: 'auction' },
};
// 动力、排量档（按档给个大概，设计08 表里没有；以后按车型补真实数）
export const TIER_SPEC = [null, { hp: 120, disp: '1.5L 小排量' }, { hp: 250, disp: '2.0T' }, { hp: 420, disp: '3.0T 六缸' }, { hp: 560, disp: '4.0T V8' }, { hp: 700, disp: '6.0 V12' }, { hp: 1000, disp: '超跑 V8 / V12 / 混动' }];
export const CHANNEL_NAME = { spot: '现货', order: '订单', invite: '邀请', auction: '拍卖', custom: '定制' };
