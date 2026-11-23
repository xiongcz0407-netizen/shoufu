// V2-08 秘书踩点占用（开发2）：踩点那 10 分钟不能上课、不能陪站柜台、不能带去商战（职位照常）
// 只依赖 clock（training / battle / counter 都要用，避免循环引用）。存档：s.sites.busy = { 秘书id: 回来的时间 }
import { now } from './clock.js?v=b7d8e042';
export const scoutUntil = (s, id) => (s && s.sites && s.sites.busy && s.sites.busy[id]) || 0;
export const isScouting = (s, id, t = now()) => scoutUntil(s, id) > t;
