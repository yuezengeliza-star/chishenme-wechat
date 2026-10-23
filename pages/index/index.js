const store = require('../../utils/store.js');
const C = require('../../utils/constants.js');
const F = require('../../utils/format.js');

const SORTS = [
  { key: 'recommend', label: '推荐' },
  { key: 'latest', label: '最新' },
  { key: 'eat', label: '跟吃最多' }
];

Page({
  data: {
    me: null,
    mealTypes: C.MEAL_TYPES,
    mealType: 'lunch',
    sorts: SORTS,
    sort: 'recommend',
    feed: [],
    regions: C.REGIONS,
    regionSheet: false,
    loading: true,
    // 首页使用自定义导航：品牌行要避开状态栏与右上角胶囊
    navTop: 44
  },

  onLoad() {
    // 交付说明 4.3：系统按时间自动预选餐次，但始终可改
    this.setData({ mealType: F.currentMealType(), navTop: this.getNavTop() });
  },

  /** 状态栏高度 + 胶囊区域高度，保证品牌行不被右上角胶囊压住 */
  getNavTop() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const statusBar = (info && info.statusBarHeight) || 20;
      return statusBar + 44;
    } catch (e) {
      return 64;
    }
  },

  onShow() {
    const tb = this.getTabBar && this.getTabBar();
    if (tb) tb.setData({ selected: 0 });

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
    const feed = store.getFeed({ mealType: this.data.mealType, sort: this.data.sort });
    this.setData({ me, feed, loading: false });
  },

  switchMeal(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.mealType) return;
    this.setData({ mealType: key }, () => this.refresh());
  },

  switchSort(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.sort) return;
    this.setData({ sort: key }, () => this.refresh());
  },

  openRegion() {
    this.setData({ regionSheet: true });
  },

  closeRegion() {
    this.setData({ regionSheet: false });
  },

  pickRegion(e) {
    const key = e.currentTarget.dataset.key;
    const r = C.REGIONS.find((x) => x.key === key);
    store.saveMe({ region: r.name, regionKey: r.key, locationAuthorized: false });
    this.setData({ regionSheet: false }, () => this.refresh());
  },

  useGps() {
    wx.getLocation({
      type: 'gcj02',
      success: () => {
        store.saveMe({ region: '当前位置附近', regionKey: 'gps', locationAuthorized: true });
        this.setData({ regionSheet: false }, () => this.refresh());
        wx.showToast({ title: '已切到当前位置', icon: 'none' });
      },
      fail: () => {
        wx.showToast({ title: '没拿到位置，可以先手动选', icon: 'none' });
      }
    });
  },

  goRandom() {
    wx.navigateTo({ url: '/pages/random/random' });
  },

  goRecord() {
    wx.switchTab({ url: '/pages/record/record' });
  },

  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  onShareAppMessage() {
    const type = C.MEAL_TYPES.find((t) => t.key === this.data.mealType);
    return {
      title: `大家今天的${type ? type.label : '饭'}都在这里了`,
      path: '/pages/index/index'
    };
  }
});
