// 商战：对手列表 → 选项目、带人 → 开战结果；赢满 3 次发起收购
import * as RG from '../core/rivalgrow.js?v=4306ebaa'; // P-00 对手也在长大
import * as EQ from '../core/equity.js?v=4306ebaa';
import * as BK from '../core/bank.js?v=4306ebaa';
import { gameDate, dateText } from '../core/gametime.js?v=4306ebaa';
import { turfText } from '../core/rivalry.js?v=4306ebaa';
import { RIVALS, RIVAL_BY_ID, PROJECTS, TEAM_MAX, WINS_TO_ACQUIRE, ACQ_DISC } from '../config/rivals.js?v=4306ebaa';
import { needsBoard } from '../core/capital.js?v=4306ebaa';   // 设计64：协议上写董事会决议
import * as MG from '../core/manage.js?v=4306ebaa'; // 设计39 精力
import { SEC_BY_ID, ATTRS } from '../config/secretaries.js?v=4306ebaa';
import { LINES } from '../config/lines.js?v=4306ebaa';
import { lineOf } from '../core/storylib.js?v=4306ebaa'; // V3-04 台词扩充（开发2）
import { BOSS_LINES } from '../config/battle-lines.js?v=4306ebaa';
import * as B from '../core/battle.js?v=4306ebaa';
import * as W from '../core/war.js?v=4306ebaa'; // V2-05 商战三回合
import { openNegotiate } from './negotiate.js?v=4306ebaa'; // V2-07 谈判（开发2）
import * as LT from '../core/late.js?v=4306ebaa'; // V3-01 对手进攻
import * as INB from './inbox.js?v=4306ebaa';
import { isTraining as isTraining0 } from '../core/training.js?v=4306ebaa';
import { isScouting } from '../core/busy.js?v=4306ebaa';
const isTraining = (s, id) => isTraining0(s, id) || isScouting(s, id); // V2-08：踩点的也不能带（开发2）
import { fmtMoney } from '../core/format.js?v=4306ebaa';
import { now } from '../core/clock.js?v=4306ebaa';
import { asset, hasAsset } from '../platform/assets.js?v=4306ebaa';
import { game } from '../game.js?v=4306ebaa';
import { h, openPanel, toast } from './dom.js?v=4306ebaa';
import { say } from './main-screen.js?v=4306ebaa';
import { playStory } from './story.js?v=4306ebaa';
import { openContract } from './contract.js?v=4306ebaa';
import { openTab } from './shell.js?v=4306ebaa';
import { nextContractNo } from '../core/contracts.js?v=4306ebaa';
import { TAX } from '../core/companytax.js?v=4306ebaa';
import { IND_BY_ID } from '../config/industries.js?v=4306ebaa';
import { auraBattle } from '../core/boss.js?v=4306ebaa';
import { hintLater } from './guide2.js?v=4306ebaa';
import * as TKO from '../core/takeover.js?v=4306ebaa';
import { listed as listedNow } from '../core/listing.js?v=4306ebaa';
import { ticketHtml, bindTicket, potionHtml, bindPotion } from './coupon.js?v=4306ebaa'; // 设计39 商战券、精力药水（开发2）

const AN = Object.fromEntries(ATTRS.map((a) => [a.key, a.name]));
const mergeText = (r) => { const e = r.effect || {}; return [...Object.entries(r.merge || {}).map(([k, n]) => `${IND_BY_ID[k].name} ${n} 家（连员工）`), e.fleetUnits && `货车 ${Math.ceil(e.fleetUnits / 3)} 辆`, (e.reProjects || []).map((x) => (x.stage === 'build' ? '在建项目 1 个' : '储备地 1 块')).join('、'), e.techProduct && '上线产品 1 个', e.levelUp && Object.entries(e.levelUp).map(([k, n]) => `${IND_BY_ID[k].name}团队（+${n} 级）`).join('、'), e.rights && `片库版权（授权费 ${fmtMoney(e.rights)}）`, e.boost && Object.entries(e.boost).map(([k, v]) => `${IND_BY_ID[k].name}收入 +${v * 100}%`).join('、'), e.early && e.early.map((k) => `提前开${IND_BY_ID[k].name}`).join('、')].filter(Boolean).join('、') || '—'; };
const bossImg = (r) => (r.bossSrc && hasAsset(r.bossSrc) ? `<img src="${asset(r.bossSrc)}" alt="" style="object-position:top">` : hasAsset(`assets/boss/${r.bossImg}.webp`) ? `<img src="${asset(`assets/boss/${r.bossImg}.webp`)}" alt="">` : `<div class="boss-ph">${r.boss}</div>`);
const pct = (x) => Math.round(x * 100) + '%';

export function openBattle(host) {
  const p = host || openPanel('商战');
  const render = () => {
    const s = game.state; const t = now();
    const mb = hasAsset('assets/bg/bg_meeting.webp') ? ` style="background-image:linear-gradient(90deg,rgba(10,14,24,.92) 40%,rgba(10,14,24,.35)),url('${asset('assets/bg/bg_meeting.webp')}')"` : '';
    p.body.innerHTML = `<div class="bt-head"${mb}><span class="bt-tk">${ticketHtml(s)}</span>商战券 <b>${B.tickets(s)}</b> 张 · 精力 <b>${Math.floor(MG.energy(s, t))}</b><br><small>每打一次：${B.battleCostText(s)}</small><br><small>赢满 ${WINS_TO_ACQUIRE} 次可以去「收购」${auraBattle(s) ? `　气场 +${(auraBattle(s) * 100).toFixed(1)}%` : ''}</small></div>`;
    bindTicket(p.body, render); // 设计39：商战券在这里买（开发2）
    if (!B.tickets(s) && MG.energy(s, t) < 5) { const el = h('div', 'cp-pot-wrap', `精力不够了　${potionHtml(s)}`); p.body.insertBefore(el, p.body.children[1] || null); bindPotion(el, render); } // 设计39（设计接手开发1）
    if (s.war && s.war.open) { const cb = h('button', 'btn gold big', `继续跟${RIVAL_BY_ID[s.war.rivalId].name}的商战（第 ${s.war.round + 1} 回合）`); cb.onclick = () => openWar(render); p.body.appendChild(cb); } /* V2-05 没打完的 */
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
    const b = h('button', 'tm' + (on ? ' on' : ''), `<img src="${asset(`assets/sec/${id}/c1.webp`)}" alt=""><span>${SEC_BY_ID[id].name}</span>${busy ? `<em>${isScouting(s, id) ? '踩点中' : '上课中'}</em>` : ''}`);
    b.disabled = busy;
    b.onclick = () => {
      if (on) team.splice(team.indexOf(id), 1);
      else { if (team.length >= TEAM_MAX) team.shift(); team.push(id); }
      onChange();
    };
    box.appendChild(b);
  }
}

/** V2-05 开战前：对手卡片（规模、这个月涨了多少、爱用的打法、情报）+ 带谁去 → 三回合 / 交给秘书打 */
function openFight(rivalId, done) {
  const s = game.state; const r = RG.live(s, rivalId);
  const team = [s.current].filter((id) => id && s.secs[id] && !isTraining(s, id));
  const p = openPanel(`对 ${r.name}`);
  const card = h('div', 'wr-card'); const teamTitle = h('div', 'sd-rec-title', `带谁去（最多 ${TEAM_MAX} 人；每人带一张专长牌）`); const teamBox = h('div', 'tm-grid');
  const rateBox = h('div', 'rate'); const go = h('button', 'btn gold big', '开战（三回合）'); const auto = h('button', 'btn big', '交给秘书打');
  p.body.append(card, teamTitle, teamBox, rateBox, go, auto);
  const autoProj = () => PROJECTS.slice().sort((a, b) => avg(b.attr) - avg(a.attr))[0].id;
  const avg = (k) => (team.length ? team.reduce((x, id) => x + (s.secs[id].attrs ? s.secs[id].attrs[k] : 0), 0) / team.length : 0);
  const render = () => {
    const c = W.rivalCard(s, rivalId); const st = B.rivalState(s, rivalId);
    card.innerHTML = `<div class="wr-top">${bossImg(r)}<div><b>${r.name}</b><small>${r.boss} · ${r.desc || ''}</small>
      <div>规模：年利润 ${fmtMoney(c.profit)}　这个月 ${c.growth >= 0 ? '+' : ''}${(c.growth * 100).toFixed(1)}%</div>
      <div>爱用：${c.favorites.map((k) => W.WAR.plays[k].name).join('、')}</div>
      <div>${c.intelEnough ? '<span class="pos">情报够了：开战后能看到它这一战最可能出的两张</span>' : `情报 ${c.intel} / ${W.WAR.intelShow}（输一次攒一点，够了能看到它最可能出的牌）`}</div>
      <div>战绩 ${st.wins} 胜 ${st.losses} 负（赢满 ${WINS_TO_ACQUIRE} 次能收购）</div></div></div>
      <div class="tr-gain">三回合，每回合双方各出一张打法同时亮牌：价格战克广告、广告克渠道、渠道克供应链、供应链克价格战、公关克挖人；不相克比带去的人对应属性。赢两回合算赢；每赢一回合，你的${r.line && IND_BY_ID[r.line] ? IND_BY_ID[r.line].name : ''}这个月营收 +2%、对手利润 −3%。出牌要花钱（按对手规模）。</div>`;
    teamPicker(teamBox, team, render);
    const why = B.whyNotBattle(s, rivalId, team, now());
    rateBox.innerHTML = why ? `<span class="sc-cond">${why}</span>` : `交给秘书打：胜率 <b>${pct(B.winRate(s, rivalId, autoProj(), team))}</b>（不花钱，赢了按 2 回合算份额）　赢了得 ${fmtMoney(r.reward)}`;
    go.disabled = auto.disabled = !!why;
  };
  auto.onclick = () => {
    const res = B.fight(s, rivalId, autoProj(), [...team], now());
    if (!res.ok) { toast(res.why); return; }
    p.close(); afterFight(r, [...team], res, done); game.changed(); game.save();
  };
  go.onclick = () => { const x = W.start(s, rivalId, [...team], now()); if (!x.ok) { toast(x.why); return; } p.close(); game.changed(); game.save(); openWar(done); };
  render();
}
function afterFight(r, team, res, done) {
  showResult(r, team, res.win, res.win ? `得 ${fmtMoney(res.reward)}${res.rounds ? `，抢下 ${res.rounds} 回合份额` : ''}` : `这次摸清了对方的底牌：下次对${r.name}胜率 +${Math.round(res.intel * 100)}%`, () => {
    if (res.win) say(team[0], lineOf(team[0], 'battle_win', Math.random, LINES[team[0]].happy), 3600, 'happy'); else { const l = lineOf(team[0], 'battle_lose', Math.random, ''); if (l) say(team[0], l, 3600); } // V3-04 台词扩充（开发2）
    if (res.canAcquire) toast(`赢满 ${WINS_TO_ACQUIRE} 次了，可以收购${r.name}！`, 2600);
    done && done();
  }, res.win ? BOSS_LINES[r.id].lose : BOSS_LINES[r.id].taunt);
}
/** 设计64：没打完的商战交给秘书打完——轻提示 + 消息「经营」一条（W.autoFinish 写）。面板关了、读档时都走这里 */
let warPanel = null, lastWF = null;   // 开着的商战面板（切后台回来自动打完时顺手关掉：关面板会走 onClose → 这里）
export function finishWarNow(done) {
  const s = game.state; if (!s.war || !s.war.open) return null;
  if (warPanel) { const c = warPanel; warPanel = null; lastWF = null; c(); return lastWF; }
  const x = W.autoFinish(s, now()); if (!x) return null; lastWF = x;
  game.changed(); game.save(); toast(x.text, 3200);
  const res = x.result || {}; const lead = x.war.team[0];
  if (lead) { if (res.win) say(lead, lineOf(lead, 'battle_win', Math.random, LINES[lead].happy), 3600, 'happy'); }
  if (res.canAcquire) setTimeout(() => toast(`赢满 ${WINS_TO_ACQUIRE} 次了，可以收购${RIVAL_BY_ID[x.war.rivalId].name}！`, 2600), 3300);
  done && done(); return x;
}
/** 三回合：选牌（花多少、看谁的属性）、专长、对手情报；亮牌出结果 */
export function openWar(done) {
  const s = game.state; const w0 = s.war; if (!w0 || !w0.open) return; const r = RG.live(s, w0.rivalId);
  // 设计64：中途关面板（×、点空白、返回键）不算输，剩下的回合带去的秘书自动打完（没有确认框）
  const p = openPanel(`商战 · ${r.name}`, { onClose: () => { warPanel = null; if (s.war && s.war.open) finishWarNow(done); } }); let spec = false; let last = null;
  const close0 = p.close; warPanel = close0;
  const render = () => {
    const w = s.war; const P = W.WAR.plays;
    const specs = w.team.filter((id) => !w.usedSpec.includes(id)).map((id) => `${SEC_BY_ID[id].name}：${P[W.specOf(s, id)].name}`);
    p.body.innerHTML = `<div class="wr-score"><b>第 ${Math.min(w.round + 1, 3)} / 3 回合</b>　你 <b class="pos">${w.me}</b> : <b class="neg">${w.op}</b> ${r.name}</div>
      ${w.log.map((x) => `<div class="wr-log ${x.win ? 'pos' : 'neg'}">${W.logText(x)}</div>`).join('')}
      ${last && !w.open ? '' : `<div class="tr-gain">${w.round === 0 && w.peek ? `🕵️ 你亲自带队，看到它第一张是「${P[w.peek].name}」。` : w.likely ? `🔍 情报：它这一战最可能出「${w.likely.map((k) => P[k].name).join('」「')}」。` : '没有情报，只知道它爱用：' + W.favorites(w.rivalId).slice(0, 2).map((k) => P[k].name).join('、')}${w.hurtMe ? '<br><span class="neg">对方挖了你的人：这回合你的效果 −30%</span>' : ''}${w.hurtOp ? '<br><span class="pos">你挖了对方的人：这回合对方效果 −30%</span>' : ''}</div>
      <div class="tabs pk-row"><button class="tab wr-spec ${spec ? 'on' : ''}" ${specs.length ? '' : 'disabled'}>用专长（×1.5）${specs.length ? `<small>${specs.join(' · ')}</small>` : '<small>用完了</small>'}</button></div>
      <div class="ind-btns pa-grid">${W.PLAY_IDS.map((k) => { const why = W.whyNotPlay(s, k, spec, now()); return `<button class="btn wr-play" data-k="${k}" ${why ? 'disabled' : ''}>${P[k].name}<br><small>${fmtMoney(W.costOf(s, w.rivalId, k))} · ${P[k].beats.length ? `克${P[k].beats.map((b) => P[b].name).join('')}` : P[k].desc}</small></button>`; }).join('')}</div>`}`;
    const sp = p.body.querySelector('.wr-spec'); if (sp) sp.onclick = () => { spec = !spec; render(); };
    p.body.querySelectorAll('.wr-play').forEach((b) => (b.onclick = () => {
      const x = W.play(s, b.dataset.k, spec, now()); if (!x.ok) { toast(x.why); return; } spec = false; last = x; game.changed(); game.save();
      toast(`对方出了「${P[x.op].name}」→ ${x.win ? '这回合你赢了' : '这回合你输了'}`, 1800);
      if (x.done) { warPanel = null; close0(); afterFight(r, s.war.team, x.result, done); return; }
      render();
    }));
  };
  render();
}

/** 设计64 第二、三节：收购价那行——「收购价 ¥X（估值 ¥Y，谈下来 ¥Z；多赢 2 次 −4%、老板人脉 −3.1%）」 */
export function priceLine(r) {
  const d = r.disc || { k: 0, parts: [] }; const pc = (k) => `−${+(k * 100).toFixed(1)}%`;
  const bits = [`估值 ${fmtMoney(r.value0 || r.value)}`]; if (r.dealP && r.dealP < (r.value0 || r.value)) bits.push(`谈下来 ${fmtMoney(r.dealP)}`);
  const ds = d.parts.map((x) => `${x.name} ${pc(x.k)}`).join('、');
  return `收购价 <b>${fmtMoney(r.value)}</b><small>（${bits.join('，')}${ds ? `；${ds}${d.capped ? `，合计最多 ${pc(d.k)}` : ''}` : ''}）</small>`;
}
/** 收购页：怎么付、带谁去谈、价钱那行、一个大按钮（谈价 → 签协议 / 按谈好的价签协议）+「不谈了，按估值直接签」 */
export function openAcquire(rivalId, done, cfg0 = {}) {
  const s = game.state; const t0 = now(); const team = cfg0.team ? [...cfg0.team] : [s.current].filter((id) => !isTraining(s, id));
  const boss = RG.live(s, rivalId).boss; const name = RG.live(s, rivalId).name;
  const p = openPanel(`收购 ${name}`); hintLater('installment', 600);
  const teamBox = h('div', 'tm-grid'); const priceBox = h('div', 'rate acq-price'); const sayBox = h('div', 'tr-gain acq-say');
  const go = h('button', 'btn gold big', ''); const plain = h('button', 'btn acq-plain', '');
  let plan = cfg0.plan || 'full'; const planBox = h('div', 'tabs'); let useLoan = !!cfg0.useLoan; const loanBox = h('div', 'tabs'); const LB = 'gongshang'; // 并购贷款（老板起，公商银行）
  let swapK = cfg0.swapK || 0; const swapBox = h('div', 'tabs'); // 第 3-05 项：上市以后可以换股
  if (t0 && B.dealStale(s, rivalId)) sayBox.innerHTML = `${name}估值变了超过 20%，上次谈的价不算了，要重新谈`;
  p.body.append(h('div', 'tr-sum', `签了字就成交。满 ${WINS_TO_ACQUIRE} 胜以后每多赢一次商战，收购价再便宜 2%（最多 6%）；老板人脉、商务总监、董事会「并购」、老板亲自谈判也能省，合计最多省 ${Math.round(ACQ_DISC.max * 100)}%`),
    h('div', 'sd-rec-title', '怎么付'), planBox, loanBox, swapBox, h('div', 'sd-rec-title', '带谁去谈（交际高对方耐心多一次）'), teamBox, priceBox, sayBox, go, plain);
  const cfg = () => ({ plan, useLoan, swapK, team: [...team] });
  const render = () => {
    const r = B.liveDeal(s, rivalId, now()); const dp = B.dealPrice(s, rivalId, now());
    teamPicker(teamBox, team, render);
    const dr = Math.round(EQ.downRate(s) * 100);
    planBox.innerHTML = `<button class="tab ${plan === 'full' ? 'on' : ''}" data-p="full">一次付清</button><button class="tab ${plan === 'install' ? 'on' : ''}" data-p="install">分期：首付 ${dr}%${s.positions && s.positions.biz ? '（商务总监谈的）' : ''}，余款 12 个游戏月</button>`;
    planBox.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { plan = b.dataset.p; render(); }));
    if ((s.title || 0) >= 2) { const mx = BK.maMax(s, r.value, B.payNow(s, r, plan)); loanBox.innerHTML = `<button class="tab ${useLoan ? '' : 'on'}" data-l="0">不贷款</button><button class="tab ${useLoan ? 'on' : ''}" data-l="1">并购贷款 ${fmtMoney(mx)}（公商银行，年利率 ${(BK.rateFor(s, LB, 'ma') * 100).toFixed(1)}%，${7} 个游戏年）</button>`; loanBox.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => { useLoan = b.dataset.l === '1'; render(); })); } else loanBox.innerHTML = '';
    if (TKO.swapMax(s, r, plan) > 0) { swapBox.innerHTML = [[0, '不换股'], [0.25, '新股付 25%'], [0.5, '新股付 50%']].map(([k, n]) => `<button class="tab ${swapK === k ? 'on' : ''}" data-w="${k}">${n}${k ? `（${fmtMoney(r.value * k)}）` : ''}</button>`).join(''); swapBox.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { swapK = +b.dataset.w; render(); })); } else { swapBox.innerHTML = listedNow(s) ? '<small class="tr-gain">分期收购不能换股</small>' : ''; }
    const pk = acqPay(s, rivalId, cfg()); const why = B.whyNotAcquire(s, rivalId, team, now(), plan, pk.loan, pk.swap);
    priceBox.innerHTML = `${priceLine(r)}${why ? `<br><span class="sc-cond">${why}</span>` : ''}`;
    go.innerHTML = dp ? `按谈好的 ${fmtMoney(r.value)} 签协议` : `跟${boss}谈价 → 签协议<small>对方开价 ${fmtMoney(B.acqNegoOpts(s, rivalId, team, now()).base)}，估值 ${fmtMoney(r.value0)}</small>`;
    go.classList.toggle('two', !dp); go.disabled = !!why;
    plain.textContent = `不谈了，按估值 ${fmtMoney(r.value0)} 直接签`; plain.hidden = !!dp; plain.disabled = !!why;
  };
  const sign = () => { const c = cfg(); const pk = acqPay(s, rivalId, c); const why = B.whyNotAcquire(s, rivalId, team, now(), plan, pk.loan, pk.swap); if (why) { toast(why); return; } p.close(); openAcqContract(rivalId, c, done); };
  plain.onclick = sign;
  go.onclick = () => {
    if (B.dealPrice(s, rivalId, now())) { sign(); return; }
    const ng = openNegotiate({ title: `跟${boss}谈收购价`, who: boss, secs: Object.keys(s.secs).filter((id) => !isTraining(s, id)), opts: B.acqNegoOpts(s, rivalId, team, now()),
      onDone: (res) => {
        if (res.deal != null) {   // 谈成：存价 → 关掉谈判 → 直接出协议（不回收购页）
          B.setAcqPrice(s, rivalId, res.deal, now()); game.changed(); game.save();
          setTimeout(() => { ng && ng.panel && ng.panel.close(); const c = cfg(); const pk = acqPay(s, rivalId, c); const why = B.whyNotAcquire(s, rivalId, team, now(), plan, pk.loan, pk.swap); if (why) { toast(why, 2600); render(); return; } p.close(); openAcqContract(rivalId, c, done); }, 900);
          return;
        }
        if (res.walked) { const l = res.sess && res.sess.log.length ? res.sess.log[res.sess.log.length - 1].line : ''; sayBox.innerHTML = `${boss}：「${l || '这个价没法谈。'}」<br><small>可以马上再谈，或者按估值直接签</small>`; }
        render();
      } });
  };
  render();
}
/** 这次付款里贷多少、换股多少（按现在的价） */
function acqPay(s, rivalId, c) {
  const r = B.liveDeal(s, rivalId, now());
  const swap = c.plan === 'full' && TKO.swapMax(s, r, c.plan) > 0 ? Math.floor(r.value * (c.swapK || 0)) : 0;
  const loan = c.useLoan && (s.title || 0) >= 2 ? { bank: 'gongshang', amount: BK.maMax(s, r.value, B.payNow(s, r, c.plan)) } : null;
  return { r, swap, loan };
}
/** 股权转让协议（设计64 第三节）：金额、付款方式、贷款、换股按收购页选好的，优惠算好；没签就关 → 消息「重要」挂一条待签 */
export function openAcqContract(rivalId, c, done = () => {}) {
  const s = game.state; const { r, swap: sw, loan: ln } = acqPay(s, rivalId, c); const plan = c.plan; const team = (c.team || []).filter((id) => s.secs[id] && !isTraining(s, id));
  const why = B.whyNotAcquire(s, rivalId, team, now(), plan, ln, sw); if (why) { toast(why, 2600); openAcquire(rivalId, done, c); return; }
  const pn = B.payNow(s, r, plan) - sw; const sch = plan === 'install' ? EQ.schedule(s, r.value, now(), pn) : [];
  const stamp = Math.round(r.value * TAX.stamp.equity * 100) / 100; const board = needsBoard(s, r.value); const d = r.disc || { k: 0, parts: [] };
  let signed = false;
  openContract({ title: '股权转让协议', no: nextContractNo(s, 'GQ', now()), signer: s.bossName || '老板',
    parties: [['受让方', `${s.companyName || '我的公司'}（法定代表人 ${s.bossName || '老板'}）`], ['转让方', `${r.boss}（${r.name}）`]],
    subject: `转让方持有的${r.name} 100% 股权，连同全部门店和员工（${Object.entries(r.merge || {}).map(([k, n]) => `${IND_BY_ID[k].name} ${n} 家`).join('、') || '—'}）`,
    rows: [['股权转让款', r.value, `${r.dealP && r.dealP < r.value0 ? `谈下来 ${fmtMoney(r.dealP)}` : `估值 ${fmtMoney(r.value0)}`}${d.k > 0 ? `；${d.parts.map((x) => `${x.name} −${+(x.k * 100).toFixed(1)}%`).join('、')}` : ''}${plan === 'install' ? '；分期' : '；从公司账户付'}`],
      ...(sw ? [['其中：以新股支付（换股）', sw, `按 ${s.listing.listed.px} 元 / 股，${Math.round(sw / s.listing.listed.px).toLocaleString()} 股`]] : []),
      ...(plan === 'install' ? [['首付', pn, '签字时付'], ...sch.map((x) => [`第 ${x.k} 期`, x.amount, dateText(gameDate(s, x.due))])] : []), ['印花税', stamp, '产权转移书据 0.05%，受让方承担']], total: r.value + stamp,
    terms: [...(board ? ['董事会决议：同意（收购超过公司估值 20%）。'] : []), ...(plan === 'install' ? ['分期：首付付完股权即交割；余款每个游戏月月底从公司账户付一期，逾期按日 0.05% 付违约金；连续 3 期付不上，转让方可以解除协议，股权收回，已付款扣 20% 违约金后退回，门店和员工退回。'] : []), '签字即生效，股权当场交割。', '交割后对方门店、员工、供应商合同一并转入受让方。'],
    signText: `签字，付 ${fmtMoney(pn - ((ln && ln.amount) || 0) + stamp)}${ln ? `（另 ${fmtMoney(ln.amount)} 并购贷款）` : ''}`,
    onClose: (sg) => { if (!sg && !signed) { B.signMsg(s, rivalId, now(), { ...c, team }); game.changed(); game.save(); toast('协议先放着：消息「重要」里有待签的，随时回来签', 2600); } },
    onSign: () => {
      signed = true;
      const res = B.acquire(s, rivalId, [...team], now(), Math.random, plan, ln, sw);
      if (!res.ok) { toast(res.why); B.signMsg(s, rivalId, now(), { ...c, team }); game.changed(); game.save(); return; }
      const m = (res.merged || []).map((x) => `${IND_BY_ID[x.ind].name} ${x.n} 家（${x.staff} 人）`).join('、'); const who = team[0] || s.current;
      showResult(r, team.length ? team : [who], true, `收购成功！${m ? `并进来 ${m}` : ''}`, () => {
        playStory([
          { who: 'narr', text: `${r.name}签下了股权转让协议（${res.contract.no}）。` },
          { who: 'narr', text: `${r.boss}：「${BOSS_LINES[rivalId].sold}」` },
          ...(m ? [{ who: 'narr', text: `${m}连同员工一起并了进来。记得去「公司 → 职位」给它们安排店长。` }] : []),
          { who, text: LINES[who].happy },
        ], { sec: who, outfit: s.secs[who].outfit, title: `收购 · ${r.name}` });
        done();
      }, BOSS_LINES[rivalId].sold);
      game.changed(); game.save();
    } });
}
// 消息「重要」里的待签协议：点「打开协议」直接回到这张协议；估值变了 20% 自动收掉（B.tidySign）
INB.addActionUi((s, m, a, rerender) => {
  if (m.type !== 'acq_sign' || a !== 'open') return false;
  const d = m.data || {}; rerender && rerender(); openAcqContract(d.rivalId, { plan: d.plan || 'full', useLoan: !!d.useLoan, swapK: d.swapK || 0, team: d.team || [] }); return true;
});
game.addTicker((s, dt, t) => { if (B.tidySign(s, t)) game.changed(); });


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

/** 「收购」分段：满 3 胜的对手，估值、收购价（设计64 优惠）、需要的钱（公司账户）、并进来什么 */
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
      ${st.acquired ? '<div class="stamp">已收购</div>' : `<div class="ind-line">${priceLine(B.liveDeal(s, r.id, t))}${why ? `　<span class="sc-cond">${why}</span>` : ''}</div><div class="ind-btns"><button class="btn gold acq">${B.dealPrice(s, r.id, t) ? `按谈好的 ${fmtMoney(B.liveDeal(s, r.id, t).value)} 签协议` : '谈价 → 签协议'}</button></div>`}</div>`);
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
    if (x.acquire) { body.appendChild(h('div', 'tr-course', `<div style="flex:1"><b class="pos">收购</b> ${r ? r.name : x.rival}<div class="tr-gain">${x.price ? `收购价 ${fmtMoney(x.price)}${x.disc ? `（优惠 −${+(x.disc * 100).toFixed(1)}%）` : ''}　` : ''}协议 ${x.contract}${(x.merged || []).length ? `　并进来 ${x.merged.map((m) => `${IND_BY_ID[m.ind].name} ${m.n} 家`).join('、')}` : ''}　${new Date(x.t).toLocaleString('zh-CN', { hour12: false })}</div></div>`)); continue; }
    body.appendChild(h('div', 'tr-course', `<div style="flex:1"><b class="${x.win ? 'pos' : 'neg'}">${x.win ? '赢' : '输'}</b> 对 ${r ? r.name : x.rival} · ${pj ? pj.name : ''}<div class="tr-gain">胜率 ${pct(x.rate)}${x.win ? `　得 ${fmtMoney(x.reward)}` : '　这次摸清了对方的底牌（下次胜率 +5%）'}　${new Date(x.t).toLocaleString('zh-CN', { hour12: false })}</div></div>`));
  }
}

// V3-01 对手进攻：消息里点「商战应对」→ 直接开三回合
INB.addActionUi((s, m, a, rerender) => {
  if (m.type !== 'late_atk' || a !== 'war') return false;
  const r = LT.respond(s, m.data.atk, 'war', now()); if (!r.ok) { toast(r.why, 2600); return true; }
  game.changed(); game.save(); rerender && rerender(); openWar(() => {}); return true;
});
