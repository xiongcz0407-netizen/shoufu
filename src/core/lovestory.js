// 设计88 爱慕剧情每人不同：有 LOVE_STAGES[id][阶段] 就照 lines 播（「」开头她说，其余旁白）；没有用 love-stories.js 的通用版
import { LOVE_STAGES } from '../config/story/index.js?v=6a9355f4';
import { LOVE_STAGE_STORIES } from '../config/love-stories.js?v=6a9355f4';
export { LOVE_STAGES };

/** 第 st 阶段（1 心动 … 5 唯一）的剧情：{ title, steps: [{ who, text }] } 或 null。accept = 唯一阶段收下定情信物那句（设计56） */
export function loveStory(c, st, accept = null) {
  const own = LOVE_STAGES[c.id] && LOVE_STAGES[c.id][st];
  let title, steps;
  if (own && own.lines && own.lines.length) { title = own.title; steps = own.lines.filter((x) => x).map((x) => ({ who: x.startsWith('「') ? c.id : 'narr', text: x.replace(/\{name\}/g, c.name) })); }
  else {
    const S = LOVE_STAGE_STORIES[st]; if (!S) return null; const nm = (x) => x.replace(/\{name\}/g, c.name);
    title = S.title; steps = [{ who: 'narr', text: nm(S.lines[0]) }, { who: st === 1 ? c.id : 'narr', text: nm(S.lines[1]) }, { who: c.id, text: S.last[c.type] }];
  }
  if (st === 5 && accept) steps.push({ who: c.id, text: accept });
  return { title, steps };
}
