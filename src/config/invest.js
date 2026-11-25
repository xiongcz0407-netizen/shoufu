// 设计72 投资账户（开发2）：没在用的钱自动生息
// idleRate：年化（按游戏年，一个游戏年 = 144 现实小时），不动经济节奏；每跳（30 秒）按「可用余额 × idleRate ÷ 一个游戏年的跳数」入账，免个税
export const INVEST_CFG = { idleRate: 0.08 };
export default INVEST_CFG;
