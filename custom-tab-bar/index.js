Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '首页' },
      { pagePath: '/pages/record/record', text: '记一顿' },
      { pagePath: '/pages/mine/mine', text: '我的' }
    ]
  },
  methods: {
    onTap(e) {
      const idx = Number(e.currentTarget.dataset.index);
      if (idx === this.data.selected) return;
      wx.switchTab({ url: this.data.list[idx].pagePath });
    }
  }
});
