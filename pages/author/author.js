const store = require('../../utils/store.js');
const C = require('../../utils/constants.js');
const F = require('../../utils/format.js');

Page({
  data: {
    user: null,
    isMe: false,
    following: false,
    todayGroups: [],
    recent: [],
    recentCount: 0
  },

  onLoad(query) {
    this.userId = query.id;
  },

  onShow() {
    const user = store.getUser(this.userId);
    if (!user) {
      wx.showToast({ title: '找不到这个人', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    const isMe = this.userId === 'u_me';
    const todayKey = F.todayKey(0);

    // 今天吃了什么：按早餐 / 午餐 / 晚餐展示当日公开饭记
    const todayMeals = store.getMealsByAuthor(this.userId, { dateKey: todayKey });
    const todayGroups = C.MEAL_TYPES.map((t) => ({
      key: t.key,
      label: t.label,
      emoji: t.emoji,
      meal: todayMeals.find((m) => m.mealType === t.key) || null
    }));

    // 最近吃过：双列规整饭卡，只展示图片 / 饭名 / 金额 / 日期
    const recent = store.getMealsByAuthor(this.userId).slice(0, 12);

    this.setData({
      user,
      isMe,
      following: !isMe && store.isFollowing(this.userId),
      todayGroups,
      recent,
      recentCount: user.recordCount
    });

    wx.setNavigationBarTitle({ title: user.nickname });
  },

  toggleFollow() {
    if (this.data.isMe) return;
    const on = store.toggleFollow(this.userId);
    this.setData({ following: on });
    wx.showToast({
      title: on ? '以后多看看 TA 吃什么' : '已取消跟吃',
      icon: 'none'
    });
  },

  openMeal(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/meal-detail/meal-detail?id=' + id });
  },

  goCalendar() {
    wx.navigateTo({ url: '/pages/calendar/calendar' });
  }
});
