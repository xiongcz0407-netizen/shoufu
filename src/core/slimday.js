// 设计79：每个游戏天把存档里有上限的列表整理一遍（兜底：哪里直接 push 了也不会一直长）
import { onDay } from './manage.js?v=9a2bf56f';
import { trimAll } from './cap.js?v=9a2bf56f';
import './slim.js?v=9a2bf56f';
onDay((s) => { trimAll(s); return []; });
