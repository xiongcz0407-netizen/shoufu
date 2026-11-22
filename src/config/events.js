// 事件（设计20 第四节）：条件满足 → 消息中心「事件」→ 点开是剧情 + 选择。加一件事 = 这里加一条
// when：minTitle 称号至少；netWorth 身价至少；staff 全公司员工至少；sinceTitle: [称号, 真实分钟] 升到那个称号以后过了多久；flag / noFlag
// from：谁来报（'cfo' 财务总监、'current' 陪着的秘书、或秘书 id；没人就旁白）
// story：点开先播的剧情（who: 'from' = 报信的人）；choices：选项
//   cost: { wallet, cat, amount | perStaff, note }（花钱，走记账）；favorAll：所有秘书好感 ±；flag：设剧情标记（秘书靠它加入）
//   refundVat: 份额（退回最近一个月多交的增值税）；snoozeMin：先放一放，多少分钟后再来；then：选完再播的剧情
export const EVENT_GAP_MIN = 10; // 两件事件之间至少隔 10 分钟（真实时间），免得扎堆

export const EVENTS = [
  {
    id: 'teambuild', name: '团建', from: 'current', once: true,
    when: { minTitle: 2, staff: 20 },
    notify: '老板，公司人都过二十了，大家想搞一次团建～',
    msg: { title: '公司第一次团建', body: '员工过了 20 人，行政问要不要搞一次团建。' },
    story: [
      { who: 'narr', text: '公司第一次团建。行政订好了郊外的拓展基地，还约了隔壁公司一起比拔河。' },
      { who: 'from', text: '老板，费用走职工福利费，人均 300（场地、大巴、烧烤）。办不办？' },
    ],
    choices: [
      { label: '办！拔河 + 烧烤', cost: { wallet: 'company', cat: 'welfare', perStaff: 300, note: '团建（拓展基地、大巴、烧烤）' }, favorAll: 3, flag: 'teamBuild1',
        then: [
          { who: 'narr', text: '最后一局，你们队把绳子一寸一寸拉了回来。对面队里一个扎马尾的女孩摔坐在地上，瞪着你。' },
          { who: 'narr', text: '第二天一早，她拿着简历站在前台。' },
        ] },
      { label: '今年先不搞了', favorAll: -2, snoozeMin: 30, then: [{ who: 'narr', text: '群里安静了一下午。' }] },
    ],
  },
  {
    id: 'crisis', name: '财务危机', from: 'cfo', once: true,
    when: { minTitle: 2, sinceTitle: [2, 30] },
    notify: '老板……账上出了点状况，您得看一下。',
    msg: { title: '现金流告急', body: '一个大客户三个月没回款，税务局又发来一封风险预警。' },
    story: [
      { who: 'from', text: '老板，最大的那个客户三个月没回款了，说是资金周转，一拖再拖。' },
      { who: 'from', text: '税务局还发了预警：说我们的进项和销项对不上，要自查。' },
      { who: 'narr', text: '正好人事说，今天有个注册会计师来面试财务岗。' },
    ],
    choices: [
      { label: '让她来翻翻账本', flag: 'financeCrisis1', refundVat: 1,
        then: [
          { who: 'narr', text: '她没坐下，直接翻账本。十分钟后，她在一张申报表上画了个圈。' },
          { who: 'narr', text: '「你们有一笔增值税申报了两次，多交了，能退。」' },
        ] },
      { label: '先自己扛着', snoozeMin: 20, then: [{ who: 'narr', text: '你让财务先压一压付款。账上的数字还是很难看。' }] },
    ],
  },
  {
    id: 'jobfair', name: '招聘会', from: 'current', once: true,
    when: { minTitle: 2, netWorth: 1e7 },
    notify: '老板，市里的人才招聘会还剩一个展位，要不要去？',
    msg: { title: '人才招聘会', body: '市人社局办的高端人才招聘会，展位费 2 万（公司账户，算招聘费）。' },
    story: [
      { who: 'from', text: '市里的高端人才招聘会，大公司都去了。我们去的话，展位费 2 万。' },
    ],
    choices: [
      { label: '租个展位，我亲自去', cost: { wallet: 'company', cat: 'recruit', amount: 20000, note: '人才招聘会展位费' }, flag: 'jobFair1',
        then: [
          { who: 'narr', text: '招聘会上，一个黑长直、厚刘海的女孩在隔壁大公司的展位前站了很久，没把简历递出去。' },
          { who: 'me', text: '你想做什么？' },
          { who: 'narr', text: '她愣了一下，转过身来。' },
        ] },
      { label: '这次不去了', snoozeMin: 30 },
    ],
  },
];
export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
