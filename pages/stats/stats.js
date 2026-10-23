const store = require('../../utils/store.js');

const PERIODS = [
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
  { key: 'year', label: '年' }
];

Page({
  data: {
    periods: PERIODS,
    period: 'month',
    stats: null
  },

  onLoad() {
    this.refresh();
  },

  switchPeriod(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.period) return;
    this.setData({ period: key }, () => this.refresh());
  },

  refresh() {
    const stats = store.getStats(this.data.period);
    // 柱状图高度：留 8% 最低可见高度，避免 0 值看不出刻度
    stats.trend = stats.trend.map((t) => Object.assign({}, t, {
      barHeight: t.value > 0 ? Math.max(8, t.percent) : 0
    }));
    this.setData({ stats });
  },

  goCalendar() {
    wx.navigateTo({ url: '/pages/calendar/calendar' });
  }
});
