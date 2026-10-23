const store = require('../../utils/store.js');

Page({
  data: {
    list: []
  },

  onShow() {
    this.setData({ list: store.getFollowingList() });
  },

  goAuthor(e) {
    wx.navigateTo({ url: '/pages/author/author?id=' + e.currentTarget.dataset.id });
  },

  unfollow(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: `取消跟吃 ${name}？`,
      content: '取消后他/她的饭记不再优先出现在你的饭流里。',
      confirmText: '取消跟吃',
      cancelText: '继续跟吃',
      success: (res) => {
        if (res.confirm) {
          store.toggleFollow(id);
          this.setData({ list: store.getFollowingList() });
        }
      }
    });
  }
});
