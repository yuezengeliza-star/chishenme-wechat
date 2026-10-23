/**
 * 双列规整饭卡
 * 严格只展示 5 项信息：图片（有则显示）/ 饭名 / 金额 / 发布者头像昵称 / 实际用餐时间
 * 不展示地点、感受、点赞、评论、粉丝数、标签堆叠
 *
 * mode = 'feed'   首页 / 饭流：图片 + 饭名 + 金额 + 作者 + 实际用餐时间
 * mode = 'author' 作者主页「最近吃过」：图片 + 饭名 + 金额 + 日期
 */
Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    meal: {
      type: Object,
      value: null
    },
    mode: {
      type: String,
      value: 'feed'
    },
    showVisibility: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onTap() {
      const meal = this.data.meal;
      if (!meal) return;
      this.triggerEvent('tap', { id: meal.id });
      wx.navigateTo({ url: '/pages/meal-detail/meal-detail?id=' + meal.id });
    }
  }
});
