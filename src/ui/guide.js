// 新手引导：开场几句 + 每个功能第一次打开时的一句提示（只出一次，记在存档 flags.hints）
import { game } from '../game.js?v=0553afd8';
import { h, openPanel } from './dom.js?v=0553afd8';

export const HINTS = {
  start: '点底部「公司」，升级便利店多赚钱。',
  company: '「产业」升级开店，「人事」招人，「职位」让秘书当店长、财务总监替你管。钱都在公司账户里。',
  hire: '店里要招人：缺编按比例少收入，缺一半停业。人事页「自动补员」默认开着，缺人会自动用贴招聘补满；关掉就要自己点「招聘」。',
  contract: '买车、买房要签合同：合同里一行一行列着价款和税费，签字盖章才付款。只能用个人现金全款。',
  wallets: '公司的钱和你自己的钱是分开的：产业赚的进公司账户，车房衣服礼物只能用个人现金。「分红到个人」代扣 20% 个税；反过来「注资到公司」不交税，但钱进了公司就只能分红拿回来。',
  payroll: '公司每个月要发工资、交房租和税：工资按天计提，月底一起付。「财富 → 财务」看利润表和纳税。',
  posts: '可以让秘书当店长替你管：「公司 → 职位」任命，她会自动招人、托管升级、每月交月报。',
  secretary: '上面一条是培训位，空位会闪，点一下安排上课。点她的卡片进详情：资料、培养、衣柜、职位工资；底下能互动、送礼、约会、让她陪着你。没来的秘书是剪影，写着怎么来。',
  battle: '选对手 → 选比什么 → 带人去。赢满 3 次就能发起收购；收购「味道工坊」+ 身价 100 万升「小老板」；鑫鑫便利是练手的。',
  assets: '车加气场、房子加人脉、飞机加眼光（老板属性）。贵的要验资、排队、拍卖，「去买」里写着差什么。',
  wealth: '财富页看公司和你自己的账：利润、交了多少税、每一笔流水。',
  date: '约会最涨爱慕。一天最多 3 次；同一天约别人，先约的那个会不开心。',
  gift: '送她喜欢的（带 ♥）好感翻倍。',
  media: '娱乐传媒：直播是稳定收入（平台抽 50%，主播再分一半）；升到影视公司能投拍电影 / 剧：选题材、导演、演员、宣发，拍 30 分钟、上映 10 分钟出票房。票房偏态：大部分不赚，少数爆款；剧集卖平台更稳。',
  bank: '银行只借钱给公司：经营贷额度约年营收 30%，钱专款专用在产业上；开发贷要四证齐全，预售款先还贷。逾期罚息 1.5 倍、征信变差，连续 3 期银行处置抵押物。存款活期、定期、大额存单都能存。',
  tech: '科技先亏后赚：立项选方向 → 研发 30 分钟只花钱 → 上线后用户按 S 曲线涨。做不起来就止损。产品经理（科技经理）智慧高、你眼光好，更容易做成。',
  logistics: '物流是规模制：每升一级每个网点多 15 个人、多一份件量，薄利但量大。要先买车（公司资产，有购置税、按 4 年折旧），缺车按比例少收入。',
  realestate: '地产是项目制：拿地（只能用自有资金）→ 办四证 → 开工 → 分 3 批预售（钱先进监管账户）→ 交房清算交土地增值税。一个项目一个多小时，一次回一大笔。',
};

/** V0.2.3（设计35 第五节）：不再自动弹提示，文字都在每个页面右上角的「?」里（openHelp）。hint / hintLater 留着不报错，什么都不做 */
export const HINTS_OFF = true;
/** 每个页签「?」里放哪些 */
export const HELP = {
  company: ['company', 'wallets', 'hire', 'payroll', 'posts', 'city', 'logistics', 'realestate', 'land', 'devloan', 'tech', 'media'],
  secretary: ['secretary', 'date', 'gift', 'posts'],
  battle: ['battle', 'installment', 'takeover'],
  assets: ['assets', 'contract', 'auction', 'offshore'],
  wealth: ['wealth', 'payroll', 'stocks', 'funds', 'bank', 'privatebank', 'stockpledge', 'artpledge', 'capital', 'vam', 'incentive', 'group', 'family'],
};
/** 页面右上角「?」：点了才看，原来 HINTS 那几句 */
export function openHelp(page, title = '怎么玩') {
  const keys = (HELP[page] || []).filter((k) => HINTS[k]); if (!keys.length) return;
  const p = openPanel(title);
  p.body.innerHTML = `<div class="help-list">${keys.map((k) => `<p>${HINTS[k]}</p>`).join('')}</div>`;
}
/** 显示一次提示；target：要指的按钮（可选） */
export function hint(key, target) {
  if (HINTS_OFF) return; // V0.2.3：取消弹窗教程
  const s = game.state; s.flags.hints = s.flags.hints || {};
  if (s.flags.hints[key] || !HINTS[key]) return;
  if (document.querySelector('.hint')) { setTimeout(() => hint(key, target), 1500); return; }   // 一次只弹一个（第 3-09 项）
  s.flags.hints[key] = true; game.save();
  const el = h('div', 'hint', `<div class="hint-box">${HINTS[key]}<small>点一下知道了</small></div>`);
  document.querySelector('#phone').appendChild(el);
  let ring = null;
  const box = el.querySelector('.hint-box');
  if (target) {
    const t = document.querySelector(target);
    if (t) { const r = t.getBoundingClientRect(), p = document.querySelector('#phone').getBoundingClientRect();
      ring = h('div', 'hint-ring'); Object.assign(ring.style, { left: r.left - p.left - 6 + 'px', top: r.top - p.top - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px' });
      document.querySelector('#phone').appendChild(ring);
      box.style.top = 'auto'; box.style.bottom = (p.bottom - r.top + 18) + 'px'; } // 放在被指的按钮上方
  }
  el.onclick = () => { el.remove(); ring && ring.remove(); };
}
/** 包一下功能入口：第一次打开先出提示 */
export const withHint = (key, fn) => (...a) => { fn(...a); setTimeout(() => hint(key), 350); };
