// 自动生成（tools/story_sync.mjs），别手改：设计/剧情/ 里的出差片段、台词、衣服款式
import T0 from './trip_s01_shen.json?v=b7d8e042' with { type: 'json' };
import T1 from './trip_s02_su.json?v=b7d8e042' with { type: 'json' };
import T2 from './trip_s03_lin.json?v=b7d8e042' with { type: 'json' };
import T3 from './trip_s09_xia.json?v=b7d8e042' with { type: 'json' };
import L0 from './lines_s01_shen.json?v=b7d8e042' with { type: 'json' };
import L1 from './lines_s02_su.json?v=b7d8e042' with { type: 'json' };
import L2 from './lines_s03_lin.json?v=b7d8e042' with { type: 'json' };
import L3 from './lines_s09_xia.json?v=b7d8e042' with { type: 'json' };
import S0 from './outfit_styles.json?v=b7d8e042' with { type: 'json' };
export const OUTFIT_STYLES = S0.list || {};
export const TRIP_LIB = { 's01_shen': T0, 's02_su': T1, 's03_lin': T2, 's09_xia': T3 };
export const LINE_PACKS = { 's01_shen': L0, 's02_su': L1, 's03_lin': L2, 's09_xia': L3 };
