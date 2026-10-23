const store = require('../../utils/store.js');
const C = require('../../utils/constants.js');

Page({
  data: {
    regions: C.REGIONS,
    regionKey: '',
    useGps: false,
    locating: false,
    customName: ''
  },

  onLoad() {
    const me = store.getRawMe();
    this.setData({
      regionKey: me.regionKey || '',
      useGps: !!me.locationAuthorized,
      customName: me.regionKey === 'custom' ? me.region || '' : ''
    });
  },

  // 授权当前位置：用于匹配附近约 3km 的饭记
  useMyLocation() {
    this.setData({ locating: true });
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        store.saveMe({
          locationAuthorized: true,
          lat: res.latitude,
          lng: res.longitude,
          region: '当前位置附近',
          regionKey: 'gps'
        });
        this.setData({ useGps: true, regionKey: 'gps', locating: false });
        wx.showToast({ title: '已开启附近匹配', icon: 'none' });
      },
      fail: () => {
        this.setData({ locating: false });
        wx.showModal({
          title: '没能拿到位置',
          content: '不开定位也可以正常用，手动选一个区域就行。以后想开随时可以在「我的 → 设置」里打开。',
          confirmText: '手动选择',
          showCancel: false,
          success: () => {
            wx.pageScrollTo({ selector: '.ob__regions', duration: 260 });
          }
        });
      }
    });
  },

  // 地图选点：任意城市/商圈都能选，不限于演示预设
  pickOnMap() {
    wx.chooseLocation({
      success: (res) => {
        const name = res.name || res.address || '地图选点';
        store.saveMe({
          locationAuthorized: true,
          lat: res.latitude,
          lng: res.longitude,
          region: name,
          regionKey: 'custom'
        });
        this.setData({ useGps: false, regionKey: 'custom', customName: name });
        wx.showToast({ title: '已选择：' + name, icon: 'none' });
      },
      fail: () => {
        // 用户取消选点，不打断流程
      }
    });
  },

  pickRegion(e) {
    const key = e.currentTarget.dataset.key;
    const r = C.REGIONS.find((x) => x.key === key);
    store.saveMe({
      locationAuthorized: false,
      region: r.name,
      regionKey: r.key
    });
    this.setData({ regionKey: key, useGps: false });
  },

  next() {
    if (!this.data.regionKey) {
      wx.showToast({ title: '选一个你常吃饭的地方', icon: 'none' });
      return;
    }
    // 不授权精确定位也允许继续
    if (!this.data.useGps) {
      const me = store.getRawMe();
      if (!me.region) store.saveMe({ region: C.REGIONS[0].name });
    }
    wx.navigateTo({ url: '/pages/welcome/welcome' });
  }
});
