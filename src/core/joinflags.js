// 人物02 两位新秘书的解锁 flag：称号 ≥ 企业家（title ≥ 3）且这条线开了 ≥ 1 家
// techOpen1 → 温语棠（s12_wen）；mediaOpen1 → 白若溪（s13_bai）。开店时、升称号时都会查到（main.js checkJoins 每秒查一次）；两条都满足的同时来
export const LINE_FLAGS = { tech: 'techOpen1', media: 'mediaOpen1' };
export const LINE_MIN_TITLE = 3;
const opened = (s, id) => !!(s.inds && s.inds[id] && (s.inds[id].branches || 0) >= 1);
/** 返回这次新置上的 flag */
export function checkLineOpen(s) {
  const out = []; if (!s || !s.flags || !((s.title || 0) >= LINE_MIN_TITLE)) return out;
  for (const [id, f] of Object.entries(LINE_FLAGS)) if (!s.flags[f] && opened(s, id)) { s.flags[f] = true; out.push(f); }
  return out;
}
