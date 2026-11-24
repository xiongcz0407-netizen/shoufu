// 房产（设计19）：全表在 estates.json（26 处）；这里转出来给别的模块用
import EST from './estates.json?v=ad479e23' with { type: 'json' };
export const HOUSES = EST.houses;
export const ASSET_VALUE_RATE = EST.sellRate; // 身价按卖回价 70%（有资产管家最高 80%）
