const store = require('../../utils/store.js');
const C = require('../../utils/constants.js');
const F = require('../../utils/format.js');

Page({
  data: {
    meal: null,
    isSaved: false,
    isMine: false,
    placeLine: '',
    moodLine: '',
    planSheet: false,
    planOptions: [],
    savedPlanLabel: ''
  },

  onLoad(query) {
    this.mealId = query.id;
    const meal = store.getMealById(query.id);
    if (!meal) {
      wx.showToast({ title: '这条饭记不见了', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    const loc = meal.location || {};
    // 地点仅在作者允许时展示
    let placeLine = '';
    if (loc.displayMode === 'exact') {
      placeLine = loc.placeName || loc.areaName || '';
    } else if (loc.displayMode === 'fuzzy') {
      placeLine = (loc.areaName || '附近') + ' · 只显示大概区域';
    } else if (loc.provided) {
      placeLine = '附近 · 位置未公开';
    }

    // 感受仅在作者允许时展示
    const moodLine =
      meal.moodText && (meal.moodVisibility === 'public' || meal.authorId === 'u_me')
        ? meal.moodText
        : '';

    this.setData({
      meal,
      isMine: meal.authorId === 'u_me',
      isSaved: store.isWished(meal.id),
      placeLine,
      moodLine
    });
    wx.setNavigationBarTitle({ title: meal.name });
  },

  previewImage() {
    const meal = this.data.meal;
    if (!meal || !meal.hasImage) return;
    wx.previewImage({ current: meal.cover, urls: meal.imageUrls });
  },

  /* ---------------- 收藏：以后可能想吃 → 我的想吃 ---------------- */

  toggleSave() {
    const on = store.toggleSaveMeal(this.data.meal.id);
    this.setData({ isSaved: on });
    wx.showToast({
      title: on ? '已放进我的想吃' : '已取消收藏',
      icon: 'none'
    });
  },

  /* ---------------- 就吃这个：决定近期吃 → 我的餐单 ---------------- */

  openPlan() {
    if (this.data.isMine) {
      wx.showToast({ title: '这是你自己记的一顿', icon: 'none' });
      return;
    }
    this.setData({ planSheet: true, planOptions: this.buildPlanOptions() });
  },

  closePlan() {
    this.setData({ planSheet: false });
  },

  // 只显示当前仍有意义的餐次：今天已经过去的餐次不再出现
  buildPlanOptions() {
    const now = new Date();
    const h = now.getHours();
    const todayMeaningful = {
      breakfast: h < 11,
      lunch: h < 16,
      dinner: true
    };

    const groups = [
      { label: '今天', dateKey: F.todayKey(0), filter: todayMeaningful },
      { label: '明天', dateKey: F.todayKey(1), filter: { breakfast: true, lunch: true, dinner: true } }
    ];

    const plans = store.getPlans(F.todayKey(0)).concat(store.getPlans(F.todayKey(1)));

    return groups.map((g) => ({
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
    })).filter((g) => g.slots.length);
  },

  pickPlan(e) {
    const mealType = e.currentTarget.dataset.type;
    const dateKey = e.currentTarget.dataset.date;
    const meal = this.data.meal;

    store.addPlan({
      date: dateKey,
      mealType,
      name: meal.name,
      referenceAmount: meal.amount,
      sourceType: 'meal',
      sourceId: meal.id,
      sourceUserName: meal.authorName
    });

    const typeLabel = C.MEAL_TYPES.find((t) => t.key === mealType).label;
    const dayLabel = dateKey === F.todayKey(0) ? '今天' : '明天';

    this.setData({ planSheet: false });

    wx.showModal({
      title: '已加入我的餐单',
      content: `${dayLabel}${typeLabel} · ${meal.name}\n\n这只是计划，吃完后点「我吃了」并完成记录，才会进入饭历和消费统计。`,
      confirmText: '去餐单看看',
      cancelText: '知道了',
      success: (res) => {
        if (res.confirm) wx.navigateTo({ url: '/pages/plan/plan' });
      }
    });
  },

  goAuthor() {
    const meal = this.data.meal;
    if (!meal) return;
    wx.navigateTo({ url: '/pages/author/author?id=' + meal.authorId });
  },

  /* ---------------- 删除：只对自己的饭记开放 ---------------- */

  deleteMeal() {
    const meal = this.data.meal;
    if (!meal) return;
    wx.showModal({
      title: '删掉这一顿？',
      content: `「${meal.name}」会从饭流、饭历和消费统计里消失，删掉就找不回来了。`,
      confirmText: '删掉',
      confirmColor: '#C0392B',
      cancelText: '再想想',
      success: (res) => {
        if (!res.confirm) return;
        const ok = store.deleteMeal(meal.id);
        if (!ok) {
          wx.showToast({ title: '删除失败，这条不是你的饭记', icon: 'none' });
          return;
        }
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => {
          // 优先回上一页（饭流/饭历），没有历史就回首页
          const pages = getCurrentPages();
          if (pages.length > 1) {
            wx.navigateBack();
          } else {
            wx.switchTab({ url: '/pages/index/index' });
          }
        }, 700);
      }
    });
  },

  onShareAppMessage() {
    const meal = this.data.meal || {};
    return {
      title: `${meal.authorName || '有人'}今天吃了${meal.name || '一顿饭'}`,
      path: '/pages/meal-detail/meal-detail?id=' + (meal.id || '')
    };
  }
});
