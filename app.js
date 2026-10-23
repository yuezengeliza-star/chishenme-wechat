const store = require('./utils/store.js');

App({
  globalData: {
    launchAt: Date.now(),
    // 记一顿草稿：从饭记详情「就吃这个」或餐单「我吃了」跳转过来时携带预填数据
    recordDraft: null,
    // 是否正在进行首次进入流程，避免 tab 页反复重定向
    onboarding: false
  },

  onLaunch() {
    // 初始化本地数据（首次启动写入种子，之后读缓存）
    store.init();

    // 记录一次启动时间，用于饭流的「新鲜度」排序
    wx.setStorageSync('cs_last_launch', Date.now());

    // 默认开启云端同步：登录 + 拉全量；云端不可用时自动降级本地种子
    try { store.initCloud(); } catch (e) {
      console.warn('[app] 云端同步未启用，使用本地数据', e);
    }
  },

  onShow() {
    // 回到前台时刷新本地缓存（15s 节流已在 store 内处理）
    try { store.syncFromCloud(); } catch (e) {}
  },

  onError(err) {
    console.error('[吃什么] 运行时错误', err);
  }
});
