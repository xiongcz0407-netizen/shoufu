// 设计79：每个游戏天把存档里有上限的列表整理一遍（兜底：哪里直接 push 了也不会一直长）
import { onDay } from './manage.js?v=701a82d3';
import { trimAll } from './cap.js?v=701a82d3';
import './slim.js?v=701a82d3';
onDay((s) => { trimAll(s); return []; });
