// 衣服（汇总第五节）：第 1 套自带，其余服装店买。设计66：每人几套看 secretaries.js 的 outfits（默认 11，夏芷晴 14），用 outfitsOf(秘书)
// needFavor：好感到多少她才穿（熟悉 100 / 信任 200 / 亲密 300 / 知己 400）
// price：老的按序号定价，只在衣服款式表里没写 price 时兜底。
// 设计35 第十四节：价格按款式照现实定，写在 设计/剧情/衣服款式.json 每套的 price（story_sync 拷进 config/story），用 priceOf(秘书, 套)
import { OUTFIT_STYLES } from './story/index.js?v=4306ebaa';
import { outfitCountOf } from './secretaries.js?v=4306ebaa';
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
  { id: 'c12', price: 2e7, needFavor: 400 },   // 设计66：c12～c14 只有 14 套的秘书有（价格写在款式表里）
  { id: 'c13', price: 2e7, needFavor: 400 },
  { id: 'c14', price: 2e7, needFavor: 400 },
];
export const OUTFIT_BY_ID = Object.fromEntries(OUTFITS.map((o) => [o.id, o]));
/** 设计66：这位秘书有的那几套（老秘书 c1～c11，夏芷晴 c1～c14） */
export const outfitsOf = (secId) => OUTFITS.slice(0, outfitCountOf(secId));
export const hasOutfit = (secId, o) => outfitsOf(secId).some((x) => x.id === o);
/** 这位秘书这一套多少钱：款式表里有 price 用它，没有按序号的老价格；第 1 套自带 0 */
export function priceOf(secId, o) {
  if (o === 'c1') return 0;
  const x = OUTFIT_STYLES && OUTFIT_STYLES[secId] && OUTFIT_STYLES[secId][o];
  return x && Number.isFinite(+x.price) && x.price !== '' && x.price != null ? +x.price : (OUTFIT_BY_ID[o] || {}).price || 0;
}
export const DATE_OUTFIT = 'c11';    // 约会满 20 次送的专属衣服（不用等好感）
