// V0.2.5（设计37 第三节）开发1 这边的升级框：core 里攒的 s.upq（店铺升级、换样子、开分店、广告、上任、升称号、托管汇总）
// 每秒倒进开发2 的 upgradeBox（ui/upgradebox.js 负责排队、剧情开着先等）。托管汇总回到首页才弹。
// note = { title, what, fx: [行], next, img?, big?, opened?: [行], auto? }
import { takeUp, flushAuto } from '../core/upnote.js?v=e379aa95';
import { asset, hasAsset } from '../platform/assets.js?v=e379aa95';
import { upgradeBox } from './upgradebox.js?v=e379aa95';
import { game } from '../game.js?v=e379aa95';
import { now } from '../core/clock.js?v=e379aa95';

export function pump(s, t) {
  flushAuto(s, t);
  if (typeof document === 'undefined') return;
  for (let i = 0; i < 5; i++) {
    const q = s.upq && s.upq[0]; if (!q) return;
    if (q.auto && document.querySelector('.full, .panel-mask')) return; /* 托管汇总回到首页才弹 */
    const n = takeUp(s);
    upgradeBox({ title: n.big ? '换样子！' : '升级！', what: n.what, gains: n.fx || [], opened: n.opened || [], next: n.next, img: n.img && hasAsset(n.img) ? asset(n.img) : '', big: !!n.big });
  }
}

// 弹窗延迟修复：以前只在每秒的 tick 里倒，点完要等到下一秒；现在点完（game.changed）马上倒
let soonT = null;
if (typeof document !== 'undefined') game.onChange(() => { if (soonT) return; soonT = setTimeout(() => { soonT = null; if (game.state) pump(game.state, now()); }, 0); });
