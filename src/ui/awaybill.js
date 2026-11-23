// 离开期间账单（第 2-16a 项）：跟合同、交割单一样的纸张样式；公司 / 个人两段；下面是秘书替你做了什么
import { secWork } from '../core/awaybill.js?v=0553afd8';
import { fmtMoney, fmtDuration } from '../core/format.js?v=0553afd8';
import { asset, hasAsset } from '../platform/assets.js?v=0553afd8';
import { game } from '../game.js?v=0553afd8';
import { h } from './dom.js?v=0553afd8';
import { openFull } from './shell.js?v=0553afd8';

const days = (d) => (d >= 30 ? `${Math.floor(d / 30)} 个月 ${Math.round(d % 30)} 天` : `${Math.max(1, Math.round(d))} 天`);
const dt = (t) => new Date(t).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const money = (l) => `<td class="${l.dir === 'in' ? 'pos' : 'neg'}">${l.dir === 'in' ? '+' : '−'}${fmtMoney(l.amount)}</td>`;

function part(b, w, title, inK, outK, range) {
  const ls = b.lines.filter((l) => l.wallet === w && l.amount >= 1);   // 不到 1 元的零头不列（显示出来是 ¥0）
  const net0 = b[inK] - b[outK]; const net = Math.abs(net0) < 1 ? 0 : net0;
  return `<div class="ct-sec">${title}</div>
    <table class="ct-tbl ab-tbl">${ls.map((l) => `<tr><td>${l.name}${l.n > 1 ? `<small>${l.n} 笔</small>` : ''}</td>${money(l)}</tr>`).join('') || '<tr><td>没有进出</td><td></td></tr>'}
      <tr class="sum"><td>收入 ${fmtMoney(b[inK])}　支出 ${fmtMoney(b[outK])}</td><td class="${net < 0 ? 'neg' : 'pos'}">${net < 0 ? '−' : '+'}${fmtMoney(Math.abs(net))}</td></tr>
      <tr><td>余额</td><td>${fmtMoney(range[0])} → <b>${fmtMoney(range[1])}</b></td></tr></table>`;
}

/** 显示账单（b = s.awayBill） */
export function showAwayBill(b) {
  const s = game.state; const p = openFull('离开期间');
  const no = `ZD-${new Date(b.to).getFullYear()}-${String((s.awayNo = (s.awayNo || 0) + 1)).padStart(5, '0')}`;
  const work = secWork(s, b);
  const box = h('div', 'contract away-paper');
  if (hasAsset('assets/contract/contract_paper.webp')) box.style.backgroundImage = `url("${asset('assets/contract/contract_paper.webp')}")`;
  const nw0 = b.netWorth[1] - b.netWorth[0]; const nw = Math.abs(nw0) < 1 ? 0 : nw0;
  box.innerHTML = `<div class="ct-title">离开期间对账单</div><div class="ct-no">单号：${no}</div>
    <div class="ct-party"><span>户名</span><b>${s.bossName || '老板'}${s.companyName ? ` · ${s.companyName}` : ''}</b></div>
    <div class="ct-party"><span>期间</span><b>${dt(b.from)} ～ ${dt(b.to)}</b></div>
    <div class="ct-text ab-lead">你离开了 ${fmtDuration(b.sec)}，游戏里过了 ${days(b.days)}${b.months ? `，月结 ${b.months} 次（发工资、交税、月报都在消息中心）` : ''}。店照常开，员工照常拿工资。</div>
    ${part(b, 'company', '一、公司账户', 'companyIn', 'companyOut', b.company)}
    ${part(b, 'personal', '二、个人', 'personalIn', 'personalOut', b.cash)}
    <div class="ct-sec">三、身价</div><table class="ct-tbl"><tr class="sum"><td>${fmtMoney(b.netWorth[0])} → ${fmtMoney(b.netWorth[1])}</td><td class="${nw < 0 ? 'neg' : 'pos'}">${nw < 0 ? '−' : '+'}${fmtMoney(Math.abs(nw))}</td></tr></table>
    ${b.capital && b.capital.length ? `<div class="ct-sec">四、投资和资本</div><table class="ct-tbl ab-tbl">${b.capital.map(([k, v]) => `<tr><td>${k}</td><td style="white-space:normal;text-align:right">${v}</td></tr>`).join('')}</table>` : ''}
    ${b.rivals && b.rivals.length ? `<div class="ct-sec">${b.capital && b.capital.length ? '五' : '四'}、对手</div><table class="ct-tbl ab-tbl">${b.rivals.map(([k, v]) => `<tr><td>${k}</td><td style="white-space:normal;text-align:right">${v}</td></tr>`).join('')}</table>` : ''}
    <div class="ct-sec">${'四五六'[2 - !(b.capital && b.capital.length) - !(b.rivals && b.rivals.length)]}、秘书替你做了什么</div>
    ${work.length ? work.map((x) => `<div class="ab-sec">${hasAsset(`assets/sec/${x.id}/${(s.secs[x.id] || {}).outfit}.webp`) ? `<img src="${asset(`assets/sec/${x.id}/${s.secs[x.id].outfit}.webp`)}" alt="">` : ''}<div><b>${x.name}${x.post ? `<small>${x.post}</small>` : ''}</b>
      ${x.cats.filter((c) => c.amount >= 1).map((c) => `<div class="ab-line"><span>${c.dir === 'in' ? '收' : '付'} ${c.name}${c.n > 1 ? ` ×${c.n}` : ''}</span><em class="${c.dir === 'in' ? 'pos' : 'neg'}">${fmtMoney(c.amount)}</em></div>`).join('')}
      ${x.msgs.length ? `<div class="ab-line"><span>交来 ${x.msgs.length} 份：${[...new Set(x.msgs.map((m) => m.title.replace(/[：:].*$/, '')))].slice(0, 3).join('、')}${x.msgs.some((m) => m.open) ? '（有等你批的）' : ''}</span></div>` : ''}</div></div>`).join('') : '<div class="ct-text">这段时间没有秘书替你办事（「公司 → 职位」可以任命店长、财务总监、资产管家）。</div>'}
    ${b.ups ? `<div class="ct-sec">托管帮你升了</div><div class="ct-text ab-ups">${b.ups.what.replace(/^你不在的时候，/, '')}${(b.ups.fx || []).map((x) => `<br>${x}`).join('')}</div>` : ''}
    <div class="ct-sign"><div>财务章</div><div class="ct-seals">${hasAsset('assets/contract/seal.webp') ? `<img class="ct-seal still" src="${asset('assets/contract/seal.webp')}" alt="">` : '<i class="ct-seal ph still">章</i>'}</div></div>`;
  const scroll = h('div', 'ct-scroll'); scroll.appendChild(box);
  const bar = h('div', 'sd-acts', '<button class="btn gold go">知道了</button>');
  p.body.classList.add('sd-full'); p.body.append(scroll, bar);
  bar.querySelector('.go').onclick = p.close;
  game.save();
  return p;
}
