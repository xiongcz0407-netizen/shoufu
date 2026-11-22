// 商战：对手列表 → 选项目、带人 → 开战结果；赢满 3 次发起收购
import * as RG from '../core/rivalgrow.js?v=1236a42d'; // P-00 对手也在长大
import * as EQ from '../core/equity.js?v=1236a42d';
import * as BK from '../core/bank.js?v=1236a42d';
import { gameDate, dateText } from '../core/gametime.js?v=1236a42d';
import { turfText } from '../core/rivalry.js?v=1236a42d';
import { RIVALS, RIVAL_BY_ID, PROJECTS, TEAM_MAX, WINS_TO_ACQUIRE, BATTLES_PER_DAY, ACQUIRE_COOLDOWN_SEC } from '../config/rivals.js?v=1236a42d';
import { SEC_BY_ID, ATTRS } from '../config/secretaries.js?v=1236a42d';
import { LINES } from '../config/lines.js?v=1236a42d';
import { BOSS_LINES } from '../config/battle-lines.js?v=1236a42d';
import * as B from '../core/battle.js?v=1236a42d';
import { isTraining } from '../core/training.js?v=1236a42d';
import { fmtMoney } from '../core/format.js?v=1236a42d';
import { now } from '../core/clock.js?v=1236a42d';
import { asset, hasAsset } from '../platform/assets.js?v=1236a42d';
import { game } from '../game.js?v=1236a42d';
import { h, openPanel, toast } from './dom.js?v=1236a42d';
import { say } from './main-screen.js?v=1236a42d';
import { playStory } from './story.js?v=1236a42d';
import { openContract } from './contract.js?v=1236a42d';
import { openTab } from './shell.js?v=1236a42d';
import { nextContractNo } from '../core/contracts.js?v=1236a42d';
import { TAX } from '../core/companytax.js?v=1236a42d';
import { IND_BY_ID } from '../config/industries.js?v=1236a42d';
import { auraBattle, networkAcquire } from '../core/boss.js?v=1236a42d';
import { hintLater } from './guide2.js?v=1236a42d';
import * as TKO from '../core/takeover.js?v=1236a42d';
import { listed as listedNow } from '../core/listing.js?v=1236a42d';

const AN = Object.fromEntries(ATTRS.map((a) => [a.key, a.name]));
const mergeText = (r) => { const e = r.effect || {}; return [...Object.entries(r.merge || {}).map(([k, n]) => `${IND_BY_ID[k].name} ${n} 家（连员工）`), e.fleetUnits && `货车 ${Math.ceil(e.fleetUnits / 3)} 辆`, (e.reProjects || []).map((x) => (x.stage === 'build' ? '在建项目 1 个' : '储备地 1 块')).join('、'), e.techProduct && '上线产品 1 个', e.levelUp && Object.entries(e.levelUp).map(([k, n]) => `${IND_BY_ID[k].name}团队（+${n} 级）`).join('、'), e.rights && `片库版权（授权费 ${fmtMoney(e.rights)}）`, e.boost && Object.entries(e.boost).map(([k, v]) => `${IND_BY_ID[k].name}收入 +${v * 100}%`).join('、'), e.early && e.early.map((k) => `提前开${IND_BY_ID[k].name}`).join('、')].filter(Boolean).join('、') || '—'; };
const bossImg = (r) => (r.bossSrc && hasAsset(r.bossSrc) ? `<img src="${asset(r.bossSrc)}" alt="" style="object-position:top">` : hasAsset(`assets/boss/${r.bossImg}.webp`) ? `<img src="${asset(`assets/boss/${r.bossImg}.webp`)}" alt="">` : `<div class="boss-ph">${r.boss}</div>`);
const pct = (x) => Math.round(x * 100) + '%';

export function openBattle(host) {
  const p = host || openPanel('商战');
  const render = () => {
    const s = game.state; const t = now();
    const mb = hasAsset('assets/bg/bg_meeting.webp') ? ` style="background-image:linear-gradient(90deg,rgba(10,14,24,.92) 40%,rgba(10,14,24,.35)),url('${asset('assets/bg/bg_meeting.webp')}')"` : '';
    p.body.innerHTML = `<div class="bt-head"${mb}>还能打 <b>${B.battlesLeft(s, t)}/${BATTLES_PER_DAY}</b> 次${B.nextBattleIn(s, t) ? `（${Math.ceil(B.nextBattleIn(s, t) / 60e3)} 分钟后 +1，每 30 分钟恢复 1 次）` : ''}<br><small>赢满 ${WINS_TO_ACQUIRE} 次可以去「收购」${auraBattle(s) ? `　气场 +${(auraBattle(s) * 100).toFixed(1)}%` : ''}</small></div>`;
    for (const r0 of RIVALS.filter((x) => x.stage <= s.title)) { // 只列到了这个阶段的对手
      const r = RG.live(s, r0.id); const st = B.rivalState(s, r.id);
      const card = h('div', 'rival' + (st.acquired ? ' done' : ''), `<div class="rival-boss">${bossImg(r)}</div>
        <div class="ind-info"><div class="ind-name">${r.name}${r.bossTitle ? `<small> · ${r.bossTitle} ${r.boss}</small>` : ''}${r.final ? '<small class="final">最终对手</small>' : ''}</div>
        <div class="ind-line">${r.bossTitle ? r.ind : `${r.ind} · 老板 ${r.boss}（${r.bossAge}）`}</div>
        <div class="ind-line">难度 ${'★'.repeat(r.level)}${'☆'.repeat(3 - r.level)}　${r.noAcquire ? `谈赢一次：过桥融资 ${fmtMoney(r.loan.amount)}（${s.bridge ? `已借，年利率 ${(s.bridge.rate * 100).toFixed(1)}%` : s.flags.beatSuBank ? '已还清' : '利率看谈得怎样，5%～10%'}）` : `赢 ${Math.min(st.wins, WINS_TO_ACQUIRE)}/${WINS_TO_ACQUIRE}　估值 ${fmtMoney(r.value)}${!st.acquired && RG.monthGrowth(s, r.id) ? `<small class="${RG.monthGrowth(s, r.id) > 0 ? 'neg' : 'pos'}">（比上个月 ${RG.monthGrowth(s, r.id) > 0 ? '+' : ''}${(RG.monthGrowth(s, r.id) * 100).toFixed(1)}%）</small>` : ''}${r.pe ? `（年利润 ${fmtMoney(r.profit)} × ${r.pe} 倍）` : ''}`}</div>
        ${!r.noAcquire && !st.acquired ? `<div class="ind-line">${mergeText(r) ? `规模：${mergeText(r).replace(/（连员工）/g, '')} · ` : ''}年利润 ${fmtMoney(r.profit)}${r.turf ? ` · 在 ${RG.turfCities(s, r).length} 个城市跟你抢` : ''}</div>` : ''}
        ${r.turf && !st.acquired ? `<div class="ind-line neg">${RG.turfLines(s, r).join('<br>')}</div>` : ''}${!r.noAcquire && !st.acquired && st.wins >= 2 && r.stage >= 2 ? '<div class="ind-line neg">被你打疼了，可能反击（挖人、抢地）</div>' : ''}
        ${st.acquired ? '<div class="stamp">已收购</div>' : `<div class="ind-btns"><button class="btn fight">${r.noAcquire ? '融资谈判' : '商战'}</button>${st.wins >= WINS_TO_ACQUIRE && !r.noAcquire ? '<button class="btn gold acq">去收购 ›</button>' : ''}</div>`}</div>`);
      const f = card.querySelector('.fight'); if (f) f.onclick = () => openFight(r.id, render);
      const a = card.querySelector('.acq'); if (a) a.onclick = () => openTab('battle', 'acquire');
      p.body.appendChild(card);
    }
  };
  render();
}

function teamPicker(box, team, onChange) {
  const s = game.state;
  box.innerHTML = '';
  for (const id of Object.keys(s.secs)) {
    const busy = isTraining(s, id); const on = team.includes(id);
    const b = h('button', 'tm' + (on ? ' on' : ''), `<img src="${asset(`assets/sec/${id}/c1.webp`)}" alt=""><span>${SEC_BY_ID[id].name}</span>${busy ? '<em>上课中</em>' : ''}`);
    b.disabled = busy;
    b.onclick = () => {
      if (on) team.splice(team.indexOf(id), 1);
      else { if (team.length >= TEAM_MAX) team.shift(); team.push(id); }
      onChange();
    };
    box.appendChild(b);
  }
}

function openFight(rivalId, done) {
  const s = game.state; const r = RG.live(s, rivalId);
  const team = [s.current].filter((id) => !isTraining(s, id));
  let proj = 'price';
  const p = openPanel(`对 ${r.name}`);
  const projBox = h('div', 'tabs'); const teamTitle = h('div', 'sd-rec-title'); const teamBox = h('div', 'tm-grid');
  const rateBox = h('div', 'rate'); const go = h('button', 'btn big', '开战');
  p.body.append(h('div', 'sd-rec-title', '比什么'), projBox, teamTitle, teamBox, rateBox, go);
  const render = () => {
    projBox.innerHTML = '';
    for (const pj of PROJECTS) {
      const b = h('button', 'tab' + (pj.id === proj ? ' on' : ''), `${pj.name}（${AN[pj.attr]}）`);
      b.onclick = () => { proj = pj.id; render(); };
      projBox.appendChild(b);
    }
    teamTitle.textContent = `带谁去（最多 ${TEAM_MAX} 人，看「${AN[PROJECTS.find((x) => x.id === proj).attr]}」）`;
    teamPicker(teamBox, team, render);
    const why = B.whyNotBattle(s, rivalId, team, now());
    rateBox.innerHTML = why ? `<span class="sc-cond">${why}</span>` : `胜率 <b>${pct(B.winRate(s, rivalId, proj, team))}</b>　赢了得 ${fmtMoney(r.reward)}${B.intelBonus(s, rivalId) ? `<br><small>知己知彼：输过的摸清了底牌 +${Math.round(B.intelBonus(s, rivalId) * 100)}%</small>` : ''}`;
    go.disabled = !!why;
  };
  go.onclick = () => {
    const res = B.fight(s, rivalId, proj, [...team], now());
    if (!res.ok) { toast(res.why); return; }
    p.close();
    showResult(r, [...team], res.win, res.win ? `得 ${fmtMoney(res.reward)}` : `这次摸清了对方的底牌：下次对${r.name}胜率 +${Math.round(res.intel * 100)}%`, () => {
      if (res.win) say(team[0], LINES[team[0]].happy, 3600, 'happy');
      if (res.canAcquire) toast(`赢满 ${WINS_TO_ACQUIRE} 次了，可以收购${r.name}！`, 2600);
      done();
    }, res.win ? BOSS_LINES[rivalId].lose : BOSS_LINES[rivalId].taunt);
    game.changed(); game.save();
  };
  render();
}

function openAcquire(rivalId, done) {
  const s = game.state; const r = RG.live(s, rivalId);
  const team = [s.current].filter((id) => !isTraining(s, id));
  const p = openPanel(`收购 ${r.name}`); hintLater('installment', 600);
  const teamBox = h('div', 'tm-grid'); const rateBox = h('div', 'rate'); const go = h('button', 'btn gold big', `出 ${fmtMoney(r.value)} 收购 → 签协议`);
  let plan = 'full'; const planBox = h('div', 'tabs'); let useLoan = false; const loanBox = h('div', 'tabs'); const LB = 'gongshang'; // 并购贷款（老板起，公商银行）
  let swapK = 0; const swapBox = h('div', 'tabs'); const swapOf = () => (plan === 'full' && TKO.swapMax(s, r, plan) > 0 ? Math.floor(r.value * swapK) : 0); // 第 3-05 项：上市以后可以换股
  const loanOf = () => (useLoan && (s.title || 0) >= 2 ? { bank: LB, amount: BK.maMax(s, r.value, B.payNow(s, r, plan)) } : null); // 一次付清 / 分期（首付 30%，商务总监在任 20%，余款 12 个游戏月）
  p.body.append(h('div', 'tr-sum', `带人去谈（看「魅力」「交际」）；失败退一半钱，对方冷静 ${ACQUIRE_COOLDOWN_SEC / 60} 分钟。满 3 胜以后每多赢一次商战，成功率 +10%${B.extraWins(s, rivalId) ? `（现在多赢了 ${B.extraWins(s, rivalId)} 次）` : ''}`), h('div', 'sd-rec-title', '怎么付'), planBox, loanBox, swapBox, teamBox, rateBox, go);
  const render = () => {
    teamPicker(teamBox, team, render);
    const dr = Math.round(EQ.downRate(s) * 100);
    planBox.innerHTML = `<button class="tab ${plan === 'full' ? 'on' : ''}" data-p="full">一次付清</button><button class="tab ${plan === 'install' ? 'on' : ''}" data-p="install">分期：首付 ${dr}%${s.positions && s.positions.biz ? '（商务总监谈的）' : ''}，余款 12 个游戏月</button>`;
    planBox.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { plan = b.dataset.p; render(); }));
    if ((s.title || 0) >= 2) { const mx = BK.maMax(s, r.value, B.payNow(s, r, plan)); loanBox.innerHTML = `<button class="tab ${useLoan ? '' : 'on'}" data-l="0">不贷款</button><button class="tab ${useLoan ? 'on' : ''}" data-l="1">并购贷款 ${fmtMoney(mx)}（公商银行，年利率 ${(BK.rateFor(s, LB, 'ma') * 100).toFixed(1)}%，${7} 个游戏年）</button>`; loanBox.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => { useLoan = b.dataset.l === '1'; render(); })); } else loanBox.innerHTML = '';
    if (TKO.swapMax(s, r, plan) > 0) { swapBox.innerHTML = [[0, '不换股'], [0.25, '新股付 25%'], [0.5, '新股付 50%']].map(([k, n]) => `<button class="tab ${swapK === k ? 'on' : ''}" data-w="${k}">${n}${k ? `（${fmtMoney(r.value * k)}）` : ''}</button>`).join(''); swapBox.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { swapK = +b.dataset.w; render(); })); } else { swapBox.innerHTML = listedNow(s) ? '<small class="tr-gain">分期收购不能换股</small>' : ''; }
    const ln0 = loanOf(); const pnow = B.payNow(s, r, plan) - swapOf();
    go.textContent = `${plan === 'install' ? '首付' : '出'} ${fmtMoney(pnow)}${ln0 ? `（自己付 ${fmtMoney(pnow - ln0.amount)}，贷款 ${fmtMoney(ln0.amount)}）` : ''} 收购 → 签协议`;
    const why = B.whyNotAcquire(s, rivalId, team, now(), plan, loanOf(), swapOf());
    rateBox.innerHTML = why ? `<span class="sc-cond">${why}</span>` : `成功率 <b>${pct(B.acquireRate(s, rivalId, team))}</b>${networkAcquire(s) ? `<br><small>老板人脉 +${(networkAcquire(s) * 100).toFixed(1)}%</small>` : ''}`;
    go.disabled = !!why;
  };
  go.onclick = () => {
    const ln = loanOf(); const sw = swapOf(); const why = B.whyNotAcquire(s, rivalId, team, now(), plan, ln, sw); if (why) { toast(why); return; }
    const pn = B.payNow(s, r, plan) - sw; const sch = plan === 'install' ? EQ.schedule(s, r.value, now(), pn) : [];
    p.close();
    const stamp = Math.round(r.value * TAX.stamp.equity * 100) / 100;
    openContract({ title: '股权转让协议', no: nextContractNo(s, 'GQ', now()), signer: s.bossName || '老板',
      parties: [['受让方', `${s.companyName || '我的公司'}（法定代表人 ${s.bossName || '老板'}）`], ['转让方', `${r.boss}（${r.name}）`]],
      subject: `转让方持有的${r.name} 100% 股权，连同全部门店和员工（${Object.entries(r.merge || {}).map(([k, n]) => `${IND_BY_ID[k].name} ${n} 家`).join('、') || '—'}）`,
      rows: [['股权转让款', r.value, plan === 'install' ? '分期' : '从公司账户付'], ...(sw ? [['其中：以新股支付（换股）', sw, `按 ${s.listing.listed.px} 元 / 股，${Math.round(sw / s.listing.listed.px).toLocaleString()} 股`]] : []), ...(plan === 'install' ? [['首付', pn, '签字时付'], ...sch.map((x) => [`第 ${x.k} 期`, x.amount, dateText(gameDate(s, x.due))])] : []), ['印花税', stamp, '产权转移书据 0.05%，受让方承担']], total: r.value + stamp,
      terms: [...(plan === 'install' ? ['分期：首付付完股权即交割；余款每个游戏月月底从公司账户付一期，逾期按日 0.05% 付违约金；连续 3 期付不上，转让方可以解除协议，股权收回，已付款扣 20% 违约金后退回，门店和员工退回。'] : []), '签字后谈判生效；对方临时反悔的，退回一半转让款（另一半是定金和中介费），10 分钟后可以再谈。', '交割后对方门店、员工、供应商合同一并转入受让方。'],
      signText: `签字，付 ${fmtMoney(pn - ((ln && ln.amount) || 0) + stamp)}${ln ? `（另 ${fmtMoney(ln.amount)} 并购贷款）` : ''}`,
      onSign: () => {
        const res = B.acquire(s, rivalId, [...team], now(), Math.random, plan, ln, sw);
        if (!res.ok) { toast(res.why); return; }
        if (!res.success) showResult(r, [...team], false, `对方最后反悔了，退回 ${fmtMoney(res.refund)}。${ACQUIRE_COOLDOWN_SEC / 60} 分钟后能再谈；再赢一次商战能提高成功率（每多赢一次 +10%）`, done, '这个价？你在开玩笑吧。');
        else {
          const m = (res.merged || []).map((x) => `${IND_BY_ID[x.ind].name} ${x.n} 家（${x.staff} 人）`).join('、');
          showResult(r, [...team], true, `收购成功！${m ? `并进来 ${m}` : ''}`, () => {
            playStory([
              { who: 'narr', text: `${r.name}签下了股权转让协议（${res.contract.no}）。` },
              { who: 'narr', text: `${r.boss}：「${BOSS_LINES[rivalId].sold}」` },
              ...(m ? [{ who: 'narr', text: `${m}连同员工一起并了进来。记得去「公司 → 职位」给它们安排店长。` }] : []),
              { who: team[0], text: LINES[team[0]].happy },
            ], { sec: team[0], outfit: s.secs[team[0]].outfit, title: `收购 · ${r.name}` });
            done();
          }, BOSS_LINES[rivalId].sold);
        }
        game.changed(); game.save();
      } });
  };
  render();
}

/** 结果动画：老板 vs 你的人，条子走到胜 / 败，盖章 */
function showResult(r, team, win, text, onClose, bossLine) {
  const el = h('div', 'bt-result');
  el.innerHTML = `<div class="bt-vs"><div class="bt-side">${bossImg(r)}<span>${r.boss}</span></div><div class="bt-x">VS</div>
    <div class="bt-side team">${team.map((id) => `<img src="${asset(`assets/sec/${id}/c1.webp`)}" alt="">`).join('')}<span>${team.map((id) => SEC_BY_ID[id].name).join('、')}</span></div></div>
    <div class="bt-bar"><i></i></div><div class="bt-line">${r.boss}：「${bossLine}」</div>
    <div class="bt-stamp ${win ? 'win' : 'lose'}">${win ? '胜' : '败'}</div><div class="bt-text">${text}</div><div class="story-hint">点一下继续</div>`;
  document.querySelector('#phone').appendChild(el);
  document.body.classList.add('story-open');
  requestAnimationFrame(() => { el.querySelector('.bt-bar i').style.width = win ? '100%' : '20%'; });
  setTimeout(() => el.classList.add('shown'), 900);
  el.onclick = () => { if (!el.classList.contains('shown')) return; el.remove(); document.body.classList.remove('story-open'); onClose && onClose(); };
}

/** 「收购」分段：满 3 胜的对手，估值、成功率、需要的钱（公司账户）、并进来什么 */
export function renderAcquire(body) {
  const s = game.state; const t = now();
  const list = RIVALS.filter((r) => !r.noAcquire && (B.rivalState(s, r.id).wins >= WINS_TO_ACQUIRE || B.rivalState(s, r.id).acquired));
  body.appendChild(h('div', 'tr-sum', `商战赢满 ${WINS_TO_ACQUIRE} 次的对手才能收购；从公司账户付，签股权转让协议（印花税 0.05%），对方门店和员工一起并进来`));
  if (!list.length) { body.appendChild(h('div', 'empty', '还没有能收购的对手，先去「对手」打商战')); return; }
  for (const r0 of list) {
    const r = RG.live(s, r0.id); const st = B.rivalState(s, r.id);
    const team = Object.keys(s.secs).filter((id) => !isTraining(s, id)).slice(0, 2);
    const why = st.acquired ? null : B.whyNotAcquire(s, r.id, team, t);
    const card = h('div', 'rival' + (st.acquired ? ' done' : ''), `<div class="rival-boss">${bossImg(r)}</div><div class="ind-info"><div class="ind-name">${r.name}${r.final ? '<small class="final">最终对手</small>' : ''}</div>
      <div class="ind-line">估值 <b>${fmtMoney(r.value)}</b>　公司账户 ${fmtMoney(s.company)}</div>
      <div class="ind-line">并进来：${mergeText(r)}</div>
      ${st.acquired ? '<div class="stamp">已收购</div>' : `<div class="ind-line">成功率约 ${pct(B.acquireRate(s, r.id, team))}${why ? `　<span class="sc-cond">${why}</span>` : ''}</div><div class="ind-btns"><button class="btn gold acq">发起收购</button></div>`}</div>`);
    const a = card.querySelector('.acq'); if (a) a.onclick = () => openAcquire(r.id, () => { body.innerHTML = ''; renderAcquire(body); });
    body.appendChild(card);
  }
}

/** 战报：商战和收购记录 */
export function renderBattleLog(body) {
  const s = game.state; const log = s.battleLog || [];
  if (!log.length) { body.appendChild(h('div', 'empty', '还没打过商战')); return; }
  for (const x of log.slice(0, 50)) {
    const r = RIVAL_BY_ID[x.rival]; const pj = PROJECTS.find((p) => p.id === x.project);
    if (x.acquire) { body.appendChild(h('div', 'tr-course', `<div style="flex:1"><b class="pos">收购</b> ${r ? r.name : x.rival}<div class="tr-gain">成功率 ${pct(x.rate)}　协议 ${x.contract}${(x.merged || []).length ? `　并进来 ${x.merged.map((m) => `${IND_BY_ID[m.ind].name} ${m.n} 家`).join('、')}` : ''}　${new Date(x.t).toLocaleString('zh-CN', { hour12: false })}</div></div>`)); continue; }
    body.appendChild(h('div', 'tr-course', `<div style="flex:1"><b class="${x.win ? 'pos' : 'neg'}">${x.win ? '赢' : '输'}</b> 对 ${r ? r.name : x.rival} · ${pj ? pj.name : ''}<div class="tr-gain">胜率 ${pct(x.rate)}${x.win ? `　得 ${fmtMoney(x.reward)}` : '　这次摸清了对方的底牌（下次胜率 +5%）'}　${new Date(x.t).toLocaleString('zh-CN', { hour12: false })}</div></div>`));
  }
}
