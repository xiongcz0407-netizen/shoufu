// 产业面板：升级、开分店、派驻秘书；产业图按等级换样子
import { INDUSTRIES, IND_BY_ID } from '../config/industries.js?v=0553afd8';
import { TITLES } from '../config/titles.js?v=0553afd8';
import * as PQ from '../core/prereq.js?v=0553afd8'; // V2-12 前置条件
import { shortText, moneyGap, doUpgrade } from './company.js?v=0553afd8';
import { askFill } from './fill.js?v=0553afd8'; // V0.2.2 // V0.2.1 灰按钮写原因
import { SEC_BY_ID } from '../config/secretaries.js?v=0553afd8';
import * as E from '../core/economy.js?v=0553afd8';
import { fmtMoney } from '../core/format.js?v=0553afd8';
import { asset, hasAsset } from '../platform/assets.js?v=0553afd8';
import { game } from '../game.js?v=0553afd8';
import { now } from '../core/clock.js?v=0553afd8';
import { h, openPanel, toast } from './dom.js?v=0553afd8';

export function openIndustry(host) {
  const p = host || openPanel('我的产业');
  const head = h('div', 'ind-sum');
  const list = h('div', 'ind-list');
  p.body.append(head, list);

  const render = () => {
    const s = game.state;
    head.innerHTML = `每秒收入 <b>${fmtMoney(E.totalIncome(s, SEC_BY_ID))}</b>　产业价值 <b>${fmtMoney(E.industryValue(s))}</b>`;
    list.innerHTML = '';
    for (const cfg of INDUSTRIES) {
      const ind = s.inds[cfg.id];
      if (!ind) {
        const lk = `assets/ind/${cfg.img[0]}.webp`;
        list.appendChild(h('div', 'ind-card locked', `${hasAsset(lk) ? `<img class="ind-img gray" src="${asset(lk)}" alt="">` : `<div class="ind-img ph">${cfg.name}</div>`}<div class="ind-info"><div class="ind-name">${cfg.name}</div><div class="ind-lock">${PQ.lockInfo(s, cfg.id).map((x) => `${x.ok ? '✓' : '○'} ${x.text}`).join('　')}<br><small>或者收购同行提前解锁</small></div></div>`));
        continue;
      }
      const look = E.lookIndex(cfg, ind.level);
      const imgKey = cfg.img[look];
      const img = hasAsset(`assets/ind/${imgKey}.webp`) ? `<img class="ind-img" src="${asset(`assets/ind/${imgKey}.webp`)}" alt="">` : `<div class="ind-img ph">${cfg.lookNames[look]}</div>`;
      const upC = E.upCostOf(s, cfg.id);
      const brC = E.whyNotBranch(s, cfg.id) ? null : E.brCostOf(s, cfg.id);
      const secName = ind.sec ? SEC_BY_ID[ind.sec].name : '';
      const nextLook = cfg.looks[look + 1];
      const card = h('div', 'ind-card', `${img}
        <div class="ind-info">
          <div class="ind-name">${cfg.name}<small>${cfg.lookNames[look]}</small></div>
          <div class="ind-line">${ind.level} 级 · ${ind.branches} 家${nextLook ? `<span class="ind-next">${nextLook} 级升${cfg.lookNames[look + 1]}</span>` : ''}</div>
          <div class="ind-line">每秒 <b>${fmtMoney(E.industryIncome(s, cfg.id, SEC_BY_ID))}</b>${ind.sec ? `　派驻：${secName}（+${Math.round(E.secBonus(s, ind, SEC_BY_ID) * 100)}%）` : ''}</div>
          <div class="ind-btns">
            <button class="btn up" ${moneyGap(s, upC) > 0 ? 'disabled' : ''}>升级<br><small>${fmtMoney(upC)}${shortText(s, upC)}</small></button>
            <button class="btn br" ${brC == null || moneyGap(s, brC) > 0 ? 'disabled' : ''}>${brC == null ? (E.whyNotBranch(s, cfg.id) || '分店满了') : `开分店<br><small>${fmtMoney(brC)}${shortText(s, brC)}</small>`}</button>
            <button class="btn sec">${ind.sec ? '换人' : '派驻'}</button>
          </div>
        </div>`);
      card.dataset.id = cfg.id;
      card.querySelector('.up').onclick = () => doUpgrade(cfg.id, render);
      card.querySelector('.br').onclick = () => { if (E.openBranch(s, cfg.id, now())) { toast(`${cfg.name}开到 ${ind.branches} 家了`); game.changed(); render(); askFill(cfg.id); } };
      card.querySelector('.sec').onclick = () => pickSec(cfg.id, render);
      list.appendChild(card);
    }
  };
  render();
  const off = game.onChange(() => { if (!document.body.contains(p.el)) { off(); return; } updateButtons(); });
  // 每秒只刷新按钮能不能点和数字，不整块重画
  function updateButtons() {
    const s = game.state;
    head.innerHTML = `每秒收入 <b>${fmtMoney(E.totalIncome(s, SEC_BY_ID))}</b>　产业价值 <b>${fmtMoney(E.industryValue(s))}</b>`;
    list.querySelectorAll('.ind-card[data-id]').forEach((card) => {
      const id = card.dataset.id;
      const ind = s.inds[id]; const cfg = IND_BY_ID[id];
      card.querySelector('.up').disabled = moneyGap(s, E.upCostOf(s, cfg.id)) > 0;
      const br = card.querySelector('.br'); br.disabled = !!E.whyNotBranch(s, id) || moneyGap(s, E.brCostOf(s, cfg.id)) > 0;
    });
  }
}

function pickSec(indId, done) {
  const s = game.state;
  const p = openPanel('派谁去管？（看「管理」）');
  const grid = h('div', 'sw-grid');
  const none = h('button', 'sw-card', '<div class="sw-none">不派</div><span>空着</span>');
  none.onclick = () => { E.assign(s, indId, null); game.changed(); p.close(); done(); };
  grid.appendChild(none);
  for (const id of Object.keys(s.secs)) {
    const sec = SEC_BY_ID[id]; if (!sec) continue;
    const where = Object.entries(s.inds).find(([, x]) => x.sec === id);
    const m = E.secAttr(s, id, 'manage', SEC_BY_ID);
    const c = h('button', 'sw-card' + (s.inds[indId].sec === id ? ' on' : ''), `<img src="${asset(`assets/sec/${id}/c1.webp`)}" alt=""><span>${sec.name} 管理${m}</span>${where && where[0] !== indId ? `<em>在${IND_BY_ID[where[0]].name}</em>` : ''}`);
    c.onclick = () => { E.assign(s, indId, id); game.changed(); p.close(); done(); };
    grid.appendChild(c);
  }
  p.body.appendChild(grid);
}
