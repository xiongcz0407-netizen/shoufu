// 衣服（汇总第五节）：每人 11 套，第 1 套自带，第 2～11 套服装店买
// needFavor：好感到多少她才穿（熟悉 100 / 信任 200 / 亲密 300 / 知己 400）
// price：先按阶段从低到高，以后 econsim 再调
export const OUTFITS = [
  { id: 'c1', price: 0, needFavor: 0 },
  { id: 'c2', price: 2e4, needFavor: 100 },
  { id: 'c3', price: 5e4, needFavor: 100 },
  { id: 'c4', price: 1e5, needFavor: 200 },
  { id: 'c5', price: 2e5, needFavor: 200 },
  { id: 'c6', price: 5e5, needFavor: 300 },
  { id: 'c7', price: 1e6, needFavor: 300 },
  { id: 'c8', price: 2e6, needFavor: 300 },
  { id: 'c9', price: 5e6, needFavor: 400 },
  { id: 'c10', price: 1e7, needFavor: 400 },
  { id: 'c11', price: 2e7, needFavor: 400 },
];
export const OUTFIT_BY_ID = Object.fromEntries(OUTFITS.map((o) => [o.id, o]));
export const GIFT_CLOTH_FAVOR = 5;   // 买衣服算送礼：好感 +5
export const DATE_OUTFIT = 'c11';    // 约会满 20 次送的专属衣服（不用等好感）
