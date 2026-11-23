// APP_V = 大版本 × 100 + 小号（V0.1 = 1，V1.0 = 100）；发布过的号不能再用
export const APP_V = 5;
const VNAME = { 3: 'V0.2.1', 4: 'V0.2.2', 5: 'V0.2.3' }; /* 小修版的显示名：号还是 +1 */
export const versionText = (v = APP_V) => VNAME[v] || `V${Math.floor(v / 100)}.${v % 100}`;
