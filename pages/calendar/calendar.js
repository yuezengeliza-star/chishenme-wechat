const store = require('../../utils/store.js');
const F = require('../../utils/format.js');

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];

Page({
  data: {
    week: WEEK,
    year: 0,
    month: 0,
    monthLabel: '',
    cells: [],
    byDay: {},
    monthCount: 0,
    monthTotalText: '¥0',
    selectedKey: '',
    selectedLabel: '',
    selectedSlots: [],
    selectedTotalText: '',
    canNext: false
  },

  onLoad() {
    const now = new Date();
    this.setData({ year: now.getFullYear(), month: now.getMonth() + 1 });
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const { year, month } = this.data;
    const r = store.getCalendarMonth(year, month);

    // 月历格子
    const { days, lead } = F.monthInfo(year, month);
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push({ empty: true, key: 'lead_' + i });
    for (let d = 1; d <= days; d++) {
      const key = `${year}-${F.pad(month)}-${F.pad(d)}`;
      const info = r.byDay[key];
      cells.push({
        empty: false,
        key,
        day: d,
        count: info ? info.count : 0,
        has: !!info,
        isToday: key === F.todayKey(0)
      });
    }
    while (cells.length % 7 !== 0) cells.push({ empty: true, key: 'tail_' + cells.length });

    // 默认选中今天（若在当前展示月份内）
    let selectedKey = this.data.selectedKey;
    const todayKey = F.todayKey(0);
    if (!selectedKey || cells.every((c) => c.key !== selectedKey)) {
      selectedKey = cells.some((c) => c.key === todayKey) ? todayKey : '';
    }

    const now = new Date();
    const canNext = !(year === now.getFullYear() && month === now.getMonth() + 1);

    this.setData(
      {
        cells,
        byDay: r.byDay,
        monthCount: r.count,
        monthTotalText: r.totalText,
        monthLabel: `${year}年${month}月`,
        canNext,
        selectedKey
      },
      () => this.selectDay(selectedKey)
    );
  },

  prevMonth() {
    let { year, month } = this.data;
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    this.setData({ year, month, selectedKey: '' }, () => this.refresh());
  },

  nextMonth() {
    if (!this.data.canNext) return;
    let { year, month } = this.data;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    this.setData({ year, month, selectedKey: '' }, () => this.refresh());
  },

  onDayTap(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    this.selectDay(key);
  },

  selectDay(key) {
    const info = key ? this.data.byDay[key] : null;
    const parts = key ? key.split('-') : [];
    const label = parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日` : '';

    this.setData({
      selectedKey: key,
      selectedLabel: label,
      selectedSlots: info ? info.byType : [],
      selectedTotalText: info ? info.totalText : '',
      selectedHasAmountUnknown: info ? info.hasAmountUnknown : false
    });
  },

  openMeal(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/meal-detail/meal-detail?id=' + id });
  },

  goStats() {
    wx.navigateTo({ url: '/pages/stats/stats' });
  }
});
