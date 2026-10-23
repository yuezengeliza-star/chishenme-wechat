const store = require('../../utils/store.js');

Page({
  data: {
    me: null,
    today: null,
    monthTotalText: '¥0',
    entries: [
      { key: 'calendar', icon: '🗓', title: '我的饭历', desc: '回看已经真实吃过的饭', url: '/pages/calendar/calendar' },
      { key: 'plan', icon: '📋', title: '我的餐单', desc: '今天和明天的三餐安排', url: '/pages/plan/plan' },
      { key: 'wish', icon: '💛', title: '我的想吃', desc: '以后可能想吃的都在这', url: '/pages/wish/wish' },
      { key: 'following', icon: '👀', title: '我跟吃的人', desc: '看看他们今天吃了什么', url: '/pages/following/following' }
    ]
  },

  onShow() {
    const tb = this.getTabBar && this.getTabBar();
    if (tb) tb.setData({ selected: 2 });

    if (!store.hasOnboarded()) {
      const now = Date.now();
      if (!this._lastRedirect || now - this._lastRedirect > 1500) {
        this._lastRedirect = now;
        wx.navigateTo({ url: '/pages/onboard-profile/onboard-profile' });
      }
      return;
    }

    this.refresh();
  },

  refresh() {
    const me = store.getMe();
    const today = store.getTodaySummary();
    this.setData({
      me,
      today,
      monthTotalText: today.monthTotalText
    });
  },

  goEntry(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url });
  },

  goStats() {
    wx.navigateTo({ url: '/pages/stats/stats' });
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  editProfile() {
    wx.navigateTo({ url: '/pages/onboard-profile/onboard-profile?edit=1' });
  },

  goCalendar() {
    wx.navigateTo({ url: '/pages/calendar/calendar' });
  },

  goPlan() {
    wx.navigateTo({ url: '/pages/plan/plan' });
  },

  // 今天三餐小卡：已记录的去看饭历，没记的去餐单安排
  onSlotTap(e) {
    if (e.currentTarget.dataset.recorded) this.goCalendar();
    else this.goPlan();
  }
});
