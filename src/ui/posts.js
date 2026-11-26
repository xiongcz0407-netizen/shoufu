// 「公司 → 职位」（设计16 第六节、设计18 第四节 1）：组织架构图（你在最上，下面一排职位卡：头像 / 空缺 / 外包），
// 点职位卡 → 底部抽屉：选人（最适合的打星）、外包、撤职、授权额度、店长托管（月预算 + 回本期）、资产管家出租、看她的月报
import * as ADS from '../core/ads.js?v=9a2bf56f'; // V0.2.5 自动升级广告
import { SECRETARIES, SEC_BY_ID, ATTRS } from '../config/secretaries.js?v=9a2bf56f';
import { IND_BY_ID } from '../config/industries.js?v=9a2bf56f';
import * as PO from '../core/posts.js?v=9a2bf56f';
import * as MG from '../core/manage.js?v=9a2bf56f';
import { noteUp } from '../core/upnote.js?v=9a2bf56f'; // V0.2.5 升级框
import * as PW from '../core/postwork.js?v=9a2bf56f';
import * as T from '../core/training.js?v=9a2bf56f';
import { fmtMoney } from '../core/format.js?v=9a2bf56f';
import { asset, hasAsset } from '../platform/assets.js?v=9a2bf56f';
import { now } from '../core/clock.js?v=9a2bf56f';
import { game } from '../game.js?v=9a2bf56f';
import { h, openPanel, toast, liveRender } from './dom.js?v=9a2bf56f';
import { avatarKey } from './main-screen.js?v=9a2bf56f';

const AN = Object.fromEntries(ATTRS.map((a) => [a.key, a.name]));
const icon = (k, cls = 'pc-ic') => (hasAsset(`assets/ui/${k}.webp`) ? `<img class="${cls}" src="${asset(`assets/ui/${k}.webp`)}" alt="">` : '');
const attrText = (kind) => PO.POSTS_CFG.posts[kind].attrs.map((a) => AN[a]).join(' + ');
/** V0.2.5（设计37 第三节）上任 / 换人：职位效率前 → 后（交接期过了以后的） */
const effAt = (s, key) => PO.power(s, key, now() + (PO.POSTS_CFG.handoverMin || 0) * 60e3 + 1);
const effSnap = (s, key) => { const id = PO.indOf(key); return { p: effAt(s, key), rev: id ? PO.managerRevMult(s, id) : 0, auto: id && s.inds[id] ? MG.autoEff(s, id) : 0 }; };
function effNote(s, key, who, a) {
  const id = PO.indOf(key); const kind = PO.kindOf(key); const pct = (x) => `${Math.round(x * 100)}%`; const fx = [];
  const nm = who === PO.OUT ? '外包' : `${SEC_BY_ID[who].name}（${attrText(kind)} ${Math.round(PO.mainAttr(s, who, kind))}）`;
  if (id && s.inds[id]) { fx.push(`${IND_BY_ID[id].name}营业额 +${pct(a.rev - 1)} → +${pct(PO.managerRevMult(s, id) - 1)}`); fx.push(`这条线自动经营效率 ${pct(a.auto)} → ${pct(MG.autoEff(s, id))}`); }
  else fx.push(`职位效率 ${pct(a.p)} → ${pct(effAt(s, key))}`);
  return { title: '上任', what: `${PO.postName(key)}：${nm}`, fx, next: who === PO.OUT ? '换成秘书能做得更好' : '她上课练属性，效率还能涨' };
}
const lastReport = (s, key) => (s.inbox || []).find((m) => m.type === 'post_report' && m.data && m.data.key === key);

function card(s, key) {
  const kind = PO.kindOf(key); const who = PO.holder(s, key); const lk = PO.postLocked(s, key); const st = PO.stat(s, key);
  const c = h('button', 'post-card' + (lk ? ' locked' : '') + (who ? '' : ' vacant'));
  let body;
  if (lk) body = `<div class="pc-who">🔒</div><small>${lk}</small>`;
  else if (PO.isSec(who)) {
    const e = PO.efficiency(s, who, key, now());
    body = `<img class="pc-av" src="${asset(`assets/sec/${who}/${s.secs[who].outfit}.webp`)}" alt=""><div class="pc-who">${SEC_BY_ID[who].name}${PO.bestFor(who, kind) ? ' ★' : ''}</div>
      <small>${attrText(kind)} ${Math.round(PO.mainAttr(s, who, kind))} · 效率 ${Math.round(e * 100)}%</small>
      <small class="pc-gain">${kind === 'manager' ? `本月 +${fmtMoney(st.gain)} / 省 ${fmtMoney(st.save)}` : kind === 'cfo' ? `本月申报 ${st.filed} 次` : kind === 'biz' ? '商战、收购、预警' : kind === 'ipo' ? '融资谈判、对赌、上市' : `出租 ${Object.keys(s.rented || {}).length} 件`}</small>`;
  } else if (who === PO.OUT) body = `${icon('icon_outsource', 'pc-av ic')}<div class="pc-who">外包</div><small>${PO.POSTS_CFG.outsource[kind].name}</small>`;
  else body = `<div class="pc-av ph">？</div><div class="pc-who">空缺</div><small>${kind === 'cfo' ? '税要你自己申报' : kind === 'manager' ? '你自己管' : kind === 'biz' ? '对手反击没预警' : kind === 'ipo' ? '融资自己谈' : '没人打理'}</small>`;
  c.innerHTML = `<div class="pc-head">${icon(PO.POSTS_CFG.posts[kind].icon)}<b>${PO.postName(key)}</b>${kind === 'manager' && PO.postMeta(s, key).host.on && who ? '<em class="pc-host">托管</em>' : ''}</div>${body}`;
  if (!lk) c.onclick = () => openPost(key);
  return c;
}

export function renderPosts(body, ctx) {
  const wrap = h('div'); body.appendChild(wrap);
  ctx.onCleanup(liveRender(wrap, () => {
    const s = game.state; wrap.innerHTML = '';
    const me = `assets/me/${avatarKey(s.title)}.webp`;
    wrap.appendChild(h('div', 'org-top', `${icon('icon_orgchart', 'org-ic')}<div class="org-boss">${hasAsset(me) ? `<img src="${asset(me)}" alt="">` : ''}<b>${s.bossName || '老板'}</b><small>${s.companyName || ''} 董事长</small></div>`));
    wrap.appendChild(h('div', 'org-line'));
    const grid = h('div', 'post-grid');
    for (const key of PO.postKeys(s)) grid.appendChild(card(s, key));
    wrap.appendChild(grid);
    const pay = Object.keys(s.secs).reduce((a, id) => a + PO.salaryOf(s, id), 0);
    wrap.appendChild(h('div', 'tr-gain', `秘书月薪合计 ${fmtMoney(pay)}（另付社保 30%），从公司账户发。每人同时只担一个职位；上课时效率减半，刚换人头 10 分钟减半。没人担任可以交给外包：代账公司（每月 2000，只报税）、职业经理人（拿利润 10%）、物业托管（不打折、不出租）。`));
  }, (fn) => game.onChange(fn), body));
}

/** 职位抽屉 */
export function openPost(key) {
  const kind = PO.kindOf(key);
  const p = openPanel(PO.postName(key));
  const render = () => {
    const s = game.state; const who = PO.holder(s, key); const m = PO.postMeta(s, key); const cfg = PO.POSTS_CFG.posts[kind];
    p.body.innerHTML = '';
    p.body.appendChild(h('div', 'tr-gain', ({ manager: `管这条线：收入 ×(1 + 管理 × 0.8)、进货成本 ×(1 − 管理 × 0.15)；拉熟客护口碑；打开托管后按预算和回本期自己升级、开分店；每月经营月报。管理低于 30 每月可能出小事故。`, cfo: '自动申报纳税（没人管要你自己点申报，过期有滞纳金）；现金流预警；分红建议；智慧 ≥ 40 提醒小型微利企业线；智慧低于 30 申报偶尔算错要补税。', biz: '商务总监：商战胜率加一点、收购价最多便宜 3%（看交际、魅力）；对手要挖人、抢地时一半以上能提前稳住；跟瑞霖谈融资时利率更低。阶段二后面还管品牌关系、配货额度。', steward: '维护费打折；帮你出租豪宅、飞机托管包机（租金进个人现金，代扣 20%）；代办验资排队；卖东西议价到最高 80%；每月资产月报。' })[kind] + `<br>看「${attrText(kind)}」；基本月薪 ${fmtMoney(cfg.base)}`));
    // 选人
    p.body.appendChild(h('div', 'sd-rec-title', '谁来当'));
    const list = h('div', 'pick-list');
    for (const c of SECRETARIES) {
      if (!s.secs[c.id]) continue;
      const cur = PO.postOfSec(s, c.id); const on = who === c.id;
      const b = h('button', 'pick' + (on ? ' on' : ''), `<img src="${asset(`assets/sec/${c.id}/${s.secs[c.id].outfit}.webp`)}" alt=""><div><b>${c.name}${PO.bestFor(c.id, kind) ? ' <span class="star">★</span>' : ''}</b><small>${attrText(kind)} ${Math.round(PO.mainAttr(s, c.id, kind))}${T.isTraining(s, c.id) ? ' · 上课中' : ''}</small><small>${on ? '现在是她' : cur ? '在当' + PO.postName(cur) : '没职位'} · 月薪约 ${fmtMoney(salaryIf(s, c.id, key))}</small></div>`);
      b.onclick = () => { if (on) return; const b0 = effSnap(s, key); PO.assign(s, key, c.id, now()); noteUp(s, effNote(s, key, c.id, b0), now()); toast(`${c.name}当${PO.postName(key)}了`); game.changed(); game.save(); render(); };
      list.appendChild(b);
    }
    const out = PO.POSTS_CFG.outsource[kind];
    const ob = h('button', 'pick' + (who === PO.OUT ? ' on' : ''), `${icon('icon_outsource', 'ic')}<div><b>外包：${out.name}</b><small>${kind === 'cfo' ? `每月 ${fmtMoney(out.fee)}，只报税不节税` : kind === 'biz' || kind === 'ipo' ? `每月 ${fmtMoney(out.fee)}，按本事 30 算` : kind === 'manager' ? '按管理 50 算，每月拿这条线利润的 10%' : kind === 'collector' ? `每月 ${fmtMoney(out.fee)}，掌眼按 50 算，不代拍` : kind === 'invest' ? `每月 ${fmtMoney(out.fee)}，按智慧 50 算，不看盘提醒` : '维护费不打折、不帮你出租'}</small></div>`);
    ob.onclick = () => { const b0 = effSnap(s, key); PO.assign(s, key, PO.OUT, now()); noteUp(s, effNote(s, key, PO.OUT, b0), now()); game.changed(); game.save(); render(); };
    list.appendChild(ob);
    { const lk = PO.postLocked(s, key); if (lk) { list.querySelectorAll('button').forEach((b) => { b.disabled = true; b.classList.add('locked'); }); list.before(h('div', 'tr-gain neg', `${lk}：${kind === 'manager' ? '开了第一家店才能派店长' : '现在还不能安排'}`)); } } /* 设计58：还没开店，选人框灰掉 */
    p.body.appendChild(list);
    if (who) { const x = h('button', 'btn', '撤职（空着）'); x.onclick = () => { PO.assign(s, key, null, now()); game.changed(); game.save(); render(); }; p.body.appendChild(x); }
    // 授权额度
    if (kind !== 'cfo' && who) {
      const steps = [1e4, 5e4, 1e5, 5e5, 1e6, 5e6, 1e7];
      p.body.appendChild(h('div', 'sd-rec-title', '授权额度（她一次能花的上限，超过来请示）'));
      const t = h('div', 'tabs'); for (const v of steps) { const b = h('button', 'tab' + (m.auth === v ? ' on' : ''), fmtMoney(v)); b.onclick = () => { m.auth = v; game.save(); render(); }; t.appendChild(b); }
      p.body.appendChild(t);
    }
    // 店长托管
    if (kind === 'manager' && who) {
      p.body.appendChild(h('div', 'sd-rec-title', '托管'));
      const sw = h('button', 'btn ' + (m.host.on ? 'gold' : ''), m.host.on ? '托管中（点一下关掉）' : '打开托管（她自己升级、开分店）');
      sw.onclick = () => { m.host.on = !m.host.on; game.save(); render(); };
      p.body.appendChild(sw);
      const bt = h('div', 'tabs'); for (const v of [5e4, 2e5, 1e6, 5e6, 2e7]) { const b = h('button', 'tab' + (m.host.budget === v ? ' on' : ''), `月预算 ${fmtMoney(v)}`); b.onclick = () => { m.host.budget = v; game.save(); render(); }; bt.appendChild(b); }
      const pt = h('div', 'tabs'); for (const v of [1, 3, 8, 24]) { const b = h('button', 'tab' + (m.host.paybackH === v ? ' on' : ''), `回本 ≤ ${v} 小时`); b.onclick = () => { m.host.paybackH = v; game.save(); render(); }; pt.appendChild(b); }
      p.body.append(bt, pt, h('div', 'tr-gain', `本月已花预算 ${fmtMoney(m.host.spent || 0)}；只花公司「可用」的钱`));
    }
    // V0.2.5 自动升级广告（设计37 第二节 6）：默认开，跟托管放一起
    if (kind === 'manager' && who && ADS.isAdLine(s, PO.indOf(key))) {
      const id = PO.indOf(key); const on = ADS.autoOn(s, id);
      const sw = h('button', 'btn ' + (on ? 'gold' : ''), on ? '自动升级广告：开（点一下关掉）' : '自动升级广告：关（点一下打开）'); sw.onclick = () => { ADS.setAuto(s, id, !on); game.save(); render(); };
      p.body.append(sw, h('div', 'tr-gain', PO.isSec(who) ? '钱够（留够两个月工资）就自动升人流、口碑，先升便宜的；升了写进月报。' : '职业经理人只会发传单、点评运营：人流升到 +25%、口碑升到 60 为止。'));
    }
    // 资产管家出租
    if (kind === 'steward') {
      const own = new Set([...(s.garage.houses || []), ...(s.garage.planes || [])]);
      const items = PW.RENTABLE().filter((x) => own.has(x.id));
      p.body.appendChild(h('div', 'sd-rec-title', '出租闲置资产'));
      if (!items.length) p.body.appendChild(h('div', 'tr-gain', '还没有豪宅、飞机。买了以后能在这里交给她出租（出租中的不能拿去约会）。'));
      for (const it of items) {
        const on = PW.isRented(s, it.id);
        const row = h('div', 'tr-course', `<div style="flex:1"><b>${it.name || `${it.brand} ${it.model}`}</b><div class="tr-gain">年租金约 ${fmtMoney(PW.rentYear(s, it))}（${it.kind === 'house' ? it.city : '托管包机'}）</div></div><button class="btn ${on ? 'gold' : ''}">${on ? '出租中' : '出租'}</button>`);
        row.querySelector('.btn').onclick = () => { const r = PW.setRent(s, it.id, !on); if (!r.ok) toast(r.why); game.save(); render(); };
        p.body.appendChild(row);
      }
    }
    const rep = lastReport(s, key);
    if (rep) p.body.append(h('div', 'sd-rec-title', '上个月的汇报'), h('div', 'tr-gain', `<b>${rep.title}</b><br>${rep.body}`));
  };
  render();
}
/** 让她当这个职位大概多少月薪 */
function salaryIf(s, id, key) {
  const old = s.positions[key]; const oldPost = PO.postOfSec(s, id);
  if (oldPost) delete s.positions[oldPost]; s.positions[key] = id;
  const v = PO.marketSalary(s, id);
  delete s.positions[key]; if (old) s.positions[key] = old; if (oldPost) s.positions[oldPost] = id;
  return v;
}
