// 设计79：每个游戏天把存档里有上限的列表整理一遍（兜底：哪里直接 push 了也不会一直长）
import { onDay } from './manage.js?v=5e43f185';
import { trimAll } from './cap.js?v=5e43f185';
import './slim.js?v=5e43f185';
onDay((s) => { trimAll(s); return []; });
