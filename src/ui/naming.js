// 开局起名：老板名字 + 公司名（默认「XX商贸有限公司」，XX = 名字前两个字）
import { game } from '../game.js?v=876cadde';
import { h } from './dom.js?v=876cadde';
import { asset, hasAsset } from '../platform/assets.js?v=876cadde';

// 默认公司名：名字去掉姓（「陈志远」→「志远」）；两个字的用全名；没填用「鸿运」
export function defaultCompany(boss) {
  const n = (boss || '').trim();
  const core = n.length >= 3 ? n.slice(1) : n;
  return `${core || '鸿运'}商贸有限公司`;
}

export function openNaming() {
  return new Promise((resolve) => {
    const el = h('div', 'naming', `<div class="nm-box">
      <div class="nm-title"><img class="nm-logo" src="boot/logo.webp" alt="首富之路" onerror="this.replaceWith(this.alt)"></div>
      <label>你的名字<input class="nm-boss" maxlength="8" placeholder="比如：陈志远"></label>
      <label>公司名字<input class="nm-co" maxlength="16" placeholder="${defaultCompany('')}"></label>
      <div class="tr-gain">以后在老板页可以改</div>
      <button class="btn big">开张</button></div>`);
    if (hasAsset('assets/bg/bg_title.webp')) el.style.backgroundImage = `linear-gradient(180deg, rgba(8,12,20,.2), rgba(8,12,20,.85) 55%), url("${asset('assets/bg/bg_title.webp')}")`;
    document.querySelector('#phone').appendChild(el);
    const boss = el.querySelector('.nm-boss'), co = el.querySelector('.nm-co');
    let coTouched = false;
    co.addEventListener('input', () => { coTouched = true; });
    boss.addEventListener('input', () => { if (!coTouched) co.placeholder = defaultCompany(boss.value); });
    el.querySelector('.btn').onclick = () => {
      const s = game.state;
      s.bossName = boss.value.trim() || '老板';
      s.companyName = co.value.trim() || defaultCompany(boss.value);
      game.save(); game.changed(); el.remove(); resolve();
    };
  });
}
