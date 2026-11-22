// 存储包一层：网页版用 localStorage，以后搬到小程序 / App 只换这里
const mem = new Map();
function ls() {
  try { if (typeof localStorage !== 'undefined') return localStorage; } catch (e) { /* 隐私模式 */ }
  return null;
}
export const storage = {
  get(key) {
    const s = ls();
    try { return s ? s.getItem(key) : (mem.has(key) ? mem.get(key) : null); } catch (e) { return mem.get(key) ?? null; }
  },
  set(key, val) {
    const s = ls();
    try { if (s) { s.setItem(key, val); return true; } } catch (e) { /* 满了 */ }
    mem.set(key, val); return false;
  },
  remove(key) {
    const s = ls();
    try { s && s.removeItem(key); } catch (e) { /* */ }
    mem.delete(key);
  },
};
