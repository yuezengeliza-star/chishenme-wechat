const store = require('../../utils/store.js');
const C = require('../../utils/constants.js');
const F = require('../../utils/format.js');

Page({
  data: {
    source: '', // '' | 'nearby' | 'wish'
    mealType: 'lunch',
    mealTypes: C.MEAL_TYPES,
    result: null,
    resultKind: '',
    rolling: false,
    planSheet: false,
    planOptions: [],
    wishCount: 0
  },

  onLoad() {
    this.setData({
      mealType: F.currentMealType(),
      wishCount: store.getWishes().length
    });
  },

  chooseSource(e) {
    const source = e.currentTarget.dataset.source;
    this.setData({ source }, () => this.roll());
  },

  switchMeal(e) {
    const mealType = e.currentTarget.dataset.key;
    this.setData({ mealType }, () => this.roll());
  },

  backToSource() {
    this.setData({ source: '', result: null });
  },

  roll() {
    // 短时间避免重复抽同一条
    this.setData({ rolling: true });
    setTimeout(() => {
      const r =
        this.data.source === 'wish'
          ? store.randomWish()
          : store.randomNearby(this.data.mealType);

      this.setData({
        result: r,
        resultKind: this.data.source === 'wish' ? 'wish' : 'meal',
        rolling: false
      });
    }, 260);
  },

  /* ---------------- 决定吃这个 ---------------- */

  openPlan() {
    if (!this.data.result) return;
    this.setData({ planSheet: true, planOptions: this.buildPlanOptions() });
  },

  closePlan() {
    this.setData({ planSheet: false });
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
    const r = this.data.result;
    if (!r) return;

    store.addPlan({
      date,
      mealType: type,
      name: r.name,
      referenceAmount: this.data.resultKind === 'wish' ? r.expectedAmount : r.amount,
      sourceType: this.data.resultKind === 'wish' ? 'wish' : 'meal',
      sourceId: r.id,
      sourceUserName: this.data.resultKind === 'meal' ? r.authorName : ''
    });

    const label = C.MEAL_TYPES.find((t) => t.key === type).label;
    const day = date === F.todayKey(0) ? '今天' : '明天';
    this.setData({ planSheet: false });

    wx.showModal({
      title: `已排进${day}${label}`,
      content: `${r.name}\n\n吃完后点「我吃了」并完成记录，才会进入饭历和消费统计。`,
      confirmText: '去餐单',
      cancelText: '继续逛',
      success: (res) => {
        if (res.confirm) wx.navigateTo({ url: '/pages/plan/plan' });
      }
    });
  },

  openMeal() {
    const r = this.data.result;
    if (this.data.resultKind === 'meal' && r && r.id) {
      wx.navigateTo({ url: '/pages/meal-detail/meal-detail?id=' + r.id });
    }
  },

  goWish() {
    wx.navigateTo({ url: '/pages/wish/wish' });
  }
});
