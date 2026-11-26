// ?debug=1 调试面板：加钱、加好感、快进时间、清存档。各功能用 addDebug() 往里加按钮
import { skip, getOffset } from './core/clock.js?v=a24b4431';
import { storage } from './platform/storage.js?v=a24b4431';
import { SAVE_KEY } from './core/save.js?v=a24b4431';
import { fmtMoney, fmtDuration } from './core/format.js?v=a24b4431';
import { game, settleOffline } from './game.js?v=a24b4431';
import { receive } from './core/ledger.js?v=a24b4431';

export const isDebug = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1';
const groups = new Map(); // 组名 → [[标签, fn]]
let panel = null;

const infos = []; // 信息行：fn() → 文字（设计22：素材一行）
export function addDebugInfo(fn) { infos.push(fn); if (panel) render(); }

export function addDebug(group, label, fn) {
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group).push([label, fn]);
  if (panel) render();
}

function render() {
  const body = panel.querySelector('.dbg-body');
  const s = game.state;
  body.innerHTML = `<div class="dbg-info">个人 ${fmtMoney(s.cash)}｜公司 ${fmtMoney(s.company || 0)}｜时间偏移 ${fmtDuration(getOffset() / 1000)}</div>`;
  for (const fn of infos) { const d = document.createElement('div'); d.className = 'dbg-info'; try { d.textContent = fn(); } catch (e) { d.textContent = String(e); } body.appendChild(d); }
  for (const [g, items] of groups) {
    const box = document.createElement('div');
    box.className = 'dbg-group';
    box.innerHTML = `<div class="dbg-title">${g}</div>`;
    for (const [label, fn] of items) {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => { fn(game.state); game.changed(); game.save(); render(); };
      box.appendChild(b);
    }
    body.appendChild(box);
  }
}

export function initDebug(root) {
  if (!isDebug()) return;
  window.__game = game; // 截图 / 自动试玩用
  for (const [n, v] of [['1万', 1e4], ['100万', 1e6], ['1亿', 1e8]]) {
    addDebug('钱', `个人 +${n}`, (s) => { receive(s, { wallet: 'personal', cat: 'debug', amount: v }); });
    addDebug('钱', `公司 +${n}`, (s) => { receive(s, { wallet: 'company', cat: 'debug', amount: v }); });
  }
  const ff = (h) => () => { game.save(); skip(h * 3600e3); settleOffline(); };
  addDebug('快进（算离线）', '1小时', ff(1));
  addDebug('快进（算离线）', '8小时', ff(8));
  addDebug('快进（算离线）', '1天', ff(24));
  addDebug('存档', '清存档并刷新', () => { storage.remove(SAVE_KEY); location.reload(); });

  const btn = document.createElement('button');
  btn.className = 'dbg-btn'; btn.textContent = '调';
  panel = document.createElement('div');
  panel.className = 'dbg-panel hidden';
  panel.innerHTML = '<div class="dbg-head">调试面板<button class="dbg-close">关</button></div><div class="dbg-body"></div>';
  btn.onclick = () => { panel.classList.toggle('hidden'); render(); };
  panel.querySelector('.dbg-close').onclick = () => panel.classList.add('hidden');
  root.append(btn, panel);
}
