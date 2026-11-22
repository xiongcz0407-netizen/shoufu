// 声音包一层：没有文件就静默；手机上第一次触摸后才能放
const cache = new Map();
let enabled = true;
let current = null;
export const audio = {
  setEnabled(v) { enabled = !!v; if (!v) this.stop(); },
  play(url, { volume = 1 } = {}) {
    if (!enabled || !url || typeof Audio === 'undefined') return null;
    let a = cache.get(url);
    if (!a) { a = new Audio(url); cache.set(url, a); }
    try { this.stop(); a.currentTime = 0; a.volume = volume; a.play().catch(() => {}); current = a; } catch (e) { /* */ }
    return a;
  },
  stop() { if (current) { try { current.pause(); } catch (e) { /* */ } current = null; } },
};
