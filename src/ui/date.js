// 约会：选地点 → 开车去 → 约会画面（背景、她的台词、加了多少）→ 次数解锁
// 设计83：一场按爱慕阶段从片段库拼（open 1 + chat 2 + end 1，用完才轮回）；恋人以后加「私密约会」（车里 / 私人飞机 / 游艇，两次 3 选 1 → 黑屏 → 精力清空）
import * as MG from '../core/manage.js?v=a24b4431'; // 设计39 约会花精力
import { SEC_BY_ID } from '../config/secretaries.js?v=a24b4431';
import { DATE_PLACES, DATES_PER_DAY, DATE5_LINES, DATE50_TITLE, RARE_NARR, RARE_REACT, ROOFTOP_LINES } from '../config/dates.js?v=a24b4431';
import * as LMK from '../core/landmark.js?v=a24b4431';
import { FIRST_DATE_LINES, DATE50_LINES } from '../config/love-stories.js?v=a24b4431';
import { LINES } from '../config/lines.js?v=a24b4431';
import * as D from '../core/dates.js?v=a24b4431';
import { fmtMoney } from '../core/format.js?v=a24b4431';
import { now } from '../core/clock.js?v=a24b4431';
import { asset, hasAsset } from '../platform/assets.js?v=a24b4431';
import { game } from '../game.js?v=a24b4431';
import { h, openPanel, toast } from './dom.js?v=a24b4431';
import { playStory } from './story.js?v=a24b4431';
import { dateTicketHtml, bindDateTicket, potionHtml, bindPotion, openWallet } from './coupon.js?v=a24b4431'; // 设计39 约会券、精力药水（开发2）
import * as DL from '../core/datelib.js?v=a24b4431';   // 设计83 约会片段库
import * as PD from '../core/privdate.js?v=a24b4431';  // 设计83 私密约会
import * as RD from '../core/ride.js?v=a24b4431';      // 设计71 座驾
import { privOutfit } from '../core/styles.js?v=a24b4431';
import { playScene } from './scene.js?v=a24b4431';
import { confirmBox } from './confirm.js?v=a24b4431';

// 车：返回 { tier, name, rarity: 'normal'|'limited'|'unique', count }；没车就打车
let carFor = () => ({ tier: 0, name: '' });
export const setDateCar = (fn) => { carFor = fn; };
// 约会穿哪套（第 9 项接上）
let outfitFor = (s, id) => s.secs[id].outfit;
export const setDateOutfit = (fn) => { outfitFor = fn; };

export function openDate(secId) {
  const s = game.state; const c = SEC_BY_ID[secId]; const t = now();
  const p = openPanel(`和 ${c.name} 去哪？`);
  const car = carFor(s);
  p.body.appendChild(h('div', 'date-top', `${D.dateBtnText(s, secId, t)}　精力还剩 ${Math.floor(MG.energy(s, t))}　${car.tier ? `开 ${car.name} 去（爱慕多加）` : '还没有车，打车去'}　跟她约过 ${s.secs[secId].rec.dates} 次`));
  if (MG.energy(s, t) < 10) { const el = h('div', 'cp-pot-wrap', `精力不够了　${potionHtml(s)}`); p.body.appendChild(el); bindPotion(el, () => { p.close(); openDate(secId); }); } // 设计39（设计接手开发1）
  { const tk = dateTicketHtml(s, secId); if (tk) { const el = h('div', 'cp-date-wrap', tk); p.body.appendChild(el); bindDateTicket(el, () => { p.close(); openDate(secId); }); } } // 设计39 约会券（开发2）
  const adj = (pl) => D.placeAdj(s, pl.id); // 自己的游艇（第 2-11 项）
  for (const pl of DATE_PLACES) {
    if (D.placeGate(s, pl.id)) continue;   // 地标楼顶：有地标才显示
    const why = D.whyNotDate(s, secId, pl.id, t);
    const bgp = `assets/bg/${pl.bg}.webp`;
    const row = h('div', 'date-place', `<div class="date-thumb" style="${hasAsset(bgp) ? `background-image:url('${asset(bgp)}')` : ''}">${hasAsset(bgp) ? '' : pl.name}</div>
      <div class="ind-info"><div class="ind-name">${pl.name}</div><div class="tr-gain">爱慕 +${pl.love + (adj(pl) ? adj(pl).love : 0)}　好感 +${pl.favor + (adj(pl) ? adj(pl).favor : 0)}${adj(pl) ? `<br>${adj(pl).note}` : ''}</div>${why ? `<div class="sc-cond">${why}</div>` : ''}</div>
      <button class="btn">${D.placePrice(s, pl.id) ? fmtMoney(D.placePrice(s, pl.id)) : '免费'}</button>`);
    const b = row.querySelector('.btn'); b.disabled = !!why;
    b.onclick = () => { p.close(); go(secId, pl.id); };
    p.body.appendChild(row);
  }
  // 设计83 私密约会：恋人 + 有符合条件的座驾才出现，单独一块放最下面；不收钱
  const priv = PD.privList(s, secId);
  if (priv.length) {
    p.body.appendChild(h('div', 'sd-rec-title date-priv-title', '私密约会'));
    for (const key of priv) {
      const P = PD.PRIV_PLACES[key]; const ride = PD.privRide(s, key); const why = PD.whyNotPriv(s, secId, key, t); const bg = privBg(key); const bgp = `assets/bg/${bg}.webp`;
      const row = h('div', 'date-place date-priv', `<div class="date-thumb" style="${hasAsset(bgp) ? `background-image:url('${asset(bgp)}')` : ''}">${hasAsset(bgp) ? '' : P.name}</div>
        <div class="ind-info"><div class="ind-name">${P.name}</div><div class="tr-gain">${key === 'car' ? '开' : '坐'}${ride.name}<br>爱慕 +${PD.PRIV_LOVE}　好感 +${PD.PRIV_FAVOR}　结束后精力清空</div>${why ? `<div class="sc-cond">${why}</div>` : ''}</div>
        <button class="btn">免费</button>`);
      const b = row.querySelector('.btn'); b.disabled = !!why;
      b.onclick = () => { p.close(); goPriv(secId, key); };
      p.body.appendChild(row);
    }
  }
}
const privBg = (key) => PD.PRIV_PLACES[key].bg.find((b) => hasAsset(`assets/bg/${b}.webp`)) || PD.PRIV_PLACES[key].bg[PD.PRIV_PLACES[key].bg.length - 1];
/** 占位用的座驾名字（设计71） */
const rideVars = (s, place, car) => ({ 地点: place, 车: car && car.tier ? car.name : RD.nameOf('car', RD.rideId(s, 'car')), 飞机: RD.nameOf('plane', RD.rideId(s, 'plane')), 游艇: RD.nameOf('yacht', RD.dateYachtId(s)) });
/** 定情信物、20 次衣服、50 次称号（普通约会、私密约会共用） */
function tailLines(r, c, secId) {
  const name = (x) => x.replace(/\{name\}/g, c.name); const lines = [];
  if (r.token) { lines.push({ who: 'narr', text: `回去的路上，${c.name}忽然停下来，说起一件很久以前的事。` }); lines.push({ who: secId, text: r.token.line }); lines.push({ who: 'narr', text: `定情信物「${r.token.name}」出现在商场「奢侈品」和她的详情页（${fmtMoney(r.token.price)}）。` }); }   // 设计56
  if (r.milestones.some((m) => m.kind === 'outfit')) lines.push({ who: 'narr', text: `约会满 20 次，${c.name}有了一套只穿给你看的衣服。` });
  if (r.milestones.some((m) => m.kind === 'title')) { for (const x of DATE50_LINES) lines.push({ who: 'narr', text: name(x) }); lines.push({ who: 'narr', text: `${c.name}获得称号「${DATE50_TITLE}」。` }); }
  return lines;
}
const afterDate = (r, secId) => {
  if (r.hurt.length) toast(`${r.hurt.map((x) => SEC_BY_ID[x].name).join('、')}有点不开心`);
  if (r.favor.stageUp) game.emit('favorUp', secId, r.favor);
  if (r.love.stageUp) game.emit('loveUp', secId, r.love);
  if (r.milestones.some((m) => m.kind === 'outfit')) game.emit('dateOutfit', secId);
};
const countLine = (s, secId, r) => ({ who: 'narr', text: `这是你们第 ${s.secs[secId].rec.dates} 次约会。`, fx: `♥ +${+(r.love.to - r.love.from).toFixed(2)}　好感 +${+(r.favor.to - r.favor.from).toFixed(2)}` });

function go(secId, placeId) {
  const s = game.state; const c = SEC_BY_ID[secId]; const car = carFor(s);
  const outfit = outfitFor(s, secId, placeId);
  const stage0 = DL.stageOf(s.secs[secId].love);   // 跨门那次：先按跨门前的阶段拼，播完再播跨门剧情
  const r = D.goDate(s, secId, placeId, now(), car.tier);
  if (!r.ok) { toast(r.why); return; }
  const name = (x) => x.replace(/\{name\}/g, c.name);
  const lines = [];
  if (placeId === 'rooftop') { const lmName = (LMK.LM[LMK.mine(s)[0]] || {}).name || '地标'; lines.push({ who: 'narr', text: `你带着${c.name}坐专属电梯，上了${lmName}的楼顶。整座城市的灯在脚下铺开。` }); if (s.secs[secId].rec.places[r.place.name] === 1) { lines.push({ who: secId, text: ROOFTOP_LINES[c.type] || ROOFTOP_LINES.元气 }); lines.push({ who: 'me', text: '（点点头）……以后，也有你的一份。' }); } }
  else lines.push({ who: 'narr', text: car.tier ? `你开着${car.name}，载着${c.name}来到${r.place.name}。` : `你和${c.name}打车来到${r.place.name}。` });
  if (r.adj && r.adj.name) lines.push({ who: 'narr', text: `码头上停着你的${r.adj.name}，船员已经在舷梯边等着了。` });
  if (car.rarity === 'limited' || car.rarity === 'unique') {
    lines.push({ who: 'narr', text: RARE_NARR[car.rarity].replace('{car}', car.name).replace('{count}', car.count ? `全球只有 ${car.count} 台` : '全球限量') });
    lines.push({ who: secId, text: (RARE_REACT[c.type] || RARE_REACT.元气)[car.rarity] });
  }
  if (r.milestones.some((m) => m.n === 1)) for (const x of FIRST_DATE_LINES) lines.push({ who: 'narr', text: name(x) });
  const lib = DL.buildDate(s, secId, stage0, rideVars(s, r.place.name, car));   // 设计83：片段库（没有文件的秘书照旧一句）
  if (lib) lines.push(...lib.open, ...lib.chat.flat());
  else lines.push({ who: secId, text: LINES[secId].date });
  if (r.milestones.some((m) => m.kind === 'line')) lines.push({ who: secId, text: DATE5_LINES[c.type] });
  if (lib) lines.push(...lib.end);
  lines.push(countLine(s, secId, r));
  if (r.milestones.some((m) => m.kind === 'place')) lines.push({ who: 'narr', text: '解锁了新的约会地点：游艇。' });
  lines.push(...tailLines(r, c, secId));
  const bg = hasAsset(`assets/bg/${r.place.bg}.webp`) ? r.place.bg : 'bg_date_4';
  playScene(lines, { sec: secId, outfit, title: `约会 · ${r.place.name}`, bg }).then(() => afterDate(r, secId));
  game.changed(); game.save();
}

/** 设计83 私密约会：open → q1（3 选 1）→ 她的反应 → q2 → close（含 #黑屏）→ 精力清空提示（带「去卡包」） */
function goPriv(secId, key) {
  const s = game.state; const c = SEC_BY_ID[secId];
  const outfit = privOutfit(s, secId, key);
  const r = PD.goPriv(s, secId, key, now());
  if (!r.ok) { toast(r.why); return; }
  game.changed(); game.save();
  const vars = { ...rideVars(s, r.place.name, carFor(s)), [{ car: '车', jet: '飞机', yacht: '游艇' }[key]]: r.ride.name };
  const f = (a) => a.map((x) => DL.fill(x, vars));
  const ask = (Q, then) => { const a = f(Q.ask); const q = a[a.length - 1]; return [...a.slice(0, -1), { choice: { q, who: q.startsWith('「') ? secId : 'narr', opts: Q.opts.map((o) => DL.fill(o.t, vars)) }, then }]; };
  const bg = privBg(key); const sc = r.scene; const tail = tailLines(r, c, secId);
  const steps = [...f(sc.open), ...ask(sc.q1, (i) => [...f(sc.q1.opts[i].r), ...ask(sc.q2, (j) => [...f(sc.q2.opts[j].r), ...f(sc.close), countLine(s, secId, r), ...(tail.length ? [{ bg }, ...tail] : [])])])];
  playScene(steps, { sec: secId, outfit, title: `私密约会 · ${r.place.name}`, bg }).then(async () => {
    if (await confirmBox({ title: '精力用完了', body: '精力用完了。还要做事得喝精力药水。', ok: '去卡包', cancel: '知道了' })) openWallet({ focus: 'potion' });
    afterDate(r, secId);
  });
}
