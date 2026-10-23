const store = require('../../utils/store.js');
const { AVATARS } = require('../../utils/constants.js');

Page({
  data: {
    step: 1,
    avatarOptions: AVATARS,
    nickname: '',
    avatarUrl: AVATARS[0],
    avatarEmoji: '',
    canNext: false,
    logging: true,
    editing: false
  },

  onLoad(query) {
    // edit=1 表示从「我的 → 编辑资料」进来，保存后返回而不是继续走首次流程
    this.editing = !!(query && query.edit);

    if (this.editing) {
      const me = store.getRawMe();
      this.setData({
        nickname: me.nickname || '',
        avatarUrl: me.avatarUrl || AVATARS[0],
        avatarEmoji: '',
        canNext: !!(me.nickname || '').trim(),
        logging: false,
        editing: true
      });
      wx.setNavigationBarTitle({ title: '编辑资料' });
      return;
    }

    // 交付说明 3：首次进入顺序固定为 微信登录 → 昵称头像 → 位置 → 欢迎信
    // 这里完成登录态获取；真实项目把 code 换成后端换取 openid 即可
    wx.login({
      success: (res) => {
        console.log('[吃什么] wx.login code =', res.code);
        this.setData({ logging: false });
      },
      fail: () => {
        this.setData({ logging: false });
      }
    });
  },

  onNickname(e) {
    const nickname = (e.detail.value || '').slice(0, 12);
    this.setData({ nickname, canNext: !!nickname.trim() });
  },

  chooseAvatarImage(e) {
    this.setData({ avatarUrl: e.currentTarget.dataset.src });
  },

  next() {
    const nickname = this.data.nickname.trim();
    if (!nickname) {
      wx.showToast({ title: '先给自己起个名字吧', icon: 'none' });
      return;
    }
    store.saveMe({
      nickname,
      avatarUrl: this.data.avatarUrl,
      avatarEmoji: this.data.avatarUrl ? '' : this.data.avatarEmoji
    });

    if (this.editing) {
      wx.showToast({ title: '已保存', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    wx.navigateTo({ url: '/pages/onboard-location/onboard-location' });
  },

  notNow() {
    if (this.editing) {
      wx.navigateBack();
      return;
    }
    // 浏览开放、记录低门槛：不强迫首次使用就设置资料
    store.saveMe({ nickname: '小橙', avatarUrl: AVATARS[0], avatarEmoji: '' });
    wx.navigateTo({ url: '/pages/onboard-location/onboard-location' });
  }
});
