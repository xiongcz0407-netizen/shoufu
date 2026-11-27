// 利润表（设计93 从 core/finance.js 拆出来：core/companytax.js 月底算 s.monthly 也用这个，同一个口径）
import { INDUSTRIES } from '../config/industries.js?v=f00c2612';
const sum = (rows) => rows.reduce((a, r) => a + r.amount, 0);
const net = (rows) => rows.reduce((a, r) => a + (r.dir === 'in' ? -r.amount : r.amount), 0); /* 支出类别里的冲回（备货卖掉冲回进货成本）算负数 */
const byCat = (rows, cats) => rows.filter((r) => !r.memo && cats.includes(r.cat));
/** 利润表：给一段时间的流水（假流水或明细都行）就能算（设计79：测试拿完整明细对数也用这个） */
export function plOf(all) {
  const rows = all.filter((r) => r.wallet === 'company' && !r.memo);
  const revRows = byCat(rows, ['revenue', 'acquired_revenue', 'presale', 'rent_co']);
  const byInd = INDUSTRIES.map((c) => ({ id: c.id, name: c.name, rev: sum(revRows.filter((r) => r.note.startsWith(c.name))), cogs: net(byCat(rows, ['cogs', 'land', 'construction']).filter((r) => r.note.startsWith(c.name))) })).filter((x) => x.rev || x.cogs);
  const L = {
    staff: sum(byCat(rows, ['payroll'])), sec: sum(byCat(rows, ['sec_salary']).filter((r) => r.note === '秘书工资')),
    bonus: sum(byCat(rows, ['bonus', 'commission'])) + sum(byCat(rows, ['sec_salary']).filter((r) => r.note !== '秘书工资')),
    social: sum(byCat(rows, ['social'])), hire: sum(byCat(rows, ['recruit', 'agency', 'severance'])),
  };
  L.total = L.staff + L.sec + L.bonus + L.social + L.hire;
  const rev = sum(revRows), other = sum(byCat(rows, ['battle_bonus', 'refund']));
  const cogs = net(byCat(rows, ['cogs', 'land', 'construction'])), rent = sum(byCat(rows, ['rent'])), opex = sum(byCat(rows, ['opex'])), tax = sum(byCat(rows, ['tax_company'])) - sum(byCat(rows, ['tax_refund']));
  const dep = sum(all.filter((r) => r.cat === 'depreciation')); // 折旧是备忘行（不动钱），利润表要扣
  const train = sum(byCat(rows, ['training']));   // 设计93：秘书培训单独一行
  const misc = sum(byCat(rows, ['outsource', 'loss', 'welfare', 're_cost', 'rnd', 'film_cost', 'filing', 'interest'])) + dep;
  const profit = rev + other - cogs - L.total - rent - opex - tax - train - misc;
  return { rev, other, cogs, labor: L, rent, opex, tax, train, misc, profit, byInd, capex: sum(byCat(rows, ['expand', 'acquire', 'fleet'])), dep };
}
