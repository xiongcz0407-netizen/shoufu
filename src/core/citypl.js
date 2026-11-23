// 利润表按城市看（设计20 第二节 5）：按现在的规模估一个游戏月 —— 门店 / 网点按各城市家数 × 系数分；地产按项目所在城市（在做的项目的建安月均摊不算，只算回款在当月的）；科技、传媒在总部
import { INDUSTRIES, IND_BY_ID } from '../config/industries.js?v=0553afd8';
import * as E from './economy.js?v=0553afd8';
import { establishment, wage, PAY, lookOf, estTotal } from './staff.js?v=0553afd8';
import { lineCities, lineK, cityK, CITY_IDS, CITY_CFG } from './cities.js?v=0553afd8';
import { MONTH_MS } from './gametime.js?v=0553afd8';
import { storeOther } from './calib.js?v=0553afd8';

const SOC = 1 + Object.values(PAY.social).reduce((a, b) => a + b, 0);
export function cityPL(s) {
  const out = Object.fromEntries(CITY_IDS.map((c) => [c, { rev: 0, cogs: 0, labor: 0, rent: 0, lines: {} }]));
  for (const id of Object.keys(s.inds)) {
    const cfg = IND_BY_ID[id]; if (cfg.kind === 'project') continue;
    const rev = E.industryRevenue(s, id) * MONTH_MS / 1000; const cogs = rev * E.cogsRate(s, id);
    const k = lineK(s, id); const labor = Object.entries(establishment(s, id)).reduce((a, [r, n]) => a + n * wage(r), 0) * k * SOC;
    const rent = ((cfg.rentPerHead ? cfg.rentPerHead * estTotal(s, id) : cfg.rent[lookOf(s, id)] * s.inds[id].branches) + (cfg.retail ? storeOther(cfg, s.inds[id].level) * s.inds[id].branches : 0)) * k; // 门店：房租 + 水电杂费
    // 分到城市：门店 / 网点按家数 × 系数（收入、工资、房租都乘系数，所以按 n × k 分）；产品、传媒在总部
    const cs = cfg.kind && cfg.kind !== 'scale' ? { [CITY_CFG.hq]: 1 } : lineCities(s, id);
    const tot = Object.entries(cs).reduce((a, [c, n]) => a + n * cityK(c), 0) || 1;
    for (const [c, n] of Object.entries(cs)) { if (!n) continue; const w = n * cityK(c) / tot; const o = out[c]; o.rev += rev * w; o.cogs += cogs * w; o.labor += labor * w; o.rent += rent * w; o.lines[id] = (o.lines[id] || 0) + n; }
  }
  for (const c of CITY_IDS) out[c].profit = out[c].rev - out[c].cogs - out[c].labor - out[c].rent;
  return out;
}
