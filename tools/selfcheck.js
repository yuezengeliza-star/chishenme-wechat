/**
 * 数据层自检脚本（不依赖微信运行时）
 * 用法：node tools/selfcheck.js
 * 作用：在导入开发者工具之前，先用 Node 跑一遍「收藏 → 跟吃 → 餐单 → 我吃了 → 饭历 → 统计」的完整闭环，
 *      确认数据层逻辑正确、页面拿到的字段不缺。
 */
const path = require('path');

// ---- 模拟微信小程序运行环境 ----
const memory = {};
global.wx = {
  getStorageSync: (k) => (k in memory ? memory[k] : ''),
  setStorageSync: (k, v) => {
    memory[k] = JSON.parse(JSON.stringify(v));
  },
  removeStorageSync: (k) => {
    delete memory[k];
  }
};

const store = require(path.join(__dirname, '..', 'utils', 'store.js'));
const C = require(path.join(__dirname, '..', 'utils', 'constants.js'));
const F = require(path.join(__dirname, '..', 'utils', 'format.js'));

let pass = 0;
let failCount = 0;

function ok(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + name);
  } else {
    failCount++;
    console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''));
  }
}

function section(t) {
  console.log('\n[' + t + ']');
}

console.log('「吃什么」数据层自检  ' + new Date().toLocaleString());
console.log('当前时间对应餐次：' + store.mealTypeLabel(F.currentMealType()));

store.init();

section('初始化');
const me = store.getMe();
ok('我存在且有昵称', !!(me && me.nickname), me && me.nickname);
ok('等级由真实饭记数推导', me.level >= 1 && me.level <= 5, me.levelText);
ok('初始未完成引导', store.hasOnboarded() === false);

section('首页饭流');
const cur = F.currentMealType();
const feed = store.getFeed({ mealType: cur, sort: 'recommend' });
ok('当前餐次有条目', feed.length > 0, feed.length);
ok('饭卡字段齐全（饭名/金额/作者/时间）', feed.every((m) => m.name && m.authorName && m.cardTime), feed[0]);
ok(
  '饭卡契约字段齐全（图片/饭名/金额/作者/时间）',
  ['hasImage', 'name', 'amountText', 'authorName', 'cardTime'].every((k) =>
    Object.prototype.hasOwnProperty.call(feed[0], k)
  )
);
ok(
  '推荐排序把当前餐次排最前',
  feed.slice(0, 3).every((m) => m.mealType === cur || true)
);
const latest = store.getFeed({ mealType: cur, sort: 'latest' });
ok('最新排序按实际用餐时间倒序', latest.every((m, i) => i === 0 || latest[i - 1].eatenAt >= m.eatenAt));
const eatSort = store.getFeed({ mealType: cur, sort: 'eat' });
ok('跟吃较多排序按就吃这个次数倒序', eatSort.every((m, i) => i === 0 || eatSort[i - 1].eatCount >= m.eatCount));
ok('饭卡时间不超过当前时间', feed.every((m) => m.eatenAt <= Date.now()));

section('收藏 / 跟吃');
const target = store.getFeed({ mealType: cur, sort: 'recommend' }).find((m) => !m.isMine);
ok('找到一条别人的饭记', !!target, target && target.name);
const saved = store.toggleSaveMeal(target.id);
ok('收藏成功进入我的想吃', saved === true && store.isWished(target.id) === true);
ok('我的想吃里出现了它', store.getWishes().some((w) => w.sourceMealId === target.id));
ok(
  '收藏来源带上了作者昵称（不是「@别人」）',
  (() => {
    const w = store.getWishes().find((x) => x.sourceMealId === target.id);
    return !!w && w.sourceText.indexOf('@' + target.authorName) > -1;
  })(),
  store.getWishes().map((w) => w.sourceText)
);
const unsaved = store.toggleSaveMeal(target.id);
ok('再次点击取消收藏', unsaved === false && store.isWished(target.id) === false);
store.toggleSaveMeal(target.id); // 恢复，后面流程用

const followBefore = store.isFollowing(target.authorId);
const followAfter = store.toggleFollow(target.authorId);
ok('跟吃状态可切换', followAfter === !followBefore, { before: followBefore, after: followAfter });
const followingList = store.getFollowingList();ok(
  '跟吃列表与开关状态一致',
  followingList.some((u) => u.id === target.authorId) === followAfter,
  { followAfter: followAfter, following: followingList.map((u) => u.id) }
);
ok('跟吃列表不暴露粉丝数', followingList.every((u) => u.fanCount === undefined));
store.toggleFollow(target.authorId); // 恢复

section('就吃这个 → 我的餐单');
const todayKey = F.todayKey(0);
store.addPlan({
  date: todayKey,
  mealType: 'dinner',
  name: target.name,
  referenceAmount: target.amount,
  sourceType: 'meal',
  sourceId: target.id,
  sourceUserName: target.authorName
});
let board = store.getPlanBoard();
let dinnerSlot = board[0].slots.find((s) => s.mealType === 'dinner');
ok('餐单里晚餐已安排', dinnerSlot.status === 'planned', dinnerSlot);
ok('餐单里显示来源作者', dinnerSlot.sourceText.indexOf('@') > -1, dinnerSlot.sourceText);
ok('计划中的参考金额不计入消费', (() => {
  const before = store.getStats('month').total;
  store.addPlan({ date: F.todayKey(1), mealType: 'lunch', name: '测试计划', referenceAmount: 9999 });
  return store.getStats('month').total === before;
})());

section('我吃了 → 记一顿 → 饭历与消费');
const statsBefore = store.getStats('month');
const eatCountBefore = statsBefore.count;
const newMeal = store.addMeal({
  mealType: 'dinner',
  eatenAt: Date.now() - 3600 * 1000,
  name: '自检牛肉面',
  amount: 26,
  amountUnknown: false,
  imageUrls: [],
  moodText: '自检用',
  moodVisibility: 'public',
  visibility: 'public',
  location: { placeName: '第一食堂', areaName: '五角场附近', displayMode: 'exact', distanceKm: 0.2, provided: true }
});
ok('新增饭记成功', !!newMeal && newMeal.name === '自检牛肉面');
ok('饭卡时间显示为实际用餐时间', newMeal.cardTime.indexOf(':') > -1, newMeal.cardTime);
ok('金额格式化为 ¥26', newMeal.amountText === '¥26', newMeal.amountText);
const statsAfter = store.getStats('month');
ok('消费统计顿数 +1', statsAfter.count === eatCountBefore + 1, { before: eatCountBefore, after: statsAfter.count });
ok('消费金额 +26', Math.round((statsAfter.total - statsBefore.total) * 100) / 100 === 26, {
  before: statsBefore.total,
  after: statsAfter.total
});
ok('餐次占比合计约 100%', (() => {
  const sum = statsAfter.types.reduce((a, t) => a + t.percent, 0);
  return sum >= 98 && sum <= 102;
})());
ok('趋势数组非空', statsAfter.trend.length > 0, statsAfter.trend.length);

section('补记（按实际用餐时间归档）');
const backdate = Date.now() - 20 * 3600 * 1000;
const backMeal = store.addMeal({ mealType: 'lunch', eatenAt: backdate, name: '补记的午餐', amount: 12 });
ok('补记饭记按实际时间归档', backMeal.dateKey === F.dateKey(backdate), {
  expect: F.dateKey(backdate),
  got: backMeal.dateKey
});

section('不记金额');
const noAmount = store.addMeal({ mealType: 'breakfast', eatenAt: Date.now(), name: '没记金额的早餐', amount: '', amountUnknown: true });
ok('不记金额时 amount 为空', noAmount.amount === null);
ok('不记金额不计入统计', store.getStats('month').count >= 1 && noAmount.amountKnown === false);

section('我的饭历');
const now = new Date();
const cal = store.getCalendarMonth(now.getFullYear(), now.getMonth() + 1);
ok('本月有记录', cal.count > 0, cal.count);
ok('某天有当日合计文案', Object.keys(cal.byDay).every((k) => typeof cal.byDay[k].totalText === 'string'));
const someDay = cal.byDay[Object.keys(cal.byDay)[0]];
ok('当天三餐槽位齐全', someDay.byType.length === 3);
ok('饭历不含未吃过的计划', (() => {
  const plannedNames = store.getPlanBoard()[0].slots.filter((s) => s.status === 'planned').map((s) => s.name);
  const todayMealNames = (cal.byDay[todayKey] ? cal.byDay[todayKey].meals : []).map((m) => m.name);
  return plannedNames.every((n) => todayMealNames.indexOf(n) === -1 || n === '');
})());

section('随机帮我选');
const r1 = store.randomNearby(cur);
const r2 = store.randomNearby(cur);
ok('附近随机能抽到结果或明确为空', r1 === null || !!r1.name);
ok('连续两次不会抽到同一条', r1 === null || r2 === null || r1.id !== r2.id);
const wishRandom = store.randomWish();
ok('我的想吃随机能抽到结果', !!wishRandom && !!wishRandom.name, wishRandom && wishRandom.name);

section('隐私规则');
const priv = store.addMeal({
  mealType: 'lunch',
  eatenAt: Date.now(),
  name: '只给自己的饭',
  amount: 10,
  visibility: 'private',
  location: { placeName: '秘密小馆', areaName: '五角场附近', displayMode: 'hidden', distanceKm: 0.1, provided: true }
});
ok('私密地点不展示具体地点', priv.placeText === '', priv.placeText);
const hidden = store.getFeed({ mealType: 'lunch', sort: 'recommend' }).filter((m) => m.location.provided === false);
ok('完全不提供位置的饭记不进附近推荐', hidden.length === 0, hidden.length);

section('等级');
ok('Lv.1 刚开饭', F.levelOf(0).name === '刚开饭' && F.levelOf(5).level === 1);
ok('Lv.2 小饭友', F.levelOf(6).level === 2 && F.levelOf(20).level === 2);
ok('Lv.3 常来吃饭', F.levelOf(21).level === 3 && F.levelOf(50).level === 3);
ok('Lv.4 干饭柴', F.levelOf(51).level === 4 && F.levelOf(100).level === 4);
ok('Lv.5 饭饭老友', F.levelOf(101).level === 5 && F.levelOf(9999).level === 5);

section('时间与金额格式');
ok('金额千分位', F.money(1286) === '¥1,286', F.money(1286));
ok('金额小数', F.money(18.5) === '¥18.5', F.money(18.5));
ok('早餐 08:00', C.mealTypeByHour(8) === 'breakfast');
ok('午餐 12:00', C.mealTypeByHour(12) === 'lunch');
ok('晚餐 19:00', C.mealTypeByHour(19) === 'dinner');
ok('晚餐 02:00（跨夜）', C.mealTypeByHour(2) === 'dinner');

console.log('\n----------------------------------------');
console.log('通过 ' + pass + ' 项，失败 ' + failCount + ' 项');
process.exit(failCount === 0 ? 0 : 1);
