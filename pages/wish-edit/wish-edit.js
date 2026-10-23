const store = require('../../utils/store.js');

Page({
  data: {
    name: '',
    placeName: '',
    expectedAmount: '',
    images: [],
    note: '',
    canSubmit: false
  },

  onName(e) {
    const name = e.detail.value;
    this.setData({ name, canSubmit: !!name.trim() });
  },

  onPlace(e) {
    this.setData({ placeName: e.detail.value });
  },

  onAmount(e) {
    this.setData({ expectedAmount: e.detail.value });
  },

  onNote(e) {
    this.setData({ note: e.detail.value.slice(0, 60) });
  },

  chooseImage() {
    if (this.data.images.length >= 1) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        this.setData({ images: [res.tempFiles[0].tempFilePath] });
      }
    });
  },

  removeImage() {
    this.setData({ images: [] });
  },

  previewImage() {
    if (!this.data.images.length) return;
    wx.previewImage({ current: this.data.images[0], urls: this.data.images });
  },

  submit() {
    const d = this.data;
    if (!d.name.trim()) {
      wx.showToast({ title: '写点什么想吃的', icon: 'none' });
      return;
    }

    const me = store.getRawMe();
    store.addWish({
      name: d.name,
      placeName: d.placeName,
      areaName: me.region || '',
      expectedAmount: d.expectedAmount,
      imageUrl: d.images[0] || '',
      note: d.note
    });

    wx.showToast({ title: '已经放进我的想吃', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 700);
  }
});
