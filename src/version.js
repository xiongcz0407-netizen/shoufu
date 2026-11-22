// APP_V = 大版本 × 100 + 小号（V0.1 = 1，V1.0 = 100）；发布过的号不能再用
export const APP_V = 1;
export const versionText = (v = APP_V) => `V${Math.floor(v / 100)}.${v % 100}`;
