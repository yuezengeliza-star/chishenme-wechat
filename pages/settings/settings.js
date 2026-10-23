const store = require('../../utils/store.js');
const C = require('../../utils/constants.js');

// 使用说明（对应《用户使用手册 V0.2》）
const MANUAL = [
  {
    title: '1. 第一次打开',
    body: '用微信登录。给自己选一个昵称和头像，不需要使用真实身份。选择是否授权定位，开启后会优先帮你找附近约 3km 内的真实饭记；不想开启也没关系，可以手动选择区域。'
  },
  {
    title: '2. 首页怎么玩',
    body: '首页先给你看「饭」，不是先给你看博主。系统会根据时间自动帮你切到早餐、午餐或晚餐，你也可以自己改。每张饭卡只展示：饭名、金额、图片（如果有）、发布者、实际吃饭时间。'
  },
  {
    title: '3. 什么是「记一顿」',
    body: '吃完了，顺手把这一顿留下来就好。这里不是写攻略，不需要精心创作。餐次和金额可以填，图片和心情都可以不填。忘了当场记录也可以补记，饭历和消费统计会按你填的「实际用餐时间」归档。'
  },
  {
    title: '4. 我不想公开位置，可以吗？',
    body: '当然可以。你可以公开具体店铺或食堂，也可以只显示「五角场附近」这类模糊区域，也可以完全不向其他人展示地点。如果你允许系统使用位置，即使不公开具体地点，这顿饭仍然可以参与附近匹配。'
  },
  {
    title: '5. 一顿饭要不要分享，由你决定',
    body: '公开：大家都可以看到；仅附近可见：只进入附近饭流；仅自己可见：只留在自己的饭历里。你的吃饭心情和地点还有各自独立的公开设置，不会因为饭记公开就被强制公开。'
  },
  {
    title: '6. 收藏、跟吃，有什么区别？',
    body: '收藏 = 这个我以后可能想吃 → 放进「我的想吃」，不绑定时间。跟吃 = 我已经决定近期要吃这个 → 选择今天或明天的一餐，加入「我的餐单」。我吃了 = 我真的已经吃过 → 进入「记一顿」，确认后才算数。所以它们是一条很简单的路线：想吃 → 安排 → 吃过。'
  },
  {
    title: '7. 随机帮我选',
    body: '实在不想想了，就把决定交给随机。可以从附近大家正在吃的饭里随机一个，也可以从你自己的「我的想吃」里随机一个。不喜欢就点「换一个」；喜欢就直接加入餐单。'
  },
  {
    title: '8. 我的餐单',
    body: '餐单管的是「准备吃什么」，不是「已经吃过什么」。分成今天和明天，每天有早餐、午餐、晚餐三个位置。状态只有：已吃 / 待吃 / 未安排。吃完后点「我吃了」，再确认实际金额、时间等信息，才会进入饭历。'
  },
  {
    title: '9. 我的想吃',
    body: '它是你的私人美食愿望清单。可以收藏别人的饭记，也可以自己录入平时路过的小馆子、朋友推荐的店，或者某个突然想吃的东西。想吃的东西也可以一键安排到今天或明天的餐单。'
  },
  {
    title: '10. 我的饭历',
    body: '饭历只记录你真实已经吃过的饭。默认按月历查看，点某一天就能看到当天的早餐、午餐、晚餐，同时显示当天消费合计。'
  },
  {
    title: '11. 吃饭花了多少钱？',
    body: '只要你在记饭时留下实际金额，我们会帮你自动整理本周、本月、今年花了多少。餐单里的参考价格和「想吃」的预计金额不会算进真实消费；只有你确认吃过的饭才会统计。'
  },
  {
    title: '12. 常见问题',
    body: '一定要发照片吗？不用，没有照片也可以记饭。晚上才想起中午忘记记了怎么办？可以补记，并把实际用餐时间改成中午。不开定位还能用吗？可以，手动选择地区即可，只是无法使用基于精确距离的附近推荐。「附近」大概是多远？目前默认约 3km。收藏会算我吃过了吗？不会。跟吃会算进消费吗？不会。'
  }
];

const ABOUT = {
  title: '关于这只小狗',
  body: '它是一只可爱俏皮的柴犬，是「吃什么」的小伙伴。它想传递的感觉不是「教你怎么吃」，而是「陪你一起想今天吃什么」。'
};

Page({
  data: {
    tab: 'manual',
    manual: MANUAL,
    about: ABOUT,
    openIndex: 100,
    me: null,
    regions: C.REGIONS,
    regionSheet: false
  },

  onLoad(query) {
    if (query && query.tab === 'manual') this.setData({ tab: 'manual' });
  },

  onShow() {
    this.setData({ me: store.getMe() });
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  toggle(e) {
    const i = Number(e.currentTarget.dataset.index);
    this.setData({ openIndex: this.data.openIndex === i ? -1 : i });
  },

  /* 位置设置 */
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
    this.setData({ regionSheet: false, me: store.getMe() });
  },

  useGps() {
    wx.getLocation({
      type: 'gcj02',
      success: () => {
        store.saveMe({ region: '当前位置附近', regionKey: 'gps', locationAuthorized: true });
        this.setData({ regionSheet: false, me: store.getMe() });
        wx.showToast({ title: '已切到当前位置', icon: 'none' });
      },
      fail: () => {
        wx.showToast({ title: '没拿到位置，可以先手动选', icon: 'none' });
      }
    });
  },

  /* 重看欢迎信 */
  readLetter() {
    wx.navigateTo({ url: '/pages/welcome/welcome' });
  },

  /* 演示数据重置（接入真实后端后可移除） */
  resetDemo() {
    wx.showModal({
      title: '重置演示数据？',
      content: '会把昵称、头像、饭记、餐单、想吃全部恢复成初始的假数据，用于重新走一遍完整流程。',
      confirmText: '确认重置',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        store.reset();
        wx.showToast({ title: '已重置', icon: 'none' });
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/index/index' });
        }, 600);
      }
    });
  },

  renderRules() {
    wx.showModal({
      title: '内容与公开规则',
      content:
        '饭记可见范围：公开 / 仅附近可见 / 仅自己可见。\n地点可见范围：具体地点 / 模糊区域 / 不公开。\n感受可见范围：公开 / 仅自己可见。\n三类权限相互独立，每一顿都可以单独设置。',
      showCancel: false,
      confirmText: '知道了'
    });
  }
});
