/* 设计79：存档里所有数组的上限，一张表（开发2）
   路径：点分隔；* = 对象里的每个键（每只股票、每个秘书）；[] = 数组里的每个元素
   LOG：只增不减的记录，超了丢最老的（有汇总的先汇总进 *Sum），走 core/cap.js 的 capAdd；读档、每个游戏天各整理一次
        front: true = 新的在前（unshift）
   BOUND：状态（车、贷款、持仓…），玩法本身有上限，不砍，只给 test/savesize 看；
   没登记的数组测试就挂（逼着新加的数组也来登记）；路径里 ** = 任意几层 */
export const UNLISTED_MAX = 0;   // 设计79 第三版：存档里的数组一律要登记（没登记的测试就挂）
export const SAVE_MAX = 300000;   // 存档 JSON 字符数上限（test/savesize：autoplay B 跑 30 个游戏天）
export const LOG = {
  'ledger': { max: 300 },                       // 流水明细只给人看（流水页、资金页最近 10 条、升级框）；数字都在 books 里（core/books.js）
  'contracts': { max: 100 },                    // 合同全文；更早的进 contractsOld 只留摘要
  'contractsOld': { max: 200 },
  'taxes': { max: 100 },                        // 完税凭证（给人看）；合计在 books.tax
  'invoices': { max: 100 },                     // 发票（给人看）
  'inbox': { max: 300, front: true },
  'battleLog': { max: 100, front: true },
  'eventLog': { max: 50, front: true },
  'monthly': { max: 60 },
  'iitWithheld': { max: 120 },
  'upq': { max: 30 },
  'warFx': { max: 50 },
  'agenda.log': { max: 30, front: true },
  'agenda.fresh': { max: 50 },
  'trip.log': { max: 30, front: true },
  'late.log': { max: 50, front: true },
  'coupon.log': { max: 50, front: true },
  'flow.list': { max: 60, front: true },
  'meet.hist': { max: 12, front: true },
  're.log': { max: 30, front: true },
  're.projects[].decLog': { max: 100 },
  'rich.story': { max: 30 },
  'listing.listed.hist': { max: 240 },
  'mkt.news': { max: 50 },
  'mkt.hist.*': { max: 120 },                   // 「最近」走势图画 120 个点
  'mkt.long.*': { max: 120 },                   // 「长期」走势图也画 120 个点（stocks.json history.longMax）
  'mkt.soldQ': { max: 10 },
  'mkt.wrongQ': { max: 5 },
  'mkt.ipoPop': { max: 10 },                    // 设计90 中签 / 没中 / 上市弹框（界面拿一次就清）
  'mkt.ws.scans': { max: 160 },
  'mkt.ipo.daily': { max: 30 },
  'mkt.ipo.done': { max: 100 },
  'mkt.mgr.hist': { max: 60, front: true },
  'secs.*.rec.giftLog': { max: 300 },
  'secs.*.rec.box': { max: 200 },
};
export const BOUND = {
  // 状态：玩法本身有上限，不砍，只给 test/savesize 看（超了说明哪里漏了封顶）
  'books.**': 2,                                // 累加器里只有 [进, 出] 两个数（core/books.js）
  're.projects': 60,                            // 地产项目：在做的 + 做完的留最近 20 个（slim.js）
  're.projects[].batches': 50, 're.projects[].pend': 50, 're.listings': 50,
  'rich.ppl': 400, 'rich.acq': 100,             // 财富榜的人（开局生成一批）
  'logi.lots': 2000,                            // 车队每批车（折旧要用）
  'garage.cars': 300, 'garage.houses': 300, 'garage.planes': 300, 'garage.yachts': 300,
  'secs.*.rec.dateUsed.*': 10,                  // 设计83 约会片段 / 私密约会场景用过的下标（每组最多 5 段，用完一轮清掉）
  'ask.seen': 20,                               // 设计96 这次上线来过的秘书（上线时清空）
  'secs.*.owned': 200, 'secs.*.worn': 200, 'secs.*.rec.cities': 100,
  'agenda.items': 50, 'antq.items': 500, 'antq.orders': 50, 'lux.given': 500, 'lux.own': 500, 'lux.orders': 50, 'coupon.gifts': 300,
  'awayBill.*': 300, 'awayBill.capital[]': 10, 'awayBill.work[].cats': 200, 'awayBill.work[].msgs': 300,   // 离线账单（每次回来换一张）
  'bank.apps': 50, 'bank.deposits': 100, 'bank.loans': 100, 'cap.holders': 50, 'cap.rounds': 20, 'cap.vams': 20,
  'battleLog[].cards': 20, 'battleLog[].cards[]': 20, 'battleLog[].merged': 20, 'battleLog[].team': 10,
  'contracts[].parties': 10, 'contracts[].parties[]': 5, 'contracts[].rows': 60, 'contracts[].rows[]': 10,
  'inbox[].actions': 10, 'inbox[].data.pages': 30, 'inbox[].data.pages[].inn': 60, 'inbox[].data.pages[].out': 60,
  'equityDeals': 100, 'equityDeals[].merged': 20, 'equityDeals[].plan': 60, 'bev.ids': 300, 'group.red.done': 20,
  'hires': 100, 'training': 50, 'goals.fresh': 50, 'late.atk': 50, 'late.fx': 50,
  'media.films': 200, 'tech.products': 200, 'meet.cur.rep': 20, 'meet.cur.stats.rows': 50,
  'mg.lines.*.fx': 100, 'mg.prepaid': 100, 'mg.stock': 100,
  'mkt.guards': 100, 'mkt.hintQ': 50, 'mkt.lu.act': 60, 'mkt.mgr.cur.legs': 20, 'mkt.orders': 500, 'mkt.wk.sells': 200,
  'mkt.ws.grps': 500, 'mkt.ws.toast': 50, 'mkt.wsLast.grps': 500, 'mkt.wsTips': 50, 'mkt.wsPre': 50, 'mkt.ipoOn': 60,
  'pick.log': 30, 'postMeta.*.notes': 20, 'sites.lines.*': 200, 'upAuto.by': 50, 'upq[].fx': 20,
  'war.log': 60, 'war.plan': 60, 'war.team': 10, 'war.usedSpec': 20,
};
