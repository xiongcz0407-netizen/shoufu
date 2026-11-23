// 「秘书」页签（设计18 第四节 2）：上面一条培训位、两列卡片（没来的剪影 + 条件）；
// 秘书详情全屏：上半立绘、下半面板（资料 | 培养 | 衣柜 | 职位工资），底部动作条（互动 · 送礼 · 约会 · 陪着我）
import * as CP from '../core/capital.js?v=d69b03f5';
import { SECRETARIES, SEC_BY_ID, ATTRS } from '../config/secretaries.js?v=d69b03f5';
import { COURSE_BY_ID } from '../config/courses.js?v=d69b03f5';
import { OUTFITS, priceOf } from '../config/outfits.js?v=d69b03f5';
import { IND_BY_ID } from '../config/industries.js?v=d69b03f5';
import * as S from '../core/secretary.js?v=d69b03f5';
import * as T from '../core/training.js?v=d69b03f5';
import { isScouting } from '../core/busy.js?v=d69b03f5'; // V2-08
import * as STY from '../core/styles.js?v=d69b03f5'; // 设计36 第 4 条：衣柜写衣服名字 + 款式
import * as O from '../core/outfits.js?v=d69b03f5';
import * as A from '../core/affection.js?v=d69b03f5';
import { query } from '../core/ledger.js?v=d69b03f5';
import { fmtMoney, fmtDuration } from '../core/format.js?v=d69b03f5';
import { asset } from '../platform/assets.js?v=d69b03f5';
import { now } from '../core/clock.js?v=d69b03f5';
import { game } from '../game.js?v=d69b03f5';
import { h, toast, liveRender } from './dom.js?v=d69b03f5';
import { openFull, closeTab, goHome } from './shell.js?v=d69b03f5';
import { switchSecretary, dressUp } from './main-screen.js?v=d69b03f5';
import { pickSec, renderCourses } from './training.js?v=d69b03f5';
import { openMall } from './mall.js?v=d69b03f5';
import { openDate } from './date.js?v=d69b03f5';
import { createPortrait } from './portrait.js?v=d69b03f5';
import { bgKeyFor } from './main-screen.js?v=d69b03f5';
import * as PO from '../core/posts.js?v=d69b03f5';
import { openTab } from './shell.js?v=d69b03f5';
import { addFavor } from '../core/affection.js?v=d69b03f5';
import { gameDate, dateText } from '../core/gametime.js?v=d69b03f5'; // 送礼明细的日期
import * as COUP from '../core/coupon.js?v=d69b03f5'; // 设计39 再聊 5 次（开发2）
import { openWallet } from './coupon.js?v=d69b03f5'; // 设计39 去卡包买互动券（开发2）

const BEST_NAME = Object.fromEntries(ATTRS.map((a) => [a.key, a.name]));
/** 她现在的职位名：没有返回 '' */
export function postOf(s, id) { const k = PO.postOfSec(s, id); return k ? PO.postName(k) : ''; }
const requesting = (s, id) => (s.inbox || []).some((m) => m.kind === 'request' && m.status === 'open' && m.from === id);
/** 给她花的钱：礼物 + 衣服（财富页「送给秘书的」用，件数、金额） */
export function spentOn(s, id) {
  const rows = (s.ledger || []).filter((r) => (r.cat === 'gift' || r.cat === 'clothes') && r.dir === 'out' && (r.party === id || (r.note || '').includes(id)));
  return { n: rows.length, amount: rows.reduce((a, r) => a + r.amount, 0) };
}
/** 送她的礼物（只算礼物，衣服在衣柜里看）：流水 cat 'gift'、收的人是她，note「送XX」。
 *  返回 { n 件数, amount 花了, list: [{ name, n }] 按礼物合并、最近送的在前, log: [{ t, name, amount, favor }] 每一次、新的在前 } */
export function giftsTo(s, id) {
  const rows = (s.ledger || []).filter((r) => r.cat === 'gift' && r.dir === 'out' && r.party === id).sort((a, b) => b.t - a.t || b.id - a.id);
  const glog = ((s.secs[id] && s.secs[id].rec && s.secs[id].rec.giftLog) || []).slice();
  const log = rows.map((r) => { const name = (r.note || '').replace(/^送/, ''); const i = glog.findIndex((x) => x.t === r.t && x.name === name); const g = i >= 0 ? glog.splice(i, 1)[0] : null; return { t: r.t, name, amount: r.amount, favor: g ? g.favor : null, love: g ? g.love : 0 }; });
  const by = new Map(); for (const x of log) by.set(x.name, (by.get(x.name) || 0) + 1); // Map 按第一次出现排 = 最近送的在前
  return { n: rows.length, amount: rows.reduce((a, r) => a + r.amount, 0), list: [...by].map(([name, n]) => ({ name, n })), log };
}
/** 她领过的工资（第 7 项记「秘书工资」，经手人 / 收款人是她） */
export const salaryPaid = (s, id) => query(s, { cat: 'sec_salary' }).filter((r) => r.by === id || r.party === id).reduce((a, r) => a + r.amount, 0);
const hearts = (n, max = 5) => '♥'.repeat(n) + '<i class="off">' + '♥'.repeat(max - n) + '</i>';

/** 培养条（设计35 第八节：没有培训位了，付钱立刻学完） */
function trainingBar(el) {
  el.innerHTML = `<div class="tb-title">培养<small>付了学费属性立刻加上，属性越高越贵</small></div>`;
  const b = h('button', 'btn gold tb-go', '＋ 给秘书上课'); b.onclick = () => pickSec(() => game.changed());
  el.appendChild(b);
}

/** 「秘书」页签：培训位条 + 两列卡片 */
export function renderSecretaryList(body, ctx) {
  const bar = h('div', 'train-bar'); const grid = h('div', 'sec-grid2');
  body.append(bar, grid);
  const draw = () => {
    const s = game.state; trainingBar(bar);
    grid.innerHTML = '';
    for (const c of SECRETARIES) {
      const r = s.secs[c.id];
      const card = h('button', 'sec-card2' + (r ? '' : ' locked') + (r && s.current === c.id ? ' cur' : ''));
      if (r) {
        S.ensureSec(s, c.id);
        const post = postOf(s, c.id);
        card.innerHTML = `<div class="sc2-img"><img src="${asset(`assets/sec/${c.id}/${r.outfit}.webp`)}" alt="">
            ${T.isTraining(s, c.id) ? '<em class="corner l">上课中</em>' : isScouting(s, c.id) ? '<em class="corner l">踩点中</em>' : ''}${requesting(s, c.id) ? '<em class="corner r">请示中</em>' : ''}${s.current === c.id ? '<em class="corner b">陪着你</em>' : ''}</div>
          <div class="sc2-name">${c.name}<small>${c.type}</small></div>
          <div class="sc2-hearts"><span class="fav" title="好感">${hearts(S.favorStage(r.favor) + 1)}</span><span class="heart">♥${r.love}</span></div>
          <div class="sc2-post${post ? '' : ' none'}">${post || '没有职位'}</div>`;
        card.onclick = () => openDetail(c.id);
      } else {
        card.innerHTML = `<div class="sc2-img"><img src="${asset(`assets/sec/${c.id}/c1.webp`)}" alt=""></div><div class="sc2-name">？？？</div><div class="sc-cond">${c.text}</div>`;
      }
      grid.appendChild(card);
    }
  };
  // 卡片角标、培训倒计时每秒刷新
  const off = liveRender(body, draw, (fn) => game.onChange(fn), body);
  ctx && ctx.onCleanup && ctx.onCleanup(off);
}
/** 兼容旧入口（面板形式） */
export function openSecretaryList(host) { renderSecretaryList(host.body, null); }

/** 秘书详情（全屏）：seg = info | train | wardrobe | post */
export function openDetail(id, seg = 'info') {
  const s = game.state; const c = SEC_BY_ID[id]; const r = S.ensureSec(s, id);
  if (!r) return;
  let portrait = null, off = null;
  const p = openFull(`${c.name}<small class="sd-sub">${c.type} · 擅长${BEST_NAME[c.best]}</small>`, { onClose: () => { portrait && portrait.stop(); off && off(); game.changed(); } });
  p.body.classList.add('sd-full');
  const k = bgKeyFor(s.title);
  const hero = h('div', 'sd-hero', '<div class="sd-stage"></div><div class="bubble sd-bubble hidden"><div class="bubble-text"></div></div>');
  if (k) hero.style.backgroundImage = `url("${asset(`assets/bg/${k}.webp`)}")`;
  const segBar = h('div', 'seg-bar'); const panel = h('div', 'sd-panel');
  const acts = h('div', 'sd-acts', '<button class="btn talk">互动</button><button class="btn gift">送礼</button><button class="btn date">约会</button><button class="btn gold stay"></button>');
  p.body.append(hero, segBar, panel, acts);
  portrait = createPortrait(hero.querySelector('.sd-stage'));
  requestAnimationFrame(() => portrait.show(id, r.outfit, { fade: false }));
  let bubbleTimer = null;
  const bubble = (text) => {
    if (!text) return; const b = hero.querySelector('.sd-bubble');
    b.querySelector('.bubble-text').textContent = text; b.classList.remove('hidden', 'pop'); void b.offsetWidth; b.classList.add('pop');
    clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => b.classList.add('hidden'), 3200);
  };
  const SEGS = [['info', '资料'], ['train', '培养'], ['wardrobe', '衣柜'], ['post', '职位工资']];
  const show = (key) => {
    seg = key; segBar.innerHTML = '';
    for (const [kk, n] of SEGS) { const b = h('button', 'seg' + (kk === key ? ' on' : ''), n); b.onclick = () => show(kk); segBar.appendChild(b); }
    off && off(); off = null; panel.innerHTML = ''; panel.scrollTop = 0;
    const draw = { info: drawInfo, train: drawTrain, wardrobe: drawWardrobe, post: drawPost }[key];
    if (key === 'info' || key === 'train') off = liveRender(panel, () => { panel.innerHTML = ''; draw(panel, id, show, portrait); }, (fn) => game.onChange(fn), panel);
    else draw(panel, id, show, portrait);
  };
  const stay = acts.querySelector('.stay');
  const stayText = () => { stay.textContent = game.state.current === id ? '正陪着你' : '陪着我'; stay.disabled = game.state.current === id; };
  stayText();
  const talkBtn = acts.querySelector('.talk');
  // 设计39：10 次用完，按钮变成「用互动券 +5 次（还有 N 张）」/ 没券「去卡包买互动券」（每人每天最多用 3 张）；用满写「今天聊够了 / 明天再来」
  const talkText = () => { const s = game.state; const t = now(); const n = A.talksLeft(s, id, t); const why = n ? null : COUP.whyTalks(s, id, t); const IT = COUP.ITEMS.talk; const buy = !n && why === '没有互动券'; const use = !n && !why;
    talkBtn.innerHTML = n ? `互动<small>今天还能 ${n} 次</small>` : use ? `再聊 ${IT.n} 次<small>用 1 张互动券（还有 ${COUP.have(s, 'talk')} 张）</small>` : buy ? `再聊 ${IT.n} 次<small>去卡包买互动券</small>` : '今天聊够了<small>明天再来</small>';
    talkBtn.disabled = !n && !use && !buy; talkBtn.classList.add('two'); talkBtn.classList.toggle('gold', use || buy); };
  talkText(); const offTalk = game.onChange(() => { if (!document.body.contains(talkBtn)) { offTalk && offTalk(); return; } talkText(); });
  talkBtn.onclick = () => {
    if (!A.talksLeft(game.state, id, now())) { if (!COUP.have(game.state, 'talk')) { openWallet({ focus: 'talk', back: talkText }); return; } const r = COUP.useTalk(game.state, id, now()); toast(r.ok ? `今天能跟${SEC_BY_ID[id].name}再聊 ${r.n} 次` : r.why); game.changed(); game.save(); talkText(); return; }
    const res = A.tapSec(game.state, id, now());
    portrait.bounce(); bubble(res.line);
    floatUp(hero, res.favor && res.favor.to > res.favor.from ? `好感 +${res.favor.to - res.favor.from}` : '今天聊够了，明天再来');
    if (res.favor && res.favor.stageUp) game.emit('favorUp', id, res.favor);
    game.changed(); game.save();
  };
  acts.querySelector('.gift').onclick = () => openMall(id, 'gift');
  acts.querySelector('.date').onclick = () => openDate(id);
  stay.onclick = () => { switchSecretary(id); goHome(); };
  show(seg);
  return p;
}

function drawInfo(el, id) {
  const s = game.state; const c = SEC_BY_ID[id]; const r = s.secs[id];
  const fs = S.favorStage(r.favor), ls = S.loveStage(r.love);
  const g = giftsTo(s, id); const places = Object.keys(r.rec.places || {}); const post = postOf(s, id);
  el.innerHTML = `
    <div class="sd-attrs">${ATTRS.map((a) => `<div class="sd-attr"><span>${a.name}${a.key === c.best ? '<i class="best">★</i>' : ''}</span><div class="bar"><i style="width:${r.attrs[a.key]}%"></i></div><b>${r.attrs[a.key]}</b></div>`).join('')}</div>
    <div class="sd-rel">好感 <b>${S.FAVOR_STAGES[fs]}</b> <span class="fav">${hearts(fs + 1)}</span><div class="bar fav"><i style="width:${S.favorInStage(r.favor)}%"></i></div></div>
    <div class="sd-rel">爱慕 <span class="heart">♥</span> <b>${r.love}</b>（${S.LOVE_STAGES[ls][1]}）<div class="bar love"><i style="width:${r.love}%"></i></div></div>
    <div class="sd-rec-title">她的记录</div>
    <div class="sd-rec">
      <div>认识<b>${S.daysKnown(s, id)} 天</b></div><div>互动<b>${r.rec.talks} 次</b></div><div>约会<b>${r.rec.dates} 次</b></div>
      <div class="sd-gift-n ${g.n ? 'tap' : ''}">送她礼物<b>${g.n} 件${g.n ? ' ›' : ''}</b></div><div>花了<b>${fmtMoney(g.amount)}</b></div><div>买衣服<b>${r.rec.clothes} 件</b></div>
      <div>职位<b>${post || '没有'}</b></div><div>月薪<b>${fmtMoney(PO.salaryOf(s, id))}</b></div><div>累计工资<b>${fmtMoney(salaryPaid(s, id))}</b></div>${(() => { const w = CP.secWorth(s, id); return w.pct ? `<div>她的身家<b>${fmtMoney(w.total)}</b></div><div>持股 / 期权<b>${(w.pct * 100).toFixed(2)}%</b></div>` : ''; })()}
      ${r.dateTitle ? '<div>称号<b>心上人</b></div>' : ''}${(() => { const x = s.trip && s.trip.rec && s.trip.rec[id]; return x ? `<div>一起出差<b>${x.n} 次</b></div><div>去过<b>${x.cities.join('、')}</b></div>` : ''; })()}<div>最近约会<b>${r.rec.lastDate ? new Date(r.rec.lastDate).toLocaleDateString('zh-CN') : '还没有'}</b></div>
    </div>
    <div class="sd-rec-title">送过的礼物</div>
    <div class="sd-gifts">${g.list.length ? g.list.map((x) => `<span>${x.name}${x.n > 1 ? ` ×${x.n}` : ''}</span>`).join('') : '<em>还没送过礼物</em>'}</div>
    <div class="sd-gift-log" hidden>${g.log.map((x) => `<div><span>${x.name}</span><small>${dateText(gameDate(s, x.t))}</small><b>${x.favor != null ? `好感 +${x.favor}${x.love ? `　♥ +${x.love}` : ''}` : '—'}</b></div>`).join('')}</div>
    <div class="sd-places">去过：${places.length ? places.join('、') : '还没一起出去过'}</div>`;
  const tap = el.querySelector('.sd-gift-n.tap'); const lg = el.querySelector('.sd-gift-log');
  if (tap) tap.onclick = () => { lg.hidden = !lg.hidden; tap.classList.toggle('on', !lg.hidden); };
}

function drawTrain(el, id) {
  renderCourses(el, id, () => game.changed());
}

function drawWardrobe(el, id, show, portrait) {
  const s = game.state; const r = s.secs[id];
  el.appendChild(h('div', 'tr-gain', '点一套让她换上；没买的去商场买（个人现金）'));
  const grid = h('div', 'cloth-grid sd-cloth');
  for (const o of OUTFITS) {
    const own = O.owns(s, id, o.id); const ok = O.canWear(s, id, o.id); const on = r.outfit === o.id;
    const card = h('button', 'cloth' + (own && ok ? '' : ' dim') + (on ? ' on' : ''), `<img src="${asset(`assets/sec/${id}/${o.id}.webp`)}" alt="">
      <div class="cloth-meta">${STY.nameOf(id, o.id)}${STY.styleOf(id, o.id) ? `<em class="cloth-st">${STY.styleOf(id, o.id)}</em>` : ''}${on ? ' · 穿着' : ''}</div>${!own ? `<div class="cloth-need">🔒 ${fmtMoney(priceOf(id, o.id))}</div>` : ok ? '' : `<div class="cloth-need">${O.needText(o.id)}</div>`}`);
    card.onclick = () => {
      if (!own) { openMall(id, 'clothes'); return; }
      if (!ok) { toast(O.needText(o.id)); return; }
      O.chooseOutfit(s, id, o.id); portrait.show(id, o.id, { fade: 'dress' });
      if (id === s.current) dressUp(id, o.id);
      game.changed(); game.save(); show('wardrobe');
    };
    grid.appendChild(card);
  }
  el.appendChild(grid);
}

function drawPost(el, id) {
  const s = game.state; const key = PO.postOfSec(s, id); const kind = key ? PO.kindOf(key) : null;
  const st = key ? PO.stat(s, key) : null; const sal = PO.salaryOf(s, id); const mk = PO.marketSalary(s, id);
  const best = (PO.POSTS_CFG.best[id] || []).map((k) => (PO.POSTS_CFG.posts[k] ? PO.POSTS_CFG.posts[k].name : ({ invest: '投资经理', biz: '商务总监', ipo: '投融资总监' })[k] + '（以后）')).join('、');
  const gain = !st ? '—' : kind === 'manager' ? `+${fmtMoney(st.gain)} / 省 ${fmtMoney(st.save)}` : kind === 'cfo' ? `申报 ${st.filed} 次` : `租金 ${fmtMoney(st.rent)}`;
  const eff = key ? Math.round(PO.efficiency(s, id, key, now()) * 100) : null;
  el.innerHTML = `
    <div class="sum-card">
      <div><small>职位</small><b>${key ? PO.postName(key) : (game.state.current === id ? '日程秘书' : '总裁秘书')}</b></div>
      <div><small>月薪（另付社保 30%）</small><b>${fmtMoney(sal)}</b></div>
      <div><small>本月为你赚 / 省</small><b class="pos">${gain}</b></div>
      <div><small>累计工资</small><b>${fmtMoney(salaryPaid(s, id))}</b></div>
    </div>
    <div class="tr-gain">${key ? `效率 ${eff}%（好感信任 ×1.1、知己 ×1.2；冷落 3 天 ×0.7；上课 ×0.5）。` : ''}最适合：<b>${best || '—'}</b> ★。市场价月薪 ${fmtMoney(mk)}${mk > sal * 1.1 ? '，比现在高不少，她可能会来谈加薪' : ''}。</div>
    <div class="ind-btns" style="margin-top:10px"><button class="btn gold go">去「公司 → 职位」安排</button><button class="btn raise">主动加薪 10%</button></div>`;
  el.querySelector('.go').onclick = () => { document.querySelector('.full .page-back').click(); openTab('company', 'posts'); };
  el.querySelector('.raise').onclick = () => { const r = PO.giveRaise(s, id, now(), addFavor); if (!r.ok) { toast(r.why); return; } toast(`月薪涨到 ${fmtMoney(r.salary)}　好感 +5`); game.changed(); game.save(); drawPost((el.innerHTML = '', el), id); };
}

/** 飘字：放在台词气泡上方，往上飘着消失 */
function floatUp(hero, text) {
  const b = hero.querySelector('.sd-bubble'); const f = h('div', 'float-up', text);
  const top = b.classList.contains('hidden') ? hero.clientHeight - 60 : b.offsetTop - 34;
  f.style.top = top + 'px'; hero.appendChild(f); setTimeout(() => f.remove(), 1400);
}
