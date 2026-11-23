// 5 个页签的页面（设计18 第四节）。各分段的内容在各自的模块里，这里只排结构
import { registerPage, hostPanel } from './shell.js?v=b7d8e042';
import { openIndustry } from './industry.js?v=b7d8e042';
import { renderSecretaryList } from './secretary.js?v=b7d8e042';
import { openBattle, renderBattleLog, renderAcquire } from './battle.js?v=b7d8e042';
import { renderAssets } from './assets.js?v=b7d8e042';
import { renderInvest } from './stocks.js?v=b7d8e042';
import { renderCapital } from './capital.js?v=b7d8e042';
import { renderRich } from './richlist.js?v=b7d8e042'; // V2-14 财富榜
import { h } from './dom.js?v=b7d8e042';

const todo = (text) => (body) => { body.appendChild(h('div', 'empty', text)); };
const extra = {}; // 后面的项往分段里塞内容：extra['company.hr'] = (body, ctx) => …
export const setSegment = (path, fn) => { extra[path] = fn; };
const seg = (path, fallback) => (body, ctx) => (extra[path] || fallback)(body, ctx);

export function registerPages() {
  registerPage('company', { title: '公司', help: '产业赚钱进公司账户；工资、开店、升级都从公司账户扣。', segments: [
    { key: 'industry', name: '产业', render: seg('company.industry', (b, c) => openIndustry(hostPanel(b, c))) },
    { key: 'hr', name: '人事', render: seg('company.hr', todo('人事（第 4 项）')) },
    { key: 'posts', name: '职位', visible: (s) => Object.keys(s.secs).length >= 2, render: seg('company.posts', todo('职位（第 7 项）')) },
  ] });
  registerPage('secretary', { title: '秘书', segments: [
    { key: 'list', name: '秘书', render: seg('secretary.list', (b, c) => renderSecretaryList(b, c)) },
  ] });
  registerPage('battle', { title: '商战', segments: [
    { key: 'rivals', name: '对手', render: seg('battle.rivals', (b, c) => openBattle(hostPanel(b, c))) },
    { key: 'acquire', name: '收购', render: seg('battle.acquire', (b) => renderAcquire(b)) },
    { key: 'log', name: '战报', render: seg('battle.log', (b) => renderBattleLog(b)) },
  ] });
  registerPage('assets', { title: '资产', segments: [
    { key: 'all', name: '资产', render: seg('assets.all', (b, c) => renderAssets(b, c)) },
  ] });
  registerPage('wealth', { title: '财富', segments: [
    { key: 'finance', name: '财务', render: seg('wealth.finance', todo('财务（第 13 项）')) },
    { key: 'invest', name: '投资', render: (b, c) => renderInvest(b, c) }, // 第 2-09 项；验收阶段三：打工人就能开户
    { key: 'capital', name: '资本', lock: (s) => (s.title >= 1 ? null : '升到「小老板」开放'), render: (b, c) => renderCapital(b, c) }, // 3-02 公司估值、股东名册、融资
    { key: 'bank', name: '银行', lock: (s) => (s.title >= 1 ? null : '升到「小老板」开放'), render: seg('wealth.bank', todo('')) },
    { key: 'rich', name: '榜单', render: (b) => renderRich(b) }, // V2-14 华夏 / 全球财富榜（设计32）
  ] });
}
