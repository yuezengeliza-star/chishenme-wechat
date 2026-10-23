const store = require('../../utils/store.js');
const C = require('../../utils/constants.js');
const F = require('../../utils/format.js');

Page({
  data: {
    wishes: [],
    planSheet: false,
    planTarget: null,
    planOptions: []
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    this.setData({ wishes: store.getWishes() });
  },

  addWish() {
    wx.navigateTo({ url: '/pages/wish-edit/wish-edit' });
  },

  /* ---------------- 安排到餐单 ---------------- */

  openPlan(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.wishes.find((w) => w.id === id);
    if (!target) return;
    this.setData({
      planSheet: true,
      planTarget: target,
      planOptions: this.buildPlanOptions()
    });
  },

  closePlan() {
    this.setData({ planSheet: false, planTarget: null });
  },

  buildPlanOptions() {
    const now = new Date();
    const h = now.getHours();
    const todayMeaningful = { breakfast: h < 11, lunch: h < 16, dinner: true };
    const groups = [
      { label: '今天', dateKey: F.todayKey(0), filter: todayMeaningful },
      { label: '明天', dateKey: F.todayKey(1), filter: { breakfast: true, lunch: true, dinner: true } }
    ];
    const plans = store.getPlans(F.todayKey(0)).concat(store.getPlans(F.todayKey(1)));
    return groups
      .map((g) => ({
        label: g.label,
        dateKey: g.dateKey,
        slots: C.MEAL_TYPES.filter((t) => g.filter[t.key]).map((t) => {
          const exist = plans.find((p) => p.date === g.dateKey && p.mealType === t.key);
          return {
            mealType: t.key,
            label: t.label,
            emoji: t.emoji,
            taken: !!exist,
            takenText: exist ? exist.name : ''
          };
        })
      }))
      .filter((g) => g.slots.length);
  },

  pickPlan(e) {
    const { type, date } = e.currentTarget.dataset;
    const w = this.data.planTarget;
    if (!w) return;

    store.addPlan({
      date,
      mealType: type,
      name: w.name,
      referenceAmount: w.expectedAmount,
      sourceType: 'wish',
      sourceId: w.id
    });

    const label = C.MEAL_TYPES.find((t) => t.key === type).label;
    const day = date === F.todayKey(0) ? '今天' : '明天';
    this.setData({ planSheet: false, planTarget: null });
    wx.showToast({ title: `已安排到${day}${label}`, icon: 'none' });
  },

  /* ---------------- 已吃过 → 去记一顿 ---------------- */

  ateIt(e) {
    const id = e.currentTarget.dataset.id;
    const w = this.data.wishes.find((x) => x.id === id);
    if (!w) return;
    getApp().globalData.recordDraft = {
      name: w.name,
      amount: w.expectedAmount || '',
      locMode: w.placeName ? 'exact' : 'fuzzy',
      placeName: w.placeName || ''
    };
    wx.switchTab({ url: '/pages/record/record' });
  },

  remove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '从我的想吃里移除？',
      content: '移除后不会影响你的饭历和消费统计。',
      confirmText: '移除',
      cancelText: '留下',
      success: (res) => {
        if (res.confirm) {
          store.removeWish(id);
          this.refresh();
        }
      }
    });
  },

  openSource(e) {
    const id = e.currentTarget.dataset.source;
    if (id) wx.navigateTo({ url: '/pages/meal-detail/meal-detail?id=' + id });
  }
});
