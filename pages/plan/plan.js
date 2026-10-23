const store = require('../../utils/store.js');

Page({
  data: {
    boards: [],
    activeDay: 0
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    this.setData({ boards: store.getPlanBoard() });
  },

  switchDay(e) {
    this.setData({ activeDay: Number(e.currentTarget.dataset.index) });
  },

  // 我吃了 → 打开已预填的「记一顿」，确认后才进饭历和消费
  ateIt(e) {
    const ds = e.currentTarget.dataset;
    const slot = this.findSlot(ds.slot);
    if (!slot) return;

    getApp().globalData.recordDraft = {
      planId: slot.planId,
      name: slot.name,
      amount: slot.referenceAmountText ? slot.referenceAmountText.replace(/[^\d.]/g, '') : '',
      mealType: slot.mealType,
      dateKey: this.data.boards[this.data.activeDay].key
    };

    wx.switchTab({ url: '/pages/record/record' });
  },

  cancelPlan(e) {
    const slot = this.findSlot(e.currentTarget.dataset.slot);
    if (!slot) return;
    wx.showModal({
      title: '取消这一餐？',
      content: '取消后不会留下任何饭历记录。',
      confirmText: '取消安排',
      cancelText: '再想想',
      success: (res) => {
        if (res.confirm) {
          store.cancelPlan(slot.planId);
          this.refresh();
        }
      }
    });
  },

  findSlot(key) {
    const board = this.data.boards[this.data.activeDay];
    if (!board) return null;
    return board.slots.find((s) => s.mealType === key);
  },

  openMeal(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/meal-detail/meal-detail?id=' + id });
  },

  goFeed() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  goRandom() {
    wx.navigateTo({ url: '/pages/random/random' });
  },

  goWish() {
    wx.navigateTo({ url: '/pages/wish/wish' });
  },

  goCalendar() {
    wx.navigateTo({ url: '/pages/calendar/calendar' });
  }
});
