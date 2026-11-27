// 合同全屏（设计18 第五节、设计14）：合同纸、编号、甲乙方、标的、金额明细表，往下滚看，底部「签字」→ 签名 + 盖章动画 → 付款
import { fmtMoney } from '../core/format.js?v=701a82d3';
import { asset, hasAsset } from '../platform/assets.js?v=701a82d3';
import { h } from './dom.js?v=701a82d3';
import { openFull } from './shell.js?v=701a82d3';

/** opts: { title, no, parties: [[甲方, 名], [乙方, 名]], subject, rows: [[项目, 金额, 说明]], total, terms: [..], signer, onSign(), signText } */
export function openContract(opts) {
  let signing = false;   // 设计64：opts.onClose(签了没有)——没签就关的收购协议挂进消息「重要」
  const p = openFull(opts.title, { onClose: () => opts.onClose && opts.onClose(signing) });
  const paper = `assets/contract/contract_paper.webp`;
  const box = h('div', 'contract');
  if (hasAsset(paper)) box.style.backgroundImage = `url("${asset(paper)}")`;
  box.innerHTML = `<div class="ct-title">${opts.title}</div>${opts.sub ? `<div class="ct-no">${opts.sub}</div>` : ''}<div class="ct-no">合同编号：${opts.no}</div>
    ${opts.parties.map(([k, v]) => `<div class="ct-party"><span>${k}</span><b>${v}</b></div>`).join('')}
    <div class="ct-sec">一、标的</div><div class="ct-text">${opts.subject}</div>
    <div class="ct-sec">二、价款和税费</div>
    <table class="ct-tbl">${opts.rows.map(([k, v, note, tone, txt]) => `<tr><td>${k}${note ? `<small>${note}</small>` : ''}</td><td${tone ? ` class="${tone}"` : ''}>${txt != null ? txt : fmtMoney(v)}</td></tr>`).join('')}
      <tr class="sum"><td>合计</td><td>${fmtMoney(opts.total)}</td></tr></table>
    ${(opts.terms || []).length ? `<div class="ct-sec">三、约定</div>${opts.terms.map((x, i) => `<div class="ct-text">${i + 1}. ${x}</div>`).join('')}` : ''}
    <div class="ct-sign"><div>买方签字：<span class="ct-name"></span></div><div class="ct-seals"></div></div>`;
  const bar = h('div', 'sd-acts', `<button class="btn cancel">再想想</button><button class="btn gold go">${opts.signText || '签字并付款'}</button>`);
  const scroll = h('div', 'ct-scroll'); scroll.appendChild(box);
  p.body.classList.add('sd-full'); p.body.append(scroll, bar);
  bar.querySelector('.cancel').onclick = p.close;
  bar.querySelector('.go').onclick = () => {
    const ok = opts.check ? opts.check() : null; if (ok) { opts.onFail && opts.onFail(ok); return; }
    bar.querySelector('.go').disabled = true; signing = true;
    box.querySelector('.ct-name').textContent = opts.signer; box.querySelector('.ct-name').classList.add('signed');
    const seal = hasAsset('assets/contract/seal.webp') ? `<img class="ct-seal" src="${asset('assets/contract/seal.webp')}" alt="">` : '<i class="ct-seal ph">章</i>';
    const thumb = hasAsset('assets/contract/thumbprint.webp') ? `<img class="ct-thumb" src="${asset('assets/contract/thumbprint.webp')}" alt="">` : '';
    box.querySelector('.ct-seals').innerHTML = seal + thumb;
    scroll.scrollTop = scroll.scrollHeight;
    setTimeout(() => { p.close(); opts.onSign && opts.onSign(); }, 1300);
  };
  return p;
}
