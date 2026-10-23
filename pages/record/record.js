const store = require('../../utils/store.js');
const C = require('../../utils/constants.js');
const F = require('../../utils/format.js');

const MOOD_MAX = 50;

Page({
  data: {
    mealTypes: C.MEAL_TYPES,
    mealType: 'lunch',
    eatenAt: 0,
    dateStr: '',
    timeStr: '',
    minDate: '',
    maxDate: '',

    name: '',
    amount: '',
    amountUnknown: false,
    images: [],
    moodText: '',
    moodMax: MOOD_MAX,

    locMode: 'fuzzy',
    placeName: '',
    regionName: '',

    visibility: 'public',
    moodVisibility: 'public',

    mealVisibilityOpts: C.MEAL_VISIBILITY,
    locVisibilityOpts: C.LOCATION_VISIBILITY,
    moodVisibilityOpts: C.MOOD_VISIBILITY,

    settingsOpen: false,
    timeSheet: false,
    locSheet: false,

    canSubmit: false,
    success: false,
    draftPlanId: '',
    timeLabel: '',
    timeSummary: '',
    publishSummary: ''
  },

  onLoad() {
    const me = store.getRawMe();
    const now = Date.now();
    this.setData({
      regionName: me.region || C.DEFAULT_REGION.name,
      mealType: F.currentMealType(now),
      eatenAt: now,
      dateStr: F.dateKey(now),
      timeStr: F.hhmm(now),
      minDate: F.dateKey(now - 30 * 86400000),
      maxDate: F.dateKey(now + 1 * 86400000)
    });
    this.syncTime();
    this.syncLabels();
  },

  onShow() {
    const tb = this.getTabBar && this.getTabBar();
    if (tb) tb.setData({ selected: 1 });

    if (!store.hasOnboarded()) {
      const now = Date.now();
      if (!this._lastRedirect || now - this._lastRedirect > 1500) {
        this._lastRedirect = now;
        wx.navigateTo({ url: '/pages/onboard-profile/onboard-profile' });
      }
      return;
    }

    // 从「就吃这个」或餐单「我吃了」跳过来的预填草稿
    const app = getApp();
    const draft = app.globalData.recordDraft;
    if (draft) {
      app.globalData.recordDraft = null;
      this.applyDraft(draft);
    }
  },

  applyDraft(d) {
    const patch = { draftPlanId: d.planId || '' };
    if (d.mealType) patch.mealType = d.mealType;
    if (d.dateKey) {
      patch.dateStr = d.dateKey;
    }
    if (d.name) patch.name = d.name;
    if (d.amount !== undefined && d.amount !== null) {
      patch.amount = String(d.amount);
      patch.amountUnknown = false;
    }
    if (d.placeName) {
      patch.placeName = d.placeName;
      patch.locMode = 'exact';
    }
    this.setData(patch, () => this.syncTime());
    wx.showToast({ title: '已帮你填好这一顿', icon: 'none' });
  },

  /* ---------------- 餐次 & 时间 ---------------- */

  switchMeal(e) {
    const mealType = e.currentTarget.dataset.key;
    this.setData({ mealType });
  },

  // 依据实际用餐时间同步显示文案（餐次自动预选只用于减少操作）
  syncTime() {
    const ts = this.data.eatenAt;
    this.setData({
      timeLabel: F.mealTimeLabel(ts),
      timeSummary: `${F.dayLabel(ts)} ${F.hhmm(ts)}`,
      canSubmit: !!this.data.name.trim()
    });
  },

  // 折叠状态下的一行摘要：公开饭记 · 模糊地点 · 公开感受
  syncLabels() {
    const d = this.data;
    const meal = (C.MEAL_VISIBILITY.find((x) => x.key === d.visibility) || {}).label || '';
    const loc = (C.LOCATION_VISIBILITY.find((x) => x.key === d.locMode) || {}).label || '不使用位置';
    const mood = (C.MOOD_VISIBILITY.find((x) => x.key === d.moodVisibility) || {}).label || '';
    this.setData({ publishSummary: `${meal} · ${loc} · ${mood}感受` });
  },

  openTime() {
    this.setData({ timeSheet: true });
  },

  closeTime() {
    this.setData({ timeSheet: false });
  },

  onDateChange(e) {
    this.setData({ dateStr: e.detail.value }, () => this.rebuildTime());
  },

  onTimeChange(e) {
    this.setData({ timeStr: e.detail.value }, () => this.rebuildTime());
  },

  rebuildTime() {
    const dp = this.data.dateStr.split('-');
    const tp = this.data.timeStr.split(':');
    const d = new Date(
      Number(dp[0]),
      Number(dp[1]) - 1,
      Number(dp[2]),
      Number(tp[0]),
      Number(tp[1]),
      0,
      0
    );
    // 补记时根据实际时间自动校正餐次，用户仍可手动改
    const auto = F.currentMealType(d.getTime());
    this.setData({ eatenAt: d.getTime(), mealType: auto }, () => this.syncTime());
  },

  confirmTime() {
    this.setData({ timeSheet: false });
    this.syncTime();
  },

  /* ---------------- 饭名 / 金额 / 图片 / 感受 ---------------- */

  onName(e) {
    const name = e.detail.value;
    this.setData({ name, canSubmit: !!name.trim() });
  },

  onAmount(e) {
    this.setData({ amount: e.detail.value, amountUnknown: false });
  },

  toggleAmountUnknown() {
    const next = !this.data.amountUnknown;
    this.setData({ amountUnknown: next, amount: next ? '' : this.data.amount });
  },

  chooseImage() {
    const rest = 3 - this.data.images.length;
    if (rest <= 0) return;
    wx.chooseMedia({
      count: rest,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = res.tempFiles.map((f) => f.tempFilePath);
        this.setData({ images: this.data.images.concat(paths) });
      }
    });
  },

  previewImage(e) {
    wx.previewImage({
      current: e.currentTarget.dataset.src,
      urls: this.data.images
    });
  },

  removeImage(e) {
    const i = Number(e.currentTarget.dataset.index);
    const images = this.data.images.slice();
    images.splice(i, 1);
    this.setData({ images });
  },

  onMood(e) {
    this.setData({ moodText: e.detail.value.slice(0, MOOD_MAX) });
  },

  /* ---------------- 地点 ---------------- */

  openLoc() {
    this.setData({ locSheet: true });
  },

  closeLoc() {
    this.setData({ locSheet: false });
  },

  pickLocMode(e) {
    this.setData({ locMode: e.currentTarget.dataset.key }, () => this.syncLabels());
  },

  onPlaceName(e) {
    this.setData({ placeName: e.detail.value });
  },

  confirmLoc() {
    this.setData({ locSheet: false });
  },

  /* ---------------- 发布设置（三类权限相互独立） ---------------- */

  toggleSettings() {
    this.setData({ settingsOpen: !this.data.settingsOpen });
  },

  pickVisibility(e) {
    this.setData({ visibility: e.currentTarget.dataset.key }, () => this.syncLabels());
  },

  pickMoodVisibility(e) {
    this.setData({ moodVisibility: e.currentTarget.dataset.key }, () => this.syncLabels());
  },

  /* ---------------- 提交 ---------------- */

  submit() {
    const d = this.data;
    if (!d.name.trim()) {
      wx.showToast({ title: '先写一下吃了什么', icon: 'none' });
      return;
    }

    const location = this.buildLocation();

    const meal = store.addMeal({
      mealType: d.mealType,
      eatenAt: d.eatenAt,
      name: d.name,
      amount: d.amount,
      amountUnknown: d.amountUnknown || d.amount === '',
      imageUrls: d.images,
      moodText: d.moodText,
      moodVisibility: d.moodVisibility,
      visibility: d.visibility,
      location
    });

    // 从餐单「我吃了」过来的，完成这条计划
    if (d.draftPlanId) store.completePlan(d.draftPlanId);

    this.setData({ success: true, lastMeal: meal });

    setTimeout(() => this.afterSuccess(), 1500);
  },

  buildLocation() {
    const d = this.data;
    const me = store.getRawMe();
    if (d.locMode === 'none') {
      return { placeName: '', areaName: '', displayMode: 'hidden', distanceKm: null, provided: false };
    }
    return {
      placeName: d.locMode === 'exact' ? (d.placeName || '未命名小馆') : '',
      areaName: me.region || C.DEFAULT_REGION.name,
      displayMode: d.locMode,
      distanceKm: 0.3,
      provided: true
    };
  },

  afterSuccess() {
    const isPrivate = this.data.visibility === 'private';
    this.resetForm();
    this.setData({ success: false });
    if (isPrivate) {
      wx.navigateTo({ url: '/pages/calendar/calendar' });
    } else {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  resetForm() {
    const now = Date.now();
    this.setData({
      name: '',
      amount: '',
      amountUnknown: false,
      images: [],
      moodText: '',
      placeName: '',
      locMode: 'fuzzy',
      visibility: 'public',
      moodVisibility: 'public',
      settingsOpen: false,
      draftPlanId: '',
      eatenAt: now,
      dateStr: F.dateKey(now),
      timeStr: F.hhmm(now),
      mealType: F.currentMealType(now),
      canSubmit: false
    });
    this.syncTime();
    this.syncLabels();
  }
});
