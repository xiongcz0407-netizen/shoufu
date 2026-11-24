// 设计56 商场「礼物」「奢侈品」两页（秘书详情「送礼」直达）：礼物只加好感（价钱 ÷ 500），奢侈品只加爱慕（价钱 ÷ 1 万）；走个人现金、出发票
// 卡片写实际能加多少（到门口 / 要信物 / 好感已满写清楚）；一点都加不上还点送 → 游戏自己的确认框；奢侈品页最上面一栏「定情信物」
import { SEC_BY_ID } from '../config/secretaries.js?v=701206f7';
import * as A from '../core/affection.js?v=701206f7';
import * as LV from '../core/love.js?v=701206f7';
import { fmtMoney } from '../core/format.js?v=701206f7';
import { asset, hasAsset } from '../platform/assets.js?v=701206f7';
import { now } from '../core/clock.js?v=701206f7';
import { game } from '../game.js?v=701206f7';
import { h, openPanel, toast } from './dom.js?v=701206f7';
import { say } from './main-screen.js?v=701206f7';
import { confirmBox } from './confirm.js?v=701206f7';

const num = (v) => (Math.round(v * 100) / 100).toString();
const pic = (img, name, cls = '') => (hasAsset(img) ? `<img class="${cls}" src="${asset(img)}" alt="">` : `<div class="gift-ph ${cls}">${name}</div>`);
const bdayTip = (s, secId) => (LV.isBirthday(s, secId, now()) ? `<div class="gift-bday">🎂 今天是${SEC_BY_ID[secId].name}的生日：送什么都 ×3</div>` : '');
/** 送完：她说一句 + 小条 + 剧情事件 */
function after(secId, r, what) {
  const c = SEC_BY_ID[secId]; if (r.line) say(secId, r.line, 3600, r.scene || 'happy');
  toast(`${c.name} ${what}`, 2600, { top: true });
  if (r.favor && r.favor.stageUp) game.emit('favorUp', secId, r.favor);
  if (r.love && r.love.stageUp) game.emit('loveUp', secId, r.love);
  game.changed(); game.save();
}
/** 实际一点都加不上：先问一声 */
const askIfNone = async (none) => (none ? confirmBox({ title: '她现在加不上了', body: '她现在加不上了，还要送吗？', ok: '还是送', cancel: '不送了' }) : true);

/** 礼物：24 件按价钱排；最喜欢的金框写「她最喜欢」，讨厌的灰框写「她不太喜欢 · 好感只算一半」 */
export function openGift(secId, host) {
  const s = game.state; const c = SEC_BY_ID[secId];
  const p = host || openPanel(`送 ${c.name} 什么？`);
  const grid = h('div', 'gift-grid');
  p.body.append(h('div', 'gift-tip', `礼物只加好感：每 ¥500 = 1 点。她最喜欢：<b>${c.favorites.join('、')}</b>（×2）；不太喜欢：${c.dislikes.join('、')}（×0.5）${A.favorMult(s) > 1 ? `　老板气场：好感 ×${A.favorMult(s).toFixed(2)}` : ''}`), h('div', '', bdayTip(s, secId)), grid);
  const render = () => {
    grid.innerHTML = ''; const t = now(); const st = game.state;
    for (const g of LV.GIFT_LIST) {
      const k = LV.giftGain(st, secId, g.id, t);
      const tag = k.fav ? '<i class="gift-tag fav">她最喜欢</i>' : k.dislike ? '<i class="gift-tag dis">她不太喜欢 · 好感只算一半</i>' : '';
      const gainTxt = k.full ? '好感已满' : `好感 +${num(k.favor)}${k.bday ? '（生日 ×3）' : ''}`;
      const card = h('div', `gift-card${k.fav ? ' fav' : k.dislike ? ' dis' : ''}`, `${pic(`assets/gift/${g.id}.webp`, g.name)}${tag}<b>${g.name}</b><small class="${k.full ? 'gift-none' : ''}">${gainTxt}</small><button class="btn">${fmtMoney(g.price)}</button>`);
      const b = card.querySelector('.btn'); b.disabled = st.cash < g.price;
      b.onclick = async () => {
        if (!(await askIfNone(k.favor <= 0))) return;
        const r = LV.giveGift(game.state, secId, g.id, now()); if (!r.ok) { toast(r.why); return; }
        if (!host) p.close();
        after(secId, r, `好感 +${num(r.favor.to - r.favor.from)}`); render();
      };
      grid.appendChild(card);
    }
  };
  render();
}

let luxKind = 'all';
const KIND_OK = { all: () => true, bag: (x) => x.kind === 'bag', jewel: (x) => x.kind === 'jewel', watchwine: (x) => x.kind === 'watch' || x.kind === 'wine' };
/** 定情信物那一栏（奢侈品页最上面、秘书详情页）：80 前剪影；80 了等下一次约会她提起；提起后有价钱能送；送过写「已送」 */
export function tokenCard(s, secId, onDone) {
  const k = LV.tokenState(s, secId); const c = SEC_BY_ID[secId]; if (!k) return null;
  const img = hasAsset(k.img) ? `<img src="${asset(k.img)}" alt="">` : '<div class="tk-ph">💍</div>';
  const el = h('div', `tk-card tk-${k.state}`);
  if (k.state === 'hidden') el.innerHTML = `<div class="tk-pic sil">${img}</div><div><b>定情信物 · ？？？</b><small>她还没告诉你（爱慕到「恋人」以后，约会时她会说起）</small></div>`;
  else if (k.state === 'wait') el.innerHTML = `<div class="tk-pic sil">${img}</div><div><b>定情信物 · ？？？</b><small>她好像有话想说……再约她一次</small></div>`;
  else if (k.state === 'given') el.innerHTML = `<div class="tk-pic">${img}</div><div><b>定情信物 · ${k.name}</b><small>已经送给${c.name}了（${fmtMoney(k.price)}）· 唯一</small></div>`;
  else {
    const lack = Math.max(0, k.price - s.cash);
    el.innerHTML = `<div class="tk-pic">${img}</div><div><b>定情信物 · ${k.name}</b><small>「${k.origin}」</small><small>只有她的 · 只能送一次 · 不能卖 · 送出爱慕直接 100</small>${lack > 0 ? `<small class="gift-none">还差 ${fmtMoney(lack)}</small>` : ''}<button class="btn gold" ${lack > 0 ? 'disabled' : ''}>${fmtMoney(k.price)} 送给她</button></div>`;
    el.querySelector('.btn').onclick = () => { const r = LV.giveToken(game.state, secId, now()); if (!r.ok) { toast(r.why); return; } toast(`${c.name} ♥ 唯一`, 2600, { top: true }); game.emit('loveUp', secId, r.love); game.changed(); game.save(); if (onDone) onDone(); };
  }
  return el;
}
/** 奢侈品：25 件按价钱排；顶上「全部 / 包 / 首饰 / 表 · 酒」；喜欢的牌子 / 最喜欢的那件金框 */
export function openLux(secId, host) {
  const c = SEC_BY_ID[secId]; const p = host || openPanel(`送 ${c.name} 什么？`);
  const wrap = h('div'); p.body.appendChild(wrap);
  const render = () => {
    const s = game.state; const t = now(); wrap.innerHTML = '';
    const tk = tokenCard(s, secId, render); if (tk) wrap.appendChild(tk);
    const brand = LV.LUX_LIST.find((x) => x.brandKey === c.likeBrand); const r = s.secs[secId];
    wrap.appendChild(h('div', 'gift-tip', `奢侈品只加爱慕：每 ¥1 万 = 1 点（全部现货）。${c.name}喜欢：<b>${brand ? brand.name.split(' ')[0] : ''}</b>的包、<b>${c.likeLux}</b>（×2）。爱慕 ${num(r.love)}，最多送到 ${A.loveCap(r.love)}${r.love < 80 ? '（跨门要约她出去）' : r.love < 100 ? '（再往上要定情信物）' : ''}`));
    wrap.insertAdjacentHTML('beforeend', bdayTip(s, secId));
    const tabs = h('div', 'tabs lux-tabs');
    for (const [k, n] of LV.LOVE_CFG.luxKinds) { const b = h('button', 'tab' + (k === luxKind ? ' on' : ''), n); b.onclick = () => { luxKind = k; render(); }; tabs.appendChild(b); }
    wrap.appendChild(tabs);
    const grid = h('div', 'gift-grid'); wrap.appendChild(grid);
    for (const x of LV.LUX_LIST.filter(KIND_OK[luxKind])) {
      const k = LV.luxGain(s, secId, x.id, t);
      const gainTxt = k.why === 'gate' && k.love <= 0 ? '爱慕 +0（到门口了，约她出去）' : k.why === 'token' && k.love <= 0 ? '爱慕 +0（要定情信物）' : k.why === 'max' ? '已经是唯一了' : `爱慕 +${num(k.love)}${k.why ? `（到 ${A.loveCap(r.love)} 为止）` : ''}${k.bday ? '（生日 ×3）' : ''}`;
      const card = h('div', `gift-card${k.like ? ' fav' : ''}`, `${pic(x.img, x.name)}${k.like ? '<i class="gift-tag fav">她喜欢</i>' : ''}<b>${x.name}</b><small class="${k.love <= 0 ? 'gift-none' : ''}">${gainTxt}</small><button class="btn">${fmtMoney(x.price)}</button>`);
      const b = card.querySelector('.btn'); b.disabled = s.cash < x.price;
      b.onclick = async () => {
        if (!(await askIfNone(k.love <= 0))) return;
        const res = LV.giveLux(game.state, secId, x.id, now()); if (!res.ok) { toast(res.why); return; }
        after(secId, res, `♥ +${num(res.love.to - res.love.from)}（${x.name}收进她的首饰盒）`); render();
      };
      grid.appendChild(card);
    }
  };
  render();
}
/** 首饰盒（秘书详情「她的记录」）：送过的奢侈品和信物 */
export function jewelBoxHtml(s, secId) {
  const B = LV.jewelBox(s, secId); if (!B.n) return '<div class="tr-gain">首饰盒还是空的：去商场「奢侈品」送她一件</div>';
  return `<div class="jb-top">一共 ${B.n} 件 · ${fmtMoney(B.total)}</div><div class="jb-grid">${B.items.map((x) => `<div class="jb-item${x.token ? ' token' : ''}">${hasAsset(x.img) ? `<img src="${asset(x.img)}" alt="">` : `<div class="tk-ph">${x.token ? '💍' : '🎁'}</div>`}<b>${x.name}</b><small>${new Date(x.t).getMonth() + 1} 月 ${new Date(x.t).getDate()} 日</small></div>`).join('')}</div>`;
}
