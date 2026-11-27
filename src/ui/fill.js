// 产业详情里的「补满」按钮（V0.2.2）；开店那一刻问招不招人的弹框设计102 删掉了
import * as ST from '../core/staff.js?v=3839f433';
import { PAY } from '../core/staff.js?v=3839f433';
import { IND_BY_ID } from '../config/industries.js?v=3839f433';
import { now } from '../core/clock.js?v=3839f433';
import { game } from '../game.js?v=3839f433';
import { toast } from './dom.js?v=3839f433';

/** 一键补满，弹一句结果 */
export function doFill(id) {
  const s = game.state; const r = ST.fillUp(s, id, now());
  if (!r.ok) { toast(r.why, 2200); return false; }
  toast(`${IND_BY_ID[id].name}补了 ${r.n} 个人（${PAY.channels[r.channel].name}），立刻到岗`, 2600); game.changed(); game.save(); return true;
}
/* 设计102：开店 / 开分店不再弹「招人」（askFill 删了），缺编交给人事自动补员 cashflow.autoFill；关着就自己去招 */
