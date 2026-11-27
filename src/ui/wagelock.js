// V0.2.9 工资锁只是提醒（Arvin）：玩家点了要花公司的钱、花完留不够工资时，不是挡住，而是弹框说清楚要花多少、花完剩多少、
// 还差多少、会有什么后果；点「照样花」就再点一次那个按钮（这一下不锁）。自动的（托管、秘书、每秒逻辑）照样锁。
import { lockState } from '../core/ledger.js?v=f00c2612';
import { lockInfo } from '../core/cashflow.js?v=f00c2612';
import { fmtMoney } from '../core/format.js?v=f00c2612';
import { game } from '../game.js?v=f00c2612';
import { toastHook } from './dom.js?v=f00c2612';
import { confirmBox } from './confirm.js?v=f00c2612';

const LOCK_TXT = /要留工资|钱不够|账户不够|还差/;
let target = null, at = 0, asking = false;
export function mountWageLock() {
  document.addEventListener('click', (e) => {
    if (asking) return;
    target = e.target; at = Date.now(); lockState.last = null; lockState.click = true;
    setTimeout(() => { lockState.click = false; }, 0);
  }, true);
  toastHook.fn = (text) => {
    const L = lockState.last;
    if (asking || lockState.bypass || !L || Date.now() - at > 1500 || !LOCK_TXT.test(text) || !target) return false;
    const tg = target; asking = true; lockState.last = null;
    const i = lockInfo(game.state, L.cost);
    const body = `这笔要花 ${fmtMoney(i.cost)}。\n花完公司剩 ${fmtMoney(i.left)}，要留 ${i.months} 个月${i.months > 1 ? '工资社保和房租' : '工资社保'} ${fmtMoney(i.need)}，还差 ${fmtMoney(i.short)}。\n照样花的话：发不出工资员工会走，拖两个月门店全部停业。`;
    confirmBox({ title: '要动工资的钱吗', body, ok: '照样花', cancel: '先不花', danger: true }).then((yes) => {
      asking = false; if (!yes) return;
      lockState.bypass = true; try { tg.click(); } finally { setTimeout(() => { lockState.bypass = false; }, 0); }
    });
    return true;
  };
  // 按钮因为「要留工资」灰掉的，改成能点（点了弹上面的框）
  const unlock = () => { for (const b of document.querySelectorAll('#phone button[disabled]')) if (/要留工资/.test(b.textContent)) { b.disabled = false; b.classList.add('wage-lock'); } };
  new MutationObserver(unlock).observe(document.querySelector('#phone') || document.body, { childList: true, subtree: true });
}
