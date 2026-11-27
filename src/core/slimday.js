// 设计79：每个游戏天把存档里有上限的列表整理一遍（兜底：哪里直接 push 了也不会一直长）
import { onDay } from './manage.js?v=3839f433';
import { trimAll } from './cap.js?v=3839f433';
import './slim.js?v=3839f433';
onDay((s) => { trimAll(s); return []; });
