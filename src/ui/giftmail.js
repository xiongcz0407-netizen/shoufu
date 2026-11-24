// 设计42 奖励邮件：消息「重要」里点「领取」→ 到手、弹跟上课一样的升级框、马上存档上传（开发2）
import * as GF from '../core/gift.js?v=6993e46b';
import { diffOf } from '../core/secfx.js?v=6993e46b';
import { SEC_BY_ID } from '../config/secretaries.js?v=6993e46b';
import { game } from '../game.js?v=6993e46b';
import { addActionUi } from './inbox.js?v=6993e46b';
import { upgradeBox } from './upgradebox.js?v=6993e46b';
import { toast } from './dom.js?v=6993e46b';

export async function takeGift(m, render = () => {}) {
  const s = game.state; const r = GF.claimGift(s, m, Date.now()); if (!r) { toast('已经领过了'); return; }
  game.changed(); game.save(); render();
  try { const CL = await import('../core/cloud.js?v=6993e46b'); if (CL.onCloud()) await CL.push(true); } catch (e) { console.warn('[礼物] 上传', e); }
  const gains = [];
  if (r.coupons) gains.push(`金券 +${r.coupons}`);
  if (r.items) gains.push(r.items);
  for (const c of r.changes) {
    const nm = SEC_BY_ID[c.id].name;
    for (const k of Object.keys(GF.ATTR_NAME)) if (c.A0[k] !== c.A1[k]) gains.push({ name: `${nm} ${GF.ATTR_NAME[k]}`, from: String(c.A0[k]), to: String(c.A1[k]), need: '' });
    for (const d of diffOf(s, c.id, c.A0, c.A1)) gains.push({ name: r.changes.length > 1 ? `${nm}：${d.name}` : d.name, from: String(d.from), to: String(d.to), need: d.on ? '' : d.need });
  }
  for (const n of r.skipped) gains.push(`还没有${n}，这项没改`);
  upgradeBox({ title: '收到礼物', what: r.why, sub: '到手了', gains, sec: r.changes[0] ? r.changes[0].id : null });
}
addActionUi((s, m, a, render) => { if (m.type !== 'gift_mail') return false; takeGift(m, render); return true; });
